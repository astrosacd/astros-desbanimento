// Compare the same activation offer in API units and reais; never assume an API currency.
function decimalUnits(value:string){const text=value.trim().replace(',','.');if(!/^\d{1,7}(?:\.\d{1,6})?$/.test(text))throw Error('Informe um valor positivo, com até seis casas decimais.');const [whole,frac='']=text.split('.');const n=BigInt(whole!)*1000000n+BigInt(frac.padEnd(6,'0'));if(n<=0n)throw Error('Informe um valor maior que zero.');return n;}
export function fiveConversionFromOffer(apiPrice:string,costBrl:string){
 const api=decimalUnits(apiPrice),brl=decimalUnits(costBrl),rate=Number((brl*10000n+api-1n)/api);
 if(!Number.isSafeInteger(rate)||rate<1||rate>10000000)throw Error('Conversão fora do limite. Confira se os dois preços correspondem à mesma oferta.');return rate;
}
