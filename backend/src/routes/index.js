import { Router } from 'express';
import authRoutes from './auth.routes.js';
import { studentRouter, drivesRouter } from './student.routes.js';
import { recruiterRouter, applicationsRouter } from './recruiter.routes.js';
import { adminRouter } from './admin.routes.js';
import { notificationRouter, supportRouter, fileRouter } from './common.routes.js';
import { dbState } from '../config/db.js';

const api = Router();
api.get('/health', (_req, res) => {
  const db = dbState();
  return res.status(db === 'connected' ? 200 : 503).json({
    success: db === 'connected',
    data: { status: db === 'connected' ? 'ok' : 'degraded', database: db, time: new Date().toISOString() },
  });
});
api.use('/auth', authRoutes);
api.use('/student', studentRouter);
api.use('/drives', drivesRouter);
api.use('/recruiter', recruiterRouter);
api.use('/applications', applicationsRouter);
api.use('/admin', adminRouter);
api.use('/notifications', notificationRouter);
api.use('/support', supportRouter);
api.use('/files', fileRouter);

export default api;
