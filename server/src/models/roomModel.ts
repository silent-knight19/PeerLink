import { firestore } from '../config/firebase';
import { Room, RoomStatus } from '../types';
import { generateId, now } from '../utils/helpers';

const COLLECTION = 'rooms';

export async function createRoom(hostId: string): Promise<Room> {
  const roomId = generateId();
  const timestamp = now();

  const room: Omit<Room, 'id'> = {
    hostId,
    status: 'waiting',
    maxParticipants: 4,
    createdAt: timestamp,
    endedAt: null,
  };

  await firestore.collection(COLLECTION).doc(roomId).set(room);

  return { id: roomId, ...room };
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const snap = await firestore.collection(COLLECTION).doc(roomId).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return {
    id: snap.id,
    hostId: data.hostId,
    status: data.status,
    maxParticipants: data.maxParticipants,
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
    endedAt: data.endedAt?.toDate?.() ?? data.endedAt ?? null,
  };
}

export async function updateRoomStatus(roomId: string, status: RoomStatus): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (status === 'ended') {
    update.endedAt = now();
  }
  await firestore.collection(COLLECTION).doc(roomId).update(update);
}
