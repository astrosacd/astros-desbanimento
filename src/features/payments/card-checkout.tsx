import {LockKeyhole} from 'lucide-react';
import {useEffect,useRef,useState,useId} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useRouteContext} from '@tanstack/react-router';
import {Button} from '@/components/ui/button';
import {getCardConfiguration,payCardRecharge} from './actions';
import {loadCardSdk} from './card-sdk';
import {cardPaymentSchema} from './card-validation';
import {friendlyRechargeError} from './cpf';
export function CardCheckout({order,onStatus}:{order:{id:string;amount_cents:number};onStatus:(id:string,status:string)=>void}){
 const {client}=useRouteContext({from:'__root__'});const id='card-'+useId().replace(/[^a-zA-Z0-9]/g,'');
 const config=useQuery({queryKey:['card-config',client?.id],queryFn:()=>getCardConfiguration(),retry:false});
 const callback=useRef(onStatus);callback.current=onStatus;const frozen=useRef<any>(null);const inFlight=useRef(false);
 const [challenge,setChallenge]=useState<any>(null);const [error,setError]=useState('');const [ready,setReady]=useState(false);const [attempt,setAttempt]=useState(0);const [submitting,setSubmitting]=useState(false);
 useEffect(()=>{frozen.current=null;setChallenge(null);},[order.id,client?.id]);
 useEffect(()=>{
  if(!config.data?.publicKey||!config.data.enabled||!client)return;
  let active=true;let controller:any;setReady(false);setError('');
  void(async()=>{try{
   await loadCardSdk();if(!active)return;
   const mp=new (window as any).MercadoPago(config.data.publicKey,{locale:'pt-BR'});
   const onSubmit=async(form:any)=>{
    if(!active||inFlight.current)throw Error('Aguarde a confirmação desta tentativa.');
    inFlight.current=true;setSubmitting(true);setError('');
    try{
     frozen.current??=cardPaymentSchema.parse({orderId:order.id,token:form.token,paymentMethodId:form.payment_method_id,...(form.issuer_id?{issuerId:String(form.issuer_id)}:{}),installments:Number(form.installments),identification:{type:form.payer?.identification?.type,number:String(form.payer?.identification?.number||'').replace(/\D/g,'')}});
     const result=await payCardRecharge({data:frozen.current});
     if(active){if(result.challenge)setChallenge({paymentId:result.paymentId,...result.challenge});callback.current(order.id,result.status);}
    }catch(e){if(active){setError(friendlyRechargeError(e));callback.current(order.id,'pending');}throw Error('Não foi possível confirmar o pagamento. Confira a situação antes de tentar novamente.');}
    finally{inFlight.current=false;if(active)setSubmitting(false);}
   };
   controller=await mp.bricks().create(challenge?'statusScreen':'cardPayment',id,{
    initialization:challenge?{paymentId:challenge.paymentId,additionalInfo:{externalResourceURL:challenge.externalResourceURL,creq:challenge.creq}}:{amount:order.amount_cents/100,payer:{email:client.email}},
    customization:{visual:{style:{theme:'dark'}}},
    callbacks:{onReady:()=>{if(active)setReady(true);},onError:()=>{if(active)setError('Não foi possível concluir o formulário. Confira os dados ou tente carregar novamente.');},...(!challenge?{onSubmit}:{})}
   });
   if(!active)controller.unmount();
  }catch(e){if(active)setError(friendlyRechargeError(e));}})();
  return()=>{active=false;controller?.unmount();};
 },[config.data?.publicKey,config.data?.enabled,client?.id,order.id,order.amount_cents,id,attempt,challenge]);
 return <div className="card-checkout">{challenge&&<h3 className="font-semibold mb-2">Confirme com seu banco</h3>}<p className="card-checkout-intro">{challenge?'Siga a confirmação solicitada pelo banco para concluir o pagamento.':'Preencha os dados e confira as parcelas disponíveis antes de confirmar.'}</p>{config.isPending?<p role="status">Carregando configuração…</p>:config.isError?<p role="alert">Não foi possível carregar o pagamento com cartão.</p>:!config.data?.publicKey||!config.data?.enabled?<p role="alert">O pagamento com cartão ainda não está disponível. Você pode usar Pix.</p>:<><div id={id} className="card-checkout-host"/>{!ready&&!error&&<p role="status">Carregando formulário seguro…</p>}</>}{submitting&&<p role="status" className="mt-4 text-sm">Enviando pagamento. Aguarde a confirmação.</p>}{error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}{!submitting&&(config.isError||(!ready&&error))&&<Button variant="outline" className="mt-4" onClick={()=>{void config.refetch();setAttempt(v=>v+1);}}>Tentar carregar novamente</Button>}<p className="card-checkout-security"><LockKeyhole size={14}/>Seus dados de cartão são enviados pelo formulário seguro do processador de pagamento.</p></div>;
}
