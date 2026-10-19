import { it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { publishedContacts, contactLink } from '../../../supabase/functions/astros-prospecting/website';
import { LeadContacts } from './contacts';
import type { Lead } from './types';
afterEach(cleanup);
it('extracts explicit public contacts from HTML and reader markdown with provenance and deduplication',()=>{
 const content='<a href="https://www.instagram.com/empresa/?utm_source=site">Instagram</a> [LinkedIn](https://www.linkedin.com/company/empresa/) <a href="https://www.instagram.com/empresa/">Duplicado</a> <a href="mailto:contato@empresa.com.br">Email</a> <a href="tel:+5585999999999">Telefone</a> <a href="https://wa.me/5585999999999?text=Oi">WhatsApp</a>';
 const contacts=publishedContacts(content);expect(contacts).toHaveLength(5);expect(contacts.every(c=>c.source==='site')).toBe(true);expect(contacts.find(c=>c.label==='Instagram')?.url).toBe('https://www.instagram.com/empresa/');
 expect(contactLink('https://linkedin.com/company/empresa','maps')?.source).toBe('maps');
});
it('rejects lookalikes, sharing links, private hosts, scripts and credentials',()=>{
 for(const value of ['javascript:alert(1)','https://instagram.com.evil.com/foo','https://instagram.com@evil.com/foo','http://127.0.0.1','https://facebook.com/sharer.php?u=abc','https://wa.me/not-a-number','https://instagram.com/'])expect(contactLink(value)).toBeNull();
 expect(publishedContacts('<script>const link="<a href=\"https://instagram.com/fake\">"</script>')).toEqual([]);
 expect(publishedContacts(Array(50).fill('<a href="https://linkedin.com/company/same/">x</a>').join(''))).toHaveLength(1);
});
it('shows source, supports legacy emails and hides unsafe URLs without invented contacts',()=>{
 const snapshot={siteEmails:['contato@empresa.com.br'],contacts:[{url:'javascript:alert(1)',label:'Fake',value:'fake',source:'site',kind:'social'},{url:'https://instagram.com/empresa',label:'Instagram',value:'instagram.com/empresa',source:'site',kind:'social'}]} as Lead['snapshot'];
 render(<LeadContacts snapshot={snapshot}/>);expect(screen.getByRole('link',{name:/Instagram/})).toBeTruthy();expect(screen.getByRole('link',{name:/contato@empresa/})).toBeTruthy();expect(screen.queryByText('Fake')).toBeNull();
});
