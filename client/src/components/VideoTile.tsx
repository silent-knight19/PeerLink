import { useRef, useEffect, useState } from 'react';

interface VideoTileProps {
  stream: MediaStream | null;
  isLocal?: boolean;
  isMuted?: boolean;
  isCamOff?: boolean;
  isScreenSharing?: boolean;
  displayName?: string;
}

export default function VideoTile({
  stream,
  isLocal = false,
  isMuted = false,
  isCamOff = false,
  isScreenSharing = false,
  displayName = 'Anonymous',
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showAvatar = isCamOff && !isScreenSharing;
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream) {
      console.log('[VideoTile] Setting stream for', displayName, 'tracks:', stream.getTracks().map(t => t.kind));
      videoEl.srcObject = stream;
      // Mute remote videos to satisfy autoplay policy; user can unmute via UI if needed
      videoEl.muted = !isLocal;
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setHasPlayed(true))
          .catch(() => {
            // Autoplay blocked - user interaction required
            setHasPlayed(false);
          });
      }
    }
    return () => {
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, [stream, isLocal]);

  return (
    <div className={`video-tile ${isLocal ? 'local' : 'remote'} ${showAvatar ? 'cam-off' : ''} ${!hasPlayed && !isLocal ? 'waiting-play' : ''}`}>
      {showAvatar ? (
        <div className="avatar-placeholder">
          {displayName.charAt(0).toUpperCase()}
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={!isLocal || isMuted}
          className="video-element"
        />
      )}
      {!hasPlayed && !isLocal && !showAvatar && (
        <div className="play-prompt" onClick={() => videoRef.current?.play()}>
          Click to play
        </div>
      )}
      <div className="video-tile-overlay">
        <span className="participant-name">{displayName}</span>
        {isMuted && <span className="mute-indicator">Muted</span>}
        {isCamOff && <span className="cam-indicator">Cam Off</span>}
        {isScreenSharing && <span className="share-indicator">Sharing</span>}
      </div>
    </div>
  );
}
