import { Request, Response, NextFunction } from 'express';

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class PolicyViolationError extends Error {
  constructor(
    public readonly rule: string,
    public readonly detail: string,
    public readonly suggested_action?: string
  ) {
    super(detail);
    this.name = 'PolicyViolationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Global error handler - catches all unhandled errors and returns structured JSON.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[ERROR]', err.name, err.message);

  if (err instanceof PolicyViolationError) {
    res.status(422).json({
      error: 'POLICY_VIOLATION',
      rule: err.rule,
      detail: err.message,
      suggested_action: err.suggested_action,
    });
    return;
  }

  if (err instanceof GatewayError) {
    res.status(502).json({
      error: 'GATEWAY_ERROR',
      detail: 'Payment gateway unavailable. Please retry.',
      retry_after: new Date(Date.now() + 30_000).toISOString(),
    });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({
      error: 'NOT_FOUND',
      detail: err.message,
    });
    return;
  }

  // Fallback
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    detail: 'An unexpected error occurred',
  });
}
