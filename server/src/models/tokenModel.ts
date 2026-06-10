import { firestore } from '../config/firebase';
import { RefreshTokenDocument } from '../types';
import { generateId, hashToken, now, addDays, addHours } from '../utils/helpers';
import { FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'refreshTokens';

export async function createRefreshToken(
  userId: string,
  familyId: string,
  token: string,
  deviceInfo: string,
  ipAddress: string,
  userAgent: string,
): Promise<RefreshTokenDocument> {
  const tokenId = generateId();
  const tokenHash = hashToken(token);
  const expiry = addDays(now(), 7);

  const doc: RefreshTokenDocument = {
    userId,
    familyId,
    sequence: 0,
    tokenHash,
    deviceInfo,
    ipAddress,
    userAgent,
    expiresAt: expiry,
    lastUsedAt: now(),
    createdAt: now(),
    revoked: false,
  };

  await firestore.collection(COLLECTION).doc(tokenId).set(doc);

  return { ...doc };
}

export async function findRefreshToken(tokenHash: string): Promise<{ id: string; data: RefreshTokenDocument } | null> {
  const snapshot = await firestore
    .collection(COLLECTION)
    .where('tokenHash', '==', tokenHash)
    .where('revoked', '==', false)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { id: doc.id, data: doc.data() as RefreshTokenDocument };
}

export async function revokeRefreshToken(tokenId: string): Promise<void> {
  await firestore.collection(COLLECTION).doc(tokenId).update({
    revoked: true,
  });
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const snapshot = await firestore
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .where('revoked', '==', false)
    .get();

  const batch = firestore.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, { revoked: true });
  });
  await batch.commit();
}

export async function getUserActiveSessions(userId: string): Promise<RefreshTokenDocument[]> {
  const snapshot = await firestore
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .where('revoked', '==', false)
    .where('expiresAt', '>', now())
    .orderBy('lastUsedAt', 'asc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as RefreshTokenDocument);
}

export async function getOldestActiveSession(userId: string): Promise<{ id: string; data: RefreshTokenDocument } | null> {
  const snapshot = await firestore
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .where('revoked', '==', false)
    .where('expiresAt', '>', now())
    .orderBy('lastUsedAt', 'asc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { id: doc.id, data: doc.data() as RefreshTokenDocument };
}

export async function createEmailVerificationToken(
  userId: string,
  email: string,
  token: string,
): Promise<void> {
  const tokenHash = hashToken(token);
  const expiresAt = addDays(now(), 1);

  await firestore.collection('emailVerificationTokens').doc(userId).set({
    userId,
    email,
    tokenHash,
    expiresAt,
    createdAt: now(),
  });
}

export async function verifyEmailToken(
  userId: string,
  token: string,
): Promise<boolean> {
  const docRef = firestore.collection('emailVerificationTokens').doc(userId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) return false;

  const data = docSnap.data()!;
  const tokenHash = hashToken(token);

  if (data.tokenHash !== tokenHash) return false;
  if (data.expiresAt.toDate() < now()) return false;

  await docRef.delete();
  return true;
}

export async function createPasswordResetToken(
  userId: string,
  token: string,
): Promise<void> {
  const tokenHash = hashToken(token);
  const expiresAt = addHours(now(), 1);

  await firestore.collection('passwordResetTokens').add({
    userId,
    tokenHash,
    expiresAt,
    createdAt: now(),
    used: false,
  });
}

export async function findPasswordResetToken(
  token: string,
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = hashToken(token);
  const snapshot = await firestore
    .collection('passwordResetTokens')
    .where('tokenHash', '==', tokenHash)
    .where('used', '==', false)
    .where('expiresAt', '>', now())
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();
  return { id: doc.id, userId: data.userId };
}

export async function markResetTokenUsed(tokenId: string): Promise<void> {
  await firestore.collection('passwordResetTokens').doc(tokenId).update({ used: true });
}
