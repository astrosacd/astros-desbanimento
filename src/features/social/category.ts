import {socialCategories} from './types';
export const customCategoryPattern=/^custom:[\p{L}\p{N}][\p{L}\p{N} .,&()/_+\-]{0,79}$/u;
export function categoryLabel(code:string){return socialCategories[code as keyof typeof socialCategories]??(code.startsWith('custom:')?code.slice(7):code);}
export function customCategoryCode(label:string){const clean=label.normalize('NFC').trim().replace(/\s+/g,' ');const builtin=Object.entries(socialCategories).find(([,name])=>name.toLocaleLowerCase('pt-BR')===clean.toLocaleLowerCase('pt-BR'));if(builtin)return builtin[0];const code=`custom:${clean}`;return customCategoryPattern.test(code)?code:null;}
