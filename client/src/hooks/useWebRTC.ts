import { useState, useRef, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerInfo {
  userId: string;
  displayName: string;
  stream: MediaStream;
}

interface UseWebRTCProps {
  socket: Socket | null;
  roomId: string;
  userId: string;
  displayName: string;
}

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  peers: Map<string, PeerInfo>;
  isMuted: boolean;
  isCamOff: boolean;
  isScreenSharing: boolean;
  error: string | null;
  toggleMute: () => void;
  toggleCam: () => void;
  toggleScreenShare: () => void;
  leaveMeeting: () => void;
}

export function useWebRTC({
  socket,
  roomId,
  userId,
  displayName,
}: UseWebRTCProps): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerMetadataRef = useRef<Map<string, { userId: string; displayName: string }>>(new Map());
  const disconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Track the original camera stream so we can restore it after screen share
  const cameraStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    async function startLocalStream() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        cameraStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        setError(
          'Camera/microphone access denied. Please grant permissions to join the meeting.',
        );
      }
    }
    startLocalStream();

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      disconnectTimersRef.current.forEach((t) => clearTimeout(t));
      disconnectTimersRef.current.clear();
    };
  }, []);

  const addPeerStream = useCallback((peerSocketId: string, stream: MediaStream) => {
    const meta = peerMetadataRef.current.get(peerSocketId);
    if (!meta) return;
    setPeers((prev) => {
      const next = new Map(prev);
      next.set(peerSocketId, {
        userId: meta.userId,
        displayName: meta.displayName,
        stream,
      });
      return next;
    });
  }, []);

  const removePeer = useCallback((peerSocketId: string) => {
    const timer = disconnectTimersRef.current.get(peerSocketId);
    if (timer) {
      clearTimeout(timer);
      disconnectTimersRef.current.delete(peerSocketId);
    }
    pcsRef.current.get(peerSocketId)?.close();
    pcsRef.current.delete(peerSocketId);
    peerMetadataRef.current.delete(peerSocketId);
    setPeers((prev) => {
      const next = new Map(prev);
      next.delete(peerSocketId);
      return next;
    });
  }, []);

  const createPeerConnection = useCallback(
    (peerSocketId: string) => {
      if (pcsRef.current.has(peerSocketId)) {
        return pcsRef.current.get(peerSocketId)!;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcsRef.current.set(peerSocketId, pc);

      localStreamRef.current?.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current);
        }
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket?.emit('signal', {
          to: peerSocketId,
          data: {
            type: 'ice-candidate',
            candidate: event.candidate.toJSON(),
          },
        });
      };

      pc.ontrack = (event) => {
        addPeerStream(peerSocketId, event.streams[0]);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          removePeer(peerSocketId);
        } else if (pc.connectionState === 'disconnected') {
          const timer = setTimeout(() => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              removePeer(peerSocketId);
            }
          }, 5000);
          disconnectTimersRef.current.set(peerSocketId, timer);
        } else if (pc.connectionState === 'connected') {
          const timer = disconnectTimersRef.current.get(peerSocketId);
          if (timer) {
            clearTimeout(timer);
            disconnectTimersRef.current.delete(peerSocketId);
          }
        }
      };

      return pc;
    },
    [socket, addPeerStream, removePeer],
  );

  const initiateCall = useCallback(
    async (peerSocketId: string) => {
      if (!localStreamRef.current) return;
      if (pcsRef.current.has(peerSocketId)) return;
      const pc = createPeerConnection(peerSocketId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('signal', {
          to: peerSocketId,
          data: { type: 'offer', sdp: pc.localDescription },
        });
      } catch (err) {
        console.error('Failed to initiate call with peer', peerSocketId, err);
        removePeer(peerSocketId);
      }
    },
    [createPeerConnection, socket, removePeer],
  );

  useEffect(() => {
    if (!socket) return;

    const onRoomJoined = (data: { participants: Array<{ socketId: string; userId: string; displayName: string }> }) => {
      for (const p of data.participants) {
        peerMetadataRef.current.set(p.socketId, {
          userId: p.userId,
          displayName: p.displayName,
        });
        initiateCall(p.socketId);
      }
    };

    const onPeerJoined = (data: { socketId: string; userId: string; displayName: string }) => {
      peerMetadataRef.current.set(data.socketId, {
        userId: data.userId,
        displayName: data.displayName,
      });
      initiateCall(data.socketId);
    };

    const onPeerLeft = (data: { socketId: string; userId: string }) => {
      removePeer(data.socketId);
    };

    const onSignal = async (data: { from: string; data: { type: string; sdp?: any; candidate?: any } }) => {
      const { from, data: signalData } = data;
      const pc = createPeerConnection(from);

      try {
        if (signalData.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', {
            to: from,
            data: { type: 'answer', sdp: pc.localDescription },
          });
        } else if (signalData.type === 'answer') {
          if (pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          }
        } else if (signalData.type === 'ice-candidate') {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          }
        }
      } catch (err) {
        console.warn('Signaling error for peer', from, err);
      }
    };

    socket.on('room-joined', onRoomJoined);
    socket.on('peer-joined', onPeerJoined);
    socket.on('peer-left', onPeerLeft);
    socket.on('signal', onSignal);

    return () => {
      socket.off('room-joined', onRoomJoined);
      socket.off('peer-joined', onPeerJoined);
      socket.off('peer-left', onPeerLeft);
      socket.off('signal', onSignal);
    };
  }, [socket, createPeerConnection, initiateCall, removePeer]);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  const toggleCam = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsCamOff((prev) => !prev);
  }, []);

  const toggleScreenShareRef = useRef<() => void>(() => {});

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;

      if (!isCamOff && cameraStreamRef.current) {
        const cameraTrack = cameraStreamRef.current.getVideoTracks()[0];
        if (cameraTrack) {
          pcsRef.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(cameraTrack);
          });
          localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
          localStreamRef.current?.addTrack(cameraTrack);
        }
      } else {
        pcsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(null);
        });
        localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        pcsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });
        localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
        localStreamRef.current?.addTrack(screenTrack);
        setIsScreenSharing(true);

        screenTrack.onended = () => toggleScreenShareRef.current();
      } catch {
        // User cancelled screen share prompt
      }
    }
  }, [isScreenSharing, isCamOff]);

  toggleScreenShareRef.current = toggleScreenShare;

  const leaveMeeting = useCallback(() => {
    socket?.emit('leave-room');
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    setPeers(new Map());
    setLocalStream(null);
  }, [socket]);

  return {
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
  };
}
