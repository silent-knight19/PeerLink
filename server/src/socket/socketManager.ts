import { Server as SocketIOServer, Socket } from 'socket.io';
import { getRoom, updateRoomStatus } from '../models/roomModel';
import { ClientToServerEvents, ServerToClientEvents } from '../types';

interface ParticipantInfo {
  socketId: string;
  userId: string;
  displayName: string;
}

const roomParticipants = new Map<string, Map<string, ParticipantInfo>>();

function getParticipantCount(roomId: string): number {
  return roomParticipants.get(roomId)?.size ?? 0;
}

function addParticipant(roomId: string, info: ParticipantInfo): void {
  if (!roomParticipants.has(roomId)) {
    roomParticipants.set(roomId, new Map());
  }
  roomParticipants.get(roomId)!.set(info.socketId, info);
}

function removeParticipant(roomId: string, socketId: string): void {
  const participants = roomParticipants.get(roomId);
  if (!participants) return;
  participants.delete(socketId);
  if (participants.size === 0) {
    roomParticipants.delete(roomId);
  }
}

function getParticipants(roomId: string): ParticipantInfo[] {
  const participants = roomParticipants.get(roomId);
  return participants ? Array.from(participants.values()) : [];
}

export function registerSocketHandlers(
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>,
): void {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    const user = socket.data.user;
    let currentRoom: string | null = null;

    socket.on('join-room', async ({ roomId }) => {
      try {
        const room = await getRoom(roomId);
        if (!room) {
          socket.emit('room-error', { message: 'Room not found' });
          return;
        }
        if (room.status === 'ended') {
          socket.emit('room-error', { message: 'This meeting has ended' });
          return;
        }

        if (getParticipantCount(roomId) >= room.maxParticipants) {
          socket.emit('room-full');
          return;
        }

        currentRoom = roomId;
        socket.join(roomId);

        const myInfo: ParticipantInfo = {
          socketId: socket.id,
          userId: user.userId,
          displayName: user.displayName || 'Anonymous',
        };

        const existingParticipants = getParticipants(roomId);
        addParticipant(roomId, myInfo);

        socket.emit('room-joined', {
          participants: existingParticipants,
        });

        socket.to(roomId).emit('peer-joined', {
          socketId: socket.id,
          userId: user.userId,
          displayName: user.displayName || 'Anonymous',
        });
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('room-error', { message: 'Failed to join room' });
      }
    });

    socket.on('signal', ({ to, data }) => {
      if (!currentRoom) return;
      socket.to(to).emit('signal', {
        from: socket.id,
        data,
      });
    });

    socket.on('leave-room', () => {
      if (!currentRoom) return;
      const roomId = currentRoom;
      socket.leave(roomId);
      removeParticipant(roomId, socket.id);
      io.to(roomId).emit('peer-left', { socketId: socket.id, userId: user.userId });
      currentRoom = null;
    });

    socket.on('end-meeting', async () => {
      try {
        if (!currentRoom) return;
        const room = await getRoom(currentRoom);
        if (!room || room.hostId !== user.userId) {
          socket.emit('room-error', { message: 'Only the host can end the meeting' });
          return;
        }
        await updateRoomStatus(currentRoom, 'ended');
        io.to(currentRoom).emit('room-ended');
      } catch (error) {
        console.error('Error ending meeting:', error);
        socket.emit('room-error', { message: 'Failed to end meeting' });
      }
    });

    socket.on('disconnect', () => {
      if (currentRoom) {
        removeParticipant(currentRoom, socket.id);
        io.to(currentRoom).emit('peer-left', { socketId: socket.id, userId: user.userId });
      }
    });
  });
}
