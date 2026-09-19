export function markLiveMetric(name: string): void {
  if (typeof performance === 'undefined') return;
  performance.mark(`millionsnest-live:${name}`);
}
