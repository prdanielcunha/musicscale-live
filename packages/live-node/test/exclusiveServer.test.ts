import { expect, it } from 'vitest';
import { claimNodePort } from '../src/exclusiveServer';

it('claims the API port before initialization and rejects a second instance', async () => {
  const server = await claimNodePort(0, '127.0.0.1');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_address_missing');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'node_initializing' });
    await expect(claimNodePort(address.port, '127.0.0.1')).rejects.toMatchObject({ code: 'EADDRINUSE' });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
