import serverless from 'serverless-http';
import { createApp } from './app.js';

const app = createApp();

const handler = serverless(app, { binary: ['image/*'] });

export default handler;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Notes API running on http://localhost:${port}`);
  });
}
