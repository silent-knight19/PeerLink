import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { env } from './env';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  ...(env.isDevelopment && {
    projectId: env.FIREBASE_PROJECT_ID,
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    }),
  }),
});

export const firestore = getFirestore('peerlink');
firestore.settings({ ignoreUndefinedProperties: true });

export const auth = admin.auth();

export default admin;
