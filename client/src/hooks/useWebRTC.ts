import { useState, useRef, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Free TURN servers for NAT traversal (symmetric NAT scenarios)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

interface MediaState {
  isMuted: boolean;
  isCamOff: boolean;
  isScreenSharing: boolean;
}

interface PeerInfo extends MediaState {
  userId: string;
  displayName: string;
  stream: MediaStream | null;
}

interface ParticipantInfo {
  socketId: string;
  userId: string;
  displayName: string;
  mediaState?: MediaState;
}

interface SignalPayload {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
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

const emptyMediaState = (): MediaState => ({
  isMuted: false,
  isCamOff: false,
  isScreenSharing: false,
});

export function useWebRTC({
  socket,
  roomId: _roomId,
  userId: _userId,
  displayName: _displayName,
}: UseWebRTCProps): UseWebRTCReturn {
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerMetadataRef = useRef<Map<string, Omit<PeerInfo, 'stream'>>>(new Map());
  const pendingRemoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const disconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingInitiationsRef = useRef<Set<string>>(new Set());
  const pendingOffersRef = useRef<Map<string, { from: string; data: SignalPayload }>>(new Map());
  const mediaStateRef = useRef<MediaState>(emptyMediaState());
  const isScreenSharingRef = useRef(false);
  const isCamOffRef = useRef(false);
  const isMutedRef = useRef(false);
  const camTurnOnSeqRef = useRef(0);

  const publishLocalStream = useCallback(() => {
    const stream = localStreamRef.current;
    setLocalStream(stream ? new MediaStream(stream.getTracks()) : null);
  }, []);

  const stopTracks = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopAllTracks = useCallback(() => {
    stopTracks(cameraStreamRef.current);
    stopTracks(screenStreamRef.current);
    localStreamRef.current?.getTracks().forEach((track) => {
      if (!cameraStreamRef.current?.getTracks().includes(track) && !screenStreamRef.current?.getTracks().includes(track)) {
        track.stop();
      }
    });
  }, [stopTracks]);

  const emitMediaState = useCallback(
    (nextState: MediaState) => {
      mediaStateRef.current = nextState;
      socket?.emit('media-state', nextState);
    },
    [socket],
  );

  const updateMediaState = useCallback(
    (patch: Partial<MediaState>) => {
      const nextState = {
        ...mediaStateRef.current,
        ...patch,
      };
      isMutedRef.current = nextState.isMuted;
      isCamOffRef.current = nextState.isCamOff;
      isScreenSharingRef.current = nextState.isScreenSharing;
      setIsMuted(nextState.isMuted);
      setIsCamOff(nextState.isCamOff);
      setIsScreenSharing(nextState.isScreenSharing);
      emitMediaState(nextState);
    },
    [emitMediaState],
  );

  const upsertPeer = useCallback((peerSocketId: string, stream?: MediaStream | null) => {
    const meta = peerMetadataRef.current.get(peerSocketId);
    if (!meta) {
      if (stream) {
        pendingRemoteStreamsRef.current.set(peerSocketId, stream);
      }
      return;
    }

    setPeers((prev) => {
      const next = new Map(prev);
      const current = next.get(peerSocketId);
      const pendingStream = pendingRemoteStreamsRef.current.get(peerSocketId);
      if (pendingStream) {
        pendingRemoteStreamsRef.current.delete(peerSocketId);
      }
      next.set(peerSocketId, {
        ...meta,
        stream: stream === undefined ? pendingStream ?? current?.stream ?? null : stream,
      });
      return next;
    });
  }, []);

  const setPeerMetadata = useCallback(
    (participant: {
      socketId: string;
      userId: string;
      displayName: string;
      mediaState?: MediaState;
    }) => {
      const mediaState = participant.mediaState ?? emptyMediaState();
      peerMetadataRef.current.set(participant.socketId, {
        userId: participant.userId,
        displayName: participant.displayName,
        ...mediaState,
      });
      upsertPeer(participant.socketId);
    },
    [upsertPeer],
  );

  const removePeer = useCallback((peerSocketId: string) => {
    const timer = disconnectTimersRef.current.get(peerSocketId);
    if (timer) {
      clearTimeout(timer);
      disconnectTimersRef.current.delete(peerSocketId);
    }
    pcsRef.current.get(peerSocketId)?.close();
    pcsRef.current.delete(peerSocketId);
    peerMetadataRef.current.delete(peerSocketId);
    pendingRemoteStreamsRef.current.delete(peerSocketId);
    remoteStreamsRef.current.delete(peerSocketId);
    pendingCandidatesRef.current.delete(peerSocketId);
    pendingInitiationsRef.current.delete(peerSocketId);
    setPeers((prev) => {
      const next = new Map(prev);
      next.delete(peerSocketId);
      return next;
    });
  }, []);

  const clearPeerConnections = useCallback(() => {
    disconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
    disconnectTimersRef.current.clear();
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    pendingRemoteStreamsRef.current.clear();
    remoteStreamsRef.current.clear();
    pendingCandidatesRef.current.clear();
    pendingInitiationsRef.current.clear();
    pendingOffersRef.current.clear();
    peerMetadataRef.current.clear();
    setPeers(new Map());
  }, []);

  const getSender = useCallback((pc: RTCPeerConnection, kind: 'audio' | 'video') => {
    return pc
      .getTransceivers()
      .find((transceiver) => transceiver.sender.track?.kind === kind || transceiver.receiver.track.kind === kind)
      ?.sender;
  }, []);

  const ensureSender = useCallback(
    (pc: RTCPeerConnection, kind: 'audio' | 'video') => {
      return getSender(pc, kind) ?? pc.addTransceiver(kind, { direction: 'sendrecv' }).sender;
    },
    [getSender],
  );

  const replaceSenderTrack = useCallback(
    async (kind: 'audio' | 'video', track: MediaStreamTrack | null) => {
      await Promise.all(
        Array.from(pcsRef.current.values()).map((pc) => ensureSender(pc, kind).replaceTrack(track)),
      );
    },
    [ensureSender],
  );

  const syncTracksToPC = useCallback(
    async (pc: RTCPeerConnection) => {
      const stream = localStreamRef.current;
      const audioTrack = stream?.getAudioTracks()[0] ?? null;
      const videoTrack = stream?.getVideoTracks()[0] ?? null;

      console.log('[Tracks] syncTracksToPC:', {
        hasAudio: !!audioTrack,
        hasVideo: !!videoTrack,
        pcTransceivers: pc.getTransceivers().map(t => ({
          kind: t.receiver.track?.kind,
          senderTrack: !!t.sender.track,
          direction: t.direction,
        })),
      });

      for (const kind of ['audio', 'video'] as const) {
        const track = kind === 'audio' ? audioTrack : videoTrack;
        const existingSender = getSender(pc, kind);

        if (existingSender) {
          console.log('[Tracks] Replacing', kind, 'sender, track:', !!track);
          await existingSender.replaceTrack(track);
          const transceiver = pc.getTransceivers().find(t => t.sender === existingSender);
          if (transceiver) {
            const newDirection = track ? 'sendrecv' : 'recvonly';
            if (transceiver.direction !== newDirection) {
              (transceiver as { direction: string }).direction = newDirection;
            }
          }
        } else if (track && stream) {
          console.log('[Tracks] Adding', kind, 'track to PC');
          pc.addTrack(track, stream);
        } else {
          const hasTransceiver = pc.getTransceivers().some(
            t => t.receiver.track?.kind === kind
          );
          if (!hasTransceiver) {
            console.log('[Tracks] Adding', kind, 'recvonly transceiver');
            pc.addTransceiver(kind, { direction: 'recvonly' });
          } else {
            console.log('[Tracks] Skipping', kind, '- transceiver already exists');
          }
        }
      }
    },
    [getSender],
  );


  const flushPendingCandidates = useCallback(async (peerSocketId: string, pc: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current.get(peerSocketId);
    if (!candidates?.length || !pc.remoteDescription) return;

    pendingCandidatesRef.current.delete(peerSocketId);
    for (const candidate of candidates) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const createPeerConnection = useCallback(
    (peerSocketId: string) => {
      const existing = pcsRef.current.get(peerSocketId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcsRef.current.set(peerSocketId, pc);
      // NOTE: Do NOT call syncTracksToPC here.
      // For the offerer, tracks are added in initiateCall() before createOffer().
      // For the answerer, tracks are added in onSignal() after setRemoteDescription().
      // Calling addTransceiver before setRemoteDescription (on the answerer side) causes
      // JSEP transceiver mis-matching and breaks the offer/answer track negotiation.

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        console.log(`[ICE] Sending candidate to ${peerSocketId}:`, event.candidate.type, event.candidate.protocol);
        socket?.emit('signal', {
          to: peerSocketId,
          data: {
            type: 'ice-candidate',
            candidate: event.candidate.toJSON(),
          },
        });
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[ICE] Connection state with ${peerSocketId}:`, pc.iceConnectionState);
      };

      pc.onicegatheringstatechange = () => {
        console.log(`[ICE] Gathering state with ${peerSocketId}:`, pc.iceGatheringState);
      };

      pc.onsignalingstatechange = () => {
        console.log(`[Signaling] State with ${peerSocketId}:`, pc.signalingState);
      };

      pc.ontrack = (event) => {
        console.log('[onTrack] Received track:', event.track.kind, event.track.id, 'from', peerSocketId, 'streams:', event.streams?.length);
        let stream = remoteStreamsRef.current.get(peerSocketId);
        if (!stream) {
          stream = new MediaStream();
          remoteStreamsRef.current.set(peerSocketId, stream);
        }

        // Add the track to our consolidated stream if not already present
        if (!stream.getTracks().some((t) => t.id === event.track.id)) {
          stream.addTrack(event.track);
          console.log('[onTrack] Added', event.track.kind, 'to consolidated stream, total tracks:', stream.getTracks().length);
        }

        event.track.onended = () => {
          const s = remoteStreamsRef.current.get(peerSocketId);
          if (s) {
            s.removeTrack(event.track);
            upsertPeer(peerSocketId, new MediaStream(s.getTracks()));
          }
        };

        // Also add other tracks from event.streams if available
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((track) => {
            if (stream && !stream.getTracks().some((t) => t.id === track.id)) {
              stream.addTrack(track);
              console.log('[onTrack] Added', track.kind, 'from event.streams, total tracks:', stream.getTracks().length);
            }
            track.onended = () => {
              const s = remoteStreamsRef.current.get(peerSocketId);
              if (s) {
                s.removeTrack(track);
                upsertPeer(peerSocketId, new MediaStream(s.getTracks()));
              }
            };
          });
        }

        // Always create a new MediaStream instance to change the reference and trigger React/VideoTile updates
        const updatedStream = new MediaStream(stream.getTracks());
        upsertPeer(peerSocketId, updatedStream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          removePeer(peerSocketId);
          return;
        }

        if (pc.connectionState === 'disconnected') {
          if (disconnectTimersRef.current.has(peerSocketId)) return;
          const timer = setTimeout(() => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              removePeer(peerSocketId);
            }
          }, 8000);
          disconnectTimersRef.current.set(peerSocketId, timer);
          return;
        }

        if (pc.connectionState === 'connected') {
          const timer = disconnectTimersRef.current.get(peerSocketId);
          if (timer) {
            clearTimeout(timer);
            disconnectTimersRef.current.delete(peerSocketId);
          }

          // Fallback: when the connection is fully established, explicitly read all
          // live receiver tracks and update the remote stream. This handles any case
          // where ontrack fired early (before ICE) or was silently missed.
          const liveTracks = pc
            .getReceivers()
            .map((r) => r.track)
            .filter((t): t is MediaStreamTrack => t !== null && t.readyState === 'live');

          if (liveTracks.length > 0) {
            let stream = remoteStreamsRef.current.get(peerSocketId);
            if (!stream) {
              stream = new MediaStream();
              remoteStreamsRef.current.set(peerSocketId, stream);
            }

            let changed = false;
            for (const track of liveTracks) {
              if (!stream.getTracks().some((t) => t.id === track.id)) {
                stream.addTrack(track);
                changed = true;
              }
            }

            // Always refresh the peer entry on first connection so the VideoTile
            // gets an up-to-date MediaStream reference and re-attaches srcObject.
            upsertPeer(peerSocketId, new MediaStream(stream.getTracks()));
          }
        }

      };

      return pc;
    },
    [removePeer, socket, upsertPeer],
  );

  const initiateCall = useCallback(
    async (peerSocketId: string) => {
      if (!localStreamRef.current) {
        console.log('[Call] Queuing initiation for', peerSocketId, '- no local stream yet');
        pendingInitiationsRef.current.add(peerSocketId);
        return;
      }

      const pc = createPeerConnection(peerSocketId);
      if (pc.signalingState !== 'stable' || pc.localDescription) return;

      try {
        console.log('[Call] Initiating call to', peerSocketId);
        await syncTracksToPC(pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('[Call] Sending offer to', peerSocketId);
        socket?.emit('signal', {
          to: peerSocketId,
          data: { type: 'offer', sdp: pc.localDescription ?? offer },
        });
      } catch (err) {
        console.error('Failed to initiate call with peer', peerSocketId, err);
        removePeer(peerSocketId);
      }
    },
    [createPeerConnection, removePeer, socket, syncTracksToPC],
  );

  const processOffer = useCallback(
    async (from: string, sdp: RTCSessionDescriptionInit) => {
      console.log('[Signal] Processing deferred offer from', from);
      const pc = createPeerConnection(from);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await syncTracksToPC(pc);
        await flushPendingCandidates(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket?.emit('signal', {
          to: from,
          data: { type: 'answer', sdp: pc.localDescription ?? answer },
        });
      } catch (err) {
        console.warn('Failed to process offer from', from, err);
      }
    },
    [createPeerConnection, flushPendingCandidates, socket, syncTracksToPC],
  );

  useEffect(() => {
    let active = true;

    async function startLocalStream() {
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (!active) {
          stopTracks(cameraStream);
          return;
        }
        console.log('[Stream] getUserMedia obtained:', cameraStream.getTracks().map(t => t.kind));
        cameraStreamRef.current = cameraStream;
        localStreamRef.current = new MediaStream(cameraStream.getTracks());
        console.log('[Stream] localStreamRef tracks:', localStreamRef.current.getTracks().map(t => t.kind));
        publishLocalStream();
      } catch {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          if (!active) {
            stopTracks(audioStream);
            return;
          }
          cameraStreamRef.current = null;
          localStreamRef.current = new MediaStream(audioStream.getAudioTracks());
          publishLocalStream();
          mediaStateRef.current = {
            ...mediaStateRef.current,
            isCamOff: true,
          };
          isCamOffRef.current = true;
          setIsCamOff(true);
        } catch {
          if (active) {
            setError('Camera/microphone access denied. Please grant permissions to join the meeting.');
          }
        }
      }
    }

    void startLocalStream();

    return () => {
      active = false;
      camTurnOnSeqRef.current += 1;
      stopAllTracks();
      clearPeerConnections();
    };
  }, [clearPeerConnections, publishLocalStream, stopAllTracks, stopTracks]);

  useEffect(() => {
    if (!localStream) return;
    for (const peerId of pendingInitiationsRef.current) {
      void initiateCall(peerId);
    }
    pendingInitiationsRef.current.clear();
    pcsRef.current.forEach((pc) => void syncTracksToPC(pc));
    pendingOffersRef.current.forEach((offerData, from) => {
      pendingOffersRef.current.delete(from);
      void processOffer(from, offerData.data.sdp!);
    });
  }, [initiateCall, localStream, processOffer, syncTracksToPC]);

  useEffect(() => {
    if (!socket) return;

    const onRoomJoined = (data: { participants: ParticipantInfo[] }) => {
      console.log('[useWebRTC] Received room-joined, participants:', data.participants?.length);
      clearPeerConnections();
      emitMediaState(mediaStateRef.current);

      for (const participant of data.participants) {
        setPeerMetadata({
          socketId: participant.socketId,
          userId: participant.userId,
          displayName: participant.displayName,
          mediaState: participant.mediaState,
        });
        void initiateCall(participant.socketId);
      }
    };

    const onPeerJoined = (participant: ParticipantInfo) => {
      console.log('[useWebRTC] Received peer-joined:', participant.socketId);
      setPeerMetadata({
        socketId: participant.socketId,
        userId: participant.userId,
        displayName: participant.displayName,
        mediaState: participant.mediaState,
      });
    };

    const onPeerLeft = (data: { socketId: string }) => {
      removePeer(data.socketId);
    };

    const onMediaState = (data: { socketId: string; mediaState: MediaState }) => {
      const current = peerMetadataRef.current.get(data.socketId);
      if (!current) return;
      peerMetadataRef.current.set(data.socketId, {
        ...current,
        ...data.mediaState,
      });
      upsertPeer(data.socketId);
    };

    const onSignal = async (data: { from: string; data: SignalPayload }) => {
      const { from, data: signalData } = data;
      console.log('[Signal] Received', signalData.type, 'from', from);

      try {
        if (signalData.type === 'offer' && signalData.sdp) {
          if (!localStreamRef.current) {
            console.log('[Signal] Deferring offer from', from, '- local stream not ready');
            pendingOffersRef.current.set(from, data);
            return;
          }
          await processOffer(from, signalData.sdp);
          return;
        }

        if (signalData.type === 'answer' && signalData.sdp) {
          const pc = createPeerConnection(from);
          console.log('[Signal] Setting remote description (answer) from', from, 'signalingState:', pc.signalingState);
          if (pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
            await flushPendingCandidates(from, pc);
          }
          return;
        }

        if (signalData.type === 'ice-candidate' && signalData.candidate) {
          console.log('[Signal] Received ICE candidate from', from);
          const pc = createPeerConnection(from);
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
            return;
          }
          const queued = pendingCandidatesRef.current.get(from) ?? [];
          queued.push(signalData.candidate);
          pendingCandidatesRef.current.set(from, queued);
        }
      } catch (err) {
        console.warn('Signaling error for peer', from, err);
      }
    };

    const onDisconnect = () => {
      clearPeerConnections();
    };

    socket.on('room-joined', onRoomJoined);
    socket.on('peer-joined', onPeerJoined);
    socket.on('peer-left', onPeerLeft);
    socket.on('media-state', onMediaState);
    socket.on('signal', onSignal);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('room-joined', onRoomJoined);
      socket.off('peer-joined', onPeerJoined);
      socket.off('peer-left', onPeerLeft);
      socket.off('media-state', onMediaState);
      socket.off('signal', onSignal);
      socket.off('disconnect', onDisconnect);
    };
  }, [
    clearPeerConnections,
    createPeerConnection,
    emitMediaState,
    flushPendingCandidates,
    initiateCall,
    processOffer,
    removePeer,
    setPeerMetadata,
    socket,
    syncTracksToPC,
    upsertPeer,
  ]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    updateMediaState({ isMuted: nextMuted });
  }, [updateMediaState]);

  const toggleCam = useCallback(async () => {
    if (isCamOffRef.current) {
      camTurnOnSeqRef.current += 1;
      const seq = camTurnOnSeqRef.current;
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (seq !== camTurnOnSeqRef.current) {
          stopTracks(newStream);
          return;
        }

        stopTracks(cameraStreamRef.current);
        cameraStreamRef.current = newStream;
        const newTrack = newStream.getVideoTracks()[0] ?? null;

        if (!isScreenSharingRef.current && newTrack) {
          localStreamRef.current?.getVideoTracks().forEach((track) => {
            localStreamRef.current?.removeTrack(track);
            if (!screenStreamRef.current?.getTracks().includes(track)) {
              track.stop();
            }
          });
          localStreamRef.current?.addTrack(newTrack);
          await replaceSenderTrack('video', newTrack);
          publishLocalStream();
        }

        updateMediaState({ isCamOff: false });
      } catch {
        setError('Could not turn on the camera. Check camera permissions or device availability.');
      }
      return;
    }

    if (!isScreenSharingRef.current) {
      localStreamRef.current?.getVideoTracks().forEach((track) => {
        localStreamRef.current?.removeTrack(track);
      });
      await replaceSenderTrack('video', null);
      publishLocalStream();
    }

    stopTracks(cameraStreamRef.current);
    cameraStreamRef.current = null;
    updateMediaState({ isCamOff: true });
  }, [publishLocalStream, replaceSenderTrack, stopTracks, updateMediaState]);

  const stopScreenShare = useCallback(async () => {
    const screenTrack = screenStreamRef.current?.getVideoTracks()[0] ?? null;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      if (track === screenTrack) {
        localStreamRef.current?.removeTrack(track);
      }
    });
    stopTracks(screenStreamRef.current);
    screenStreamRef.current = null;

    if (!isCamOffRef.current) {
      let cameraTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
      if (!cameraTrack || cameraTrack.readyState !== 'live') {
        try {
          const newCameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
          stopTracks(cameraStreamRef.current);
          cameraStreamRef.current = newCameraStream;
          cameraTrack = newCameraStream.getVideoTracks()[0] ?? null;
        } catch {
          cameraTrack = null;
          updateMediaState({ isCamOff: true });
        }
      }

      if (cameraTrack) {
        localStreamRef.current?.getVideoTracks().forEach((track) => {
          localStreamRef.current?.removeTrack(track);
          track.stop();
        });
        localStreamRef.current?.addTrack(cameraTrack);
        await replaceSenderTrack('video', cameraTrack);
      } else {
        await replaceSenderTrack('video', null);
      }
    } else {
      await replaceSenderTrack('video', null);
    }

    publishLocalStream();
    updateMediaState({ isScreenSharing: false });
  }, [publishLocalStream, replaceSenderTrack, stopTracks, updateMediaState]);

  const toggleScreenShareRef = useRef<() => void>(() => {});

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharingRef.current) {
      await stopScreenShare();
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0] ?? null;
      if (!screenTrack) {
        stopTracks(screenStream);
        return;
      }

      localStreamRef.current?.getVideoTracks().forEach((track) => {
        localStreamRef.current?.removeTrack(track);
      });
      localStreamRef.current?.addTrack(screenTrack);
      await replaceSenderTrack('video', screenTrack);
      publishLocalStream();
      updateMediaState({ isScreenSharing: true });

      screenTrack.onended = () => {
        if (isScreenSharingRef.current) {
          toggleScreenShareRef.current();
        }
      };
    } catch {
      // User cancelled the browser screen-share picker.
    }
  }, [publishLocalStream, replaceSenderTrack, stopScreenShare, stopTracks, updateMediaState]);

  toggleScreenShareRef.current = () => {
    void toggleScreenShare();
  };

  const leaveMeeting = useCallback(() => {
    socket?.emit('leave-room');
    stopAllTracks();
    clearPeerConnections();
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
    localStreamRef.current = null;
    publishLocalStream();
  }, [clearPeerConnections, publishLocalStream, socket, stopAllTracks]);

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
