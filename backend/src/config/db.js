import mongoose from 'mongoose';
import { config } from './env.js';

mongoose.set('strictQuery', true);
// NOTE: NoSQL-operator injection is blocked at the edge (middleware/sanitize.js strips `$`/`.` keys from
// body, query and params) and by zod schemas that only allow typed primitives.

export async function connectDb(uri = config.mongoUri) {
  mongoose.set('autoIndex', config.mongoAutoIndex);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export function dbState() {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
}
