import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { verifyEmail } from '../services/authApi';

type VerifyStatus = 'verifying' | 'success' | 'error';

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
    <div className="auth-split-page">
      <div className="auth-card-container">
        <motion.div
          className="auth-left-panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <img src="/images/login.png" alt="PeerLink" className="auth-hero-image" />
        </motion.div>

        <motion.div
          className="auth-right-panel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="auth-right-content">
            <div className="auth-top-bar">
              <div className="auth-logo-wrapper">
                <img src="/images/logo.png" className="auth-logo-img" alt="PeerLink" />
              </div>
              <Link to="/login" className="auth-signup-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                  <polyline points="10 17 15 12 10 7"></polyline>
                  <line x1="15" y1="12" x2="3" y2="12"></line>
                </svg>
                Sign In
              </Link>
            </div>

            <div className="auth-form-container">
              {status === 'verifying' && (
                <div>
                  <div className="auth-form-header">
                    <h1 className="auth-welcome">Verifying email</h1>
                    <p className="auth-subtitle" style={{ marginTop: '16px', lineHeight: '1.5' }}>
                      Please wait while we verify your email address...
                    </p>
                  </div>
                  <div className="page-loader" style={{ minHeight: 'auto', marginTop: '40px' }}>
                    <div className="spinner" />
                  </div>
                </div>
              )}

              {status === 'success' && (
                <div>
                  <div className="auth-form-header">
                    <h1 className="auth-welcome">Verified!</h1>
                    <p className="auth-subtitle" style={{ marginTop: '16px', lineHeight: '1.5' }}>
                      Your email has been verified successfully. You can now sign in to your account.
                    </p>
                  </div>
                  <Link
                    to="/login"
                    className="btn-signin"
                    style={{ textDecoration: 'none', marginTop: '30px' }}
                  >
                    Sign In
                  </Link>
                </div>
              )}

              {status === 'error' && (
                <div>
                  <div className="auth-form-header">
                    <h1 className="auth-welcome">Failed</h1>
                    <p className="auth-subtitle" style={{ marginTop: '16px', lineHeight: '1.5' }}>
                      Verification failed. The link may have expired or is invalid.
                    </p>
                  </div>
                  <div className="alert alert-error" style={{ margin: '20px 0' }}>
                    {errorMessage}
                  </div>
                  <Link
                    to="/login"
                    className="btn-signin"
                    style={{ textDecoration: 'none', marginTop: '10px' }}
                  >
                    Go to Sign In
                  </Link>
                </div>
              )}
            </div>

            <div className="auth-footer-bar">
              <span className="copyright">&copy; 2026 PeerLink Inc.</span>
              <div className="footer-links">
                <Link to="/contact">Contact Us</Link>
                <div className="language-select">
                  English
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
