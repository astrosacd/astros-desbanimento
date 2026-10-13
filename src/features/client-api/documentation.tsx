import {CountryGuide} from './country-guide';
import {Code2} from 'lucide-react';
import {CopyButton} from './copy-button';
const endpoint='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-submit-number';
const headers=`-H "X-Astros-Api-Key: $ASTROS_API_KEY"`;
const examples=[
 {name:'Consultar saldo',method:'GET',operation:'saldo',description:'Retorna balanceCents, o saldo disponível em centavos, e currency: BRL.',payload:null},
 {name:'Validar formato',method:'POST',operation:'validar',description:'Valida number e country sem cobrança. Não verifica se o número existe, tem WhatsApp ou está banido.',payload:'{\\"number\\":\\"85999999999\\",\\"country\\":\\"BR\\"}'},
 {name:'Consultar número e taxa',method:'POST',operation:'consultar',description:'Confere propriedade, situação, taxa e saldo. Não inicia uma solicitação nem desconta saldo. Guarde costCents da resposta para o envio.',payload:'{\\"number\\":\\"85999999999\\",\\"country\\":\\"BR\\",\\"requestId\\":\\"$REQUEST_ID\\"}'},
 {name:'Enviar solicitação',method:'POST',operation:'enviar',description:'Use o mesmo número, país e REQUEST_ID da consulta. EXPECTED_CENTS deve ser o costCents retornado, inclusive quando for 0. Esta chamada pode descontar saldo.',payload:'{\\"number\\":\\"85999999999\\",\\"country\\":\\"BR\\",\\"requestId\\":\\"$REQUEST_ID\\",\\"expectedCents\\":$EXPECTED_CENTS}'},
 {name:'Consultar histórico',method:'GET',operation:'solicitacoes&page=1',description:'Retorna apenas os envios da sua conta: rows, page, pageSize: 20 e hasMore. Aumente page enquanto hasMore for true. Localize o envio pelo id, igual ao requestId.',payload:null}
];
export const fullExample=`// JavaScript no servidor (Node.js). Nunca coloque a chave no navegador.
const endpoint = '${endpoint}';
const apiKey = process.env.ASTROS_API_KEY;
// Gere um UUID NOVO para uma nova solicitação e salve-o com o número
// na sua integração ANTES do envio. Reutilize o UUID salvo nas tentativas.
const requestId = process.env.ASTROS_REQUEST_ID;
if (!apiKey || !requestId) throw new Error('Configure a chave e o UUID salvo desta solicitação.');
const input = { number: '85999999999', country: 'BR', requestId };
async function call(operation, body) {
  const response = await fetch(endpoint + '?api=' + operation, {
    method: 'POST',
    headers: { 'X-Astros-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível confirmar.');
  return result;
}
const quote = await call('consultar', input);
// Se o UUID já existe, a consulta pode retornar o estado do envio anterior.
// Nesse caso, acompanhe esse envio; não crie um novo UUID para repetir.
if (quote.state === 'quoted') {
  const result = await call('enviar', { ...input, expectedCents: quote.costCents });
  console.log({ state: result.state, number: result.number, costCents: result.costCents });
} else {
  console.log({ state: quote.state, number: quote.number });
}
// Em falha de conexão, preserve requestId. Consulte o histórico e repita
// a mesma solicitação com os mesmos dados. Não tente com outro UUID.`;
const errors=[
 ['Referência divergente','O UUID já pertence a outro número ou outra conta. Para uma solicitação realmente nova, gere outro UUID. Se está repetindo um envio, confira o UUID e os dados originais.'],
 ['O valor ou a situação do número mudou','Consulte novamente com o mesmo UUID e número. Use o novo costCents como expectedCents; não fixe a taxa na integração.'],
 ['Saldo insuficiente','Adicione saldo pela carteira. Uma consulta não faz recarga. Reenvios gratuitos podem retornar costCents: 0.'],
 ['401 — chave inválida ou acesso bloqueado','Confira o cabeçalho X-Astros-Api-Key, a chave ativa e a liberação pelo admin. Uma chave revogada ou substituída não funciona.'],
 ['429 — limite de chamadas','Aguarde o próximo minuto e reduza a frequência. O limite de 60 chamadas inclui consultas, validações e envios.'],
 ['400 — dados inválidos','Confira JSON, número, país, UUID e expectedCents inteiro em centavos. Envie Content-Type: application/json. Não envie e-mail, userId ou action no corpo.'],
 ['Timeout, erro de conexão ou 503','O resultado pode estar indefinido. Guarde o UUID, consulte o histórico e tente novamente com os mesmos dados. Não gere uma nova referência apenas para contornar o erro.']
];
export function ApiDocumentation(){return <section className="form-section mt-6 api-documentation"><div className="flex items-center gap-3"><Code2 className="text-primary"/><h2 className="text-lg font-semibold">Guia de integração</h2></div><p className="text-sm text-muted-foreground mt-3 leading-7">Comece pelo fluxo abaixo. A API usa o saldo, a taxa vigente e as mesmas regras de envio do painel.</p>
 <div className="api-doc-flow"><h3 className="font-semibold">Fluxo correto: consulta → envio → acompanhamento</h3><ol className="list-decimal pl-5 mt-3 space-y-3 text-sm leading-7"><li><strong>Gere e salve um UUID para a nova solicitação.</strong> requestId é o identificador desse envio, não é a chave da API e não é um número fixo.</li><li>Chame <strong>consultar</strong> com number, country e o UUID salvo.</li><li>Copie <strong>costCents da resposta</strong> para expectedCents e chame <strong>enviar</strong> com o mesmo UUID, número e país.</li><li>Confira success e state. Se houver instabilidade, mantenha o UUID e consulte o histórico antes de repetir.</li></ol></div>
 <div className="notice warning mt-5"><strong>Nunca reutilize um UUID de exemplo para solicitações diferentes.</strong><p className="mt-2 text-sm leading-7">Para repetir o mesmo envio, mantenha o UUID original. Para outro número ou uma nova contratação, gere um novo UUID. Nas automações, gere uma vez antes dos HTTP Requests e reutilize o campo salvo na consulta e no envio.</p></div>
 <h3 className="font-semibold mt-7">Antes de copiar os exemplos cURL</h3><p className="text-sm text-muted-foreground leading-7 mt-2">Os comandos são para terminal Bash e usam variáveis. Defina ASTROS_API_KEY com sua chave e REQUEST_ID com o UUID salvo desta solicitação. Depois da consulta, defina EXPECTED_CENTS com o costCents recebido. Nenhum exemplo contém um UUID fixo ou uma taxa fixa para enviar.</p><div className="api-example"><pre>{`export ASTROS_API_KEY='SUA_CHAVE'
export REQUEST_ID='UUID_SALVO_DA_SUA_SOLICITACAO'
# Após consultar: EXPECTED_CENTS recebe o costCents da resposta.
# Não copie os marcadores literalmente para as requisições.`}</pre></div>
 <div className="api-doc-flow"><h3 className="font-semibold">Usando um HTTP Request na automação</h3><p className="text-sm leading-7 mt-3">Gere o UUID em um passo anterior e salve no campo requestId. No primeiro HTTP Request, envie number, country e esse campo. No segundo, mantenha os três campos e preencha expectedCents com o costCents retornado pelo primeiro.</p><p className="text-sm leading-7 mt-3">As variáveis $REQUEST_ID e $EXPECTED_CENTS dos exemplos cURL são para Bash. Ao importar em um cliente HTTP ou automação, substitua-as pelos campos dinâmicos do seu fluxo. Não copie esses nomes como valores literais no JSON.</p></div>
 <h3 className="font-semibold mt-7">Campos e valores</h3><div className="overflow-x-auto mt-3"><table><thead><tr><th>Campo</th><th>Como preencher</th></tr></thead><tbody>{[
 ['number','Brasil: DDD + número, como 85999999999. Internacional: número completo com +DDI.'],['country','Código do país em duas letras: BR, CA, PT etc. País adicional cadastrado: custom:ID.'],['requestId','UUID novo por solicitação, salvo e mantido na consulta, no envio e nas tentativas.'],['expectedCents','Número inteiro igual ao costCents da consulta. Ex.: 397 significa R$ 3,97; 0 significa sem cobrança. Nunca envie 3.97, "397" ou um valor fixo.'],['Autenticação','Cabeçalho X-Astros-Api-Key. A chave pertence à sua conta; não envie e-mail ou ID de usuário.']
 ].map(([field,description])=><tr key={field}><td><code>{field}</code></td><td>{description}</td></tr>)}</tbody></table></div>
 <CountryGuide/>
 {examples.map(item=>{const curl=`curl -X ${item.method} "${endpoint}?api=${item.operation}" \\\n  ${headers}${item.payload?` \\\n  -H "Content-Type: application/json" \\\n  -d "${item.payload}"`:''}`;return <article key={item.operation} className="api-endpoint"><div className="flex items-center gap-3"><span className="api-method">{item.method}</span><h3 className="font-semibold">{item.name}</h3></div><p className="text-sm text-muted-foreground mt-3 leading-7">{item.description}</p><div className="api-example"><pre>{curl}</pre><CopyButton value={curl} label="Copiar exemplo"/></div></article>;})}
 <article className="api-endpoint"><h3 className="font-semibold">Exemplo completo em JavaScript</h3><p className="text-sm text-muted-foreground mt-3 leading-7">Este exemplo recebe o UUID já salvo pela sua integração e usa a taxa retornada pela consulta, sem fixar o valor. A chamada enviar pode consumir saldo.</p><div className="api-example"><pre>{fullExample}</pre><CopyButton value={fullExample} label="Copiar fluxo completo"/></div></article>
 <article className="api-endpoint"><h3 className="font-semibold">Como interpretar o resultado</h3><p className="text-sm text-muted-foreground mt-3 leading-7">Confira sempre success, mesmo se o HTTP retornar 200. Quando success for false, leia message. Quando success for true, confira state:</p><ul className="list-disc pl-5 mt-3 space-y-2 text-sm leading-7"><li><strong>quoted:</strong> consulta concluída; nenhuma solicitação iniciada.</li><li><strong>completed:</strong> envio confirmado. Isso não significa que a Meta já desbloqueou o número.</li><li><strong>processing:</strong> envio em conferência automática. Acompanhe pelo mesmo UUID.</li><li><strong>review:</strong> a equipe está conferindo. Não envie novamente com outro UUID.</li><li><strong>failed:</strong> envio não concluído. Confira message e as movimentações da carteira para entender a taxa.</li></ul><p className="text-sm text-muted-foreground mt-4 leading-7">kind informa new, renew ou resend. costCents indica o valor do envio; targetStatus informa a etapa registrada. A API não precisa do tipo WhatsApp Business/Messenger usado no painel antigo.</p></article>
 <article className="api-endpoint"><h3 className="font-semibold">Erros frequentes e como resolver</h3><div className="api-doc-errors mt-4">{errors.map(([title,description])=><div key={title}><h4 className="font-semibold text-sm">{title}</h4><p className="text-sm text-muted-foreground leading-7 mt-2">{description}</p></div>)}</div></article>
 <p className="text-sm text-muted-foreground leading-7 mt-4">Se precisar de atendimento, informe a operação, requestId, número e mensagem do erro. Nunca envie sua chave da API. A API é para integrações no servidor; não exponha a chave em sites ou aplicativos públicos.</p>
 </section>;}
