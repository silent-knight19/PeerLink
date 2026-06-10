import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWebRTC } from '../hooks/useWebRTC';
import { getSocket, connectSocket } from '../services/socket';
import api from '../services/api';
import VideoTile from '../components/VideoTile';
import MeetingControls from '../components/MeetingControls';

export default function MeetingRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  const [connectionState, setConnectionState] = useState<'connecting' | 'joined' | 'error'>('connecting');
  const [isHost, setIsHost] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socket, setSocket] = useState<ReturnType<typeof getSocket>>(null);

  useEffect(() => {
    setSocket(connectSocket());
  }, []);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'You';

  const {
    localStream,
    peers,
    isMuted,
    isCamOff,
    isScreenSharing,
    error,
    toggleMute,
    toggleCam,
    toggleScreenShare,
    leaveMeeting,
  } = useWebRTC({
    socket,
    roomId: roomId || '',
    userId: user?.id || '',
    displayName,
  });

  useEffect(() => {
    if (!socket || !roomId || isLoading) return;

    // Fetch room to determine if current user is the host
    api.get(`/rooms/${roomId}`).then(({ data }) => {
      if (data.room) {
        setIsHost(data.room.hostId === user?.id);
      }
    }).catch(() => {
      // Room doesn't exist yet (host hasn't created it?)
    });

    const onRoomJoined = () => {
      setConnectionState('joined');
    };

    const onRoomFull = () => {
      setErrorMessage('This meeting is full (max 4 participants)');
      setConnectionState('error');
    };

    const onRoomError = (data: { message: string }) => {
      setErrorMessage(data.message);
      setConnectionState('error');
    };

    const onRoomEnded = () => {
      setErrorMessage('The meeting has ended');
      setConnectionState('error');
    };

    socket.on('room-joined', onRoomJoined);
    socket.on('room-full', onRoomFull);
    socket.on('room-error', onRoomError);
    socket.on('room-ended', onRoomEnded);

    socket.emit('join-room', { roomId });

    return () => {
      socket.off('room-joined', onRoomJoined);
      socket.off('room-full', onRoomFull);
      socket.off('room-error', onRoomError);
      socket.off('room-ended', onRoomEnded);
    };
  }, [socket, roomId, isLoading, user?.id]);

  useEffect(() => {
    if (error) {
      setErrorMessage(error);
      setConnectionState('error');
    }
  }, [error]);

  const handleLeave = useCallback(() => {
    leaveMeeting();
    navigate('/dashboard');
  }, [leaveMeeting, navigate]);

  const handleEndMeeting = useCallback(() => {
    socket?.emit('end-meeting');
    leaveMeeting();
    navigate('/dashboard');
  }, [socket, leaveMeeting, navigate]);

  if (connectionState === 'connecting') {
    return (
      <div className="meeting-container">
        <div className="connecting-message">
          <p>Connecting to meeting...</p>
        </div>
      </div>
    );
  }

  if (connectionState === 'error') {
    return (
      <div className="meeting-container">
        <div className="error-message">
          <h2>Meeting Error</h2>
          <p>{errorMessage || 'Could not connect to the meeting.'}</p>
          <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const allPeers = Array.from(peers.entries());

  return (
    <div className="meeting-container">
      <div className="video-grid">
        <VideoTile
          stream={localStream}
          isLocal
          isMuted={isMuted}
          isCamOff={isCamOff}
          displayName={`${displayName} (You)`}
        />
        {allPeers.map(([socketId, peer]) => (
          <VideoTile
            key={socketId}
            stream={peer.stream}
            displayName={peer.displayName}
          />
        ))}
      </div>

      <MeetingControls
        isMuted={isMuted}
        isCamOff={isCamOff}
        isScreenSharing={isScreenSharing}
        isHost={isHost}
        roomId={roomId || ''}
        onToggleMute={toggleMute}
        onToggleCam={toggleCam}
        onToggleScreenShare={toggleScreenShare}
        onLeave={handleLeave}
        onEndMeeting={handleEndMeeting}
      />
    </div>
  );
}
