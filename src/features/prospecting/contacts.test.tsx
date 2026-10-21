import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {LeadContacts} from './contacts';
import type {Lead} from './types';
afterEach(cleanup);
it('hides the supplier suffix from saved complementary contacts without changing their links or values',()=>{
 const snapshot={source:'cnpj',contacts:[{kind:'phone',label:'Telefone complementar (ReceitaWS)',value:'8533334444',url:'tel:8533334444',source:'cnpj'}]} as Lead['snapshot'];
 render(<LeadContacts snapshot={snapshot}/>);
 expect(screen.getByText('Telefone complementar')).toBeTruthy();expect(screen.queryByText(/ReceitaWS/i)).toBeNull();expect(screen.getByRole('link')).toHaveAttribute('href','tel:8533334444');expect(snapshot.contacts?.[0]?.label).toContain('ReceitaWS');
});
