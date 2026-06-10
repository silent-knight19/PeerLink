import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { createRoom, getRoom } from '../models/roomModel';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.post(
  '/',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const room = await createRoom(req.user!.userId);
      res.status(201).json({ room });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:roomId',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const room = await getRoom(req.params.roomId);
      if (!room) {
        res.status(404).json({
          error: { code: 'ROOM_NOT_FOUND', message: 'Room not found', statusCode: 404 },
        });
        return;
      }
      res.json({ room });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
