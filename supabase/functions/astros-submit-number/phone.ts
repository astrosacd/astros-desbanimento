import {parsePhoneNumberFromString,isSupportedCountry,type CountryCode} from 'npm:libphonenumber-js@1.13.15';
// BR stays in the existing local format; international numbers have an explicit +DDI.
export function canonicalPhone(raw:string,country:string,custom?:{id:string;ddi:string}){
 if(country.startsWith('custom:')){
  if(!custom||country!==`custom:${custom.id}`||!/^([1-9][0-9]{0,2})$/.test(custom.ddi)||custom.ddi==='55')throw Error('Selecione um país adicional disponível.');
  if(!/^[+\d\s().-]+$/.test(raw))throw Error('Confira o número e o país selecionado.');
  const digits=raw.replace(/\D/g,'');const number=raw.trim().startsWith('+')?'+'+digits:'+'+custom.ddi+digits;
  if(!number.startsWith('+'+custom.ddi)||!/^\+[1-9][0-9]{7,14}$/.test(number)||number.length<=custom.ddi.length+4)throw Error('Confira o número e o país selecionado.');
  return number;
 }
 if(!isSupportedCountry(country as CountryCode))throw Error('Selecione um país válido.');
 const digits=raw.replace(/\D/g,'');
 const value=country==='BR'&&digits.startsWith('55')&&[12,13].includes(digits.length)?'+'+digits:raw;
 const phone=parsePhoneNumberFromString(value,{defaultCountry:country as CountryCode,extract:false});
 if(!phone||!phone.isPossible()||phone.ext||!(phone.country===country||(!phone.country&&phone.getPossibleCountries().includes(country as CountryCode))))throw Error('Confira o número e o país selecionado.');
 return country==='BR'?String(phone.nationalNumber):String(phone.number);
}
