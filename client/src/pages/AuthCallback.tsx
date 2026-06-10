import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Parses the URL hash fragment into key-value pairs.
 * The server redirects with: /auth/callback#accessToken=xxx&isNewUser=true
 */
function parseHashParams(): Record<string, string> {
  const hash = window.location.hash.substring(1); // remove leading #
  const params: Record<string, string> = {};

  if (!hash) return params;

  hash.split('&').forEach((pair) => {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  });

  return params;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleGoogleCallback } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    // Check for error in query params (server redirects errors via query params)
    const error = searchParams.get('error');
    if (error) {
      navigate('/login?error=google_auth_failed', { replace: true });
      return;
    }

    // Read token from URL fragment (not query params) to prevent logging
    const hashParams = parseHashParams();
    const accessToken = hashParams.accessToken;
    const isNewUser = hashParams.isNewUser === 'true';

    if (!accessToken) {
      navigate('/login?error=google_auth_failed', { replace: true });
      return;
    }

    // Clear the hash from the URL to remove the token from browser history
    window.history.replaceState(null, '', window.location.pathname);

    handleGoogleCallback(accessToken, isNewUser)
      .then(() => {
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        navigate('/login?error=google_auth_failed', { replace: true });
      });
  }, [searchParams, navigate, handleGoogleCallback]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-logo">PeerLink</h1>
          <h2 className="auth-title">Completing sign-in...</h2>
        </div>
        <div className="auth-loading">
          <div className="spinner" />
        </div>
      </div>
    </div>
  );
}
