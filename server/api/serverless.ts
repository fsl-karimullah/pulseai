import { createServer } from '../src/app';

let app: any;

export default async (req: any, res: any) => {
  try {
    if (!app) {
      console.log('Initializing Fastify app...');
      app = await createServer();
      await app.ready();
      console.log('Fastify app ready.');
    }
    app.server.emit('request', req, res);
  } catch (err: any) {
    console.error('Serverless Function Crash:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, message: 'Internal Server Error', error: err.message }));
  }
};
