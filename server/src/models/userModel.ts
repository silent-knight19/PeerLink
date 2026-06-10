import { firestore } from '../config/firebase';
import { User, UserDocument, CreateUserInput } from '../types';
import { generateId, encodeEmail, now } from '../utils/helpers';
import { FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'users';
const EMAIL_MAPPINGS = 'emailMappings';
const GOOGLE_MAPPINGS = 'googleMappings';

export async function createUser(data: CreateUserInput): Promise<User> {
  const userId = generateId();
  const timestamp = now();
  const encodedEmail = encodeEmail(data.email);

  const userDoc: Omit<User, 'id'> = {
    ...data,
    passwordHash: data.passwordHash,
    googleId: data.googleId,
    failedLoginAttempts: 0,
    lockedUntil: null,
    refreshTokenVersion: 0,
    activeSessionCount: 0,
    lastLoginAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await firestore.runTransaction(async (transaction) => {
    const emailMappingRef = firestore.collection(EMAIL_MAPPINGS).doc(encodedEmail);
    const emailMappingSnap = await transaction.get(emailMappingRef);

    if (emailMappingSnap.exists) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }

    const userRef = firestore.collection(COLLECTION).doc(userId);
    transaction.set(userRef, userDoc);
    transaction.set(emailMappingRef, { userId });

    if (data.googleId) {
      const googleMappingRef = firestore.collection(GOOGLE_MAPPINGS).doc(data.googleId);
      const googleMappingSnap = await transaction.get(googleMappingRef);

      if (googleMappingSnap.exists) {
        throw new Error('GOOGLE_ACCOUNT_ALREADY_LINKED');
      }

      transaction.set(googleMappingRef, { userId });
    }
  });

  return { id: userId, ...userDoc } as User;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const encodedEmail = encodeEmail(email);
  const mappingSnap = await firestore.collection(EMAIL_MAPPINGS).doc(encodedEmail).get();

  if (!mappingSnap.exists) return null;

  const { userId } = mappingSnap.data() as { userId: string };
  return findUserById(userId);
}

export async function findUserByGoogleId(googleId: string): Promise<User | null> {
  const mappingSnap = await firestore.collection(GOOGLE_MAPPINGS).doc(googleId).get();

  if (!mappingSnap.exists) return null;

  const { userId } = mappingSnap.data() as { userId: string };
  return findUserById(userId);
}

export async function findUserById(userId: string): Promise<User | null> {
  const userSnap = await firestore.collection(COLLECTION).doc(userId).get();

  if (!userSnap.exists) return null;

  return { id: userSnap.id, ...userSnap.data() } as User;
}

export async function updateUser(userId: string, data: Partial<UserDocument>): Promise<void> {
  const updateData = { ...data, updatedAt: now() };
  await firestore.collection(COLLECTION).doc(userId).update(updateData);
}

export async function incrementSessionCount(userId: string): Promise<void> {
  await firestore
    .collection(COLLECTION)
    .doc(userId)
    .update({
      activeSessionCount: FieldValue.increment(1),
      updatedAt: now(),
    });
}

export async function decrementSessionCount(userId: string): Promise<void> {
  await firestore.runTransaction(async (transaction) => {
    const userRef = firestore.collection(COLLECTION).doc(userId);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists) return;

    const currentCount = (userSnap.data() as User).activeSessionCount || 0;
    if (currentCount <= 0) return;

    transaction.update(userRef, {
      activeSessionCount: FieldValue.increment(-1),
      updatedAt: now(),
    });
  });
}

export async function linkGoogleAccount(userId: string, googleId: string): Promise<void> {
  await firestore.runTransaction(async (transaction) => {
    const googleMappingRef = firestore.collection(GOOGLE_MAPPINGS).doc(googleId);
    const googleMappingSnap = await transaction.get(googleMappingRef);

    if (googleMappingSnap.exists) {
      throw new Error('GOOGLE_ACCOUNT_ALREADY_LINKED');
    }

    const userRef = firestore.collection(COLLECTION).doc(userId);
    transaction.update(userRef, {
      googleId,
      authProvider: 'both',
      updatedAt: now(),
    });
    transaction.set(googleMappingRef, { userId });
  });
}

export async function changeEmail(userId: string, newEmail: string): Promise<void> {
  const encodedNewEmail = encodeEmail(newEmail);

  await firestore.runTransaction(async (transaction) => {
    const userRef = firestore.collection(COLLECTION).doc(userId);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists) throw new Error('USER_NOT_FOUND');

    const user = userSnap.data() as UserDocument;
    const encodedCurrentEmail = encodeEmail(user.email);

    const newMappingRef = firestore.collection(EMAIL_MAPPINGS).doc(encodedNewEmail);
    const newMappingSnap = await transaction.get(newMappingRef);

    if (newMappingSnap.exists) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }

    const oldMappingRef = firestore.collection(EMAIL_MAPPINGS).doc(encodedCurrentEmail);
    transaction.delete(oldMappingRef);
    transaction.set(newMappingRef, { userId });
    transaction.update(userRef, { email: newEmail, updatedAt: now() });
  });
}
