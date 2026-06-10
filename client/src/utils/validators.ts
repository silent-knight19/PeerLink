export function validateEmail(email: string): string | null {
  if (!email) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Invalid email address';
  }
  if (email.length > 255) return 'Email must be at most 255 characters';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/(?=.*[a-z])/.test(password)) return 'Password must contain a lowercase letter';
  if (!/(?=.*[A-Z])/.test(password)) return 'Password must contain an uppercase letter';
  if (!/(?=.*\d)/.test(password)) return 'Password must contain a number';
  if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
    return 'Password must contain a special character';
  }
  return null;
}

export function validateDisplayName(name: string): string | null {
  if (!name) return 'Display name is required';
  if (name.length < 2) return 'Display name must be at least 2 characters';
  if (name.length > 50) return 'Display name must be at most 50 characters';
  return null;
}
