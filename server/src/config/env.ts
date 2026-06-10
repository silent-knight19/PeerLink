import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const env = {
  PORT: parseInt(optionalEnv('PORT', '4000'), 10),
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),

  FIREBASE_PROJECT_ID: requireEnv('FIREBASE_PROJECT_ID'),
  FIREBASE_CLIENT_EMAIL: requireEnv('FIREBASE_CLIENT_EMAIL'),
  FIREBASE_PRIVATE_KEY: requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),

  REDIS_URL: requireEnv('REDIS_URL'),

  JWT_PRIVATE_KEY: Buffer.from(requireEnv('JWT_PRIVATE_KEY_BASE64'), 'base64').toString('utf-8'),
  JWT_PUBLIC_KEY: Buffer.from(requireEnv('JWT_PUBLIC_KEY_BASE64'), 'base64').toString('utf-8'),
  ACCESS_TOKEN_EXPIRY: optionalEnv('ACCESS_TOKEN_EXPIRY', '15m'),
  REFRESH_TOKEN_EXPIRY: optionalEnv('REFRESH_TOKEN_EXPIRY', '7d'),

  GOOGLE_CLIENT_ID: requireEnv('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: requireEnv('GOOGLE_CLIENT_SECRET'),
  GOOGLE_CALLBACK_URL: requireEnv('GOOGLE_CALLBACK_URL'),

  RESEND_API_KEY: requireEnv('RESEND_API_KEY'),

  CLIENT_URL: requireEnv('CLIENT_URL'),

  MAX_ACTIVE_SESSIONS: parseInt(optionalEnv('MAX_ACTIVE_SESSIONS', '10'), 10),
  MAX_LOGIN_ATTEMPTS: parseInt(optionalEnv('MAX_LOGIN_ATTEMPTS', '5'), 10),
  LOCKOUT_DURATION_MINUTES: parseInt(optionalEnv('LOCKOUT_DURATION_MINUTES', '15'), 10),

  get isProduction(): boolean {
    return this.NODE_ENV === 'production';
  },

  get isDevelopment(): boolean {
    return this.NODE_ENV === 'development';
  },
};
