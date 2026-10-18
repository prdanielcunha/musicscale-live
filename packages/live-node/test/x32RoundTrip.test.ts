import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { X32Mixer, decodeX32, encodeX32 } from '../src/x32Mixer';
it('uses one OSC connection: observed writes, passive snapshots, independent selected channels', async () => {
  const desk = createSocket('udp4');
  const values = new Map<string, string | number>([
    ['/ch/01/config/name', 'TESTE CAMBE'], ['/ch/01/mix/fader', 0.5],
    ['/ch/01/mix/on', 1], ['/ch/01/eq/1/g', 0.25], ['/ch/02/eq/1/g', 0.75]
  ]);
  let messages = 0;
  let writes = 0;
  let suppress = false;
  desk.on('message', (packet, sender) => {
    messages++;
    const { address, args } = decodeX32(packet);
    if (args.length) { writes++; values.set(address, args[0]!); return; }
    if (suppress && address === '/ch/01/mix/fader') return;
    const value = address === '/info' ? 'X32 SIMULATOR' : values.get(address);
    if (value !== undefined) desk.send(encodeX32(address, [value], typeof value === 'number' && !address.endsWith('/on')), sender.port, sender.address);
  });
  desk.bind(10023, '127.0.0.1');
  await once(desk, 'listening');
  const mixer = new X32Mixer();
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  try {
    await mixer.connect('127.0.0.1');
    for (let i = 0; i < 20 && !mixer.snapshot().channels[0]?.name; i++) await wait(25);
    expect(mixer.snapshot().connected).toBe(true);
    expect(writes).toBe(0);
    expect((await mixer.write({ channel: 'ch/01', parameter: 'fader', value: 0.51 })).confirmed).toBe(true);
    await Promise.all([mixer.refreshSelected('ch/01'), mixer.refreshSelected('ch/02')]);
    expect(mixer.snapshot('ch/01').eq['eq/1/g']).toBe(0.25);
    expect(mixer.snapshot('ch/02').eq['eq/1/g']).toBe(0.75);
    expect(mixer.snapshot('ch/01').selectedId).toBe('ch/01');
    // Read-only snapshots cannot trigger queries, regardless of how many phones read them.
    // Let the one-time initial scan finish, then observe actual UDP traffic.
    await wait(4000);
    const before = messages;
    for (let i = 0; i < 100; i++) mixer.snapshot(i % 2 ? 'ch/01' : 'ch/02');
    await Promise.all(Array.from({ length: 5 }, () => mixer.refreshSelected('ch/02')));
    await wait(30);
    expect(messages).toBe(before);
    suppress = true;
    expect((await mixer.write({ channel: 'ch/01', parameter: 'fader', value: 0.52 })).confirmed).toBe(false);
    await mixer.close();
    await expect(mixer.write({ channel: 'ch/01', parameter: 'fader', value: 0.5 })).rejects.toThrow('mixer_offline');
  } finally { await mixer.close(); desk.close(); }
}, 10000);
