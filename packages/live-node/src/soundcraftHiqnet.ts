/**
 * Soundcraft Si Expression / HARMAN HiQnet v2 network transport.
 * Reference: HARMAN HiQnet Third Party Programmer Documentation (public specification).
 * READ-ONLY P0: no param set, snapshots, phantom, gains, mutes or master writes.
 * A successful TCP connection is NOT equivalent to authenticated HiQnet connectivity.
 */
import { connect, type Socket } from 'node:net';

const HIQNET_PORT = 3804;
const MAX_FRAME = 65536;
const CLIENT_DEVICE_ADDRESS = 24501;
const FLAG_INFORMATION = 0x0004;
const FLAG_ERROR = 0x0008;
const FLAG_GUARANTEED = 0x0020;
const FLAG_SESSION = 0x0100;
const MESSAGE_HELLO = 0x0008;
const MESSAGE_MULTI_PARAM_GET = 0x0103;
const IDLE_MS = 5000;

export interface HiqnetFrame {
  sourceDevice: number;
  sourceVd: number;
  sourceObject: number;
  destDevice: number;
  destVd: number;
  destObject: number;
  message: number;
  flags: number;
  sequence: number;
  session?: number;
  payload: Buffer;
}
export type HiqnetValue = string | number;
export interface HiqnetReading {
  id: number;
  type: number;
  value: HiqnetValue;
}
export interface SoundcraftProbe {
  host: string;
  deviceAddress: number;
  tcpReachable: boolean;
  protocolConfirmed: boolean;
  lastSeenAt: string | null;
  status: string;
  channels?: Array<{ id: number; label: string; mute?: boolean; faderDb?: number }>;
}
export function isPrivateMixerIpv4(input: string): boolean {
  const parts = input.trim().split('.');
  if (parts.length !== 4 || parts.some(s => !/^\d{1,3}$/.test(s))) return false;
  const n = parts.map(Number);
  if (n.some(x => x > 255)) return false;
  return n[0] === 10 || n[0] === 127 ||
    (n[0] === 172 && n[1]! >= 16 && n[1]! <= 31) ||
    (n[0] === 192 && n[1] === 168);
}
function validDevice(addr: number) {
  return Number.isInteger(addr) && addr > 0 && addr < 65535 && addr !== CLIENT_DEVICE_ADDRESS;
}
function writeAddress(dest: Buffer, offset: number, device: number, vd: number, object: number): void {
  if (!validDevice(device) && device !== CLIENT_DEVICE_ADDRESS) throw new Error('invalid_hiqnet_device');
  if (!Number.isInteger(vd) || vd < 0 || vd > 255 ||
      !Number.isInteger(object) || object < 0 || object > 0xffffff) throw new Error('invalid_hiqnet_object');
  dest.writeUInt16BE(device, offset);
  dest[offset + 2] = vd;
  dest.writeUIntBE(object, offset + 3, 3);
}
export function encodeHiqnet(input: {
  destDevice: number; destVd?: number; destObject?: number;
  message: number; sequence: number; payload?: Buffer; session?: number;
}): Buffer {
  if (!validDevice(input.destDevice)) throw new Error('invalid_hiqnet_device');
  if (!Number.isInteger(input.sequence) || input.sequence < 0 || input.sequence > 65535) throw new Error('invalid_hiqnet_sequence');
  // Only read-safe command types can be generated from this diagnostic module.
  if (![MESSAGE_HELLO, MESSAGE_MULTI_PARAM_GET].includes(input.message)) throw new Error('hiqnet_command_not_allowed');
  if (input.session !== undefined && (!Number.isInteger(input.session) || input.session < 1 || input.session > 65535)) {
    throw new Error('invalid_hiqnet_session');
  }
  const payload = input.payload || Buffer.alloc(0);
  const headerLen = input.session ? 27 : 25;
  if (payload.length + headerLen > MAX_FRAME) throw new Error('hiqnet_frame_too_large');
  const out = Buffer.alloc(headerLen + payload.length);
  out[0] = 2;
  out[1] = headerLen;
  out.writeUInt32BE(out.length, 2);
  writeAddress(out, 6, CLIENT_DEVICE_ADDRESS, 0, 0);
  writeAddress(out, 12, input.destDevice, input.destVd || 0, input.destObject || 0);
  out.writeUInt16BE(input.message, 18);
  out.writeUInt16BE(FLAG_GUARANTEED | (input.session ? FLAG_SESSION : 0), 20);
  out[22] = 5;
  out.writeUInt16BE(input.sequence, 23);
  if (input.session) out.writeUInt16BE(input.session, 25);
  payload.copy(out, headerLen);
  return out;
}
export function decodeHiqnet(buf: Buffer): HiqnetFrame {
  if (buf.length < 25 || buf[0] !== 2) throw new Error('invalid_hiqnet_version');
  const headerLen = buf[1]!;
  const length = buf.readUInt32BE(2);
  if (length !== buf.length || length > MAX_FRAME || headerLen < 25 || headerLen > length) throw new Error('invalid_hiqnet_length');
  const flags = buf.readUInt16BE(20);
  if ((flags & FLAG_SESSION) && headerLen < 27) throw new Error('invalid_hiqnet_session_header');
  return {
    sourceDevice: buf.readUInt16BE(6),
    sourceVd: buf[8]!,
    sourceObject: buf.readUIntBE(9, 3),
    destDevice: buf.readUInt16BE(12),
    destVd: buf[14]!,
    destObject: buf.readUIntBE(15, 3),
    message: buf.readUInt16BE(18),
    flags,
    sequence: buf.readUInt16BE(23),
    session: flags & FLAG_SESSION ? buf.readUInt16BE(25) : undefined,
    payload: buf.subarray(headerLen)
  };
}
export function encodeHiqnetGet(ids: readonly number[]): Buffer {
  if (!ids.length || ids.length > 128 || ids.some(id => !Number.isInteger(id) || id <= 0 || id > 65535)) {
    throw new Error('invalid_hiqnet_parameters');
  }
  const out = Buffer.alloc(2 + ids.length * 2);
  out.writeUInt16BE(ids.length, 0);
  ids.forEach((id, i) => out.writeUInt16BE(id, 2 + 2 * i));
  return out;
}
function readTypedValue(data: Buffer, offset: number, type: number): { value: HiqnetValue; offset: number } {
  const size = [1,1,2,2,4,4,4,8,0,0,8,8][type];
  if (size === undefined) throw new Error('unsupported_hiqnet_type');
  if (type === 8 || type === 9) {
    if (offset + 2 > data.length) throw new Error('hiqnet_value_truncated');
    const count = data.readUInt16BE(offset);
    if (offset + 2 + count > data.length) throw new Error('hiqnet_value_truncated');
    const bytes = data.subarray(offset + 2, offset + 2 + count);
    const value = type === 9
      ? Array.from({ length: Math.floor(count / 2) }, (_, i) => String.fromCharCode(bytes.readUInt16BE(i * 2))).join('').replace(/\0+$/, '')
      : bytes.toString('hex');
    return { value, offset: offset + 2 + count };
  }
  if (offset + size > data.length) throw new Error('hiqnet_value_truncated');
  let value: number;
  switch (type) {
    case 0: value = data.readInt8(offset); break;
    case 1: value = data.readUInt8(offset); break;
    case 2: value = data.readInt16BE(offset); break;
    case 3: value = data.readUInt16BE(offset); break;
    case 4: value = data.readInt32BE(offset); break;
    case 5: value = data.readUInt32BE(offset); break;
    case 6: value = data.readFloatBE(offset); break;
    case 7: value = data.readDoubleBE(offset); break;
    default: throw new Error('unsupported_hiqnet_type');
  }
  return { value, offset: offset + size };
}
export function decodeHiqnetReadings(payload: Buffer): HiqnetReading[] {
  if (payload.length < 2) throw new Error('invalid_hiqnet_payload');
  const count = payload.readUInt16BE(0);
  if (count > 128) throw new Error('too_many_hiqnet_parameters');
  let offset = 2;
  const items: HiqnetReading[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 3 > payload.length) throw new Error('hiqnet_value_truncated');
    const id = payload.readUInt16BE(offset);
    const type = payload.readUInt8(offset + 2);
    offset += 3;
    const decoded = readTypedValue(payload, offset, type);
    offset = decoded.offset;
    items.push({ id, type, value: decoded.value });
  }
  if (offset !== payload.length) throw new Error('invalid_hiqnet_payload_length');
  return items;
}

export class SoundcraftHiqnetClient {
  private socket: Socket | null = null;
  private receiveBuffer = Buffer.alloc(0);
  private pending: Array<{ resolve: (frame: HiqnetFrame) => void; reject: (reason: Error) => void }> = [];
  private sequence = 0;
  private session = 0;
  private confirmed = false;
  private host: string | null = null;
  private deviceAddress = 0;
  private lastSeenAt: string | null = null;
  private channels = new Map<number, { name?: string; mute?: boolean; faderDb?: number }>();
  private lastError = 'Não configurado';

  snapshot(): SoundcraftProbe {
    return {
      host: this.host || '',
      deviceAddress: this.deviceAddress,
      tcpReachable: Boolean(this.socket && !this.socket.destroyed),
      protocolConfirmed: this.confirmed,
      lastSeenAt: this.lastSeenAt,
      status: this.lastError,
      channels: this.confirmed ? Array.from({ length: 32 }, (_, i) => ({
        id: i + 1, label: this.channels.get(i + 1)?.name || 'Canal ' + (i + 1),
        mute: this.channels.get(i + 1)?.mute,
        faderDb: this.channels.get(i + 1)?.faderDb
      })) : undefined
    };
  }
  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.confirmed = false;
    this.receiveBuffer = Buffer.alloc(0);
    this.channels.clear();
    const waiters = this.pending.splice(0);
    for (const waiter of waiters) waiter.reject(new Error('hiqnet_connection_closed'));
    socket?.destroy();
  }
  async connect(host: string, deviceAddress: number): Promise<SoundcraftProbe> {
    if (!isPrivateMixerIpv4(host)) throw new Error('mixer_host_must_be_private_ipv4');
    if (!validDevice(deviceAddress)) throw new Error('invalid_hiqnet_device');
    await this.close();
    this.host = host;
    this.deviceAddress = deviceAddress;
    this.lastError = 'Aguardando conexão TCP/HiQnet';
    const socket = connect({ host, port: HIQNET_PORT, timeout: 3000 });
    this.socket = socket;
    socket.on('data', chunk => this.onData(chunk));
    socket.on('close', () => this.onDisconnected('Conexão HiQnet encerrada'));
    socket.on('error', () => this.onDisconnected('Conexão HiQnet falhou'));
    try {
      await new Promise<void>((resolve, reject) => {
        if (socket.readyState === 'open') return resolve();
        socket.once('connect', resolve);
        socket.once('error', reject);
        socket.once('timeout', () => reject(new Error('hiqnet_connect_timeout')));
      });
      socket.setTimeout(0);
      socket.setNoDelay(true);
      const hello = Buffer.alloc(4);
      const localSession = Math.floor(Math.random() * 65000) + 1;
      hello.writeUInt16BE(localSession, 0);
      hello.writeUInt16BE(0x01ff, 2);
      const response = await this.exchange(MESSAGE_HELLO, 0, hello);
      if (response.message !== MESSAGE_HELLO ||
          !(response.flags & FLAG_INFORMATION) ||
          response.sourceDevice !== deviceAddress ||
          (response.flags & FLAG_ERROR) ||
          response.payload.length < 4 ||
          response.session !== localSession) {
        throw new Error('hiqnet_handshake_not_verified');
      }
      this.session = response.payload.readUInt16BE(0);
      if (!this.session) throw new Error('hiqnet_remote_session_missing');
      this.confirmed = true;
      this.lastError = 'HiQnet validado. Leitura somente.';
      this.lastSeenAt = new Date().toISOString();
      await this.refresh().catch(() => undefined);
      return this.snapshot();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'hiqnet_connect_failed';
      this.confirmed = false;
      socket.destroy();
      return this.snapshot();
    }
  }
  private onDisconnected(reason: string) {
    this.confirmed = false;
    this.lastError = reason;
    for (const item of this.pending.splice(0)) item.reject(new Error(reason));
  }
  private onData(data: Buffer) {
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);
    if (this.receiveBuffer.length > MAX_FRAME * 2) { this.socket?.destroy(); return; }
    while (this.receiveBuffer.length >= 25) {
      const length = this.receiveBuffer.readUInt32BE(2);
      if (length < 25 || length > MAX_FRAME) { this.socket?.destroy(); return; }
      if (this.receiveBuffer.length < length) break;
      const packet = this.receiveBuffer.subarray(0, length);
      this.receiveBuffer = this.receiveBuffer.subarray(length);
      try {
        const frame = decodeHiqnet(packet);
        if (frame.sourceDevice !== this.deviceAddress || frame.destDevice !== CLIENT_DEVICE_ADDRESS) continue;
        this.lastSeenAt = new Date().toISOString();
        const pending = this.pending.shift();
        pending?.resolve(frame);
      } catch { /* Ignore malformed frames without trusting unknown audio state. */ }
    }
  }
  private async exchange(message: number, destObject: number, payload: Buffer, destVd = 0): Promise<HiqnetFrame> {
    if (!this.socket || this.socket.destroyed) throw new Error('hiqnet_not_connected');
    const seq = this.sequence++ & 0xffff;
    const frame = encodeHiqnet({
      destDevice: this.deviceAddress, destVd, destObject,
      message, sequence: seq, payload,
      session: this.confirmed ? this.session : undefined
    });
    let cleanup: (() => void) | undefined;
    const awaited = new Promise<HiqnetFrame>((resolve, reject) => {
      const waiter = { resolve, reject };
      this.pending.push(waiter);
      const timer = setTimeout(() => {
        this.pending = this.pending.filter(item => item !== waiter);
        reject(new Error('hiqnet_read_timeout'));
      }, IDLE_MS);
      cleanup = () => clearTimeout(timer);
    });
    try {
      this.socket.write(frame);
      return await awaited;
    } finally { cleanup?.(); }
  }
  private async readParams(object: number, ids: number[]): Promise<HiqnetReading[]> {
    if (!this.confirmed) throw new Error('hiqnet_session_not_confirmed');
    const resp = await this.exchange(MESSAGE_MULTI_PARAM_GET, object, encodeHiqnetGet(ids), 0);
    if (resp.message !== MESSAGE_MULTI_PARAM_GET ||
        !(resp.flags & FLAG_INFORMATION) ||
        (resp.flags & FLAG_ERROR) ||
        resp.sourceObject !== object ||
        resp.session !== this.session) throw new Error('hiqnet_read_not_confirmed');
    return decodeHiqnetReadings(resp.payload);
  }
  async refresh(): Promise<SoundcraftProbe> {
    if (!this.confirmed) return this.snapshot();
    try {
      // Discovered via HARMAN's HiQnet parameter model; values from real device, never simulated.
      // Object 22: channel mutes (IDs 1..36) and faders (IDs 37..72).
      const ids = Array.from({ length: 32 }, (_, i) => i + 1)
        .concat(Array.from({ length: 32 }, (_, i) => i + 37));
      const values = await this.readParams(22, ids);
      for (const item of values) {
        const channel = item.id <= 36 ? item.id : item.id - 36;
        if (channel < 1 || channel > 32 || typeof item.value !== 'number') continue;
        const before = this.channels.get(channel) || {};
        if (item.id <= 36) before.mute = item.value === 0;
        else before.faderDb = Math.round((item.value / 64) * 10) / 10;
        this.channels.set(channel, before);
      }
      this.lastError = 'HiQnet conectado. Controles ainda somente leitura.';
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'hiqnet_read_failed';
    }
    return this.snapshot();
  }
}
