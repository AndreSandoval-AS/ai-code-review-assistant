import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errors';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'customer' | 'admin';
  };
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

/**
 * Verifies the Bearer JWT in the Authorization header.
 * Attaches the decoded payload to req.user on success.
 * Returns 401 for any verification failure (no detail exposed to client).
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError('UNAUTHORIZED', 401, 'Unauthorized'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthenticatedRequest['user'];
    req.user = payload;
    next();
  } catch (err) {
    // Do not distinguish between expired, malformed, or invalid-signature tokens.
    next(new AppError('UNAUTHORIZED', 401, 'Unauthorized'));
  }
}

/** Middleware that requires the authenticated user to have the 'admin' role. */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== 'admin') {
    next(new AppError('FORBIDDEN', 403, 'Forbidden'));
    return;
  }
  next();
}
