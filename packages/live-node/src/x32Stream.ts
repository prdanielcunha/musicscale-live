import type { ServerResponse } from 'node:http';
import type { X32Mixer } from './x32Mixer';

const activeStreams = new Set<ServerResponse>();
/** One shared OSC client, cached state, bounded output. Never poll the desk per frame. */
export function streamX32(
  res: ServerResponse,
  mixer: X32Mixer,
  selected: string | undefined,
  authorized: () => Promise<boolean>
): void {
  if (activeStreams.size >= 16) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'mixer_stream_limit' }));
    return;
  }
  activeStreams.add(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.socket?.setNoDelay(true);
  void mixer.refreshSelected(selected).catch(() => undefined);
  let lastRevision = '';
  let lastSentAt = 0;
  let lastAuthorizationAt = Date.now();
  let busy = false;
  let blockedSince = 0;
  const cleanup = () => {
    clearInterval(timer);
    activeStreams.delete(res);
  };
  const tick = async () => {
    if (busy || res.destroyed || res.writableEnded) return;
    busy = true;
    try {
      const now = Date.now();
      if (now - lastAuthorizationAt >= 5000) {
        lastAuthorizationAt = now;
        if (!await authorized()) { res.end(); return; }
      }
      // Do not build an unbounded queue for a disconnected/slow phone.
      if (res.writableNeedDrain) {
        blockedSince ||= now;
        if (now - blockedSince > 10000) res.destroy();
        return;
      }
      blockedSince = 0;
      const revision = mixer.revisionKey();
      if (revision === lastRevision && now - lastSentAt < 5000) return;
      res.write('data: ' + JSON.stringify(mixer.snapshot(selected)) + '\n\n');
      lastRevision = revision;
      lastSentAt = now;
    } catch { res.destroy(); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, 100);
  timer.unref();
  res.once('close', cleanup);
  void tick();
}
