import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export function generateId(): string {
  return uuidv4();
}

export function encodeEmail(email: string): string {
  return Buffer.from(email.toLowerCase().trim()).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Escapes HTML special characters to prevent injection in email templates.
 * @param text - Raw user input string
 * @returns Escaped string safe for HTML interpolation
 */
export function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

export function generateFamilyId(): string {
  return uuidv4();
}

export function now(): Date {
  return new Date();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

export function sanitizeUser(user: {
  id: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  authProvider: string;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
}): {
  id: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  authProvider: string;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
} {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    authProvider: user.authProvider,
    emailVerified: user.emailVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
