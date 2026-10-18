import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const AUDIO_MIXER_FAMILIES = [
  'none', 'behringer-x32', 'soundcraft-si-expression'
] as const;
export type AudioMixerFamily = typeof AUDIO_MIXER_FAMILIES[number];

export interface AudioMixerScope {
  organizationId: string;
  venueId: string;
  liveSystemId: string;
}

export function audioMixerScopeKey(scope: AudioMixerScope): string {
  if (!scope.organizationId || !scope.venueId || !scope.liveSystemId) {
    throw new Error('mixer_scope_required');
  }
  return JSON.stringify([scope.organizationId, scope.venueId, scope.liveSystemId]);
}

export function validAudioMixerFamily(input: unknown): input is AudioMixerFamily {
  return typeof input === 'string' &&
    (AUDIO_MIXER_FAMILIES as readonly string[]).includes(input);
}

/** Stores only mixer identity, never mixer credentials or remote audio settings. */
export class AudioMixerProfileStore {
  private profiles: Record<string, AudioMixerFamily> = {};
  private loaded = false;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw)) {
          if (validAudioMixerFamily(value)) this.profiles[key] = value;
        }
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  async shouldRestoreLegacyX32(): Promise<boolean> {
    await this.load();
    const families = Object.values(this.profiles);
    return families.length === 0 || families.includes('behringer-x32');
  }

  async get(scope: AudioMixerScope): Promise<AudioMixerFamily> {
    await this.load();
    return this.profiles[audioMixerScopeKey(scope)] ?? 'none';
  }

  async set(scope: AudioMixerScope, family: AudioMixerFamily): Promise<AudioMixerFamily> {
    if (!validAudioMixerFamily(family)) throw new Error('invalid_mixer_family');
    const key = audioMixerScopeKey(scope);
    await this.load();
    await (this.writes = this.writes.then(async () => {
      if (this.profiles[key] === family) return;
      const updated = { ...this.profiles, [key]: family };
      await mkdir(dirname(this.filePath), { recursive: true });
      const temp = this.filePath + '.tmp';
      await writeFile(temp, JSON.stringify(updated, null, 2), { mode: 0o600 });
      await rename(temp, this.filePath);
      this.profiles = updated;
    }));
    return family;
  }
}
