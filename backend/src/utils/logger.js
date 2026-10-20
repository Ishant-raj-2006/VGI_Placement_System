import { config } from '../config/env.js';

// Minimal structured logger. Never pass passwords, tokens or resume contents to it.
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const current = config.isTest ? levels.error : config.isProd ? levels.info : levels.debug;

function log(level, msg, meta) {
  if (levels[level] > current) return;
  const line = { t: new Date().toISOString(), level, msg, ...(meta || {}) };
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(config.isProd ? JSON.stringify(line) : `[${line.t}] ${level.toUpperCase()} ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`);
}

export const logger = {
  error: (m, meta) => log('error', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  info: (m, meta) => log('info', m, meta),
  debug: (m, meta) => log('debug', m, meta),
};
