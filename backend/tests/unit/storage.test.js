import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';

process.env.STORAGE_DRIVER = 'mongodb';

const mongoose = (await import('mongoose')).default;
const originalGridFSBucket = Object.getOwnPropertyDescriptor(mongoose.mongo, 'GridFSBucket');
const files = new Map();

class TestGridFSBucket {
  constructor(_db, options) {
    assert.equal(options.bucketName, 'cpmsFiles');
  }

  openUploadStream(filename) {
    const chunks = [];
    return new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
      final(callback) {
        files.set(filename, Buffer.concat(chunks));
        callback();
      },
    });
  }

  openDownloadStreamByName(filename) {
    const content = files.get(filename);
    return Readable.from(content ? [content] : []);
  }

  find({ filename }) {
    const cursor = {
      limit() { return this; },
      hasNext: async () => files.has(filename),
      next: async () => files.has(filename) ? { _id: filename } : null,
    };
    return cursor;
  }

  async delete(id) {
    files.delete(id);
  }
}

Object.defineProperty(mongoose.mongo, 'GridFSBucket', { configurable: true, value: TestGridFSBucket });
mongoose.connection.db = {};

const storage = await import('../../src/services/storage.service.js');

test('MongoDB storage saves, streams, checks, and deletes private files', async () => {
  const content = Buffer.from('private document contents');
  const key = await storage.saveFile('resumes', content, '.pdf');

  assert.match(key, /^resumes\/[0-9a-f-]+\.pdf$/i);
  assert.equal(await storage.exists(key), true);

  const chunks = [];
  for await (const chunk of await storage.openStream(key)) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), content);

  await storage.deleteFile(key);
  assert.equal(await storage.exists(key), false);
});

test.after(() => {
  Object.defineProperty(mongoose.mongo, 'GridFSBucket', originalGridFSBucket);
  mongoose.connection.db = undefined;
});
