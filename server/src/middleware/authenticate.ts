import fs from 'fs';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { verifyAccessToken, isAccessTokenBlacklisted } from '../services/tokenService';
import { findUserById } from '../models/userModel';
import { getRedis } from '../config/redis';
import { AuthError, ForbiddenError } from '../utils/errors';

const USER_CACHE_PREFIX = 'user_cache:';
const USER_CACHE_TTL = 300; // 5 minutes

interface CachedUserStatus {
  status: 'active' | 'inactive';
  tokenVersion: number;
}

/**
 * Middleware to authenticate requests using JWT access tokens.
 * Validates the token, checks blacklist, verifies user status
 * and token version (even from cache).
 */
export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    try {
      fs.appendFileSync('/tmp/auth_me.log', `${new Date().toISOString()} - [AUTH_ME] incoming, auth=${!!req.headers.authorization}\n`);
    } catch {}
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError('MISSING_TOKEN', 'Access token is required');
    }

    const token = authHeader.split(' ')[1];

    const isBlacklisted = await isAccessTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new AuthError('TOKEN_REVOKED', 'Access token has been revoked');
    }

    const payload = verifyAccessToken(token);

    const redis = getRedis();
    const cacheKey = `${USER_CACHE_PREFIX}${payload.userId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      const cachedData: CachedUserStatus = JSON.parse(cached);

      if (cachedData.status === 'inactive') {
        throw new ForbiddenError('ACCOUNT_DISABLED', 'Account has been disabled');
      }

      if (cachedData.tokenVersion !== payload.tokenVersion) {
        throw new AuthError('TOKEN_REVOKED', 'Session has been revoked. Please login again.');
      }

      req.user = payload;
      next();
      return;
    }

    const user = await findUserById(payload.userId);

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User not found');
    }

    if (!user.isActive) {
      const inactiveData: CachedUserStatus = { status: 'inactive', tokenVersion: user.refreshTokenVersion };
      await redis.set(cacheKey, JSON.stringify(inactiveData), 'EX', USER_CACHE_TTL);
      throw new ForbiddenError('ACCOUNT_DISABLED', 'Account has been disabled');
    }

    if (user.refreshTokenVersion !== payload.tokenVersion) {
      throw new AuthError('TOKEN_REVOKED', 'Session has been revoked. Please login again.');
    }

    const activeData: CachedUserStatus = { status: 'active', tokenVersion: user.refreshTokenVersion };
    await redis.set(cacheKey, JSON.stringify(activeData), 'EX', USER_CACHE_TTL);

    req.user = payload;
    next();
  } catch (error) {
    try {
      const errMsg = error instanceof Error ? error.message : String(error);
      fs.appendFileSync('/tmp/auth_me.log', `${new Date().toISOString()} - [AUTH_ME] ERROR: ${errMsg}\n`);
    } catch {}
    next(error);
  }
}
