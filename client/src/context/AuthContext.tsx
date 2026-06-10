import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import * as authApi from '../services/authApi';
import { setAccessToken, getAccessToken, tryRefreshToken } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import type { UserResponse } from '../services/authApi';

interface AuthState {
  user: UserResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  handleGoogleCallback: (
    accessToken: string,
    isNewUser: boolean,
  ) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const prevAuthRef = useRef(false);

  const updateState = useCallback((partial: Partial<AuthState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  /**
   * On mount, try to restore the session.
   * First checks in-memory token, then attempts a refresh
   * using the httpOnly cookie (survives page refreshes).
   */
  const hydrateFromToken = useCallback(async () => {
    const existingToken = getAccessToken();

    // If we have a token in memory, use it
    if (existingToken) {
      try {
        const { user } = await authApi.getProfile();
        updateState({ user, isAuthenticated: true, isLoading: false });
        return;
      } catch {
        setAccessToken(null);
      }
    }

    // No in-memory token — try refreshing via the httpOnly cookie
    const newToken = await tryRefreshToken();
    if (newToken) {
      try {
        const { user } = await authApi.getProfile();
        updateState({ user, isAuthenticated: true, isLoading: false });
        return;
      } catch {
        setAccessToken(null);
      }
    }

    // No valid session
    updateState({ user: null, isAuthenticated: false, isLoading: false });
  }, [updateState]);

  useEffect(() => {
    hydrateFromToken();
  }, [hydrateFromToken]);

  useEffect(() => {
    if (state.isAuthenticated && !prevAuthRef.current) {
      connectSocket();
    } else if (!state.isAuthenticated && prevAuthRef.current) {
      disconnectSocket();
    }
    prevAuthRef.current = state.isAuthenticated;
  }, [state.isAuthenticated]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login({ email, password });

      if (result.accessToken) {
        setAccessToken(result.accessToken);
      }

      updateState({
        user: result.user,
        isAuthenticated: true,
      });
    },
    [updateState],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await authApi.register({ email, password, displayName });
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        updateState({ user: result.user, isAuthenticated: true });
      }
    },
    [updateState],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // proceed even if server logout fails
    } finally {
      setAccessToken(null);
      updateState({
        user: null,
        isAuthenticated: false,
      });
    }
  }, [updateState]);

  const handleGoogleCallback = useCallback(
    async (accessToken: string, _isNewUser: boolean) => {
      setAccessToken(accessToken);
      const { user } = await authApi.getProfile();
      updateState({ user, isAuthenticated: true });
    },
    [updateState],
  );

  const refreshProfile = useCallback(async () => {
    try {
      const { user } = await authApi.getProfile();
      updateState({ user });
    } catch {
      // silently fail
    }
  }, [updateState]);

  const value = useMemo(
    () => ({
      ...state,
      login,
      register,
      logout,
      handleGoogleCallback,
      refreshProfile,
    }),
    [state, login, register, logout, handleGoogleCallback, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
