import {parsePhoneNumberFromString,isSupportedCountry,type CountryCode} from 'libphonenumber-js';
// BR stays in the existing local format; international numbers have an explicit +DDI.
export function canonicalPhone(raw:string,country:string){
 if(!isSupportedCountry(country as CountryCode))throw Error('Selecione um país válido.');
 const digits=raw.replace(/\D/g,'');
 const value=country==='BR'&&digits.startsWith('55')&&[12,13].includes(digits.length)?'+'+digits:raw;
 const phone=parsePhoneNumberFromString(value,{defaultCountry:country as CountryCode,extract:false});
 if(!phone||!phone.isPossible()||phone.ext||!(phone.country===country||(!phone.country&&phone.getPossibleCountries().includes(country as CountryCode))))throw Error('Confira o número e o país selecionado.');
 return country==='BR'?String(phone.nationalNumber):String(phone.number);
}
