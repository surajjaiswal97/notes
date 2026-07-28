import express from 'express';
import serverless from 'serverless-http';
import { createApp } from '../server/src/app.js';

const app = express();
const apiApp = createApp();

app.use('/api', apiApp);
app.use('/', apiApp);

app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

export default serverless(app);
