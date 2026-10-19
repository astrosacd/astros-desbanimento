import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { whatsappLink, leadMessage, LeadOutreach } from './outreach';
import type { Lead } from './types';
const lead = {id:'lead-1',snapshot:{name:'Empresa Exemplo',phone:'(85) 99999-9999'}} as Lead;
afterEach(cleanup);
it('builds valid links with encoded editable text and international numbers',()=>{
 expect(whatsappLink('(85) 99999-9999','Olá & tudo?')).toBe('https://wa.me/5585999999999?text=Ol%C3%A1%20%26%20tudo%3F');
 expect(whatsappLink('+1 416 555 0123','Oi')).toContain('/14165550123?');
 expect(whatsappLink('123','Oi')).toBeNull();
 expect(whatsappLink('','Oi')).toBeNull();
 expect(leadMessage(lead.snapshot)).toContain('Empresa Exemplo');
 expect(leadMessage(lead.snapshot)).not.toMatch(/lento|escondido|analisei/);
});
it('uses edited text, reports clipboard success and does not send or change stages',async()=>{
 const writeText=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
 render(<LeadOutreach lead={lead}/>);
 fireEvent.click(screen.getByText('Preparar abordagem'));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Minha proposta'}});
 expect(screen.getByRole('link',{name:'Conversar no WhatsApp'}).getAttribute('href')).toContain('Minha%20proposta');
 fireEvent.click(screen.getByRole('button',{name:'Copiar mensagem'}));
 await screen.findByText('Mensagem copiada!');expect(writeText).toHaveBeenCalledWith('Minha proposta');
});
