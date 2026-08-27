import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Factory: returns an Express middleware that validates req.body against a Zod schema.
 * On failure, returns 400 with field-level error detail.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data; // use parsed + coerced data
      next();
    } else {
      const fields = formatZodErrors(result.error);
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        detail: 'Request body failed schema validation',
        fields,
      });
    }
  };
}

/**
 * Factory: validates req.query against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (result.success) {
      (req as Request & { parsedQuery: unknown }).parsedQuery = result.data;
      next();
    } else {
      const fields = formatZodErrors(result.error);
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        detail: 'Query parameters failed validation',
        fields,
      });
    }
  };
}

function formatZodErrors(error: ZodError) {
  return error.errors.map((e) => ({
    path: e.path.join('.'),
    message: e.message,
    received: 'received' in e ? e.received : undefined,
  }));
}
