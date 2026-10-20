import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config/env.js';

export function signAccessToken({ userId, role, jti = crypto.randomUUID(), ttlHours }) {
  const expiresInSec = Math.round((ttlHours || config.sessionTtlHours) * 3600);
  const token = jwt.sign({ sub: String(userId), role, jti }, config.jwtSecret, { expiresIn: expiresInSec, algorithm: 'HS256' });
  return { token, jti, expiresAt: new Date(Date.now() + expiresInSec * 1000) };
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
}
