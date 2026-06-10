import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import {
  validateEmail,
  validatePassword,
  validateDisplayName,
} from '../utils/validators';
import { getGoogleAuthUrl } from '../services/authApi';

interface FormErrors {
  displayName?: string;
  email?: string;
  password?: string;
  general?: string;
}

export default function Register() {
  const navigate = useNavigate();
  const { register, isAuthenticated } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (isAuthenticated) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  function validate(): boolean {
    const newErrors: FormErrors = {};
    const nameError = validateDisplayName(displayName);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    if (nameError) newErrors.displayName = nameError;
    if (emailError) newErrors.email = emailError;
    if (passwordError) newErrors.password = passwordError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      await register(email, password, displayName);
      navigate('/login?registered=true', { replace: true });
    } catch (err: any) {
      const serverError = err?.response?.data?.error;
      if (serverError) {
        if (serverError.code === 'EMAIL_ALREADY_EXISTS') {
          setErrors({ email: serverError.message });
        } else {
          setErrors({ general: serverError.message });
        }
      } else {
        setErrors({ general: 'An unexpected error occurred. Please try again.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleRegister() {
    setIsGoogleLoading(true);
    try {
      const { url } = await getGoogleAuthUrl();
      window.location.href = url;
    } catch {
      setErrors({ general: 'Failed to initiate Google sign-up. Please try again.' });
      setIsGoogleLoading(false);
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
              <div className="auth-form-header">
                <h1 className="auth-welcome">Sign Up</h1>
              </div>

              <AnimatePresence>
                {errors.general && (
                  <motion.div
                    className="alert alert-error"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {errors.general}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="auth-form">
                <div className="input-wrapper">
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display Name"
                    autoComplete="name"
                    disabled={isSubmitting}
                  />
                  {errors.displayName && (
                    <motion.span
                      className="field-error"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {errors.displayName}
                    </motion.span>
                  )}
                </div>

                <div className="input-wrapper">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
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

                <div className="input-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
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

                <motion.button
                  type="submit"
                  className="btn-signin"
                  disabled={isSubmitting}
                  whileHover={{ scale: 1.005 }}
                  whileTap={{ scale: 0.995 }}
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
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="8" x2="12" y2="16"></line>
                          <line x1="8" y1="12" x2="16" y2="12"></line>
                        </svg>
                        Create Account
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </form>

              <div className="auth-divider">
                <span>or</span>
              </div>

              <button
                type="button"
                className="btn-google"
                onClick={handleGoogleRegister}
                disabled={isGoogleLoading}
              >
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Continue with Google
              </button>
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
