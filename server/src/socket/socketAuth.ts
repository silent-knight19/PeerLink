import { Socket } from 'socket.io';
import { verifyAccessToken } from '../services/tokenService';
import { AuthError } from '../utils/errors';

export function authenticateSocket(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth?.token;

  if (!token) {
    next(new AuthError('MISSING_TOKEN', 'Authentication required'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    socket.data.user = payload;
    next();
  } catch {
    next(new AuthError('INVALID_TOKEN', 'Invalid or expired access token'));
  }
}
