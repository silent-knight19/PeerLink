import api from './api';

export interface UserResponse {
  id: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  authProvider: string;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

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
  accessToken?: string;
  user: UserResponse;
  message?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    statusCode: number;
  };
}

export async function register(params: RegisterParams): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/register', params);
  return data;
}

export async function login(params: LoginParams): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/login', params);
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function refreshToken(): Promise<{ accessToken: string }> {
  const { data } = await api.post<{ accessToken: string }>('/auth/refresh');
  return data;
}

export async function getGoogleAuthUrl(): Promise<{ url: string }> {
  const { data } = await api.get<{ url: string }>('/auth/google');
  return data;
}

export async function verifyEmail(userId: string, token: string): Promise<void> {
  await api.post('/auth/verify-email', { userId, token });
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post('/auth/reset-password', { token, password });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await api.post('/auth/change-password', { currentPassword, newPassword });
}

export async function getProfile(): Promise<{ user: UserResponse }> {
  const { data } = await api.get<{ user: UserResponse }>('/auth/me');
  return data;
}

export async function updateProfile(updates: {
  displayName?: string;
  photoURL?: string | null;
}): Promise<{ user: UserResponse }> {
  const { data } = await api.patch<{ user: UserResponse }>('/auth/me', updates);
  return data;
}
