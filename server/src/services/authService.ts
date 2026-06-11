import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { env } from '../config/env';
import { AuthTokens, User } from '../types';
import { getRedis } from '../config/redis';
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByGoogleId,
  updateUser,
  incrementSessionCount,
} from '../models/userModel';
import {
  createEmailVerificationToken,
  verifyEmailToken,
  createPasswordResetToken,
  findPasswordResetToken,
  markResetTokenUsed,
  getUserActiveSessions,
} from '../models/tokenModel';
import { issueTokens, revokeToken, enforceSessionLimit } from './tokenService';
import { emailService } from './emailService';
import { getGoogleProfileFromCode, GoogleProfile } from './googleService';
import { AuthError, ForbiddenError, ConflictError } from '../utils/errors';
import { sanitizeUser } from '../utils/helpers';

const BCRYPT_SALT_ROUNDS = 12;
const VERIFICATION_TOKEN_EXPIRY_SECONDS = 86400; // 24 hours
const PASSWORD_RESET_TOKEN_EXPIRY_SECONDS = 3600; // 1 hour
const STATE_STORE_PREFIX = 'google_oauth_state:';
const inMemoryStateStore = new Map<string, number>();

interface RegisterParams {
  email: string;
  password: string;
  displayName: string;
}

interface LoginParams {
  email: string;
  password: string;
}

interface AuthResult {
  tokens: AuthTokens;
  user: ReturnType<typeof sanitizeUser>;
  isNewUser: boolean;
}

export class AuthService {
  async register(
    params: RegisterParams,
  ): Promise<{ user: ReturnType<typeof sanitizeUser> }> {
    const passwordHash = await bcrypt.hash(params.password, BCRYPT_SALT_ROUNDS);

    const user = await createUser({
      email: params.email.toLowerCase().trim(),
      displayName: params.displayName.trim(),
      photoURL: null,
      authProvider: 'email',
      passwordHash,
      googleId: null,
      emailVerified: false,
      isActive: true,
    }).catch((error) => {
      if (error.message === 'EMAIL_ALREADY_EXISTS') {
        throw new ConflictError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists');
      }
      throw error;
    });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await createEmailVerificationToken(user.id, user.email, verificationToken);
    await emailService.sendVerificationEmail(user.email, user.displayName, user.id, verificationToken);

    return { user: sanitizeUser(user) };
  }

  async login(
    params: LoginParams,
    deviceInfo: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthResult> {
    const user = await findUserByEmail(params.email.toLowerCase().trim());

    if (!user) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenError('ACCOUNT_DISABLED', 'Account has been disabled');
    }

    if (!user.emailVerified && user.authProvider === 'email') {
      throw new AuthError(
        'EMAIL_NOT_VERIFIED',
        'Please verify your email address before signing in. Check your inbox for the verification link.',
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenError(
        'ACCOUNT_LOCKED',
        `Account is locked. Try again in ${remainingMinutes} minutes`,
      );
    }

    // Clear expired lock and stale failed attempts
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      await updateUser(user.id, { lockedUntil: null, failedLoginAttempts: 0 } as any);
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    }

    if (!user.passwordHash) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'This account uses Google Sign-In. Please sign in with Google.',
      );
    }

    const isPasswordValid = await bcrypt.compare(params.password, user.passwordHash);

    if (!isPasswordValid) {
      const attempts = user.failedLoginAttempts + 1;
      const updates: Record<string, unknown> = { failedLoginAttempts: attempts };

      if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60000);
        updates.lockedUntil = lockUntil;
      }

      await updateUser(user.id, updates as any);

      const remainingAttempts = env.MAX_LOGIN_ATTEMPTS - attempts;
      if (remainingAttempts > 0) {
        throw new AuthError(
          'INVALID_CREDENTIALS',
          `Invalid email or password. ${remainingAttempts} attempts remaining.`,
        );
      }

      throw new ForbiddenError(
        'ACCOUNT_LOCKED',
        `Account locked due to too many failed attempts. Try again in ${env.LOCKOUT_DURATION_MINUTES} minutes.`,
      );
    }

    const updates: Record<string, unknown> = {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    };

    if (user.authProvider === 'email') {
      updates.authProvider = 'email';
    }

    await updateUser(user.id, updates as any);

    const activeSessions = await getUserActiveSessions(user.id);
    if (activeSessions.length >= env.MAX_ACTIVE_SESSIONS) {
      await enforceSessionLimit(user.id);
    }

    const tokens = await issueTokens(
      user.id,
      user.email,
      user.displayName,
      user.refreshTokenVersion,
      deviceInfo,
      ipAddress,
      userAgent,
    );

    await incrementSessionCount(user.id);

    return {
      tokens,
      user: sanitizeUser({ ...user }),
      isNewUser: false,
    };
  }

  async loginWithGoogle(
    code: string,
    state: string,
    deviceInfo: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthResult> {
    const redis = getRedis();
    let stateValid = false;

    if (redis) {
      const storedState = await redis.get(`${STATE_STORE_PREFIX}${state}`);
      stateValid = !!storedState;
      if (stateValid) {
        await redis.del(`${STATE_STORE_PREFIX}${state}`);
      }
    } else {
      const expiry = inMemoryStateStore.get(state);
      if (expiry && expiry > Date.now()) {
        stateValid = true;
      }
      inMemoryStateStore.delete(state);
    }

    if (!stateValid) {
      throw new AuthError('INVALID_STATE', 'Invalid OAuth state. Please try again.');
    }

    let googleProfile: GoogleProfile;
    try {
      googleProfile = await getGoogleProfileFromCode(code);
    } catch (googleError) {
      const errMsg = googleError instanceof Error ? `${googleError.message}\n${googleError.stack}` : String(googleError);
      throw new AuthError('GOOGLE_AUTH_FAILED', `Google authentication failed: ${errMsg}`);
    }

    let user = await findUserByGoogleId(googleProfile.googleId);

    if (!user) {
      user = await findUserByEmail(googleProfile.email);
    }

    if (user) {
      if (!user.isActive) {
        throw new ForbiddenError('ACCOUNT_DISABLED', 'Account has been disabled');
      }

      if (user.authProvider === 'email' && !user.googleId) {
        if (!user.emailVerified) {
          throw new AuthError(
            'EMAIL_NOT_VERIFIED',
            'Please verify your email before linking a Google account.',
          );
        }
        const { linkGoogleAccount } = await import('../models/userModel');
        await linkGoogleAccount(user.id, googleProfile.googleId);
      }

      const updates: Record<string, unknown> = {
        lastLoginAt: new Date(),
        photoURL: googleProfile.photoURL || user.photoURL,
        displayName: googleProfile.displayName || user.displayName,
        failedLoginAttempts: 0,
        lockedUntil: null,
      };

      if (!user.emailVerified) {
        updates.emailVerified = true;
      }

      await updateUser(user.id, updates as any);

      const activeSessions = await getUserActiveSessions(user.id);
      if (activeSessions.length >= env.MAX_ACTIVE_SESSIONS) {
        await enforceSessionLimit(user.id);
      }

      const tokens = await issueTokens(
        user.id,
        user.email,
        user.displayName,
        user.refreshTokenVersion,
        deviceInfo,
        ipAddress,
        userAgent,
      );

      await incrementSessionCount(user.id);

      return {
        tokens,
        user: sanitizeUser({
          ...user,
          ...updates,
          emailVerified: updates.emailVerified === true || user.emailVerified,
        }),
        isNewUser: false,
      };
    }

    const newUser = await createUser({
      email: googleProfile.email.toLowerCase().trim(),
      displayName: googleProfile.displayName.trim(),
      photoURL: googleProfile.photoURL,
      authProvider: 'google',
      passwordHash: null,
      googleId: googleProfile.googleId,
      emailVerified: true,
      isActive: true,
    });

    const tokens = await issueTokens(
      newUser.id,
      newUser.email,
      newUser.displayName,
      newUser.refreshTokenVersion,
      deviceInfo,
      ipAddress,
      userAgent,
    );

    await incrementSessionCount(newUser.id);

    return {
      tokens,
      user: sanitizeUser(newUser),
      isNewUser: true,
    };
  }

  async refreshTokens(
    refreshToken: string,
    deviceInfo: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    const { refreshTokens: rotateTokens } = await import('./tokenService');
    return rotateTokens(refreshToken, deviceInfo, ipAddress, userAgent);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    if (refreshToken) {
      await revokeToken(refreshToken);
    }

    const { decrementSessionCount } = await import('../models/userModel');
    await decrementSessionCount(userId);
  }

  async verifyEmail(userId: string, token: string): Promise<void> {
    const isValid = await verifyEmailToken(userId, token);

    if (!isValid) {
      throw new AuthError('INVALID_VERIFICATION_TOKEN', 'Invalid or expired verification token');
    }

    await updateUser(userId, { emailVerified: true } as any);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await findUserByEmail(email.toLowerCase().trim());

    if (!user) {
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    await createPasswordResetToken(user.id, resetToken);
    await emailService.sendPasswordResetEmail(user.email, user.displayName, resetToken);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetTokenDoc = await findPasswordResetToken(token);

    if (!resetTokenDoc) {
      throw new AuthError('INVALID_RESET_TOKEN', 'Invalid or expired password reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    const { revokeAllUserTokens } = await import('../models/tokenModel');

    await updateUser(resetTokenDoc.userId, {
      passwordHash,
      refreshTokenVersion: Math.floor(Date.now() / 1000),
    } as any);

    await revokeAllUserTokens(resetTokenDoc.userId);
    await markResetTokenUsed(resetTokenDoc.id);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await findUserById(userId);

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User not found');
    }

    if (!user.passwordHash) {
      throw new AuthError(
        'NO_PASSWORD_SET',
        'This account does not have a password. Use Google Sign-In.',
      );
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthError('INVALID_PASSWORD', 'Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    const { revokeAllUserTokens } = await import('../models/tokenModel');

    await updateUser(userId, {
      passwordHash,
      refreshTokenVersion: Math.floor(Date.now() / 1000),
    } as any);

    await revokeAllUserTokens(userId);
  }

  async getProfile(userId: string): Promise<ReturnType<typeof sanitizeUser>> {
    const user = await findUserById(userId);

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User not found');
    }

    return sanitizeUser(user);
  }

  async updateProfile(
    userId: string,
    updates: { displayName?: string; photoURL?: string | null },
  ): Promise<ReturnType<typeof sanitizeUser>> {
    const user = await findUserById(userId);

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User not found');
    }

    const updateData: Record<string, unknown> = {};
    if (updates.displayName !== undefined) {
      updateData.displayName = updates.displayName.trim();
    }
    if (updates.photoURL !== undefined) {
      updateData.photoURL = updates.photoURL;
    }

    if (Object.keys(updateData).length === 0) {
      return sanitizeUser(user);
    }

    await updateUser(userId, updateData as any);

    return sanitizeUser({ ...user, ...updateData });
  }

  async generateGoogleAuthState(): Promise<string> {
    const state = crypto.randomBytes(32).toString('hex');
    const redis = getRedis();

    if (redis) {
      await redis.set(
        `${STATE_STORE_PREFIX}${state}`,
        'valid',
        'EX',
        300, // 5 minutes
      );
    } else {
      inMemoryStateStore.set(state, Date.now() + 300_000);
      setTimeout(() => inMemoryStateStore.delete(state), 300_000);
    }

    return state;
  }
}

export const authService = new AuthService();
