import {QuickHelp} from "../workspace/help";
import {ModuleNotice,useModuleAccess} from '../module-access/client';
import { useState, useRef, type FormEvent } from 'react';
import { Link, useRouteContext, useSearch } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PageHeading } from '../panel/heading';
import { getWallet, getPaymentPrices } from '../payments/actions';
import { submitNumber } from './actions';
import { submissionSchema } from './validation';
import {CountryPicker} from '../countries/picker';
import {getClientCountries} from '../countries/actions';
import {canonicalPhone} from './phone';
import {getCountries,getCountryCallingCode,parsePhoneNumberFromString,type CountryCode} from 'libphonenumber-js';
const names=new Intl.DisplayNames(['pt-BR'],{type:'region'});
const standardCountries=getCountries().map(code=>({code,name:names.of(code)||code,ddi:getCountryCallingCode(code)})).sort((a,b)=>a.code==='BR'?-1:b.code==='BR'?1:a.name.localeCompare(b.name,'pt-BR'));
function initialPhone(raw:string){const digits=raw.replace(/\D/g,'');const parsed=(raw.trim().startsWith('+')||digits.length>11)?parsePhoneNumberFromString('+'+digits):undefined;return {country:parsed?.country||'BR' as CountryCode,number:parsed?String(parsed.nationalNumber):digits};}
const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export function NewRequestPage(){
 const moduleAccess=useModuleAccess('desbanimento');
 const {numero}=useSearch({from:'/nova-solicitacao'});const {client}=useRouteContext({from:'__root__'});const cache=useQueryClient();
 const additions=useQuery({queryKey:['countries','client',client?.id],queryFn:()=>getClientCountries(),retry:false,refetchInterval:30000});
 const countries=[...standardCountries,...(additions.data||[]).map(c=>({code:`custom:${c.id}`,name:c.name,ddi:c.ddi}))];
 const prices=useQuery({queryKey:['payment-prices',client?.id],queryFn:()=>getPaymentPrices(),retry:false,refetchInterval:30000});
 const wallet=useQuery({queryKey:['wallet',client?.id],queryFn:()=>getWallet(),retry:false});
 const initial=initialPhone(numero||'');const [country,setCountry]=useState<string>(initial.country);const [number,setNumber]=useState(initial.number);const [requestId,setRequestId]=useState('');const sending=useRef(false);const [phase,setPhase]=useState('');const [noBalance,setNoBalance]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [done,setDone]=useState(false);
 function reference(phone:string){const key=`astros-submit:${client?.id}:${phone}`;try{const existing=sessionStorage.getItem(key);if(existing)return existing;const id=crypto.randomUUID();sessionStorage.setItem(key,id);return id;}catch{return requestId||crypto.randomUUID();}}
 async function refresh(){await Promise.all([cache.invalidateQueries({queryKey:['wallet',client?.id]}),cache.invalidateQueries({queryKey:['own-numbers',client?.id]}),cache.invalidateQueries({queryKey:['submission-history',client?.id]})]);}
 async function inspect(e:FormEvent){
  e.preventDefault();if(sending.current)return;sending.current=true;setBusy(true);setPhase('Verificando número e saldo…');setMessage('');setNoBalance(false);setDone(false);
  try{
   const parsed=submissionSchema.parse({number:canonicalPhone(number,country,additions.data?.find(c=>`custom:${c.id}`===country)),country,requestId:crypto.randomUUID(),action:'quote'});
   const id=reference(parsed.number);setRequestId(id);
   const checked=await submitNumber({data:{number:parsed.number,country,requestId:id,action:'quote'}});
   if(['processing','review','failed'].includes(checked.state)){setDone(true);setMessage(checked.message);if(checked.state==='failed'){try{sessionStorage.removeItem(`astros-submit:${client?.id}:${parsed.number}`);}catch{}}await refresh();return;}
   if(checked.state==='completed'){try{sessionStorage.removeItem(`astros-submit:${client?.id}:${parsed.number}`);}catch{}setDone(true);setMessage('Esse envio já foi concluído. Consulte Solicitações.');await refresh();return;}
   if(checked.state!=='quoted')throw Error(checked.message||'Solicitação em conferência.');
   setPhase('Enviando número…');
   const result=await submitNumber({data:{number:checked.number,country,requestId:id,action:'submit',expectedCents:checked.costCents}});
   if(['processing','review','failed'].includes(result.state)){setDone(true);setMessage(result.message);if(result.state==='failed'){try{sessionStorage.removeItem(`astros-submit:${client?.id}:${parsed.number}`);}catch{}}await refresh();return;}
   if(result.state!=='completed')throw Error(result.message||'Solicitação em conferência.');
   setMessage(result.costCents?`Número enviado como ${result.targetStatus}. Taxa descontada: ${money(result.costCents)}.`:`Número reenviado como ${result.targetStatus}, sem nova cobrança.`);setDone(true);
   try{sessionStorage.removeItem(`astros-submit:${client?.id}:${result.number}`);}catch{}
   await refresh();
  }catch(e){const text=e instanceof Error?e.message:'Não foi possível enviar.';setMessage(text);setNoBalance(text.toLowerCase().includes('saldo insuficiente'));await refresh();}finally{setBusy(false);sending.current=false;setPhase('');}
 }
 return <><PageHeading title="Enviar número" subtitle="Informe o número. A situação e o saldo serão verificados automaticamente."/><QuickHelp module="desbanimento"/><ModuleNotice module="desbanimento"/><section className="form-section max-w-2xl"><div className="rounded-xl border border-border p-4 mb-5"><p className="text-sm text-muted-foreground">Saldo disponível</p><strong className="text-xl">{wallet.isPending?'Consultando…':wallet.isError?'Indisponível':money(wallet.data!.balanceCents)}</strong><p className="text-xs text-muted-foreground mt-2">Taxa do serviço: {prices.data?money(prices.data.servicePriceCents):prices.isError?'Indisponível':'Consultando…'}</p></div><form onSubmit={inspect} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3"><div className="min-w-0"><label className="block text-sm mb-2" htmlFor="submission-country">País / DDI</label><CountryPicker countries={countries} value={country} disabled={busy||done} onChange={value=>{setCountry(value);setRequestId('');setMessage('');setNoBalance(false);}}/></div><div className="min-w-0"><label className="block text-sm mb-2" htmlFor="submission-number">Número do WhatsApp{country==='BR'?' com DDD':''}</label><input id="submission-number" className="field w-full" inputMode="tel" autoComplete="tel-national" placeholder={country==='BR'?'Ex.: (85) 99999-9999':'Número com código de área'} maxLength={40} value={number} disabled={busy||done} onChange={e=>{setNumber(e.target.value);setRequestId('');setMessage('');setNoBalance(false);}}/></div></div><p className="text-xs text-muted-foreground">Certifique-se de que o número está correto. Para internacionais, inclua o código do país.</p>{additions.isError&&<p className="text-xs text-amber-400">Países adicionais indisponíveis no momento. A lista padrão continua disponível.</p>}{!done&&<Button type="submit" disabled={busy||!number.trim()||moduleAccess.blocked}>{busy?phase:'Enviar número'}</Button>}</form>
 {message&&<p role={noBalance?'alert':'status'} className="mt-5 text-sm leading-relaxed">{message}</p>}{noBalance&&<div className="mt-4"><Button asChild><Link to="/carteira">Adicionar saldo</Link></Button></div>}{done&&<div className="flex gap-3 flex-wrap mt-4"><Button asChild><Link to="/solicitacoes">Ver solicitações</Link></Button><Button variant="outline" onClick={()=>{setDone(false);setCountry('BR');setNumber('');setRequestId('');setMessage('');setNoBalance(false);}}>Enviar outro número</Button></div>}<p className="text-xs text-muted-foreground mt-6">Envios em processamento são conferidos automaticamente. Acompanhe em Solicitações e não envie o mesmo número novamente enquanto estiver em andamento.</p></section></>;
}
