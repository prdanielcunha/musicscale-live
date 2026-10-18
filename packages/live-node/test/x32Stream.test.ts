import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { streamX32 } from '../src/x32Stream';
import type { X32Mixer } from '../src/x32Mixer';
class Response extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  writableNeedDrain = false;
  socket = { setNoDelay: vi.fn() };
  writeHead = vi.fn();
  flushHeaders = vi.fn();
  write = vi.fn(() => true);
  end() { this.writableEnded = true; this.emit('close'); }
  destroy() { this.destroyed = true; this.emit('close'); }
}
afterEach(() => { vi.useRealTimers(); });
it('sends only changed snapshots, rechecks grants and cleans up when revoked', async () => {
  vi.useFakeTimers();
  const res = new Response();
  let revision = '1';
  const mixer = { refreshSelected: vi.fn(async () => undefined), revisionKey: () => revision,
    snapshot: vi.fn(() => ({ connected: true })) };
  const allowed = vi.fn(async () => false);
  streamX32(res as unknown as ServerResponse, mixer as unknown as X32Mixer, 'ch/01', allowed);
  expect(res.write).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(res.write).toHaveBeenCalledTimes(1);
  revision = '2';
  await vi.advanceTimersByTimeAsync(100);
  expect(res.write).toHaveBeenCalledTimes(2);
  expect(mixer.refreshSelected).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(4000);
  expect(res.writableEnded).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('does not queue frames for a slow phone and disconnects it after ten seconds', async () => {
  vi.useFakeTimers();
  const res = new Response();
  const mixer = { refreshSelected: async () => undefined, revisionKey: () => '1', snapshot: () => ({}) };
  streamX32(res as unknown as ServerResponse, mixer as unknown as X32Mixer, undefined, async () => true);
  res.writableNeedDrain = true;
  await vi.advanceTimersByTimeAsync(10500);
  expect(res.write).toHaveBeenCalledTimes(1);
  expect(res.destroyed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
