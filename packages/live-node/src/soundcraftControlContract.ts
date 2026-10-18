/**
 * Soundcraft Si Expression READINESS CONTRACT ONLY.
 * Channel mapping based on captured Si-family HiQnet object documentation.
 *
 * IMPORTANT: this module does not transmit packets. Audio writes are disabled
 * until real-device round-trip tests and operator approval are completed.
 */
export type SoundcraftChannelCommand =
  | { kind:'input.fader'; channel:number; db:number }
  | { kind:'input.mute'; channel:number; muted:boolean }
  | { kind:'input.eq.on'; channel:number; enabled:boolean }
  | { kind:'input.eq.gain'; channel:number; band:'LF'|'LMF'|'HMF'|'HF'; db:number };

export interface SoundcraftParameterChange {
  destinationVD: 1;
  destinationObject: number;
  parameterId: number;
  dataType: 4; // LONG signed
  encodedValue: number;
  risky: boolean;
}
export function buildSoundcraftChange(input: SoundcraftChannelCommand): SoundcraftParameterChange {
  if (!Number.isInteger(input.channel) || input.channel < 1 || input.channel > 32) {
    throw new Error('invalid_soundcraft_channel');
  }
  const destinationObject = input.kind === 'input.fader' || input.kind === 'input.mute'
    ? 22 : 47 + input.channel;
  if (input.kind === 'input.mute') {
    return { destinationVD:1, destinationObject, parameterId: input.channel,
      dataType:4, encodedValue:input.muted ? 0 : 1, risky:true };
  }
  if (input.kind === 'input.fader') {
    if (!Number.isFinite(input.db) || input.db < -90 || input.db > 10) throw new Error('invalid_soundcraft_fader_db');
    return { destinationVD:1, destinationObject, parameterId:36+input.channel,
      dataType:4, encodedValue: Math.round(input.db * 64), risky:true };
  }
  if (input.kind === 'input.eq.on') {
    return { destinationVD:1, destinationObject, parameterId:14,
      dataType:4, encodedValue:input.enabled ? 1 : 0, risky:true };
  }
  const bands: Record<'LF'|'LMF'|'HMF'|'HF',number> = { LF:16, LMF:20, HMF:23, HF:26 };
  if (!Number.isFinite(input.db) || input.db < -15 || input.db > 15) {
    throw new Error('invalid_soundcraft_eq_gain');
  }
  return { destinationVD:1, destinationObject, parameterId:bands[input.band],
    dataType:4, encodedValue:Math.round(input.db * 64), risky:true };
}

/** Strictly offline packet payload constructor: no socket/device access. */
export function encodeSoundcraftMultiParamSetPayload(changes: readonly SoundcraftParameterChange[]): Buffer {
  if (changes.length < 1 || changes.length > 32) throw new Error('invalid_soundcraft_change_count');
  const out=Buffer.alloc(2+changes.length*7);
  out.writeUInt16BE(changes.length,0);
  changes.forEach((change,i)=>{
    const offset=2+i*7;
    if (change.dataType!==4 ||
      !Number.isInteger(change.parameterId) || change.parameterId<1 || change.parameterId>65535 ||
      !Number.isInteger(change.encodedValue) || change.encodedValue < -2147483648 || change.encodedValue > 2147483647)
      throw new Error('invalid_soundcraft_change');
    out.writeUInt16BE(change.parameterId,offset);
    out.writeUInt8(change.dataType,offset+2);
    out.writeInt32BE(change.encodedValue,offset+3);
  });
  return out;
}

export const SOUNDCRAFT_WRITES_ENABLED = false as const;
