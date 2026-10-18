import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AudioMixerProfileStore, validAudioMixerFamily
} from '../src/audioMixerProfileStore';

describe('AudioMixerProfileStore', () => {
  it('defaults to no mixer, not the X32, for a new venue', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ms-mixer-'));
    const store = new AudioMixerProfileStore(join(dir, 'profile.json'));
    expect(await store.get({ organizationId: 'industrial', venueId: 'londrina', liveSystemId: 'live1' })).toBe('none');
  });

  it('stores Soundcraft independently of X32 and recovers after restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ms-mixer-'));
    const path = join(dir, 'profile.json');
    const first = new AudioMixerProfileStore(path);
    const industrial = { organizationId: 'obpc', venueId: 'industrial', liveSystemId: 'live1' };
    const monte = { organizationId: 'obpc', venueId: 'monte-castelo', liveSystemId: 'live2' };
    await first.set(industrial, 'soundcraft-si-expression');
    await first.set(monte, 'behringer-x32');

    const restored = new AudioMixerProfileStore(path);
    expect(await restored.get(industrial)).toBe('soundcraft-si-expression');
    expect(await restored.get(monte)).toBe('behringer-x32');
  });

  it('rejects unknown mixer families without writing anything', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ms-mixer-'));
    const store = new AudioMixerProfileStore(join(dir, 'profile.json'));
    const venue = { organizationId: 'a', venueId: 'b', liveSystemId: 'c' };
    expect(validAudioMixerFamily('soundcraft-ui')).toBe(false);
    await expect(store.set(venue, 'soundcraft-ui' as never)).rejects.toThrow('invalid_mixer_family');
    expect(await store.get(venue)).toBe('none');
  });
});
