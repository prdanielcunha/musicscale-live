import { createSocket, type Socket } from 'node:dgram';

export type X32Value = string | number;
export type MixerParameter = 'fader' | 'on' | 'pan' | 'eqOn' | 'eqFrequency' | 'eqGain' | 'eqQ' | 'sendLevel';
export interface X32Channel {
  id: string;
  label: string;
  name: string;
  fader?: number;
  on?: number;
  pan?: number;
}
export interface X32State {
  model: 'Behringer X32';
  host: string | null;
  connected: boolean;
  lastSeenAt: string | null;
  channels: X32Channel[];
  selectedId: string | null;
  eq: Record<string, number>;
  note: string;
}

const DEFAULT_PORT = 10023;
const MAX_AGE_MS = 15000;
const channelIds = [
  ...Array.from({ length: 32 }, (_, n) => 'ch/' + String(n + 1).padStart(2, '0')),
  ...Array.from({ length: 8 }, (_, n) => 'auxin/' + String(n + 1).padStart(2, '0')),
  ...Array.from({ length: 8 }, (_, n) => 'fxrtn/' + String(n + 1).padStart(2, '0')),
  ...Array.from({ length: 16 }, (_, n) => 'bus/' + String(n + 1).padStart(2, '0')),
  'main/st'
];

export function validMixerHost(host: string): boolean {
  const parts = host.trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254);
}

function oscString(text: string): Buffer {
  const value = Buffer.from(text + '\0', 'utf8');
  return Buffer.concat([value, Buffer.alloc((4 - value.length % 4) % 4)]);
}
export function encodeX32(address: string, args: X32Value[] = [], forceFloat = false): Buffer {
  if (!/^\/[A-Za-z0-9/_-]+$/.test(address)) throw new Error('invalid_x32_address');
  const tags = args.map(value => typeof value === 'string' ? 's' : forceFloat || !Number.isInteger(value) ? 'f' : 'i');
  const parts = [oscString(address), oscString(',' + tags.join(''))];
  args.forEach((value, index) => {
    if (typeof value === 'string') parts.push(oscString(value));
    else {
      const buf = Buffer.alloc(4);
      if (tags[index] === 'i') buf.writeInt32BE(value, 0);
      else buf.writeFloatBE(value, 0);
      parts.push(buf);
    }
  });
  return Buffer.concat(parts);
}
function parseField(buf: Buffer, position: number): { value: string; next: number } {
  const end = buf.indexOf(0, position);
  if (end === -1) throw new Error('invalid_osc_packet');
  return { value: buf.toString('utf8', position, end), next: (end + 4) & ~3 };
}
export function decodeX32(buf: Buffer): { address: string; args: X32Value[] } {
  const address = parseField(buf, 0);
  const tags = parseField(buf, address.next);
  if (!tags.value.startsWith(',')) throw new Error('invalid_osc_typetags');
  let offset = tags.next;
  const args: X32Value[] = [];
  for (const tag of tags.value.slice(1)) {
    if (tag === 's') {
      const field = parseField(buf, offset);
      args.push(field.value);
      offset = field.next;
    } else if (tag === 'i' || tag === 'f') {
      if (offset + 4 > buf.length) throw new Error('invalid_osc_packet');
      args.push(tag === 'i' ? buf.readInt32BE(offset) : buf.readFloatBE(offset));
      offset += 4;
    } else if (tag === 'T' || tag === 'F') args.push(tag === 'T' ? 1 : 0);
    else throw new Error('unsupported_osc_typetag');
  }
  return { address: address.value, args };
}

export function x32ParameterAddress(input: {
  channel: string; parameter: MixerParameter; band?: number; bus?: number;
}): string {
  if (!channelIds.includes(input.channel)) throw new Error('invalid_mixer_channel');
  const base = '/' + input.channel;
  const eqAllowed = input.channel.startsWith('ch/') || input.channel.startsWith('auxin/');
  switch (input.parameter) {
    case 'fader': return base + '/mix/fader';
    case 'on': return base + '/mix/on';
    case 'pan':
      if (input.channel === 'main/st') throw new Error('mixer_unsupported_parameter');
      return base + '/mix/pan';
    case 'eqOn':
      if (!eqAllowed) throw new Error('mixer_unsupported_parameter');
      return base + '/eq/on';
    case 'eqFrequency':
    case 'eqGain':
    case 'eqQ': {
      if (!eqAllowed) throw new Error('mixer_unsupported_parameter');
      if (!Number.isInteger(input.band) || input.band! < 1 || input.band! > 4) throw new Error('invalid_mixer_band');
      const suffix = input.parameter === 'eqFrequency' ? 'f' : input.parameter === 'eqGain' ? 'g' : 'q';
      return base + '/eq/' + input.band + '/' + suffix;
    }
    case 'sendLevel':
      if (!input.channel.startsWith('ch/') && !input.channel.startsWith('auxin/')) throw new Error('mixer_unsupported_parameter');
      if (!Number.isInteger(input.bus) || input.bus! < 1 || input.bus! > 16) throw new Error('invalid_mixer_bus');
      return base + '/mix/' + String(input.bus).padStart(2, '0') + '/level';
  }
}

export function validateMixerWrite(input: {
  channel: string; parameter: MixerParameter; band?: number; bus?: number; value: number;
}): { address: string; value: number } {
  const address = x32ParameterAddress(input);
  if (!Number.isFinite(input.value) || input.value < 0 || input.value > 1) throw new Error('invalid_mixer_value');
  if (input.parameter === 'on' || input.parameter === 'eqOn') {
    if (input.value !== 0 && input.value !== 1) throw new Error('invalid_mixer_boolean');
    return { address, value: input.value };
  }
  return { address, value: input.value };
}

export class X32Mixer {
  private socket: Socket | null = null;
  private host: string | null = null;
  private lastSeenAt = 0;
  private state = new Map<string, X32Value>();
  private pending = new Map<string, Array<(value: X32Value) => void>>();
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private scanning = false;
  private selectedId: string | null = 'ch/01';
  private disposed = false;
  private revision = 0;
  private selectedReads = new Map<string, number>();
  private selectedInFlight = new Set<string>();

  revisionKey(): string {
    return `${this.revision}:${this.host}:${Boolean(this.host && this.lastSeenAt && Date.now() - this.lastSeenAt < MAX_AGE_MS)}`;
  }

  async connect(host: string): Promise<void> {
    const value = host.trim();
    if (!validMixerHost(value)) throw new Error('mixer_host_must_be_private_ipv4');
    await this.close();
    this.disposed = false;
    this.host = value;
    const socket = createSocket('udp4');
    this.socket = socket;
    socket.on('message', (data, rinfo) => {
      if (rinfo.address !== this.host || rinfo.port !== DEFAULT_PORT) return;
      try {
        const packet = decodeX32(data);
        this.lastSeenAt = Date.now();
        if (packet.args.length) {
          if (this.state.get(packet.address) !== packet.args[0]) this.revision++;
          this.state.set(packet.address, packet.args[0]!);
          const handlers = this.pending.get(packet.address) || [];
          this.pending.delete(packet.address);
          for (const resolve of handlers) resolve(packet.args[0]!);
        }
      } catch { /* Meters use OSC blobs, intentionally not interpreted as channel values. */ }
    });
    socket.on('error', () => { this.lastSeenAt = 0; });
    await new Promise<void>((resolve, reject) => {
      socket.once('listening', resolve);
      socket.once('error', reject);
      socket.bind(0, '0.0.0.0');
    });
    await this.send('/xremote');
    this.keepalive = setInterval(() => {
      void this.send('/xremote').catch(() => undefined);
      void this.send('/info').catch(() => undefined);
    }, 7000);
    await this.send('/info');
    void this.refresh().catch(() => undefined);
  }
  async close(): Promise<void> {
    this.disposed = true;
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
    const socket = this.socket;
    this.socket = null;
    this.host = null;
    this.lastSeenAt = 0;
    this.state.clear();
    this.selectedReads.clear();
    this.revision++;
    this.pending.clear();
    if (socket) await new Promise<void>(resolve => socket.close(() => resolve()));
  }
  private async send(address: string, args: X32Value[] = [], forceFloat = false): Promise<void> {
    const socket = this.socket;
    const host = this.host;
    if (!socket || !host) throw new Error('mixer_not_configured');
    const packet = encodeX32(address, args, forceFloat);
    await new Promise<void>((resolve, reject) => socket.send(packet, DEFAULT_PORT, host, error => error ? reject(error) : resolve()));
  }
  private async query(address: string, timeoutMs = 550): Promise<X32Value | undefined> {
    if (!this.host) return undefined;
    let finish: (value: X32Value | undefined) => void = () => undefined;
    const result = new Promise<X32Value | undefined>(resolve => { finish = resolve; });
    const callback = (value: X32Value) => finish(value);
    const handlers = this.pending.get(address) || [];
    handlers.push(callback);
    this.pending.set(address, handlers);
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    try {
      await this.send(address);
      return await result;
    } finally {
      clearTimeout(timer);
      const remaining = (this.pending.get(address) || []).filter(item => item !== callback);
      if (remaining.length) this.pending.set(address, remaining);
      else this.pending.delete(address);
    }
  }
  private async wait(ms: number) { await new Promise(resolve => setTimeout(resolve, ms)); }
  async refresh(selected?: string): Promise<void> {
    if (selected && channelIds.includes(selected)) this.selectedId = selected;
    if (this.scanning || !this.host || this.disposed) return;
    this.scanning = true;
    try {
      await this.send('/info');
      for (const id of channelIds) {
        if (!this.host || this.disposed) break;
        const fields = ['mix/fader', 'mix/on', 'config/name'];
        for (const field of fields) {
          // Not all channel families have the same config capabilities.
          if (id === 'main/st' && field === 'config/name') continue;
          await this.send('/' + id + '/' + field).catch(() => undefined);
          await this.wait(17);
        }
      }
      await this.refreshSelected();
    } finally { this.scanning = false; }
  }
  async refreshSelected(id = this.selectedId): Promise<void> {
    if (!id || !channelIds.includes(id) || !this.host) return;
    if (this.selectedInFlight.has(id) || (this.selectedReads.has(id) && Date.now() - this.selectedReads.get(id)! < 5000)) return;
    this.selectedInFlight.add(id);
    this.selectedReads.set(id, Date.now());
    this.selectedId = id;
    try {
      const fields = ['mix/fader', 'mix/on', 'mix/pan'];
      if (id.startsWith('ch/') || id.startsWith('auxin/')) {
        fields.push('eq/on');
        for (let band = 1; band <= 4; band++) fields.push('eq/' + band + '/f', 'eq/' + band + '/g', 'eq/' + band + '/q');
      }
      if (id.startsWith('ch/') || id.startsWith('auxin/')) {
        for (let bus = 1; bus <= 16; bus++) fields.push('mix/' + String(bus).padStart(2, '0') + '/level');
      }
      for (const field of fields) {
        await this.send('/' + id + '/' + field).catch(() => undefined);
        await this.wait(15);
      }
    } finally { this.selectedInFlight.delete(id); }
  }
  snapshot(selected?: string): X32State {
    // Snapshot reads must not generate console traffic or change another phone's selection.
    const current = selected && channelIds.includes(selected) ? selected : this.selectedId;
    const eq: Record<string, number> = {};
    if (current) {
      const prefix = '/' + current + '/';
      for (const [key, value] of this.state) {
        if (key.startsWith(prefix) && typeof value === 'number') eq[key.slice(prefix.length)] = value;
      }
    }
    return {
      model: 'Behringer X32', host: this.host,
      connected: Boolean(this.host && this.lastSeenAt && Date.now() - this.lastSeenAt < MAX_AGE_MS),
      lastSeenAt: this.lastSeenAt ? new Date(this.lastSeenAt).toISOString() : null,
      selectedId: current, eq,
      channels: channelIds.map(id => ({
        id,
        label: id === 'main/st' ? 'Master LR' : id.replace('/', ' ').toUpperCase(),
        name: String(this.state.get('/' + id + '/config/name') || ''),
        fader: this.number('/' + id + '/mix/fader'),
        on: this.number('/' + id + '/mix/on'),
        pan: this.number('/' + id + '/mix/pan')
      })),
      note: 'Controle beta em rede local; somente alterações observadas na mesa são exibidas.'
    };
  }
  private number(address: string): number | undefined {
    const value = this.state.get(address);
    return typeof value === 'number' ? value : undefined;
  }
  async write(input: {
    channel: string; parameter: MixerParameter; band?: number; bus?: number; value: number;
  }): Promise<{ sent: boolean; confirmed: boolean; observed?: X32Value; address: string }> {
    const { address, value } = validateMixerWrite(input);
    if (!this.snapshot().connected) throw new Error('mixer_offline');
    // X32 accepts normalized float for continuous parameters, integer for switches.
    await this.send(address, [input.parameter === 'on' || input.parameter === 'eqOn' ? Math.round(value) : value],
      input.parameter !== 'on' && input.parameter !== 'eqOn');
    // A UDP send acknowledgement alone is never proof that the desk applied a change.
    const observed = await this.query(address, 800);
    const confirmed = typeof observed === 'number' && Math.abs(observed - value) < 0.003;
    return { sent: true, confirmed, observed, address };
  }
  isConfigured() { return Boolean(this.host); }
}
