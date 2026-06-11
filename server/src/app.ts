import http from 'http';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './config/env';
import { connectRedis, disconnectRedis } from './config/redis';
// import { globalLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/authRoutes';
import roomRoutes from './routes/roomRoutes';
import { authenticateSocket } from './socket/socketAuth';
import { registerSocketHandlers } from './socket/socketManager';
import { AppError } from './utils/errors';

const app = express();
const server = http.createServer(app);

const configuredClientOrigins = env.CLIENT_URL.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedDevOrigin(origin: string): boolean {
  if (!env.isDevelopment) return false;

  try {
    const { hostname, port, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (port !== '5173') return false;

    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  return configuredClientOrigins.includes(origin) || isAllowedDevOrigin(origin);
}

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
  callback(null, isAllowedOrigin(origin));
}

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

io.use(authenticateSocket);
registerSocketHandlers(io);

export { io };

app.use(helmet());
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// app.use('/api', globalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        ...('retryAfterSeconds' in err && {
          retryAfterSeconds: (err as any).retryAfterSeconds,
        }),
      },
    });
    return;
  }

  console.error('Unhandled error:', err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
    },
  });
});

async function start() {
  try {
    try {
      await connectRedis();
    } catch (error) {
      console.warn('Redis unavailable — running without it:', error);
    }

    server.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await disconnectRedis();
  process.exit(0);
});

start();

export default app;
