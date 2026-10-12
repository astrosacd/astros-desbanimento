import type {Row} from './core.ts';
type Page={count:number;results:Row[]};
// Bounded parallel reads preserve the complete global ownership/duplicate scan.
export async function scanRows(load:(page:number)=>Promise<Page>,size=200,concurrency=3,maxRows=20000){
 const first=await load(1);const total=first.count;
 if(!Number.isSafeInteger(total)||total<0||total>maxRows||!Array.isArray(first.results))throw Error('A base precisa de conferência antes do envio.');
 const pages:Row[][]=[first.results];const count=Math.max(1,Math.ceil(total/size));let next=2;
 const check=(data:Page,page:number)=>{if(data.count!==total||!Array.isArray(data.results)||data.results.length!==Math.min(size,Math.max(0,total-(page-1)*size)))throw Error('A base mudou durante a consulta. Tente novamente.');};
 check(first,1);
 await Promise.all(Array.from({length:Math.min(concurrency,Math.max(0,count-1))},async()=>{while(next<=count){const page=next++;const data=await load(page);check(data,page);pages[page-1]=data.results;}}));
 const rows=pages.flat();
 if(rows.length!==total||rows.some(r=>!Number.isSafeInteger(r?.id)||r.id<=0)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('A base mudou durante a consulta. Tente novamente.');
 return rows;
}
