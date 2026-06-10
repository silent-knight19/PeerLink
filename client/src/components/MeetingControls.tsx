import { useState, useCallback } from 'react';

interface MeetingControlsProps {
  isMuted: boolean;
  isCamOff: boolean;
  isScreenSharing: boolean;
  isHost: boolean;
  roomId: string;
  onToggleMute: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
  onEndMeeting: () => void;
}

export default function MeetingControls({
  isMuted,
  isCamOff,
  isScreenSharing,
  isHost,
  roomId,
  onToggleMute,
  onToggleCam,
  onToggleScreenShare,
  onLeave,
  onEndMeeting,
}: MeetingControlsProps) {
  const [copied, setCopied] = useState(false);

  const copyInviteLink = useCallback(async () => {
    const link = `${window.location.origin}/meeting/${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (err) {
        console.error('Failed to copy invite link:', err);
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  return (
    <div className="meeting-controls">
      <button
        className={`control-btn ${isMuted ? 'active' : ''}`}
        onClick={onToggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? 'Unmute' : 'Mute'}
      </button>

      <button
        className={`control-btn ${isCamOff ? 'active' : ''}`}
        onClick={onToggleCam}
        title={isCamOff ? 'Turn On Camera' : 'Turn Off Camera'}
      >
        {isCamOff ? 'Cam On' : 'Cam Off'}
      </button>

      <button
        className={`control-btn ${isScreenSharing ? 'active' : ''}`}
        onClick={onToggleScreenShare}
        title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
      >
        {isScreenSharing ? 'Stop Share' : 'Share'}
      </button>

      <button className="control-btn" onClick={copyInviteLink} title="Copy Invite Link">
        {copied ? 'Copied!' : 'Invite'}
      </button>

      <button className="control-btn leave-btn" onClick={onLeave} title="Leave Meeting">
        Leave
      </button>

      {isHost && (
        <button className="control-btn end-btn" onClick={onEndMeeting} title="End Meeting for All">
          End
        </button>
      )}
    </div>
  );
}
