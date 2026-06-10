import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { AuthError } from '../utils/errors';

const oauth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_CALLBACK_URL,
);

export interface GoogleProfile {
  googleId: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

export function getGoogleAuthURL(state: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
    prompt: 'select_account',
  });
}

export async function getGoogleProfileFromCode(code: string): Promise<GoogleProfile> {
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.id_token) {
    throw new AuthError('GOOGLE_AUTH_FAILED', 'Failed to get ID token from Google');
  }

  const ticket = await oauth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.sub || !payload.email) {
    throw new AuthError('GOOGLE_AUTH_FAILED', 'Invalid Google token payload');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    displayName: payload.name || payload.email.split('@')[0],
    photoURL: payload.picture || null,
  };
}
