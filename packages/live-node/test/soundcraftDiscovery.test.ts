import { describe, expect, it } from 'vitest';
import {
  buildDiscoQuery, sameSubnet, subnetBroadcast, SoundcraftDiscovery
} from '../src/soundcraftDiscovery';
import { decodeHiqnet } from '../src/soundcraftHiqnet';

describe('Soundcraft Industrial read-only discovery', () => {
  it('uses the actual Industrial mask and correct subnet', () => {
    expect(sameSubnet('192.168.0.103','192.168.0.148','255.255.255.0')).toBe(true);
    expect(sameSubnet('192.168.1.103','192.168.0.148','255.255.255.0')).toBe(false);
    expect(subnetBroadcast('192.168.0.103','255.255.255.0')).toBe('192.168.0.255');
  });
  it('builds a read-safe HiQnet broadcast query, not any audio parameter command', () => {
    const frame = decodeHiqnet(buildDiscoQuery({
      clientAddress: 24501, localIp:'192.168.0.130', localMask:'255.255.255.0',
      localMac:'00:11:22:33:44:55'
    }));
    expect(frame.message).toBe(0);
    expect(frame.flags).toBe(0);
    expect(frame.destDevice).toBe(65535);
    expect(frame.sourceDevice).toBe(24501);
    expect(frame.payload.readUInt16BE(0)).toBe(24501);
    expect(frame.payload.length).toBe(47);
  });
  it('does not claim connectivity before receiving real frames', () => {
    expect(new SoundcraftDiscovery().snapshot()).toBe(null);
    expect(() => subnetBroadcast('not-an-ip','255.255.255.0')).toThrow();
  });
});
