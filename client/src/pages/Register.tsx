import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-logo">PeerLink</h1>
          <h2 className="auth-title">Create your account</h2>
        </div>

        {errors.general && (
          <div className="alert alert-error">{errors.general}</div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="John Doe"
              autoComplete="name"
              disabled={isSubmitting}
            />
            {errors.displayName && (
              <span className="field-error">{errors.displayName}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isSubmitting}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={isSubmitting}
            />
            {errors.password && (
              <span className="field-error">{errors.password}</span>
            )}
            <span className="field-hint">
              Must contain uppercase, lowercase, number, and special character
            </span>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn btn-google btn-full"
          onClick={handleGoogleRegister}
          disabled={isGoogleLoading}
        >
          {isGoogleLoading ? 'Connecting...' : 'Continue with Google'}
        </button>

        <div className="auth-footer">
          <span>Already have an account? </span>
          <Link to="/login" className="auth-link">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
