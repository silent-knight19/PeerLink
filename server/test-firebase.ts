import admin from 'firebase-admin';
import { firestore } from './src/config/firebase';

async function test() {
  console.log('Testing Firestore connection...');
  const testRef = firestore.collection('_connection_test').doc('test');
  await testRef.set({ timestamp: new Date().toISOString(), message: 'hello' });
  const doc = await testRef.get();
  console.log('SUCCESS:', doc.data());
  await testRef.delete();
  console.log('Firestore is working!');
  process.exit(0);
}

test().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
