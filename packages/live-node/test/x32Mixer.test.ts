import { describe, expect, it } from 'vitest';
import {
  decodeX32, encodeX32, validMixerHost,
  validateMixerWrite, x32ParameterAddress
} from '../src/x32Mixer';

describe('X32 safe OSC transport', () => {
  it('encodes and decodes real X32 channel fader floats', () => {
    const p = encodeX32('/ch/01/mix/fader', [0.75], true);
    expect(p.includes(Buffer.from(',f\0'))).toBe(true);
    const decoded = decodeX32(p);
    expect(decoded.address).toBe('/ch/01/mix/fader');
    expect(decoded.args[0]).toBeCloseTo(0.75, 5);
    const bottom = decodeX32(encodeX32('/ch/01/mix/fader', [0], true));
    expect(bottom.args[0]).toBe(0);
  });
  it('encodes a channel mute as integer and a name as OSC string', () => {
    expect(decodeX32(encodeX32('/ch/02/mix/on', [0]))).toEqual({
      address: '/ch/02/mix/on', args: [0]
    });
    expect(decodeX32(encodeX32('/ch/02/config/name', ['MIC PASTOR']))).toEqual({
      address: '/ch/02/config/name', args: ['MIC PASTOR']
    });
  });
  it('does not permit arbitrary or critical OSC paths', () => {
    expect(x32ParameterAddress({ channel: 'ch/32', parameter: 'fader' })).toBe('/ch/32/mix/fader');
    expect(x32ParameterAddress({ channel: 'ch/01', parameter: 'eqFrequency', band: 4 })).toBe('/ch/01/eq/4/f');
    expect(x32ParameterAddress({ channel: 'ch/01', parameter: 'sendLevel', bus: 16 })).toBe('/ch/01/mix/16/level');
    expect(() => x32ParameterAddress({ channel: 'main/st', parameter: 'eqGain', band: 1 })).toThrow();
    expect(() => x32ParameterAddress({ channel: 'ch/33', parameter: 'on' })).toThrow();
    expect(() => x32ParameterAddress({ channel: '../../-snap/load', parameter: 'fader' })).toThrow();
    expect(() => validateMixerWrite({ channel: 'ch/01', parameter: 'on', value: 0.4 })).toThrow();
  });
  it('denies out-of-range values and public mixer addresses', () => {
    expect(() => validateMixerWrite({ channel: 'ch/01', parameter: 'fader', value: 1.01 })).toThrow();
    expect(() => validateMixerWrite({ channel: 'ch/01', parameter: 'fader', value: -1 })).toThrow();
    expect(() => validateMixerWrite({ channel: 'ch/01', parameter: 'fader', value: Number.NaN })).toThrow();
    expect(validMixerHost('192.168.1.100')).toBe(true);
    expect(validMixerHost('10.0.0.5')).toBe(true);
    expect(validMixerHost('8.8.8.8')).toBe(false);
    expect(validMixerHost('192.168.1.3:10023')).toBe(false);
  });
  it('rejects malformed OSC datagrams', () => {
    expect(() => decodeX32(Buffer.from('bad'))).toThrow();
    expect(() => encodeX32('/ch/01/mix/fader\0', [0.5])).toThrow();
  });
});
