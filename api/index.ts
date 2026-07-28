import express from 'express';
import serverless from 'serverless-http';
import { createApp } from '../server/src/app.js';

console.log('api/index.ts loaded');

const app = express();
const apiApp = createApp();

// Mount the app both at /api and root to tolerate routing differences.
app.use('/api', apiApp);
app.use('/', apiApp);

app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

export default serverless(app);


// Also expose a very small quick health route at the wrapper level so we can
// validate the function invocation before deeper request handling.
try {
  app.get('/api/healthz', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
} catch (e) {
  console.error('failed to register healthz', e);
}
