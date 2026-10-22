import mongoose from 'mongoose';
import { config } from './env.js';

mongoose.set('strictQuery', true);
// NOTE: NoSQL-operator injection is blocked at the edge (middleware/sanitize.js strips `$`/`.` keys from
// body, query and params) and by zod schemas that only allow typed primitives.

export async function connectDb(uri = config.mongoUri) {
  mongoose.set('autoIndex', config.mongoAutoIndex);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: config.mongoMaxPoolSize,
  });
  return mongoose.connection;
}

let connectionPromise;

export async function ensureDbConnected() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (mongoose.connection.readyState === 2 && connectionPromise) return connectionPromise;

  connectionPromise = connectDb().catch((err) => {
    connectionPromise = null;
    throw err;
  });
  return connectionPromise;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  connectionPromise = null;
}

export function dbState() {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
}
