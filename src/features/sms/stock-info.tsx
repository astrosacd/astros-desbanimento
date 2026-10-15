export function SmsStockInfo({stock,checkedAt,expired=false}:{stock?:number|undefined;checkedAt?:string|undefined;expired?:boolean}){
 const valid=typeof stock==='number'&&Number.isSafeInteger(stock)&&stock>=0;
 const date=checkedAt?Date.parse(checkedAt):NaN;
 return <div className="sms-stock-info" data-expired={expired}><span className="sms-label">Disponibilidade consultada</span><strong>{valid?`${stock.toLocaleString('pt-BR')} ${stock===1?'número informado':'números informados'}`:'Estoque não confirmado'}</strong><p>{Number.isFinite(date)?`Consulta em ${new Date(date).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})} · Fortaleza.`:'Consulte novamente para atualizar a disponibilidade.'}{expired?' Consulta vencida. Atualize o preço e o estoque antes de comprar.':''}</p><p>Quantidade informada para o serviço e país escolhidos. Não reserva um número. A disponibilidade e a liberação do serviço serão confirmadas na compra.</p></div>;
}
