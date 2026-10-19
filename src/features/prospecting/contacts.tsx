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
  if (!safe.length) return null;
  return <section className="prospect-contacts" aria-label="Outros contatos publicados">
    <h4>Outros contatos publicados</h4>
    <div>{safe.map(c => <a key={c.url} href={c.url} target={c.url.startsWith("https:")?"_blank":undefined} rel="noopener noreferrer">
      <span><strong>{c.label}</strong><span>{c.value}</span><small>Origem: {c.source === "cnpj" ? "cadastro CNPJ" : c.source === "maps" ? "Google Maps" : "site da empresa"}</small></span><ExternalLink size={14}/>
    </a>)}</div>
    <p>Links publicados na fonte consultada. O vínculo, a disponibilidade e o atendimento não foram confirmados.</p>
  </section>;
}
