import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/client';
import { AgentTokenPayload, Agent } from '../types';

/**
 * Validates the Agent Identity Token (AIT) from the Authorization header.
 * Attaches the decoded payload to req.agent.
 * Returns 401 if missing/invalid, 403 if revoked or expired.
 */
export async function requireAIT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'MISSING_AUTH',
      detail: 'Authorization header with Bearer token is required',
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AgentTokenPayload;

    // Check expiry (belt-and-suspenders - JWT already checks this)
    if (decoded.expires_at < Math.floor(Date.now() / 1000)) {
      res.status(403).json({
        error: 'TOKEN_EXPIRED',
        detail: 'Agent Identity Token has expired',
        expired_at: new Date(decoded.expires_at * 1000).toISOString(),
      });
      return;
    }

    // Check revocation in DB
    const agent = await queryOne<Agent>(
      'SELECT id, revoked FROM agents WHERE id = $1',
      [decoded.agent_id]
    );

    if (!agent) {
      res.status(403).json({
        error: 'AGENT_NOT_FOUND',
        detail: 'Agent not registered on Aisle',
      });
      return;
    }

    if (agent.revoked) {
      res.status(403).json({
        error: 'AGENT_REVOKED',
        detail: 'This agent has been revoked and cannot perform transactions',
      });
      return;
    }

    req.agent = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(403).json({
        error: 'TOKEN_EXPIRED',
        detail: 'Agent Identity Token has expired',
      });
    } else if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'INVALID_TOKEN',
        detail: 'Agent Identity Token is malformed or has invalid signature',
      });
    } else {
      res.status(500).json({ error: 'AUTH_ERROR', detail: 'Authentication check failed' });
    }
  }
}
