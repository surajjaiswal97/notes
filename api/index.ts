import express from 'express';
import serverless from 'serverless-http';
import { createApp } from '../server/src/app.js';

const app = express();
app.use('/api', createApp());

export default serverless(app);
