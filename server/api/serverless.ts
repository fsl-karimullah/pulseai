import { createServer } from '../src/app';

export default async (req: any, res: any) => {
  const app = await createServer();
  await app.ready();
  app.server.emit('request', req, res);
};
