// Informational preview only. The server revalidates catalog, balance and price before purchase.
export function pricingPreview(rate:number,quantity:number,fx:number,margin:number,fee:number){
 if(![rate,quantity,fx,margin,fee].every(Number.isSafeInteger)||rate<1||quantity<1||fx<1||margin<0||margin>100000||fee<0)return null;
 const costUnits=(BigInt(rate)*BigInt(quantity)+999n)/1000n;
 const n=costUnits*BigInt(fx)*BigInt(10000+margin);
 const sale=Number((n+999999999999n)/1000000000000n)+fee;
 if(!Number.isSafeInteger(sale)||sale<1||sale>1000000)return null;
 const costCents=Number(costUnits)*fx/100000000;
 return {costCents,priceCents:sale,differenceCents:sale-costCents};
}
export function hasNoRefill(name:string,description:string){return /\bNR\b|\bno[\s-]+refill\b|sem reposi[cç][aã]o/i.test(name+' '+description);}
