import type { Design } from '../src/types';
export type LiveRole = 'edit' | 'comment' | 'view';
export interface LiveChange { path:string[]; before?:any; after?:any }
export const liveProtocol:number;
export const maxLiveBytes:number;
export function sharedDesign(value:Design|any):any;
export function validateLiveDesign(value:unknown):any;
export function diffDesign(before:any,after:any):LiveChange[];
export function applyTransaction(value:any,ops:LiveChange[],options?:{role?:LiveRole;actor?:{id:string;name:string};authoritative?:boolean}):{design:any;ops:LiveChange[];conflicts:string[]};
