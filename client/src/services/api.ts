import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

interface FailedRequest {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessToken: string | null = null;
let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

/**
 * Stores the access token in memory.
 * @param token - JWT access token or null to clear
 */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Returns the current in-memory access token.
 */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Attempts to refresh the access token using the httpOnly refresh cookie.
 * Returns the new access token or null if refresh failed.
 */
export async function tryRefreshToken(): Promise<string | null> {
  try {
    const { data } = await axios.post(
      '/api/auth/refresh',
      {},
      { withCredentials: true },
    );
    const newToken = data.accessToken;
    setAccessToken(newToken);
    return newToken;
  } catch {
    setAccessToken(null);
    return null;
  }
}

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);
/**
 * Auth endpoints that should NOT trigger automatic token refresh.
 * These endpoints either issue tokens or don't require them.
 */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/verify-email'];

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh for non-auth 401 errors
    const shouldRefresh =
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url);

    if (shouldRefresh) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await tryRefreshToken();

        if (!newToken) {
          processQueue(new Error('Refresh failed'), null);
          window.location.href = '/login';
          return Promise.reject(error);
        }

        processQueue(null, newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        setAccessToken(null);
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;

