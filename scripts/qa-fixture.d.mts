import type { Page } from '@playwright/test';
export const fixture:any;
export const logo:{id:string;name:string;src:string;width:number;height:number};
export const sticker:{id:string;name:string;src:string;category:string};
export function saved(page:Page):Promise<any>;
export function importFixture(page:Page):Promise<void>;
