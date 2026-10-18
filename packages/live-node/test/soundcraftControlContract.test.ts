import { describe,it,expect } from 'vitest';
import { buildSoundcraftChange,encodeSoundcraftMultiParamSetPayload,SOUNDCRAFT_WRITES_ENABLED } from '../src/soundcraftControlContract';

describe('Soundcraft Si manual control contract (transmission disabled)',()=>{
 it('maps 32 channel master sends at object 22',()=>{
   const first=buildSoundcraftChange({kind:'input.fader',channel:1,db:0});
   expect(first).toMatchObject({destinationVD:1,destinationObject:22,parameterId:37,dataType:4,encodedValue:0,risky:true});
   const last=buildSoundcraftChange({kind:'input.fader',channel:32,db:-6});
   expect(last.parameterId).toBe(68);
   expect(last.encodedValue).toBe(-384);
   expect(buildSoundcraftChange({kind:'input.mute',channel:1,muted:true}).encodedValue).toBe(0);
 });
 it('encodes a single long-signed fader payload, not a network request',()=>{
   const data=encodeSoundcraftMultiParamSetPayload([buildSoundcraftChange({kind:'input.fader',channel:1,db:-10})]);
   expect(data.toString('hex')).toBe('0001002504fffffd80');
 });
 it('maps EQ parameters and rejects dangerous values',()=>{
   expect(buildSoundcraftChange({kind:'input.eq.gain',channel:5,band:'HMF',db:2}).parameterId).toBe(23);
   expect(buildSoundcraftChange({kind:'input.eq.on',channel:5,enabled:true}).destinationObject).toBe(52);
   expect(()=>buildSoundcraftChange({kind:'input.fader',channel:33,db:-10})).toThrow();
   expect(()=>buildSoundcraftChange({kind:'input.fader',channel:1,db:70})).toThrow();
   expect(()=>buildSoundcraftChange({kind:'input.eq.gain',channel:1,band:'LF',db:20})).toThrow();
 });
 it('never exposes actual Soundcraft writes until a hardware gate is implemented',()=>{
   expect(SOUNDCRAFT_WRITES_ENABLED).toBe(false);
 });
});
