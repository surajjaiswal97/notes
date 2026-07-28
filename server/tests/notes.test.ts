import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

let tempDir: string;
let app: ReturnType<typeof createApp>;

test.before(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'notes-app-'));
  process.env.NOTES_DATA_FILE = path.join(tempDir, 'notes.json');
  app = createApp();
});

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test('creates, lists, updates, and deletes notes', async () => {
  const server = app.listen(0);
  const port = await new Promise<number>((resolve) => server.once('listening', () => resolve((server.address() as { port: number }).port)));

  const baseUrl = `http://127.0.0.1:${port}`;

  const createResponse = await fetch(`${baseUrl}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'First note', content: 'Hello world', tags: ['work'] })
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.title, 'First note');

  const listResponse = await fetch(`${baseUrl}/notes?search=hello&tag=work&sort=updatedAt&order=desc&page=1&limit=5`);
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json();
  assert.equal(listPayload.notes.length, 1);
  assert.equal(listPayload.notes[0].id, created.id);

  const updateResponse = await fetch(`${baseUrl}/notes/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Updated note', content: 'Updated content' })
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.title, 'Updated note');

  const tagsResponse = await fetch(`${baseUrl}/tags`);
  assert.equal(tagsResponse.status, 200);
  const tagsPayload = await tagsResponse.json();
  assert.equal(tagsPayload[0].name, 'work');

  const deleteResponse = await fetch(`${baseUrl}/notes/${created.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);

  const afterDelete = await fetch(`${baseUrl}/notes`);
  const afterDeletePayload = await afterDelete.json();
  assert.equal(afterDeletePayload.notes.length, 0);

  server.close();
});

test('rejects invalid note payloads', async () => {
  const server = app.listen(0);
  const port = await new Promise<number>((resolve) => server.once('listening', () => resolve((server.address() as { port: number }).port)));
  const baseUrl = `http://127.0.0.1:${port}`;

  const response = await fetch(`${baseUrl}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '', content: 'x', tags: [''] })
  });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error.message, /Validation failed/i);

  server.close();
});
