import fs from 'fs';
import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
// import {
//   registerLimiter,
//   loginLimiter,
//   forgotPasswordLimiter,
//   refreshLimiter,
//   changePasswordLimiter,
//   verifyEmailLimiter,
// } from '../middleware/rateLimiter';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} from '../validators/authValidators';
import { AuthenticatedRequest } from '../types';
import { getGoogleAuthURL } from '../services/googleService';
import { env } from '../config/env';

const router = Router();

function getDeviceInfo(req: Request) {
  return {
    deviceInfo: (req.headers['user-agent'] || 'unknown').substring(0, 255),
    ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: (req.headers['user-agent'] || 'unknown').substring(0, 255),
  };
}

// POST /api/auth/register
router.post(
  '/register',
  // registerLimiter,
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body);

      res.status(201).json({
        message: 'Registration successful. Please check your email to verify your account.',
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/login
router.post(
  '/login',
  // loginLimiter,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { deviceInfo, ipAddress, userAgent } = getDeviceInfo(req);
      const result = await authService.login(
        req.body,
        deviceInfo,
        ipAddress,
        userAgent,
      );

      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        accessToken: result.tokens.accessToken,
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/logout
router.post(
  '/logout',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refreshToken || '';
      await authService.logout(req.user!.userId, refreshToken);

      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'strict',
        path: '/api/auth',
      });

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  // refreshLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        res.status(401).json({
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'Refresh token is required',
            statusCode: 401,
          },
        });
        return;
      }

      const { deviceInfo, ipAddress, userAgent } = getDeviceInfo(req);
      const tokens = await authService.refreshTokens(
        refreshToken,
        deviceInfo,
        ipAddress,
        userAgent,
      );

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({ accessToken: tokens.accessToken });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/auth/google
router.get('/google', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await authService.generateGoogleAuthState();
    const url = getGoogleAuthURL(state);
    res.json({ url });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/google/callback
router.get(
  '/google/callback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      try {
        fs.appendFileSync('/tmp/google_callback_hit.log', `${new Date().toISOString()} - Callback received\n`);
      } catch {}
      const { code, state } = req.query as { code: string; state: string };

      if (!code || !state) {
        const redirectUrl = new URL('/login', env.CLIENT_URL);
        redirectUrl.searchParams.set('error', 'google_auth_failed');
        res.redirect(redirectUrl.toString());
        return;
      }

      const { deviceInfo, ipAddress, userAgent } = getDeviceInfo(req);
      const result = await authService.loginWithGoogle(
        code,
        state,
        deviceInfo,
        ipAddress,
        userAgent,
      );

      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      try {
        fs.appendFileSync('/tmp/google_callback_hit.log', `${new Date().toISOString()} - Callback SUCCEEDED for user ${result.user.email}, redirecting to client\n`);
      } catch {}
      // Use URL fragment (#) instead of query param (?) to prevent
      // the access token from appearing in server logs or Referer headers
      const callbackPath = '/auth/callback';
      const fragment = `accessToken=${encodeURIComponent(result.tokens.accessToken)}&isNewUser=${result.isNewUser}`;
      res.redirect(`${env.CLIENT_URL}${callbackPath}#${fragment}`);
    } catch (error) {
      try {
        const msg = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}\n` : String(error);
        fs.appendFileSync('/tmp/google_callback_error.log', `${new Date().toISOString()} - ${msg}\n`);
      } catch {}
      const redirectUrl = new URL('/login', env.CLIENT_URL);
      redirectUrl.searchParams.set('error', 'google_auth_failed');
      res.redirect(redirectUrl.toString());
    }
  },
);

// POST /api/auth/verify-email
router.post(
  '/verify-email',
  // verifyEmailLimiter,
  validate(verifyEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.verifyEmail(req.body.userId, req.body.token);
      res.json({ message: 'Email verified successfully' });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  // forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.forgotPassword(req.body.email);
      res.json({
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.resetPassword(req.body.token, req.body.password);
      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/change-password
router.post(
  '/change-password',
  // changePasswordLimiter,
  authenticate,
  validate(changePasswordSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await authService.changePassword(
        req.user!.userId,
        req.body.currentPassword,
        req.body.newPassword,
      );
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/auth/me
router.get(
  '/me',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getProfile(req.user!.userId);
      res.json({ user });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/auth/me
router.patch(
  '/me',
  authenticate,
  validate(updateProfileSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = await authService.updateProfile(req.user!.userId, req.body);
      res.json({ user });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
