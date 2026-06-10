import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMeeting = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      const { data } = await api.post('/rooms');
      navigate(`/meeting/${data.room.id}`);
    } catch {
      setError('Failed to create meeting. Please try again.');
      setIsCreating(false);
    }
  }, [navigate]);

  const joinMeeting = useCallback(() => {
    const raw = joinCode.trim();
    if (!raw) {
      setError('Please enter a meeting code');
      return;
    }
    // Extract room ID from either a plain code or a full invite URL
    const match = raw.match(/\/meeting\/([a-zA-Z0-9-]+)/);
    const roomId = match ? match[1] : raw;
    navigate(`/meeting/${roomId}`);
  }, [joinCode, navigate]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>PeerLink</h1>
        <div className="user-info">
          <span>{user?.displayName || user?.email}</span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="dashboard-main">
        {error && <div className="error-banner">{error}</div>}

        <div className="action-cards">
          <div className="action-card">
            <h2>New Meeting</h2>
            <p>Start an instant video meeting</p>
            <button
              onClick={createMeeting}
              disabled={isCreating}
              className="primary-btn"
            >
              {isCreating ? 'Creating...' : 'Create Meeting'}
            </button>
          </div>

          <div className="action-card">
            <h2>Join Meeting</h2>
            <p>Enter a code to join an existing meeting</p>
            <div className="join-form">
              <input
                type="text"
                placeholder="Enter meeting code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && joinMeeting()}
              />
              <button onClick={joinMeeting} className="primary-btn">
                Join
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
