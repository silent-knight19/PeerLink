import { Request } from 'express';

export type AuthProvider = 'email' | 'google' | 'both';

export interface UserProfile {
  email: string;
  displayName: string;
  photoURL: string | null;
  authProvider: AuthProvider;
  emailVerified: boolean;
  isActive: boolean;
}

export interface User extends UserProfile {
  id: string;
  passwordHash: string | null;
  googleId: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  refreshTokenVersion: number;
  activeSessionCount: number;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  photoURL: string | null;
  authProvider: AuthProvider;
  passwordHash: string | null;
  googleId: string | null;
  emailVerified: boolean;
  isActive: boolean;
}

export interface UserDocument extends Omit<User, 'id'> {
  id?: string;
}

export interface RefreshTokenDocument {
  userId: string;
  familyId: string;
  sequence: number;
  tokenHash: string;
  deviceInfo: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
  revoked: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthPayload {
  userId: string;
  email: string;
  displayName: string;
  tokenVersion: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}
