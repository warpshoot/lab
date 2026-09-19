import { DroneVoice } from './drone.js';
import { NoiseVoice } from './noise.js';
import { GrainVoice } from './grain.js';
import { DriveVoice } from './drive.js';
import { AnchorVoice } from './anchor.js';

// 音源種別は配列駆動。種別を足すのに UI 側の分岐は書き足さない。
export const VOICE_TYPES = [DroneVoice, NoiseVoice, GrainVoice, DriveVoice, AnchorVoice];

// 鳴る音源だけ。同時発音数と配置制限はこちらで数える。
export const SOUNDING_TYPES = VOICE_TYPES.filter((V) => !V.silent);

export function voiceClass(type) {
  return VOICE_TYPES.find((V) => V.type === type) || VOICE_TYPES[0];
}

export function createVoice(engine, data) {
  const V = voiceClass(data.type);
  return new V(engine, data);
}
