export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthError extends AppError {
  constructor(code: string, message: string) {
    super(401, code, message);
    this.name = 'AuthError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends AppError {
  constructor(code: string, message: string) {
    super(403, code, message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.');
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }

  retryAfterSeconds: number;
}
