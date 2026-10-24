import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { dbState } from '../../src/config/db.js';
import { createApp } from '../../src/app.js';

describe('database availability', () => {
  it('returns a retryable service error before database-dependent routes run', async (t) => {
    if (dbState() === 'connected') {
      t.skip('The database is connected');
      return;
    }

    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'not-a-real-password' });

    assert.equal(response.status, 503);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'SERVICE_UNAVAILABLE');
  });
});
