import {lookup as readerLookup} from 'node:dns/promises';
import {publicWebsite,publicIPv4,socialWebsite,siteEvidence,publishedContacts,contactLink} from './website.ts';
export type SiteReading={siteTitle:string;siteSummary:string;siteEmails:string[];siteReadAt:string;contacts:ReturnType<typeof publishedContacts>};
const text=(v:unknown,n:number)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n):'';
export function readerContent(value:unknown,original:URL):SiteReading|null{
 const v=value as {code?:number;data?:{url?:string;title?:string;content?:string;httpStatus?:number}}|null;
 if(v?.code!==200||!v.data||typeof v.data.content!=='string'||typeof v.data.httpStatus!=='number'||v.data.httpStatus<200||v.data.httpStatus>=300)return null;
 const final=publicWebsite(v.data.url);if(!final||socialWebsite(final.hostname)||final.hostname.replace(/^www\./,'')!==original.hostname.replace(/^www\./,''))return null;
 const body=v.data.content.slice(0,60000);
 if(body.trim().length<80||/verify (you are|that you are) human|checking your browser|just a moment|access denied|captcha|cloudflare ray id/i.test(body))return null;
 const emails=[...new Set((body.match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}/gi)||[]).filter(e=>e.length<=254&&!/\.(png|jpe?g|webp|svg|gif)$/i.test(e)))].slice(0,5);
 const summary=text(body.replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,' ').replace(/[#*`>|]/g,' '),600);
 return {siteTitle:text(v.data.title,160),siteSummary:summary,siteEmails:emails,contacts:[...publishedContacts(body),...emails.map(e=>contactLink('mailto:'+e)).filter((c):c is NonNullable<typeof c>=>!!c)].filter((c,i,a)=>a.findIndex(v=>v.url===c.url)===i).slice(0,20),siteReadAt:new Date().toISOString()};
}
// Only public business URLs. Never forward session cookies or provider credentials.
export async function readWebsite(value:unknown,key='',deadline=Date.now()+8500):Promise<SiteReading|null>{
 const url=publicWebsite(value);if(!url||socialWebsite(url.hostname)||/(^|\.)(jina\.ai|serpapi\.com|supabase\.co)$/i.test(url.hostname)||deadline-Date.now()<1000)return null;
 url.search='';
 try{
  let dnsTimer:ReturnType<typeof setTimeout>|undefined;
  const addresses=await Promise.race([readerLookup(url.hostname,{all:true,family:4}),new Promise<never>((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('DNS_TIMEOUT')),1000);})]).finally(()=>clearTimeout(dnsTimer));
  if(!addresses.length||addresses.some(r=>!publicIPv4(r.address)))return null;
  const headers:Record<string,string>={Accept:'application/json','X-No-Cache':'true','X-Timeout':'6','X-Token-Budget':'3000','X-Robots-Txt':'AstrosMais','X-With-Links-Summary':'true'};
  if(key)headers['Authorization']='Bearer '+key;
  const response=await fetch('https://r.jina.ai/'+url.href,{headers,redirect:'error',signal:AbortSignal.timeout(Math.min(8000,deadline-Date.now()))});
  if(!response.ok)return null;
  const stream=response.body?.getReader();if(!stream)return null;const decoder=new TextDecoder();let body='',size=0;
  while(true){const part=await stream.read();if(part.done)break;size+=part.value.byteLength;if(size>131072){await stream.cancel();return null;}body+=decoder.decode(part.value,{stream:true});}
  body+=decoder.decode();return readerContent(JSON.parse(body),url);
 }catch{return null;}
}
export function enrichWebsite<T extends {websiteStatus:string;websiteReason:string}>(site:T,reading:SiteReading|null){
 if(!reading)return site;
 if(site.websiteStatus!=='unknown')return {...site,...reading,contacts:[...((site as T & {contacts?:SiteReading['contacts']}).contacts||[]),...reading.contacts].filter((c,i,a)=>a.findIndex(v=>v.url===c.url)===i).slice(0,20)};
 const evidence=siteEvidence(200,reading.siteSummary.replace(/[<>]/g,' '));
 return {...site,...reading,contacts:[...((site as T & {contacts?:SiteReading['contacts']}).contacts||[]),...reading.contacts].filter((c,i,a)=>a.findIndex(v=>v.url===c.url)===i).slice(0,20),websiteStatus:evidence.status,websiteReason:evidence.status==='online'?'A leitura complementar encontrou conteúdo na página nesta verificação.':evidence.reason};
}
