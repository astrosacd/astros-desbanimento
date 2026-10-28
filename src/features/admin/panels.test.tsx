import {useEffect,useState} from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AdminPanels} from './panels';
afterEach(cleanup);
it('keeps unsaved forms mounted while navigating and never submits on tab selection',()=>{
 const mount=vi.fn(),submit=vi.fn();
 function Form(){const [value,setValue]=useState('');useEffect(()=>{mount();},[]);return <form onSubmit={e=>{e.preventDefault();submit();}}><label>Comissão<input value={value} onChange={e=>setValue(e.target.value)}/></label><button type="submit">Salvar regras</button></form>;}
 render(<AdminPanels label="Áreas de teste" items={[{id:'rules',label:'Regras',description:'Valores',content:<Form/>},{id:'routine',label:'Conferência',description:'Rotina',content:<button type="button" onClick={submit}>Executar rotina</button>}]}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'Comissão'}),{target:{value:'30'}});
 expect(screen.queryByRole('button',{name:'Executar rotina'})).toBeNull();
 fireEvent.keyDown(screen.getByRole('tab',{name:/Conferência/}),{key:'Enter'});
 expect(screen.queryByRole('textbox',{name:'Comissão'})).toBeNull();expect(screen.getByRole('button',{name:'Executar rotina'})).toBeTruthy();
 fireEvent.keyDown(screen.getByRole('tab',{name:/Regras/}),{key:'Enter'});
 expect(screen.getByRole('textbox',{name:'Comissão'})).toHaveProperty('value','30');expect(mount).toHaveBeenCalledOnce();expect(submit).not.toHaveBeenCalled();
});
it('has accessible panel controls with independent instances',()=>{const items=[{id:'one',label:'Principal',description:'Resumo',content:<p>Conteúdo</p>}];render(<><AdminPanels label="Primeira" items={items}/><AdminPanels label="Segunda" items={items}/></>);const tabs=screen.getAllByRole('tab');expect(new Set(tabs.map(t=>t.getAttribute('aria-controls'))).size).toBe(2);for(const t of tabs){const panel=document.getElementById(t.getAttribute('aria-controls')!);expect(panel?.getAttribute('aria-labelledby')).toBe(t.id);}});
