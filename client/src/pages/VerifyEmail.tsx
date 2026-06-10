import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { verifyEmail } from '../services/authApi';

type VerifyStatus = 'verifying' | 'success' | 'error';

/**
 * Handles the email verification link clicked from the user's inbox.
 * Extracts userId and token from URL params, sends them to the server.
 */
export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<VerifyStatus>('verifying');
  const [errorMessage, setErrorMessage] = useState('');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const userId = searchParams.get('userId');
    const token = searchParams.get('token');

    if (!userId || !token) {
      setStatus('error');
      setErrorMessage('Invalid verification link. Please check your email and try again.');
      return;
    }

    verifyEmail(userId, token)
      .then(() => {
        setStatus('success');
      })
      .catch((err: any) => {
        const serverError = err?.response?.data?.error;
        setStatus('error');
        setErrorMessage(
          serverError?.message || 'Verification failed. The link may have expired.',
        );
      });
  }, [searchParams]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-logo">PeerLink</h1>
        </div>

        {status === 'verifying' && (
          <>
            <h2 className="auth-title">Verifying your email...</h2>
            <div className="auth-loading">
              <div className="spinner" />
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <h2 className="auth-title">Email verified!</h2>
            <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '24px' }}>
              Your email has been verified successfully. You can now sign in.
            </p>
            <Link to="/login" className="btn btn-primary btn-full" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Sign in
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="auth-title">Verification failed</h2>
            <div className="alert alert-error">{errorMessage}</div>
            <Link to="/login" className="btn btn-primary btn-full" style={{ textAlign: 'center', textDecoration: 'none', marginTop: '16px' }}>
              Go to Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
