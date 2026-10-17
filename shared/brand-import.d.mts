import type { BrandProfile } from './brand-context.mjs';
export type BrandField = keyof BrandProfile;
export interface WebsiteBrandField { value:string; basis:'stated'|'suggested'|'unknown'; sourceUrl:string; evidence:string }
export type WebsiteBrandFields = Record<BrandField,WebsiteBrandField>;
export interface WebsiteBrandResult { url:string; fields:WebsiteBrandFields; sources:{url:string;title:string}[]; warnings:string[] }
export const brandFieldLabels:Record<BrandField,string>;
export const brandImportSchema:object;
export function validateWebsiteDraft(value:unknown,pages:{id:string;url:string;title:string;text:string}[]):WebsiteBrandFields;
