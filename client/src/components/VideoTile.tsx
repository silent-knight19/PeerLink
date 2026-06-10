import { useRef, useEffect } from 'react';

interface VideoTileProps {
  stream: MediaStream | null;
  isLocal?: boolean;
  isMuted?: boolean;
  isCamOff?: boolean;
  displayName?: string;
}

export default function VideoTile({
  stream,
  isLocal = false,
  isMuted = false,
  isCamOff = false,
  displayName = 'Anonymous',
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream) {
      videoEl.srcObject = stream;
    }
    return () => {
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <div className={`video-tile ${isLocal ? 'local' : 'remote'} ${isCamOff ? 'cam-off' : ''}`}>
      {isCamOff ? (
        <div className="avatar-placeholder">
          {displayName.charAt(0).toUpperCase()}
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal || isMuted}
          className="video-element"
        />
      )}
      <div className="video-tile-overlay">
        <span className="participant-name">{displayName}</span>
        {isMuted && <span className="mute-indicator">Muted</span>}
        {isCamOff && <span className="cam-indicator">Cam Off</span>}
      </div>
    </div>
  );
}
