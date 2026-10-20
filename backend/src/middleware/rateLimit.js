import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

const make = (opts) =>
  config.rateLimit.enabled
    ? rateLimit({
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, res) =>
          res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.' } }),
        ...opts,
      })
    : (_req, _res, next) => next();

export const apiLimiter = make({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max });

// Login: keyed by IP + e-mail so one attacker cannot lock out everyone, and one IP cannot spray many accounts.
export const loginLimiter = make({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.loginMax,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
});

export const sensitiveLimiter = make({ windowMs: 60 * 60 * 1000, max: 10 }); // forgot-password, contact form, resend verification
