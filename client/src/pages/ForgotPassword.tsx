import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { validateEmail } from '../utils/validators';
import { forgotPassword } from '../services/authApi';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ email?: string; general?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function validate(): boolean {
    const emailError = validateEmail(email);
    if (emailError) {
      setErrors({ email: emailError });
      return false;
    }
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      const serverError = err?.response?.data?.error;
      setErrors({
        general: serverError?.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

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
              <AnimatePresence mode="wait">
                {sent ? (
                  <motion.div
                    key="sent-state"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="auth-form-header">
                      <h1 className="auth-welcome">Check your email</h1>
                      <p className="auth-subtitle" style={{ marginTop: '16px', lineHeight: '1.5' }}>
                        If an account with that email exists, we've sent a password reset link.
                        Check your inbox and spam folder.
                      </p>
                    </div>
                    <Link
                      to="/login"
                      className="btn-signin"
                      style={{ textDecoration: 'none', marginTop: '24px' }}
                    >
                      Back to Sign in
                    </Link>
                  </motion.div>
                ) : (
                  <motion.div
                    key="form-state"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="auth-form-header">
                      <h1 className="auth-welcome">Forgot password?</h1>
                      <p className="auth-subtitle" style={{ marginTop: '16px', lineHeight: '1.5' }}>
                        Enter your email and we'll send you a reset link.
                      </p>
                    </div>

                    {errors.general && (
                      <div className="alert alert-error" style={{ marginBottom: '20px' }}>
                        {errors.general}
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: '24px' }}>
                      <div className="input-wrapper">
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Email address"
                          autoComplete="email"
                          disabled={isSubmitting}
                        />
                        {errors.email && (
                          <motion.span
                            className="field-error"
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            {errors.email}
                          </motion.span>
                        )}
                      </div>

                      <motion.button
                        type="submit"
                        className="btn-signin"
                        disabled={isSubmitting}
                        whileHover={{ scale: 1.005 }}
                        whileTap={{ scale: 0.995 }}
                        style={{ marginTop: '12px' }}
                      >
                        <AnimatePresence mode="wait">
                          {isSubmitting ? (
                            <motion.div
                              key="loading"
                              className="btn-spinner"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            />
                          ) : (
                            <motion.span
                              key="text"
                              className="btn-content"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
                              Send Reset Link
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
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
