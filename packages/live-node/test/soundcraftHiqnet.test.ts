import { describe, expect, it } from 'vitest';
import {
  encodeHiqnet, decodeHiqnet, encodeHiqnetGet, decodeHiqnetReadings,
  isPrivateMixerIpv4, SoundcraftHiqnetClient
} from '../src/soundcraftHiqnet';

describe('Soundcraft Si Expression HiQnet v2 transport (read-only)', () => {
  it('encodes HARMAN 25-byte TCP header and 27-byte session header', () => {
    const payload = Buffer.from('1234', 'hex');
    const hello = encodeHiqnet({
      destDevice: 1244, message: 0x0008, sequence: 22, payload
    });
    expect(hello.length).toBe(27);
    expect(hello.readUInt32BE(2)).toBe(hello.length);
    const decoded = decodeHiqnet(hello);
    expect(decoded.destDevice).toBe(1244);
    expect(decoded.sourceDevice).toBe(24501);
    expect(decoded.message).toBe(0x0008);
    expect(decoded.sequence).toBe(22);
    expect(decoded.payload).toEqual(payload);
    const get = decodeHiqnet(encodeHiqnet({
      destDevice: 1244, destVd: 0, destObject: 22,
      message: 0x0103, sequence: 23, session: 2323,
      payload: encodeHiqnetGet([1, 37, 72])
    }));
    expect(get.flags & 0x0120).toBe(0x0120);
    expect(get.session).toBe(2323);
    expect(get.destObject).toBe(22);
    expect(get.payload.toString('hex')).toBe('0003000100250048');
  });
  it('decodes typed numbers and UTF16-BE names from HiQnet information payload', () => {
    const nameBytes = Buffer.from([0x00, 0x4d, 0x00, 0x49, 0x00, 0x43, 0x00, 0x00]);
    const payload = Buffer.concat([
      Buffer.from('0003', 'hex'),
      Buffer.from('00010400000001', 'hex'),
      Buffer.from('002504fffffd80', 'hex'),
      Buffer.from('0003090008', 'hex'), nameBytes
    ]);
    const values = decodeHiqnetReadings(payload);
    expect(values).toEqual([
      { id: 1, type: 4, value: 1 },
      { id: 37, type: 4, value: -640 },
      { id: 3, type: 9, value: 'MIC' }
    ]);
  });
  it('rejects malformed message lengths and output commands', () => {
    expect(() => encodeHiqnet({ destDevice: 1244, message: 0x0101, sequence: 1 })).toThrow();
    expect(() => encodeHiqnetGet([])).toThrow();
    expect(() => encodeHiqnet({ destDevice: 24501, message: 0x0008, sequence: 1 })).toThrow();
    expect(() => decodeHiqnet(Buffer.from([2, 25, 0, 0, 0, 0]))).toThrow();
    const packet = encodeHiqnet({ destDevice: 1244, message: 0x0008, sequence: 1 });
    packet.writeUInt32BE(99999, 2);
    expect(() => decodeHiqnet(packet)).toThrow();
  });
  it('denies connection attempts to public destinations', () => {
    expect(isPrivateMixerIpv4('192.168.1.101')).toBe(true);
    expect(isPrivateMixerIpv4('10.100.2.1')).toBe(true);
    expect(isPrivateMixerIpv4('172.16.0.1')).toBe(true);
    expect(isPrivateMixerIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateMixerIpv4('192.168.1.1:3804')).toBe(false);
    expect(isPrivateMixerIpv4('169.254.2.3')).toBe(false);
    const client = new SoundcraftHiqnetClient();
    expect(() => client.snapshot()).not.toThrow();
  });
});
