/**
 * Optional Soundcraft Si Expression control via Mixing Station Desktop OSC.
 * This is NOT a native HiQnet implementation; Mixing Station must be connected
 * to the console and its OSC API must be enabled on the same production PC.
 * Only verified, observable input-channel faders can be written.
 */
import { createSocket, type Socket } from 'node:dgram';

const CHANNELS = 32;
const MAX_AGE_MS = 12000;
export type SoundcraftChannel = { id: string; label: string; name: string; fader?: number };
export type SoundcraftSnapshot = {
  model: 'Soundcraft Si Expression 3'; bridge: 'Mixing Station Desktop OSC';
  host: string | null; consoleIp: string; connected: boolean;
  lastSeenAt: string | null; channels: SoundcraftChannel[];
  capabilities: string[]; note: string;
};

function oscString(value: string): Buffer {
  const input = Buffer.from(value + '\0', 'utf8');
  return Buffer.concat([input, Buffer.alloc((4 - input.length % 4) % 4)]);
}
export function soundcraftAddress(channel: string): string {
  const match = /^ch\/(0[1-9]|[12][0-9]|3[0-2])$/.exec(channel);
  if (!match) throw new Error('soundcraft_invalid_channel');
  return '/con/n/ch.' + (Number(match[1]) - 1) + '.mix.lvl';
}
export function encodeMixingStationOsc(address: string, value?: number): Buffer {
  if (!/^\/(?:hi\/n|con\/n\/ch\.(?:[0-9]|[12][0-9]|3[01])\.mix\.lvl)$/.test(address)) {
    throw new Error('soundcraft_invalid_osc_address');
  }
  if (value === undefined) return Buffer.concat([oscString(address), oscString(',')]);
  if (!Number.isFinite(value) || value < 0 || value > 1 || address === '/hi/n') {
    throw new Error('soundcraft_invalid_value');
  }
  const encoded = Buffer.alloc(4);
  encoded.writeFloatBE(value, 0);
  return Buffer.concat([oscString(address), oscString(',f'), encoded]);
}
function readOscString(data: Buffer, start: number) {
  const end = data.indexOf(0, start);
  if (end < start || end === -1 || end - start > 200) throw new Error('soundcraft_invalid_packet');
  return { value: data.toString('utf8', start, end), next: (end + 4) & ~3 };
}
export function decodeMixingStationOsc(data: Buffer): { address: string; value: number } {
  if (data.length > 512 || data.length < 12) throw new Error('soundcraft_invalid_packet');
  const address = readOscString(data, 0);
  const tags = readOscString(data, address.next);
  if (!/^,([fi])$/.test(tags.value) || tags.next + 4 > data.length) throw new Error('soundcraft_invalid_packet');
  const value = tags.value === ',f' ? data.readFloatBE(tags.next) : data.readInt32BE(tags.next);
  if (!Number.isFinite(value)) throw new Error('soundcraft_invalid_packet');
  return { address: address.value, value };
}
export function soundcraftBridgePort(port: unknown): number {
  const result = Number(port);
  if (!Number.isInteger(result) || result < 1024 || result > 65535) throw new Error('soundcraft_invalid_bridge_port');
  return result;
}

export class SoundcraftSiBridge {
  private socket: Socket | null = null;
  private port: number | null = null;
  private consoleIp = '192.168.0.148';
  private lastSeen = 0;
  private last = new Map<string, { value: number; time: number }>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private refreshBusy = false;
  private listeners = new Map<string, Set<(value: number) => void>>();

  async connect(portInput: unknown, consoleIp = '192.168.0.148') {
    const port = soundcraftBridgePort(portInput);
    if (!/^192\.168\.0\.[1-9][0-9]{0,2}$/.test(consoleIp) ||
        Number(consoleIp.split('.')[3]) > 254) {
      throw new Error('soundcraft_console_ip_must_be_local');
    }
    await this.close();
    const socket = createSocket('udp4');
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('listening', resolve);
        socket.once('error', reject);
        socket.bind(0, '127.0.0.1');
      });
    } catch (error) {
      socket.close();
      throw error;
    }
    this.socket = socket;
    this.port = port;
    this.consoleIp = consoleIp;
    socket.on('message', (buf, info) => {
      if (info.address !== '127.0.0.1' || info.port !== this.port) return;
      try {
        const packet = decodeMixingStationOsc(buf);
        if (!/^\/con\/n\/ch\.(?:[0-9]|[12][0-9]|3[01])\.mix\.lvl$/.test(packet.address)) return;
        if (packet.value < 0 || packet.value > 1) return;
        const now = Date.now();
        this.lastSeen = now;
        this.last.set(packet.address, { value: packet.value, time: now });
        const callbacks = this.listeners.get(packet.address);
        if (callbacks) for (const callback of callbacks) callback(packet.value);
      } catch { /* Never treat malformed or unrelated OSC packets as desk state. */ }
    });
    socket.on('error', () => { this.lastSeen = 0; });
    this.timers.push(setInterval(() => { void this.send('/hi/n').catch(() => undefined); }, 4000));
    this.timers.push(setInterval(() => { void this.refresh().catch(() => undefined); }, 5500));
    await this.send('/hi/n');
    void this.refresh().catch(() => undefined);
  }
  async close() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    const socket = this.socket;
    this.socket = null;
    this.port = null;
    this.lastSeen = 0;
    this.last.clear();
    this.listeners.clear();
    if (socket) await new Promise<void>(resolve => socket.close(() => resolve()));
  }
  private async send(address: string, value?: number) {
    if (!this.socket || !this.port) throw new Error('soundcraft_bridge_not_configured');
    const packet = encodeMixingStationOsc(address, value);
    await new Promise<void>((resolve, reject) => {
      this.socket!.send(packet, this.port!, '127.0.0.1', error => error ? reject(error) : resolve());
    });
  }
  private async query(address: string, timeoutMs = 900): Promise<number | undefined> {
    let callback: (value: number) => void = () => undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const result = new Promise<number | undefined>(resolve => {
      callback = resolve;
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    });
    const callbacks = this.listeners.get(address) || new Set();
    callbacks.add(callback);
    this.listeners.set(address, callbacks);
    try {
      await this.send(address);
      return await result;
    } finally {
      if (timer) clearTimeout(timer);
      callbacks.delete(callback);
      if (!callbacks.size) this.listeners.delete(address);
    }
  }
  async refresh() {
    if (this.refreshBusy || !this.port) return;
    this.refreshBusy = true;
    try {
      for (let i = 1; i <= CHANNELS && this.port; i++) {
        await this.send(soundcraftAddress('ch/' + String(i).padStart(2, '0')));
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } finally { this.refreshBusy = false; }
  }
  snapshot(): SoundcraftSnapshot {
    const now = Date.now();
    const connected = Boolean(this.port && this.lastSeen && now - this.lastSeen <= MAX_AGE_MS);
    return {
      model: 'Soundcraft Si Expression 3', bridge: 'Mixing Station Desktop OSC',
      host: this.port ? '127.0.0.1:' + this.port : null,
      consoleIp: this.consoleIp, connected,
      lastSeenAt: this.lastSeen ? new Date(this.lastSeen).toISOString() : null,
      channels: Array.from({ length: CHANNELS }, (_, index) => {
        const id = 'ch/' + String(index + 1).padStart(2, '0');
        const state = this.last.get(soundcraftAddress(id));
        return { id, label: 'Canal ' + (index + 1), name: '', fader: connected && state && now - state.time < MAX_AGE_MS ? state.value : undefined };
      }),
      capabilities: connected ? ['audio.channel.fader'] : [],
      note: 'Somente faders observados pelo bridge são editáveis. Sem FX, roteamento ou mute não verificado.'
    };
  }
  async write(input: { channel: string; value: number }) {
    const address = soundcraftAddress(input.channel);
    if (!Number.isFinite(input.value) || input.value < 0 || input.value > 1) throw new Error('soundcraft_invalid_value');
    if (!this.snapshot().connected) throw new Error('soundcraft_bridge_offline');
    const previous = this.last.get(address);
    if (!previous || Date.now() - previous.time > 5000) throw new Error('soundcraft_channel_state_stale');
    // Never allow large involuntary jumps in a live worship service.
    if (Math.abs(input.value - previous.value) > 0.10) throw new Error('soundcraft_step_too_large');
    await this.send(address, input.value);
    const observed = await this.query(address, 1200);
    return {
      sent: true,
      confirmed: observed !== undefined && Math.abs(observed - input.value) < 0.004,
      observed, address
    };
  }
}
