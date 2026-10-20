/** Builds / reconciles every index declared in the models. Run during deployments when MONGO_AUTO_INDEX=false. */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/config/db.js';
import '../src/models/index.js';

await connectDb();
for (const [name, model] of Object.entries(mongoose.models)) {
  const dropped = await model.syncIndexes();
  console.log(`${name.padEnd(18)} indexes synced${dropped.length ? ` (dropped: ${dropped.join(', ')})` : ''}`);
}
await disconnectDb();
