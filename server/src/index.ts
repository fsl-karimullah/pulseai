import 'dotenv/config';
import { createServer } from './app';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function start() {
  const server = await createServer();
  
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
    server.log.info(`🚀 PulseAI API ready on http://localhost:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
