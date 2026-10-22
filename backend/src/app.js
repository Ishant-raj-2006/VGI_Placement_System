import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/env.js';
import { sanitizeInput } from './middleware/sanitize.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { dbState, ensureDbConnected } from './config/db.js';
import { assertProductionConfig } from './config/env.js';
import routes from './routes/index.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1); // behind a reverse proxy / load balancer

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        // blob: lets the SPA show the (private, token-protected) profile photo it fetched itself
        directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'frame-src': ["'self'", 'blob:'], 'object-src': ["'self'", 'blob:'] },
      },
    })
  );
  app.use(
    cors({
      origin(origin, cb) {
        // Same-origin / curl / server-to-server requests have no Origin header
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    })
  );
  app.use(compression());
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));
  app.use(express.json({ limit: '200kb' })); // request size limit (uploads use multer with their own limits)
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(sanitizeInput); // strips $-operators / dotted keys (NoSQL injection)

  if (config.isVercel) {
    app.use(async (_req, res, next) => {
      try {
        assertProductionConfig();
        await ensureDbConnected();
        next();
      } catch (err) {
        logger.error('Vercel request could not connect to required services', { message: err.message });
        res.status(503).json({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable.' },
        });
      }
    });
  }

  app.get('/health', (_req, res) => {
    const db = dbState();
    res.status(db === 'connected' ? 200 : 503).json({ status: db === 'connected' ? 'ok' : 'degraded', database: db, time: new Date().toISOString() });
  });

  app.use('/api/v1', apiLimiter, routes);

  // Optionally serve the built React app (single-container deployment). API routes above take priority.
  const dist = config.frontendDist;
  if (dist && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: config.isProd ? '1h' : 0, setHeaders: (res, f) => { if (f.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get(/^\/(?!api\/|health).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = createApp();

export default app;
