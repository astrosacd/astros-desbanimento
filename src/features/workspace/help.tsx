import "./style.css";
const help = {
  digital: [
    [
      "Escolha a ferramenta",
      "Busque perfis por palavra-chave, consulte um @, link ou ID, ou extraia seguidores de um perfil público.",
    ],
    [
      "Confira antes de pesquisar",
      "Veja o preço e a quantidade antes de confirmar. A cobrança considera os perfis entregues, mesmo sem contato. O restante da reserva é devolvido após a conclusão confirmada.",
    ],
    [
      "Encontre seus resultados",
      "Abra Minhas pesquisas para acompanhar e exportar. Em Perfis salvos, organize os perfis em coleções sem iniciar outra consulta.",
    ],
  ],
  prospecting: [
    [
      "Como começar",
      "Escolha Google Maps para buscar por nicho e localização, ou CNPJ para pesquisar empresas pelos filtros cadastrais. Confira o valor antes de confirmar.",
    ],
    [
      "Onde ficam os resultados",
      "Abra Meus leads para consultar os contatos e organizar as etapas. O Histórico de buscas reúne as consultas de Google Maps e CNPJ.",
    ],
    [
      "Como acompanhar um contato",
      "Nos detalhes do lead, salve sua anotação e uma data de retorno. A aba Retornos mostra os contatos de hoje, os atrasados e os próximos 7 dias.",
    ],
    [
      "Instagram e avaliações",
      "São consultas opcionais nos detalhes do lead quando disponíveis. Informações de Instagram dependem do link salvo; avaliações são das empresas do Google Maps. Há limites de consulta.",
    ],
  ],
  sms: [
    [
      "Como começar",
      "Escolha o serviço e o país, confira disponibilidade e preço e confirme a ativação.",
    ],
    [
      "Como receber o código",
      "Acompanhe a ativação no painel e no histórico. Use sempre o pedido já iniciado para consultar o recebimento.",
    ],
    [
      "Se houver demora",
      "Não inicie outra compra para tentar recuperar um pedido incerto. Consulte o andamento ou fale com o suporte usando a referência do pedido.",
    ],
    [
      "Cancelamento e devolução",
      "Use as opções disponíveis no próprio pedido. O vencimento do prazo, sozinho, não confirma uma devolução de saldo.",
    ],
  ],
  social: [
    [
      "Como começar",
      "Selecione a rede e o serviço, leia a descrição e os limites e informe o endereço solicitado. Confira quantidade e valor antes de confirmar.",
    ],
    ["Como acompanhar", "Abra seu histórico para consultar o andamento e os detalhes do pedido."],
    [
      "Reposição e cancelamento",
      "Essas opções dependem do serviço contratado. Um pedido de reposição ou cancelamento não significa confirmação imediata.",
    ],
    ["Se precisar de ajuda", "Tenha a referência do pedido em mãos ao falar com o suporte."],
  ],
  desbanimento: [
    [
      "Como enviar",
      "Selecione o país e informe o número. O painel confere a situação atual e o valor antes de realizar o envio.",
    ],
    [
      "Cobrança e reenvio",
      "O painel identifica quando um novo envio é pago ou quando o número permite reenvio elegível. Consulte o valor apresentado na operação.",
    ],
    [
      "Como acompanhar",
      "Abra Solicitações para consultar seus números. A confirmação de envio é diferente do resultado da análise do desbanimento.",
    ],
    [
      "Se o envio ficar em conferência",
      "Consulte a mesma tentativa ou o suporte. Evite iniciar outro envio para contornar uma demora.",
    ],
  ],
  wallet: [
    [
      "Como recarregar",
      "Escolha valor e forma de pagamento. O saldo é creditado após a confirmação do pagamento.",
    ],
    [
      "Carteira compartilhada",
      "O mesmo saldo atende aos módulos integrados da plataforma. Veja suas entradas e utilizações no histórico.",
    ],
    [
      "Como conferir o extrato",
      "Escolha as datas na seção Exportar extrato da carteira e baixe o CSV. O arquivo inclui movimentações de saldo, não pagamentos ainda pendentes.",
    ],
  ],
};
export function QuickHelp({ module }: { module: keyof typeof help }) {
  return (
    <details className="workspace-help">
      <summary>Como usar esta área</summary>
      {help[module].map(([title, body]) => (
        <section key={title}>
          <h3>{title}</h3>
          <p>{body}</p>
        </section>
      ))}
    </details>
  );
}
