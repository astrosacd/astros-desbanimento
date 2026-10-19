import { ExternalLink } from "lucide-react";
import type { Lead } from "./types";
export function LeadContacts({ snapshot }: { snapshot: Lead["snapshot"] }) {
  const contacts = [...(snapshot.contacts || [])];
  for (const email of snapshot.siteEmails || []) {
    if (/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(email) && !contacts.some(c => c.url === "mailto:" + email)) {
      contacts.push({kind:"email",label:"E-mail",value:email,url:"mailto:"+email,source:"site"});
    }
  }
  const safe = contacts.filter(c => {
    try { const u = new URL(c.url); return ["https:","mailto:","tel:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
  }).filter((c,i,a)=>a.findIndex(v=>v.url===c.url)===i).slice(0,25);
  if (!safe.length) return snapshot.source === "cnpj" ? <section className="prospect-contacts" aria-label="Contatos cadastrais"><h4>Telefones e e-mails cadastrados</h4><p>A fonte não informou telefones ou e-mails para este cadastro na consulta recebida.</p></section> : null;
  return <section className="prospect-contacts" aria-label={snapshot.source === "cnpj" ? "Contatos cadastrais" : "Outros contatos publicados"}>
    <h4>{snapshot.source === "cnpj" ? "Telefones e e-mails cadastrados" : "Outros contatos publicados"}</h4>
    <div>{safe.map(c => <a key={c.url} href={c.url} target={c.url.startsWith("https:")?"_blank":undefined} rel="noopener noreferrer">
      <span><strong>{c.label}</strong><span>{snapshot.source === "cnpj" && c.kind === "phone" ? c.value.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") : c.value}</span><small>Origem: {c.source === "cnpj" ? "cadastro CNPJ" : c.source === "maps" ? "Google Maps" : "site da empresa"}</small></span><ExternalLink size={14}/>
    </a>)}</div>
    <p>{snapshot.source === "cnpj" ? "Contatos disponíveis no cadastro da empresa. A titularidade, a disponibilidade e o uso de WhatsApp não foram confirmados." : "Links publicados na fonte consultada. O vínculo, a disponibilidade e o atendimento não foram confirmados."}</p>
  </section>;
}
