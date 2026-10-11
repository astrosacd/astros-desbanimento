import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { addRecharge, addRequest, createSeed, stateSchema, type DemoState, type TYPES } from './model';
const KEY = 'astros-desbanimento-v2-demo';
type Context = { state: DemoState; ready: boolean; storageError: string; submit: (number: string, type: typeof TYPES[number]) => string; recharge: (value: number) => void; profile: (profile: DemoState['profile']) => void; restore: () => void };
const DemoContext = createContext<Context | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(createSeed);
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    try { const stored = localStorage.getItem(KEY); if (stored) { const saved = stateSchema.parse(JSON.parse(stored)); current.current = saved; setState(saved); } }
    catch { setStorageError('Não foi possível recuperar os dados locais. A demonstração padrão foi carregada.'); }
    setReady(true);
  }, []);
  const save = (next: DemoState) => {
    current.current = next; setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('Armazenamento indisponível. Suas alterações duram apenas nesta sessão.'); toast.error('Não foi possível salvar neste navegador.'); }
  };
  return <DemoContext.Provider value={{ state, ready, storageError,
    submit: (number, type) => { const id = `AST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; save(addRequest(current.current, number, type, id, new Date().toISOString())); return id; },
    recharge: value => save(addRecharge(current.current, value, `REC-${crypto.randomUUID().slice(0, 8)}`, new Date().toISOString())),
    profile: profile => save({ ...current.current, profile }),
    restore: () => { save(createSeed()); toast.success('Demonstração restaurada.'); },
  }}>{children}</DemoContext.Provider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('DemoProvider ausente'); return context; }
