import { useState, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { validatePassword } from '../utils/validators';
import { resetPassword } from '../services/authApi';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; general?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function validate(): boolean {
    const newErrors: typeof errors = {};
    const passwordError = validatePassword(password);
    if (passwordError) newErrors.password = passwordError;
    if (!confirmPassword) newErrors.confirm = 'Please confirm your password';
    else if (password !== confirmPassword) newErrors.confirm = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      await resetPassword(token!, password);
      setSuccess(true);
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
                {!token ? (
                  <motion.div
                    key="invalid-token"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="auth-form-header">
                      <h1 className="auth-welcome">Invalid link</h1>
                      <p className="auth-subtitle" style={{ marginTop: '16px', lineHeight: '1.5' }}>
                        This password reset link is invalid or has expired.
                      </p>
                    </div>
                    <Link
                      to="/forgot-password"
                      className="btn-signin"
                      style={{ textDecoration: 'none', marginTop: '24px' }}
                    >
                      Request a new link
                    </Link>
                  </motion.div>
                ) : success ? (
                  <motion.div
                    key="success-state"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="auth-form-header">
                      <h1 className="auth-welcome">Success!</h1>
                      <p className="auth-subtitle" style={{ marginTop: '16px', lineHeight: '1.5' }}>
                        Your password has been reset successfully. You can now sign in with your new password.
                      </p>
                    </div>
                    <Link
                      to="/login"
                      className="btn-signin"
                      style={{ textDecoration: 'none', marginTop: '24px' }}
                    >
                      Sign In
                    </Link>
                  </motion.div>
                ) : (
                  <motion.div
                    key="reset-form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="auth-form-header">
                      <h1 className="auth-welcome">Set new password</h1>
                      <p className="auth-subtitle" style={{ marginTop: '16px', lineHeight: '1.5' }}>
                        Enter your new password below.
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
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="New password"
                          autoComplete="new-password"
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          onClick={() => setShowPassword(!showPassword)}
                          tabIndex={-1}
                        >
                          <AnimatePresence mode="wait">
                            {showPassword ? (
                              <motion.svg
                                key="eye-off"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.1 }}
                              >
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </motion.svg>
                            ) : (
                              <motion.svg
                                key="eye"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.1 }}
                              >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </motion.svg>
                            )}
                          </AnimatePresence>
                        </button>
                        {errors.password && (
                          <motion.span
                            className="field-error"
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            {errors.password}
                          </motion.span>
                        )}
                      </div>

                      <div className="input-wrapper">
                        <input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                          disabled={isSubmitting}
                        />
                        {errors.confirm && (
                          <motion.span
                            className="field-error"
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            {errors.confirm}
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
                              Reset Password
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
