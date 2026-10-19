export const brazilStates = [{"id": "AC", "name": "Acre"}, {"id": "AL", "name": "Alagoas"}, {"id": "AP", "name": "Amapá"}, {"id": "AM", "name": "Amazonas"}, {"id": "BA", "name": "Bahia"}, {"id": "CE", "name": "Ceará"}, {"id": "DF", "name": "Distrito Federal"}, {"id": "ES", "name": "Espírito Santo"}, {"id": "GO", "name": "Goiás"}, {"id": "MA", "name": "Maranhão"}, {"id": "MT", "name": "Mato Grosso"}, {"id": "MS", "name": "Mato Grosso do Sul"}, {"id": "MG", "name": "Minas Gerais"}, {"id": "PA", "name": "Pará"}, {"id": "PB", "name": "Paraíba"}, {"id": "PR", "name": "Paraná"}, {"id": "PE", "name": "Pernambuco"}, {"id": "PI", "name": "Piauí"}, {"id": "RJ", "name": "Rio de Janeiro"}, {"id": "RN", "name": "Rio Grande do Norte"}, {"id": "RS", "name": "Rio Grande do Sul"}, {"id": "RO", "name": "Rondônia"}, {"id": "RR", "name": "Roraima"}, {"id": "SC", "name": "Santa Catarina"}, {"id": "SP", "name": "São Paulo"}, {"id": "SE", "name": "Sergipe"}, {"id": "TO", "name": "Tocantins"}];
const cityCache=new Map<string,{until:number;cities:{id:string;name:string}[]}>();
const cityPending=new Map<string,Promise<{id:string;name:string}[]>>();
export async function brazilCities(uf:string){
 if(!brazilStates.some(state=>state.id===uf))throw Error('Selecione um estado brasileiro válido.');
 const cached=cityCache.get(uf);if(cached&&cached.until>Date.now())return cached.cities;
 const pending=cityPending.get(uf);if(pending)return pending;
 const task=(async()=>{const response=await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?view=nivelado&orderBy=nome`,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});if(!response.ok)throw Error('Não foi possível carregar as cidades. Tente novamente.');
 const reader=response.body?.getReader();if(!reader)throw Error('Resposta de cidades não confirmada.');let body='',size=0;const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2000000){await reader.cancel();throw Error('Resposta de cidades não confirmada.');}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();
 const rows=JSON.parse(body);if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw Error('Resposta de cidades não confirmada.');
 const cities=rows.map((row:Record<string,unknown>)=>{if(row['UF-sigla']!==uf||typeof row['municipio-nome']!=='string'||row['municipio-nome'].length<2||row['municipio-nome'].length>80||!Number.isSafeInteger(row['municipio-id']))throw Error('Resposta de cidades não confirmada.');return {id:String(row['municipio-id']),name:row['municipio-nome']};});
 if(new Set(cities.map(c=>c.id)).size!==cities.length)throw Error('Resposta de cidades não confirmada.');cities.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));cityCache.set(uf,{cities,until:Date.now()+86400000});return cities;
 })().catch(()=>{throw Error('Não foi possível carregar as cidades. Tente novamente.');}).finally(()=>cityPending.delete(uf));cityPending.set(uf,task);return task;
}

import {Buffer} from 'node:buffer';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {lookup} from 'node:dns/promises';
export function publicIPv4(ip:string){if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))return false;const a=ip.split('.').map(Number);if(a.some(n=>n>255))return false;const [x,y]=a;return !(x===0||x===10||x===127||x!>=224||x===169&&y===254||x===172&&y!>=16&&y!<=31||x===192&&(y===168||y===0||y===2)||x===100&&y!>=64&&y!<=127||x===198&&(y===18||y===19||y===51)||x===203&&y===0);}
export function publicWebsite(value:unknown){try{const u=new URL(String(value));if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||u.href.length>1500||!/^([a-z0-9-]+\.)+[a-z]{2,63}$/i.test(u.hostname)||/(^|\.)(localhost|local|internal|invalid|test|example|onion)$/i.test(u.hostname))return null;u.hash='';return u;}catch{return null;}}
export const socialWebsite=(host:string)=>/(^|\.)(instagram\.com|facebook\.com|fb\.com|linktr\.ee|linktree\.com|wa\.me|whatsapp\.com|tiktok\.com|linkedin\.com)$/i.test(host);
export function siteEvidence(status:number,html:string){if(status===403||status===429||status>=500)return {status:'unknown',reason:'O site não permitiu uma verificação conclusiva.'};if(status===404||status===410)return {status:'offline',reason:'A página informada não foi encontrada nesta verificação.'};if(status<200||status>=300)return {status:'unknown',reason:'Resposta do site não confirmada.'};const body=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<script\b[^>]*>[\s\S]*$/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<style\b[^>]*>[\s\S]*$/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').toLowerCase();if(/domain (is )?for sale|this domain (is|has been) (parked|suspended)|dom[ií]nio (est[aá] )?[àa] venda|conta suspensa|account suspended|website (has been |is )?suspended/.test(body))return {status:'offline',reason:'A página indica domínio à venda, estacionamento ou suspensão.'};if(body.trim().length<40)return {status:'unknown',reason:'Conteúdo insuficiente para confirmar o site.'};return {status:'online',reason:'A página respondeu e apresentou conteúdo nesta verificação.'};}
// Resolve inside the actual socket lookup, reject private addresses and pin that connection.
// Checking DNS before fetch alone would leave a DNS-rebinding gap.
async function page(url:URL):Promise<{status:number;location:string|null;html:string}>{return new Promise((resolve,reject)=>{let done=false;let timer:ReturnType<typeof setTimeout>;const finish=(fn:()=>void)=>{if(!done){done=true;clearTimeout(timer);fn();}};const req=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method:'GET',agent:false,headers:{'User-Agent':'AstrosMais-WebsiteCheck/1.0','Accept':'text/html,text/plain;q=0.8'},lookup:((hostname:string,options:any,callback:any)=>{lookup(hostname,{all:true,family:4}).then(rows=>{if(!rows.length||rows.some(r=>!publicIPv4(r.address)))return callback(Error('BLOCKED_ADDRESS'));if(options?.all)callback(null,rows);else callback(null,rows[0]!.address,4);}).catch(()=>callback(Error('DNS_UNCONFIRMED')));}) as any},res=>{const status=res.statusCode??0,location=typeof res.headers.location==='string'?res.headers.location:null;if(status>=300&&status<400){res.resume();finish(()=>resolve({status,location,html:''}));return;}const content=String(res.headers['content-type']||'');if(!/text\/(html|plain)/i.test(content)){res.resume();finish(()=>resolve({status:0,location:null,html:''}));return;}const parts:Uint8Array[]=[];let size=0;res.on('data',(part:Uint8Array)=>{const remaining=524288-size;parts.push(part.subarray(0,Math.max(0,remaining)));size+=part.length;if(size>=524288){finish(()=>resolve({status,location,html:Buffer.concat(parts).toString('utf8')}));res.destroy();}});res.on('end',()=>finish(()=>resolve({status,location,html:Buffer.concat(parts).toString('utf8')})));res.on('error',()=>finish(()=>reject(Error('SITE_UNCONFIRMED'))));});timer=setTimeout(()=>{req.destroy();finish(()=>reject(Error('SITE_TIMEOUT')));},6500);req.setTimeout(4500,()=>{req.destroy();finish(()=>reject(Error('SITE_TIMEOUT')));});req.on('error',()=>finish(()=>reject(Error('SITE_UNCONFIRMED'))));req.end();});}
export async function checkWebsite(value:unknown){const checkedAt=new Date().toISOString();if(!value)return {website:'',websiteStatus:'missing',websiteReason:'Nenhum site informado no cadastro de origem.',checkedAt};let url=publicWebsite(value);if(!url)return {website:'',websiteStatus:'unknown',websiteReason:'Endereço informado não pôde ser verificado.',checkedAt};const original=url.href;try{for(let i=0;i<4;i++){if(socialWebsite(url.hostname))return {website:url.href,websiteStatus:'social',websiteReason:'O endereço leva a uma rede social ou página de links.',checkedAt};const result=await page(url);if(result.status>=300&&result.status<400){const next=publicWebsite(new URL(result.location||'',url).href);if(!result.location||!next)break;url=next;continue;}const evidence=siteEvidence(result.status,result.html);return {website:original,websiteStatus:evidence.status,websiteReason:evidence.reason,checkedAt,contacts:result.status>=200&&result.status<300?publishedContacts(result.html):[]};}}catch{/* Never turn timeout, DNS, TLS or access restrictions into proof of inactivity. */}return {website:original,websiteStatus:'unknown',websiteReason:'Não foi possível concluir a verificação agora.',checkedAt};}

export type BusinessContact={kind:string;label:string;value:string;url:string;source:'site'|'maps'};
export function contactLink(value:unknown,source:'site'|'maps'='site'):BusinessContact|null{
 if(typeof value!=='string'||value.length>1500)return null;
 if(/^mailto:/i.test(value)){const email=value.slice(7).split('?')[0]!;if(!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(email)||email.length>254)return null;return {kind:'email',label:'E-mail',value:email,url:'mailto:'+email,source};}
 if(/^tel:/i.test(value)){const phone=value.slice(4).replace(/[ ()\-.]/g,'');if(!/^\+?\d{8,15}$/.test(phone))return null;return {kind:'phone',label:'Telefone',value:phone,url:'tel:'+phone,source};}
 const u=publicWebsite(value);if(!u||u.protocol!=='https:')return null;const host=u.hostname.replace(/^www\./,'').toLowerCase();
 const names:Record<string,string>={'instagram.com':'Instagram','facebook.com':'Facebook','fb.com':'Facebook','linkedin.com':'LinkedIn','tiktok.com':'TikTok','youtube.com':'YouTube','youtu.be':'YouTube','x.com':'X','twitter.com':'X','threads.net':'Threads','threads.com':'Threads','wa.me':'WhatsApp','api.whatsapp.com':'WhatsApp','whatsapp.com':'WhatsApp','linktr.ee':'Página de links','linktree.com':'Página de links'};
 const label=names[host];if(!label||u.pathname==='/'&&!['api.whatsapp.com'].includes(host)||/\/(share|sharer|intent|login|signin|accounts|privacy|terms)(\/|\.|$)/i.test(u.pathname))return null;
 if(label==='WhatsApp'){const phone=host==='wa.me'?u.pathname.slice(1):u.searchParams.get('phone')||'';if(!/^\+?\d{8,15}$/.test(phone))return null;return {kind:'whatsapp',label,value:phone,url:'https://wa.me/'+phone.replace(/^\+/,''),source};}
 u.search='';return {kind:'social',label,value:u.hostname+u.pathname,url:u.href,source};
}
export function publishedContacts(content:string,source:'site'|'maps'='site'):BusinessContact[]{
 const contacts:BusinessContact[]=[];const seen=new Set<string>();
 const body=content.slice(0,524288).replace(/<script\b[^>]*>[\s\S]*?(<\/script>|$)/gi,' ').replace(/<style\b[^>]*>[\s\S]*?(<\/style>|$)/gi,' ');
 const links=[...body.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]!).concat([...body.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map(m=>m[1]!));
 for(const email of body.replace(/<[^>]*>/g,' ').match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}/gi)||[]){if(!/\.(png|jpe?g|svg|webp|gif)$/i.test(email))links.push('mailto:'+email);}
 for(const raw of links){const c=contactLink(raw.replace(/&amp;/g,'&'),source);if(c&&!seen.has(c.url)){seen.add(c.url);contacts.push(c);if(contacts.length>=20)break;}}
 return contacts;
}

import {lookup as readerLookup} from 'node:dns/promises';
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

// Fixed provider endpoints; no customer-supplied URL, key, actor or balance.
type Db = (path: string, method?: string, body?: unknown) => Promise<any>;
const cnpjText = (v: unknown, max = 200) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
export function validCnpj(value: unknown) {
  const v = typeof value === "string" ? value.replace(/[.\/-]/g, "").trim() : "";
  if (!/^\d{14}$/.test(v) || /^(\d)\1+$/.test(v)) return false;
  for (const size of [12, 13]) {
    let sum = 0,
      weight = size - 7;
    for (let i = 0; i < size; i++) {
      sum += Number(v[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (digit !== Number(v[size])) return false;
  }
  return true;
}
export function cnpjCriteria(v: Obj) {
  const mode = v.mode === "lookup" ? "lookup" : v.mode === "search" ? "search" : "";
  if (mode === "lookup") {
    const cnpj = cnpjText(v.cnpj, 30).replace(/[.\/-]/g, "");
    if (!validCnpj(cnpj)) throw Error("Informe um CNPJ numérico válido.");
    return { mode, cnpj };
  }
  const uf = cnpjText(v.uf, 2).toUpperCase(),
    city = cnpjText(v.city, 80).normalize("NFC").toLowerCase().replace(/\s+/g, " "),
    cnae = cnpjText(v.cnae, 20).replace(/[.\/-]/g, ""),
    term = cnpjText(v.term, 80);
  if (
    !mode ||
    ![
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ].includes(uf) ||
    city.length < 2 ||
    (cnae && !/^\d{7}$/.test(cnae))
  )
    throw Error("Confira o estado, a cidade e o CNAE.");
  const size = cnpjText(v.size, 2),
    status = cnpjText(v.status, 12),
    from = cnpjText(v.from, 10),
    until = cnpjText(v.until, 10);
  if (
    (size && !["01", "03", "05"].includes(size)) ||
    (status && !["ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NULA"].includes(status)) ||
    [from, until].some((d) => d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) ||
    (from && until && from > until)
  )
    throw Error("Filtros CNPJ inválidos");
  return { mode, uf, city, cnae, term, size, status, from, until };
}
export function casaBody(c: Obj, page: number) {
  return {
    uf: [c.uf],
    municipio: [c.city],
    ...(c.cnae ? { codigo_atividade_principal: [c.cnae] } : {}),
    ...(c.term
      ? {
          busca_textual: [
            { texto: [c.term], tipo_busca: "exata", razao_social: true, nome_fantasia: true },
          ],
        }
      : {}),
    ...(c.size ? { porte_empresa: { codigos: [c.size] } } : {}),
    ...(c.status ? { situacao_cadastral: [c.status] } : {}),
    ...(c.from || c.until
      ? {
          data_abertura: {
            ...(c.from ? { inicio: c.from } : {}),
            ...(c.until ? { fim: c.until } : {}),
          },
        }
      : {}),
    limite: 20,
    pagina: page,
  };
}
export function companySnapshot(r: Obj, receita = false) {
  const cnpj = cnpjText(r.cnpj, 30).replace(/\D/g, "");
  if (!validCnpj(cnpj)) return null;
  const address = receita ? r : r.endereco || {},
    legalName = cnpjText(receita ? r.nome : r.razao_social),
    tradeName = cnpjText(receita ? r.fantasia : r.nome_fantasia),
    name = tradeName || legalName;
  if (!name) return null;
  const now = new Date().toISOString(),
    phones = (
      Array.isArray(r.telefones) ? r.telefones : typeof r.telefone === "string" ? [r.telefone] : []
    )
      .flatMap((v: unknown) => {
        const raw =
          typeof v === "string"
            ? v
            : v && typeof v === "object"
              ? String((v as Obj).ddd || "") +
                String((v as Obj).numero || (v as Obj).telefone || "")
              : "";
        return raw
          .split(/[\/;,]/)
          .map((p) => p.replace(/\D/g, ""))
          .filter((p) => /^\d{10,13}$/.test(p));
      })
      .slice(0, 4);
  const emails = (Array.isArray(r.emails) ? r.emails : typeof r.email === "string" ? [r.email] : [])
    .map((v: unknown) =>
      cnpjText(
        typeof v === "string" ? v : v && typeof v === "object" ? (v as Obj).email : "",
        254,
      ).toLowerCase(),
    )
    .filter((v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    .slice(0, 5);
  const contacts = [
    ...phones.map((phone: string) => ({
      kind: "phone",
      label: "Telefone cadastrado",
      value: phone,
      url: "tel:" + phone,
      source: "cnpj",
    })),
    ...emails.map((email: string) => ({
      kind: "email",
      label: "E-mail cadastrado",
      value: email,
      url: "mailto:" + email,
      source: "cnpj",
    })),
  ];
  const activity = receita ? r.atividade_principal?.[0] : r.atividade_principal || r.cnae_principal;
  return {
    id: "cnpj:" + cnpj,
    source: "cnpj",
    cnpj,
    name,
    legalName,
    tradeName,
    address: [
      address.tipo_logradouro,
      address.logradouro,
      address.numero,
      address.complemento,
      address.bairro,
      address.municipio,
      address.uf,
      address.cep,
    ]
      .map((v) => cnpjText(v, 100))
      .filter(Boolean)
      .join(", ")
      .slice(0, 500),
    city: cnpjText(address.municipio, 80),
    region: cnpjText(address.uf, 2),
    phone: phones[0] || "",
    contacts,
    website: "",
    websiteStatus: "unknown",
    websiteReason: "O site não é verificado na pesquisa por CNPJ.",
    checkedAt: now,
    collectedAt: now,
    rating: null,
    reviews: null,
    mapsUrl: "",
    activity: cnpjText(
      typeof activity === "string"
        ? activity
        : activity?.descricao || activity?.text || r.descricao_atividade_principal,
    ),
    activityCode: cnpjText(activity?.codigo || activity?.code || r.codigo_atividade_principal, 20),
    size: cnpjText(receita ? r.porte : r.porte_empresa?.descricao),
    registrationStatus: cnpjText(receita ? r.situacao : r.situacao_cadastral?.situacao_cadastral),
    openedAt: cnpjText(receita ? r.abertura : r.data_abertura, 20),
    capitalSocial:
      typeof r.capital_social === "number" && Number.isFinite(r.capital_social)
        ? String(r.capital_social)
        : cnpjText(r.capital_social, 40),
    enriched: receita,
  };
}
async function provider(url: string, options: RequestInit) {
  const r = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!r.ok) {
    const code =
      (
        {
          400: "request",
          401: "auth",
          402: "billing",
          403: "forbidden",
          404: "not_found",
          429: "rate",
        } as Record<number, string>
      )[r.status] || (r.status >= 500 ? "outage" : "http");
    throw Error("CNPJ_" + code);
  }
  const reader = r.body?.getReader();
  if (!reader) throw Error("CNPJ_invalid");
  let size = 0,
    result = "";
  const decoder = new TextDecoder();
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      throw Error("CNPJ_invalid");
    }
    result += decoder.decode(chunk.value, { stream: true });
  }
  result += decoder.decode();
  let v: Obj;
  try {
    v = JSON.parse(result);
  } catch {
    throw Error("CNPJ_invalid");
  }
  if (!v || typeof v !== "object" || v.error || v.status === "ERROR") throw Error("CNPJ_invalid");
  return v as Obj;
}
const integer = (v: unknown, max = 10000) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max)
    throw Error("Configuração CNPJ inválida");
  return v;
};
export async function handleCnpj(action: string, data: Obj, actor: Obj, db: Db) {
  if (action === "cnpj-config" || action === "admin-cnpj-config")
    return db("rpc/astros_cnpj_config", "POST", {
      actor: actor.id,
      administrator: action.startsWith("admin-"),
    });
  if (action === "admin-cnpj-save") {
    const settings = {
      enabled: data.enabled === true,
      unitCents: integer(data.unitCents),
      enrichEnabled: data.enrichEnabled === true,
      enrichCents: integer(data.enrichCents),
      dailyRequests: integer(data.dailyRequests, 100),
      dailyCalls: integer(data.dailyCalls),
      minuteCalls: integer(data.minuteCalls, 100),
      cacheDays: integer(data.cacheDays, 30),
    };
    if (
      Object.entries(settings).some(
        ([k, v]) =>
          ["dailyRequests", "dailyCalls", "minuteCalls", "cacheDays"].includes(k) && Number(v) < 1,
      ) ||
      typeof data.apiKey !== "string" ||
      data.apiKey.length > 500 ||
      /[\u0000-\u001f\u007f]/.test(data.apiKey)
    )
      throw Error("Configuração CNPJ inválida");
    await db("rpc/astros_cnpj_save", "POST", {
      actor: actor.id,
      settings,
      new_key: data.apiKey.trim(),
    });
    return { saved: true };
  }
  if (action === "cnpj-history" || action === "admin-cnpj-history") {
    const p = new URLSearchParams({
      select: action.startsWith("admin-")
        ? "id,operation,criteria,state,quantity,delivered,charged_cents,created_at,user_id,diagnostic,painel_de_desbanimento(nome,email)"
        : "id,operation,criteria,state,quantity,delivered,charged_cents,created_at,diagnostic",
      order: "created_at.desc,id.desc",
      limit: "21",
      offset: String(integer(data.page ?? 0) * 20),
    });
    if (!action.startsWith("admin-")) p.set("user_id", "eq." + actor.id);
    const rows = await db("astros_cnpj_requests?" + p);
    return {
      requests: rows.slice(0, 20).map((row: Obj) =>
        action.startsWith("admin-")
          ? row
          : (({ diagnostic, ...safe }) => ({
              ...safe,
              failureReason:
                diagnostic === "balance"
                  ? "balance"
                  : row.state === "failed"
                    ? "unavailable"
                    : null,
            }))(row),
      ),
      hasMore: rows.length > 20,
    };
  }
  if (!["cnpj-search", "cnpj-enrich", "cnpj-status"].includes(action))
    throw Error("Operação CNPJ indisponível");
  if (
    typeof data.requestId !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(data.requestId)
  )
    throw Error("Referência CNPJ inválida");
  if (action === "cnpj-status")
    return db("rpc/astros_cnpj_status", "POST", { actor: actor.id, request_id: data.requestId });
  let input: Obj, op: string, wanted: number, original: Obj | undefined;
  if (action === "cnpj-enrich") {
    if (
      typeof data.leadId !== "string" ||
      !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(data.leadId)
    )
      throw Error("Lead CNPJ não encontrado");
    const row = (
      await db(
        "astros_cnpj_deliveries?id=eq." +
          encodeURIComponent(data.leadId) +
          "&user_id=eq." +
          actor.id +
          "&select=cnpj,snapshot&limit=1",
      )
    )[0];
    if (!row) throw Error("Lead CNPJ não encontrado");
    input = { leadId: data.leadId, cnpj: row.cnpj };
    original = row.snapshot;
    op = "enrich";
    wanted = 1;
  } else {
    input = cnpjCriteria(data);
    op = input.mode;
    wanted = op === "lookup" ? 1 : integer(data.quantity, 20);
    if (!wanted) throw Error("Informe de 1 a 20 empresas.");
  }
  const job = await db("rpc/astros_cnpj_begin", "POST", {
    actor: actor.id,
    request_id: data.requestId,
    op,
    input,
    wanted,
    expected_unit: integer(data.expectedUnitCents),
  });
  if (!job.run) return job.request;
  let rows: Obj[] = [],
    hasNext = false;
  if (job.fetch) {
    try {
      if (op === "enrich") {
        const v = await provider("https://www.receitaws.com.br/v1/cnpj/" + input.cnpj, {
          headers: { Accept: "application/json" },
        });
        const enriched = companySnapshot(v, true);
        if (!enriched || enriched.cnpj !== input.cnpj) throw Error("CNPJ_invalid");
        rows = [
          {
            ...original,
            ...enriched,
            phone: enriched.phone || original?.phone || "",
            contacts: [...(enriched.contacts || []), ...(original?.contacts || [])]
              .filter((c, i, a) => a.findIndex((v) => v.url === c.url) === i)
              .slice(0, 20),
          },
        ];
      } else {
        const key = (await db("astros_cnpj_private?id=eq.true&select=api_key"))[0]?.api_key;
        if (!key) throw Error("CNPJ_invalid");
        const v = await provider(
          "https://api.casadosdados.com.br/" +
            (op === "lookup" ? "v4/cnpj/" + input.cnpj : "v5/cnpj/pesquisa"),
          {
            method: op === "lookup" ? "GET" : "POST",
            headers: {
              "api-key": key,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            ...(op === "search" ? { body: JSON.stringify(casaBody(input, job.page)) } : {}),
          },
        );
        const found = op === "lookup" ? [v] : v.cnpjs;
        if (!Array.isArray(found)) throw Error("CNPJ_invalid");
        if (found.length > 20) throw Error("CNPJ_invalid");
        rows = found.map((r) => companySnapshot(r)).filter(Boolean) as Obj[];
        if (rows.length !== found.length) throw Error("CNPJ_invalid");
        rows = rows.filter((r, i, a) => a.findIndex((v) => v.cnpj === r.cnpj) === i);
        if (op === "lookup" && (!rows[0] || rows[0].cnpj !== input.cnpj))
          throw Error("CNPJ_invalid");
        hasNext =
          op === "search" &&
          (typeof v.total === "number" ? job.page * 20 < v.total : found.length === 20);
      }
    } catch (error) {
      const code = error instanceof Error ? error.message.replace(/^CNPJ_/, "") : "";
      const diagnostic = [
        "auth",
        "billing",
        "forbidden",
        "request",
        "not_found",
        "rate",
        "outage",
        "http",
        "invalid",
      ].includes(code)
        ? code
        : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "timeout"
          : "connection";
      return db("rpc/astros_cnpj_finish", "POST", {
        actor: actor.id,
        request_id: data.requestId,
        failure: diagnostic,
      });
    }
  }
  return db("rpc/astros_cnpj_finish", "POST", {
    actor: actor.id,
    request_id: data.requestId,
    rows_input: rows,
    has_next: hasNext,
  });
}

declare const Deno:{env:{get:(name:string)=>string|undefined};serve:(handler:(req:Request)=>Promise<Response>)=>void};
type Obj=Record<string,any>;
function env(n:string){const v=Deno.env.get(n);if(!v)throw Error('Prospecção ainda não configurada.');return v;}
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
const safeMessages=['Configuração CNPJ inválida', 'Configure a chave CNPJ antes de ativar', 'Referência CNPJ divergente', 'Busca CNPJ temporariamente indisponível', 'Consulte o preço CNPJ novamente', 'Filtros CNPJ inválidos', 'Consulta complementar indisponível', 'Lead CNPJ não encontrado', 'Confira a consulta CNPJ em andamento', 'Limite diário de consultas CNPJ atingido', 'Esta pesquisa CNPJ já está em andamento', 'Limite de consultas CNPJ ao fornecedor atingido', 'Consulta CNPJ não encontrada', 'Resposta CNPJ inválida'].concat(['Conta indisponível','Configuração inválida','Configure a chave antes de ativar','Referência inválida','Referência divergente','Prospecção temporariamente indisponível','Consulte o preço novamente','Busca inválida','Saldo insuficiente. Faça uma recarga','Confira a busca anterior antes de iniciar outra','Limite diário de buscas atingido','Busca não encontrada','Ative o processamento automático de Prospecção']);
async function db(path:string,method='GET',body?:unknown):Promise<any>{const r=await fetch(env('SUPABASE_URL')+'/rest/v1/'+path,{method,headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(12000)});const v=await r['json']().catch(()=>null);if(!r['ok'])throw Error(safeMessages.includes(v?.message)?v['message']:'Não foi possível confirmar os dados de prospecção. Confira a ativação do módulo.');return v;}
// Optional read bridge allows the Maps-only installation to keep working before CNPJ SQL activation.
async function optionalRpc(name:string,body:unknown){const r=await fetch(env('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});const v=await r.json().catch(()=>null);if(!r.ok&&['PGRST202','42883'].includes(v?.code))return null;if(!r.ok||!v)throw Error('Não foi possível confirmar os dados de prospecção.');return v;}
export function clean(v:unknown,max=200){return typeof v==='string'?v['replace'](/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';}
export function canonical(v:unknown){return clean(v,80).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');}
export function uuid(v:unknown){if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw Error('Referência inválida');return v;}
export function count(v:unknown,max:number){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)throw Error('Quantidade inválida.');return v;}
export function criteria(v:Obj){const r={niche:canonical(v['niche']),city:canonical(v['city']),region:canonical(v['region']),country:clean(v['country'],2).toUpperCase(),filter:clean(v['filter'],10)||'all'};if(r['niche'].length<2||r['city'].length<2||!/^[A-Z]{2}$/.test(r['country'])||!['all','missing','social','online','offline','unknown'].includes(r['filter']))throw Error('Informe nicho, país e cidade válidos.');const label=new Intl.DisplayNames(['pt-BR'],{type:'region'}).of(r['country']);if(!label||label===r['country'])throw Error('País inválido.');return r;}
async function user(req:Request){const token=req.headers.get('Authorization');if(!token?.startsWith('Bearer '))throw Error('Entre novamente para continuar.');const r=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:token},signal:AbortSignal.timeout(10000),redirect:'error'});const u=r['ok']?await r['json']():null;if(!u?.id||!u.email_confirmed_at||u.banned_until&&Date.parse(u.banned_until)>Date.now()||u.app_metadata?.astros_password_change_required)throw Error('Entre com uma conta confirmada e conclua a atualização de senha, se solicitada.');const p=(await db(`painel_de_desbanimento?id=eq.${encodeURIComponent(u.id)}&select=id,tipo_usuario&limit=1`))[0];if(!p)throw Error('Conta indisponível');return p as Obj;}
async function privateKey(){const p=(await db('astros_prospect_private?id=eq.true&select=api_key'))[0];if(!p?.api_key)throw Error('Configure a chave antes de ativar');return String(p.api_key);}
async function supplier(path:string,params:Record<string,string>={},key?:string){const u=new URL('https://serpapi.com/'+path);u.search=new URLSearchParams({...params,api_key:key??await privateKey()}).toString();let r:Response;try{r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(18000)});}catch{throw Error('Não foi possível consultar o serviço de pesquisa.');}const reader=r['body']?.getReader();if(!reader)throw Error('Resposta de pesquisa não confirmada.');let size=0;const parts:Uint8Array[]=[];while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024){await reader.cancel();throw Error('Resposta de pesquisa não confirmada.');}parts.push(part.value);}const data=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!r['ok']||!data||typeof data!=='object'||data.error)throw Error('O serviço de pesquisa está indisponível ou sem consultas disponíveis.');return data as Obj;}
export function results(v:Obj){if(v['search_metadata']?.status!=='Success'||!Array.isArray(v['local_results'])&&!v['search_information']?.local_results_state)throw Error('Pesquisa não confirmada.');const rows=Array.isArray(v['local_results'])?v['local_results']:[];const seen=new Set<string>();return rows.slice(0,20).flatMap((r:Obj)=>{const place=clean(r['place_id'],200),cid=clean(r['data_cid'],100);const id=place?'pid:'+place:cid&&/^\d+$/.test(cid)?'cid:'+cid:'';const name=clean(r['title']);if(!id||!name||seen.has(id)||/permanently closed|fechado permanentemente/i.test(String(r['open_state'])))return [];seen.add(id);const rating=typeof r['rating']==='number'&&r['rating']>=0&&r['rating']<=5?r['rating']:null;return [{id,name,address:clean(r['address'],400),phone:clean(r['phone'],60),website:publicWebsite(r['website'])?.href||'',websiteSupplied:!!r['website'],contacts:[contactLink(r['website'],'maps')].filter(Boolean),rating,reviews:typeof r['reviews']==='number'?count(r['reviews'],100000000):null,mapsUrl:'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query:name,...(place?{query_place_id:place}:{})}),collectedAt:new Date().toISOString()}];});}
async function checkedRows(rows:ReturnType<typeof results>){const out:Obj[]=[];let cursor=0;const deadline=Date.now()+45000;await Promise.all(Array.from({length:3},async()=>{while(cursor<rows.length){const row=rows[cursor++]!;const old=(await db('astros_prospect_businesses?id=eq.'+encodeURIComponent(row.id)+'&select=data&limit=1'))[0]?.data;if(old&&old.website===row.website&&old.checkedAt&&Date.parse(old.checkedAt)>Date.now()-86400000&&old.readingVersion===2){out.push({...row,websiteStatus:old.websiteStatus,websiteReason:old.websiteReason,checkedAt:old.checkedAt,siteTitle:old.siteTitle,siteSummary:old.siteSummary,siteEmails:old.siteEmails,siteReadAt:old.siteReadAt,contacts:old.contacts||row.contacts,readingVersion:2});continue;}const site=(!row.website||Date.now()<deadline)?await checkWebsite(row.websiteSupplied?(row.website||'invalid'):null):{website:row.website,websiteStatus:'unknown',websiteReason:'Não foi possível concluir a verificação agora.',checkedAt:new Date().toISOString()};const reading=['online','unknown'].includes(site.websiteStatus)?await readWebsite(row.website,Deno.env.get('JINA_API_KEY')||'',deadline):null;const enriched=enrichWebsite(site,reading);out.push({...row,...enriched,contacts:[...row.contacts,...((enriched as {contacts?:any[]}).contacts||[])].filter((c,i,a)=>a.findIndex(v=>v.url===c.url)===i).slice(0,20),readingVersion:2});}}));return out;}
export function accountDetails(v:Obj){return {plan:clean(v['plan_name'],80),remaining:count(v['total_searches_left'],100000000),used:count(v['this_month_usage'],100000000),monthly:count(v['searches_per_month'],100000000),hourLimit:count(v['account_rate_limit_per_hour'],100000000),hourUsed:count(v['this_hour_searches'],100000000),renewal:/^\d{4}-\d{2}-\d{2}$/.test(String(v['plan_renewal_date']))?v['plan_renewal_date']:''};}
async function syncCapacity(force=false){const token=await db('rpc/astros_prospect_sync_claim','POST',{force_refresh:force});if(token){try{const details=accountDetails(await supplier('account.json'));await db('rpc/astros_prospect_sync_finish','POST',{token,details});}catch{await db('rpc/astros_prospect_sync_finish','POST',{token,details:null}).catch(()=>{});if(force)throw Error('Não foi possível atualizar a cota. Os limites anteriores permanecem protegidos.');}}return (await db('astros_prospect_capacity?id=eq.true&select=plan,remaining,used,monthly,hour_limit,hour_used,renewal,synced_at,worker_seen_at'))[0];}
async function dispatchJob(job:Obj){const id=uuid(job['id']),actor=uuid(job['actor']);if(!job['fetch'])return db('rpc/astros_prospect_finish','POST',{actor,request_id:id});const c=job['criteria'];let rows:Obj[],next:boolean;try{const country=new Intl.DisplayNames(['pt-BR'],{type:'region'}).of(c.country);const found=await supplier('search.json',{engine:'google_maps',type:'search',q:`${c.niche} em ${c.city}${c.region?', '+c.region:''}, ${country}`,hl:'pt-br',gl:c.country.toLowerCase(),start:String(job['cursor'])});rows=await checkedRows(results(found));next=!!found['serpapi_pagination']?.next&&job['cursor']<100;}catch{return db('rpc/astros_prospect_finish','POST',{actor,request_id:id,failure:'provider'});}return db('rpc/astros_prospect_finish','POST',{actor,request_id:id,rows_input:rows,page_complete:true,has_next:next});}
async function worker(req:Request){const key=(await db('astros_prospect_private?id=eq.true&select=worker_secret'))[0]?.worker_secret;const supplied=req.headers.get('X-Astros-Prospect-Worker')||'';if(!key||!supplied)return json({error:'Acesso recusado.'},403);const digest=async(v:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));const [a,b]=await Promise.all([digest(key),digest(supplied)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]!^b[i]!;if(diff)return json({error:'Acesso recusado.'},403);await db('rpc/astros_prospect_heartbeat','POST',{});await syncCapacity().catch(()=>{});const pending=await db('astros_prospect_requests?state=eq.queued&next_attempt_at=lte.'+encodeURIComponent(new Date().toISOString())+'&order=created_at.asc,id.asc&select=id&limit=20');const jobs:Obj[]=[];for(const row of pending){if(jobs.length===3)break;const job=await db('rpc/astros_prospect_claim','POST',{request_id:row.id});if(job)jobs.push(job);}const settled=await Promise.allSettled(jobs.map(dispatchJob));return json({processed:settled.filter(r=>r.status==='fulfilled').length});}
const statuses=['new','contacted','negotiating','won','discarded'];
export async function handler(req:Request){try{
 if(req.method!=='POST')return json({error:'Método indisponível.'},405);if(Number(req.headers.get('content-length')||0)>32768)return json({error:'Pedido muito grande.'},413);const raw=await req.text();if(raw.length>32768)return json({error:'Pedido muito grande.'},413);const body=JSON.parse(raw),action=String(body.action),data=body.data??{};if(action==='worker')return await worker(req);const actor=await user(req);const admin=action.startsWith('admin-');if(admin&&actor['tipo_usuario']!=='admin')throw Error('Acesso administrativo necessário.');
 if(action==='cnpj-config')return json(await optionalRpc('astros_cnpj_config',{actor:actor['id']})||{installed:false,enabled:false,unitCents:0,enrichEnabled:false,enrichCents:0});
 if(action.startsWith('cnpj-')||action.startsWith('admin-cnpj-'))return json(await handleCnpj(action,data,actor,db));
 if(action==='lead-summary')return json(await optionalRpc('astros_prospect_crm_summary',{actor:actor['id']})||await db('rpc/astros_prospect_lead_summary','POST',{actor:actor['id']}));
 if(action==='daily-quota')return json(await db('rpc/astros_prospect_daily_quota','POST',{actor:actor['id']}));
 if(action==='cities')return json({cities:await brazilCities(clean(data.state,2).toUpperCase())});
 if(action==='config'||action==='admin-config'){const s=(await db('astros_prospect_settings?id=eq.true'))[0];if(!s)throw Error('Ative o SQL de prospecção.');return json({enabled:s.enabled,unitCents:s.unit_cents,maxQuantity:20,...(admin?{cacheDays:s.cache_days,dailyRequests:s.daily_requests,dailyCalls:s.daily_calls,hasKey:!!(await db('astros_prospect_private?id=eq.true&select=api_key'))[0]?.api_key}:{})});}
 if(action==='admin-save'){await db('rpc/astros_prospect_save','POST',{actor:actor['id'],active:data.enabled===true,unit_price:count(data.unitCents,10000),retention_days:count(data.cacheDays,30),request_limit:count(data.dailyRequests,100),call_limit:count(data.dailyCalls,5000),new_key:clean(data.apiKey,201)});return json({saved:true});}
 if(action==='admin-deliveries'){const email=clean(data.email,255).toLowerCase(),company=clean(data.company,81),queryId=clean(data.queryId,65),businessId=clean(data.businessId,251);if(email.length>254||company.length>80||queryId.length>64||businessId.length>250||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(queryId&&!/^[a-f0-9]{32}$/.test(queryId)))throw Error('Filtro inválido.');return json(await db('rpc/astros_prospect_admin_deliveries','POST',{actor:actor['id'],account_email:email,company_search:company,query_key:queryId,business_key:businessId,request_key:data.requestId?uuid(data.requestId):null,page_number:count(data.page??0,10000)}));}
 if(action==='admin-base'){const email=clean(data.email,255).toLowerCase(),search=clean(data.search,81),queryId=clean(data.queryId,65);if(email.length>254||search.length>80||queryId.length>64||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(queryId&&!/^[a-f0-9]{32}$/.test(queryId)))throw Error('Filtro inválido.');return json(await db('rpc/astros_prospect_admin_base','POST',{actor:actor['id'],search_text:search,account_email:email,query_key:queryId,query_page:count(data.page??0,10000),business_page:count(data.businessPage??0,10000)}));}
 if(action==='admin-account'){const v=await syncCapacity(data.force===true);if(!v)throw Error('Ative o controle de capacidade.');return json({plan:v.plan,remaining:v.remaining,used:v.used,monthly:v.monthly,hourLimit:v.hour_limit,hourUsed:v.hour_used,renewal:v.renewal,syncedAt:v.synced_at,workerSeenAt:v.worker_seen_at});}
 if(action==='search'){await syncCapacity().catch(()=>{});const c=criteria(data),id=uuid(data.requestId),quantity=count(data.quantity,20);if(!quantity)throw Error('Informe a quantidade.');const begin=await db('rpc/astros_prospect_begin','POST',{actor:actor['id'],request_id:id,criteria_input:c,wanted:quantity,expected_unit:count(data.expectedUnitCents,10000)});if(begin.request?.state!=='queued')return json(begin.request);const job=await db('rpc/astros_prospect_claim','POST',{request_id:id});if(job)await dispatchJob(job);return json(await db('rpc/astros_prospect_status','POST',{actor:actor['id'],request_id:id}));}
 if(action==='request-status')return json(await db('rpc/astros_prospect_status','POST',{actor:actor['id'],request_id:uuid(data.requestId)}));
 if(action==='history'){const combined=await optionalRpc('astros_prospect_crm_history',{actor:actor['id'],page_number:count(data.page??0,10000),search_text:clean(data.search,80),stage:data.status||'all',source_filter:data.source||'all'});if(combined)return json(combined);if(data.source==='cnpj')return json({leads:[],hasMore:false});const page=count(data.page??0,10000),search=clean(data.search,80);if(!/^[\p{L}\p{N} @._+\-]*$/u.test(search))throw Error('Use letras ou números na pesquisa.');const p=new URLSearchParams({user_id:'eq.'+actor['id'],select:'id,snapshot,status,created_at,request_id',order:'created_at.desc,id.desc',limit:'21',offset:String(page*20)});if(search)p.set('snapshot->>name','ilike.*'+search+'*');if(data.status&&data.status!=='all'){if(!statuses.includes(data.status))throw Error('Filtro inválido.');p.set('status','eq.'+data.status);}const rows=await db('astros_prospect_deliveries?'+p);return json({leads:rows.slice(0,20),hasMore:rows.length>20});}
 if(action==='lead-status'){if(data.source==='cnpj'){await db('rpc/astros_cnpj_stage','POST',{actor:actor['id'],lead_id:uuid(data.id),stage:data.status});return json({saved:true});}if(!statuses.includes(data.status))throw Error('Situação inválida.');const rows=await db(`astros_prospect_deliveries?id=eq.${uuid(data.id)}&user_id=eq.${actor['id']}`,'PATCH',{status:data.status});if(rows.length!==1)throw Error('Lead não encontrado na sua conta.');return json({saved:true});}
 if(action==='requests'||action==='admin-requests'){const p=new URLSearchParams({select:admin?'id,quantity,unit_cents,state,delivered,charged_cents,created_at,completed_at,criteria,queue_reason,next_attempt_at,diagnostic,painel_de_desbanimento(nome,email)':'id,quantity,unit_cents,state,delivered,charged_cents,created_at,completed_at,criteria,queue_reason,next_attempt_at,diagnostic',order:'created_at.desc,id.desc',limit:'21',offset:String(count(data.page??0,10000)*20)});if(!admin)p.set('user_id','eq.'+actor['id']);const rows=await db('astros_prospect_requests?'+p);return json({requests:rows.slice(0,20).map((row:Obj)=>admin?row:{...row,diagnostic:undefined,failureReason:row['state']==='failed'?({'quota':'capacity','balance':'balance','expired':'expired','paused':'paused'} as Record<string,string>)[row['diagnostic']]||'unavailable':null}),hasMore:rows.length>20});}
 return json({error:'Operação indisponível.'},400);
 }catch(e){return json({error:e instanceof SyntaxError?'Resposta não confirmada. Tente consultar a mesma tentativa.':e instanceof Error?e.message:'Não foi possível concluir a operação.'},400);}}
if(typeof Deno!=='undefined'&&typeof Deno.serve==='function')Deno.serve(handler);
