/**
 * Soundcraft Si Expression / HARMAN HiQnet v2 network transport.
 * Reference: HARMAN HiQnet Third Party Programmer Documentation (public specification).
 * READ-ONLY P0 codec: transport handled by soundcraftDiscovery.ts. No audio writes.
 * A successful TCP connection is NOT equivalent to authenticated HiQnet connectivity.
 */

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

