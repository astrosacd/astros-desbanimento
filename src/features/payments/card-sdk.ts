let loading:Promise<void>|undefined;
export async function loadCardSdk(){
 if((window as any).MercadoPago)return;
 loading??=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://sdk.mercadopago.com/js/v2';script.async=true;
  const timeout=setTimeout(()=>{script.remove();loading=undefined;reject(Error('Não foi possível carregar o formulário de cartão. Tente novamente.'));},20000);
  script.onload=()=>{clearTimeout(timeout);if((window as any).MercadoPago)resolve();else{loading=undefined;reject(Error('Formulário de cartão indisponível.'));}};
  script.onerror=()=>{clearTimeout(timeout);script.remove();loading=undefined;reject(Error('Não foi possível carregar o formulário de cartão. Tente novamente.'));};document.head.append(script);
 });
 await loading;
}
