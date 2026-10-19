import type { AudioClip } from '../src/types';
export const maxAudioClips: number;
export function validateAudio(clips: unknown): AudioClip[];
export function audioLength(clips?: AudioClip[]): number;
export function clipDuration(clip:AudioClip): number;
export function splitClip(clip: AudioClip,time:number,id:string): AudioClip[];
export function joinClips(clips:AudioClip[]): AudioClip[];
