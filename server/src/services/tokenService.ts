import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { AuthPayload, AuthTokens } from '../types';
import { generateFamilyId, now, addDays } from '../utils/helpers';
import {
  createRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  getOldestActiveSession,
} from '../models/tokenModel';
import { findUserById } from '../models/userModel';
import { getRedis } from '../config/redis';
import { AuthError } from '../utils/errors';

const ACCESS_TOKEN_BLACKLIST_PREFIX = 'at_blacklist:';

function generateAccessToken(payload: AuthPayload): string {
  const options: jwt.SignOptions = {
    algorithm: 'RS256',
    expiresIn: env.ACCESS_TOKEN_EXPIRY as jwt.SignOptions['expiresIn'],
    issuer: 'peerlink',
  };
  return jwt.sign(payload, env.JWT_PRIVATE_KEY, options);
}

function generateRefreshTokenString(): string {
  return crypto.randomBytes(64).toString('hex');
}

export function verifyAccessToken(token: string): AuthPayload {
  try {
    const options: jwt.VerifyOptions = {
      algorithms: ['RS256'],
      issuer: 'peerlink',
    };
    const payload = jwt.verify(token, env.JWT_PUBLIC_KEY, options) as jwt.JwtPayload & AuthPayload;

    return {
      userId: payload.userId,
      email: payload.email,
      displayName: payload.displayName,
      tokenVersion: payload.tokenVersion,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthError('TOKEN_EXPIRED', 'Access token has expired');
    }
    throw new AuthError('INVALID_TOKEN', 'Invalid access token');
  }
}

export async function issueTokens(
  userId: string,
  email: string,
  displayName: string,
  tokenVersion: number,
  deviceInfo: string = 'unknown',
  ipAddress: string = 'unknown',
  userAgent: string = 'unknown',
): Promise<AuthTokens> {
  const authPayload: AuthPayload = { userId, email, displayName, tokenVersion };
  const accessToken = generateAccessToken(authPayload);
  const refreshToken = generateRefreshTokenString();
  const familyId = generateFamilyId();

  await createRefreshToken(
    userId,
    familyId,
    refreshToken,
    deviceInfo,
    ipAddress,
    userAgent,
  );

  return { accessToken, refreshToken };
}

export async function refreshTokens(
  refreshToken: string,
  deviceInfo: string,
  ipAddress: string,
  userAgent: string,
): Promise<AuthTokens> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const existing = await findRefreshToken(tokenHash);

  if (!existing) {
    throw new AuthError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
  }

  const { id: tokenId, data: tokenData } = existing;

  if (tokenData.expiresAt < now()) {
    await revokeRefreshToken(tokenId);
    throw new AuthError('REFRESH_TOKEN_EXPIRED', 'Refresh token has expired');
  }

  const user = await findUserById(tokenData.userId);
  if (!user) {
    await revokeRefreshToken(tokenId);
    throw new AuthError('USER_NOT_FOUND', 'User no longer exists');
  }

  if (!user.isActive) {
    await revokeRefreshToken(tokenId);
    throw new AuthError('ACCOUNT_DISABLED', 'Account has been disabled');
  }

  await revokeRefreshToken(tokenId);

  const newRefreshToken = generateRefreshTokenString();
  const newAccessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    tokenVersion: user.refreshTokenVersion,
  });

  await createRefreshToken(
    user.id,
    tokenData.familyId,
    newRefreshToken,
    deviceInfo,
    ipAddress,
    userAgent,
  );

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function revokeToken(token: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const existing = await findRefreshToken(tokenHash);

  if (existing) {
    await revokeRefreshToken(existing.id);
  }
}

export async function blacklistAccessToken(token: string, expirySeconds: number): Promise<void> {
  const redis = getRedis();
  const key = `${ACCESS_TOKEN_BLACKLIST_PREFIX}${token}`;
  await redis.set(key, '1', 'EX', expirySeconds);
}

export async function isAccessTokenBlacklisted(token: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.get(`${ACCESS_TOKEN_BLACKLIST_PREFIX}${token}`);
  return result !== null;
}

export async function enforceSessionLimit(userId: string): Promise<void> {
  const oldest = await getOldestActiveSession(userId);
  if (oldest) {
    await revokeRefreshToken(oldest.id);
  }
}
