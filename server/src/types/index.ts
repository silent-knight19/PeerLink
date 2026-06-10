import { Request } from 'express';

export type AuthProvider = 'email' | 'google' | 'both';
export type RoomStatus = 'waiting' | 'active' | 'ended';

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

export interface Room {
  id: string;
  hostId: string;
  status: RoomStatus;
  maxParticipants: number;
  createdAt: Date;
  endedAt: Date | null;
}

export interface SignalData {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

export interface ServerToClientEvents {
  'peer-joined': (data: { socketId: string; userId: string; displayName: string }) => void;
  'peer-left': (data: { socketId: string; userId: string }) => void;
  'room-joined': (data: { participants: Array<{ socketId: string; userId: string; displayName: string }> }) => void;
  'signal': (data: { from: string; data: SignalData }) => void;
  'room-ended': () => void;
  'room-full': () => void;
  'room-error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'join-room': (data: { roomId: string }) => void;
  'leave-room': () => void;
  'signal': (data: { to: string; data: SignalData }) => void;
  'end-meeting': () => void;
}
