import { createServer, type Server } from 'node:http';

/** Claim the actual API port before loading state, discovering or probing hardware. */
export async function claimNodePort(port: number, host: string): Promise<Server> {
  const server = createServer((_req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '2' });
    res.end(JSON.stringify({ error: 'node_initializing' }));
  });
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => reject(error);
    server.once('error', failed);
    server.listen(port, host, () => { server.off('error', failed); resolve(); });
  });
  return server;
}
