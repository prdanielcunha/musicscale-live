import { describe, expect, it } from 'vitest';
import {
  buildHiqnetDiscoQuery,
  buildSiFaderReadQuery,
  parseSiFaderReadReply,
  SI_MASTER_SENDS_CANDIDATE_OBJECT,
  decodeHiqnetHeader,
  encodeHiqnetHeader,
  SOUNDCRAFT_INDUSTRIAL
} from '../src/soundcraftHiqnet';

describe('Soundcraft Si native HiQnet discovery (read-only)', () => {
  it('preserves the Industrial network, independent of internet Ethernet', () => {
    expect(SOUNDCRAFT_INDUSTRIAL.consoleIp).toBe('192.168.0.148');
    expect(SOUNDCRAFT_INDUSTRIAL.preferredWifiIp).toBe('192.168.0.158');
    expect(SOUNDCRAFT_INDUSTRIAL.consoleHiqnetAddress).toBe(10596);
    expect(SOUNDCRAFT_INDUSTRIAL.port).toBe(3804);
  });

  it('packs and unpacks canonical 25-byte HiQnet v2 header', () => {
    const payload = Buffer.from([0, 1, 2, 3]);
    const message = encodeHiqnetHeader({
      sourceDevice: 1337, destinationDevice: 10596,
      messageId: 0, flags: 0, sequence: 21, payload
    });
    expect(message.length).toBe(29);
    const parsed = decodeHiqnetHeader(message);
    expect(parsed).toMatchObject({
      version: 2, headerLength: 25, messageLength: 29,
      sourceDevice: 1337, destinationDevice: 10596,
      sourceObject: 0, destinationObject: 0, messageId: 0, flags: 0, sequence: 21
    });
    expect(message.subarray(25).equals(payload)).toBe(true);
  });

  it('builds a discovery request describing only the Wi-Fi SOM address', () => {
    const request = buildHiqnetDiscoQuery({
      name: 'Wi-Fi SOM', address: '192.168.0.158',
      netmask: '255.255.255.0', mac: '10:20:30:40:50:60'
    });
    expect(decodeHiqnetHeader(request).messageId).toBe(0);
    expect(decodeHiqnetHeader(request).destinationDevice).toBe(10596);
    expect(request.includes(Buffer.from([192, 168, 0, 158]))).toBe(true);
    expect(request.includes(Buffer.from([255, 255, 255, 0]))).toBe(true);
    expect(request.includes(Buffer.from([0x10, 0x20, 0x30, 0x40, 0x50, 0x60]))).toBe(true);
  });

  it('rejects malformed lengths and illegal network identifiers without sending anything', () => {
    expect(() => encodeHiqnetHeader({
      sourceDevice: -1, destinationDevice: 10596, messageId: 0
    })).toThrow();
    expect(() => decodeHiqnetHeader(Buffer.alloc(6))).toThrow();
    const packet = encodeHiqnetHeader({
      sourceDevice: 1337, destinationDevice: 10596, messageId: 0
    });
    packet.writeUInt32BE(100000, 2);
    expect(() => decodeHiqnetHeader(packet)).toThrow();
    expect(() => buildHiqnetDiscoQuery({
      name: 'bad', address: '1.1.1', netmask: '255.255.255.0', mac: 'bad'
    })).toThrow();
  });
  it('prepares but does not send a single research-only channel fader read query', () => {
    const request = buildSiFaderReadQuery(1);
    const header = decodeHiqnetHeader(request);
    expect(header.messageId).toBe(0x0103); // GET, not SET
    expect(header.destinationObject).toBe(SI_MASTER_SENDS_CANDIDATE_OBJECT);
    expect(request.readUInt16BE(25)).toBe(1);
    expect(request.readUInt16BE(27)).toBe(37);
    expect(() => buildSiFaderReadQuery(33)).toThrow();
  });

  it('decodes only valid replies from the configured Soundcraft device', () => {
    const payload = Buffer.alloc(9);
    payload.writeUInt16BE(1, 0);
    payload.writeUInt16BE(37, 2);
    payload.writeUInt8(4, 4); // signed LONG
    payload.writeInt32BE(5 * 64, 5); // +5dB
    const reply = encodeHiqnetHeader({
      sourceDevice: 10596, destinationDevice: 1337,
      messageId: 0x0103, flags: 0x0004, payload
    });
    reply.writeUInt32BE(SI_MASTER_SENDS_CANDIDATE_OBJECT, 8);
    expect(parseSiFaderReadReply(reply)).toEqual({
      channel: 1, pid: 37, db: 5, rawValue: 320
    });
    reply.writeUInt16BE(1336, 6);
    expect(parseSiFaderReadReply(reply)).toBeNull();
  });

});
