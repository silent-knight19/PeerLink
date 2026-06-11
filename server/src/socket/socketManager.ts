import { Server as SocketIOServer, Socket } from 'socket.io';
import { getRoom, updateRoomStatus } from '../models/roomModel';
import { ClientToServerEvents, MediaState, ParticipantInfo, ServerToClientEvents } from '../types';

const DEFAULT_MEDIA_STATE: MediaState = {
  isMuted: false,
  isCamOff: false,
  isScreenSharing: false,
};

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

    const leaveCurrentRoom = () => {
      if (!currentRoom) return;
      const roomId = currentRoom;
      socket.leave(roomId);
      removeParticipant(roomId, socket.id);
      io.to(roomId).emit('peer-left', { socketId: socket.id, userId: user.userId });
      currentRoom = null;
    };

    socket.on('join-room', async ({ roomId }) => {
      try {
        if (currentRoom === roomId && roomParticipants.get(roomId)?.has(socket.id)) {
          socket.emit('room-joined', {
            participants: getParticipants(roomId).filter((p) => p.socketId !== socket.id),
          });
          return;
        }

        if (currentRoom && currentRoom !== roomId) {
          leaveCurrentRoom();
        }

        const room = await getRoom(roomId);
        if (!room) {
          socket.emit('room-error', { message: 'Room not found' });
          return;
        }
        if (room.status === 'ended') {
          socket.emit('room-error', { message: 'This meeting has ended' });
          return;
        }

        if (!roomParticipants.get(roomId)?.has(socket.id) && getParticipantCount(roomId) >= room.maxParticipants) {
          socket.emit('room-full');
          return;
        }

        if (room.status === 'waiting') {
          await updateRoomStatus(roomId, 'active');
        }

        currentRoom = roomId;
        socket.join(roomId);

        const myInfo: ParticipantInfo = {
          socketId: socket.id,
          userId: user.userId,
          displayName: user.displayName || 'Anonymous',
          mediaState: { ...DEFAULT_MEDIA_STATE },
        };

        const existingParticipants = getParticipants(roomId).filter((p) => p.socketId !== socket.id);
        addParticipant(roomId, myInfo);

        socket.emit('room-joined', {
          participants: existingParticipants,
        });

        console.log('[Server] Room joined:', roomId, 'by', socket.id, 'existing participants:', existingParticipants.map(p => p.socketId));

        socket.to(roomId).emit('peer-joined', {
          socketId: socket.id,
          userId: user.userId,
          displayName: user.displayName || 'Anonymous',
          mediaState: myInfo.mediaState,
        });
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('room-error', { message: 'Failed to join room' });
      }
    });

    socket.on('signal', ({ to, data }) => {
      if (!currentRoom) return;
      if (!roomParticipants.get(currentRoom)?.has(to)) {
        console.log('[Server Signal] Target peer not in room:', to, 'participants:', Array.from(roomParticipants.get(currentRoom)?.keys() || []));
        return;
      }
      console.log('[Server Signal] Relaying', data.type, 'from', socket.id, 'to', to);
      socket.to(to).emit('signal', {
        from: socket.id,
        data,
      });
    });

    socket.on('media-state', (mediaState) => {
      if (!currentRoom) return;
      const participant = roomParticipants.get(currentRoom)?.get(socket.id);
      if (!participant) return;

      participant.mediaState = mediaState;
      socket.to(currentRoom).emit('media-state', {
        socketId: socket.id,
        userId: user.userId,
        mediaState,
      });
    });

    socket.on('leave-room', () => {
      console.log('[Server] Leave room:', currentRoom, 'by', socket.id);
      leaveCurrentRoom();
    });

    socket.on('end-meeting', async () => {
      try {
        if (!currentRoom) return;
        const roomId = currentRoom;
        const room = await getRoom(roomId);
        if (!room || room.hostId !== user.userId) {
          socket.emit('room-error', { message: 'Only the host can end the meeting' });
          return;
        }
        await updateRoomStatus(roomId, 'ended');
        io.to(roomId).emit('room-ended');
        roomParticipants.delete(roomId);
        io.in(roomId).socketsLeave(roomId);
        currentRoom = null;
      } catch (error) {
        console.error('Error ending meeting:', error);
        socket.emit('room-error', { message: 'Failed to end meeting' });
      }
    });

    socket.on('disconnect', () => {
      leaveCurrentRoom();
    });
  });
}
