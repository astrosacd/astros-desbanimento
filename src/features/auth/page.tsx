import { useEffect, useState, type FormEvent } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { Eye, EyeOff, ShieldCheck, ArrowRight,  KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/features/demo/shell';
import { loginClient, signupClient, recoverClient, resetClient } from './actions';
import { signupSchema } from './validation';
type Mode = 'login' | 'cadastro' | 'recuperacao' | 'reset';
const titles = { login: 'Entre na sua conta', cadastro: 'Crie sua conta', recuperacao: 'Esqueceu sua senha?', reset: 'Defina sua nova senha' };
export function Entrance({ mode, passwordUpdated = false }: { mode: Mode; passwordUpdated?: boolean }) {
 const router = useRouter();
 const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [whatsapp, setWhatsapp] = useState('');
 const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
 const [token, setToken] = useState(''); const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(passwordUpdated ? 'Senha atualizada com sucesso. Entre com seu e-mail e sua nova senha.' : '');
 useEffect(() => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (mode === 'reset') {
   if (hash.get('type') === 'recovery' && hash.get('access_token')) setToken(hash.get('access_token')!);
   else setError('Abra o link recebido por e-mail. Se ele expirou, solicite uma nova recuperação.');
  } else if (mode === 'login' && hash.get('access_token')) setMessage('E-mail confirmado. Entre com seu e-mail e senha.');
  if (hash.get('error')) setError('Esse link é inválido ou expirou. Solicite um novo link.');
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
 }, [mode]);
 async function submit(event: FormEvent) {
  event.preventDefault(); setError(''); setMessage(''); setBusy(true);
  try {
   if (mode === 'login') { await loginClient({ data: { email, password } }); await router.invalidate(); await router.navigate({ to: '/' }); }
   if (mode === 'cadastro') {
    const parsed = signupSchema.safeParse({ name, email, whatsapp, password });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Confira os dados do cadastro.');
    const result = await signupClient({ data: { name, email, whatsapp, password } });
    if (result.signedIn) { await router.invalidate(); await router.navigate({ to: '/' }); }
    else setMessage('Confira sua caixa de entrada para confirmar o cadastro. Se esse e-mail já possui conta, entre ou use “Esqueci minha senha”.');
   }
   if (mode === 'recuperacao') { await recoverClient({ data: { email } }); setMessage('Se houver uma conta com esse e-mail, você receberá um link para redefinir a senha. Confira também o spam. Ainda não tem conta? Crie seu cadastro abaixo.'); }
   if (mode === 'reset') {
    if (password !== confirmation) throw new Error('As senhas precisam ser iguais.');
    await resetClient({ data: { token, password } }); setToken(''); setPassword(''); setConfirmation('');
    await router.navigate({ to: '/login', search: { senha: 'atualizada' }, replace: true });
   }
  } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.'); }
  finally { setBusy(false); setPassword(''); setConfirmation(''); }
 }
 return <main className="admin-login client-entrance"><section className="entrance-story"><Wordmark/><span className="eyebrow">PAINEL DE DESBANIMENTO</span><h1>Acompanhe<br/>cada etapa.<br/><span>Com clareza.</span></h1><p>Seus números, solicitações e saldo em um só lugar. Acesse sua conta e acompanhe tudo com a Astros.</p><div className="entrance-signature">ASTROS Comunicação Digital®<span>Ecossistema de Crescimento Digital</span></div></section><section className="admin-login-card entrance-card"><div className="entrance-mobile-brand"><Wordmark/></div><span className="eyebrow">{mode === 'cadastro' ? 'COMECE POR AQUI' : 'ACESSO AO PAINEL'}</span><h2>{titles[mode]}</h2><p>{mode === 'cadastro' ? 'Preencha seus dados para começar.' : mode === 'login' ? 'Entre com seu e-mail e senha.' : mode === 'recuperacao' ? 'Enviaremos um link para você escolher uma nova senha.' : 'Escolha uma senha com pelo menos 8 caracteres.'}</p><form onSubmit={submit}>
 {mode === 'cadastro' && <><label className="field-label" htmlFor="client-name">Nome completo</label><input className="field" id="client-name" placeholder="Como você se chama?" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} maxLength={120} required disabled={busy}/></>}
 {mode !== 'reset' && <><label className="field-label" htmlFor="client-email">E-mail</label><input className="field" id="client-email" type="email" placeholder="voce@exemplo.com" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required disabled={busy}/></>}
 {mode === 'cadastro' && <><label className="field-label" htmlFor="client-whatsapp">WhatsApp com DDD</label><input className="field" id="client-whatsapp" type="tel" autoComplete="tel" placeholder="(85) 99999-9999" value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} maxLength={30} required disabled={busy}/></>}
 {mode !== 'recuperacao' && <><label className="field-label" htmlFor="client-password">{mode === 'reset' ? 'Nova senha' : 'Senha'}</label><div className="admin-password"><input className="field" id="client-password" placeholder={mode === 'login' ? 'Digite sua senha' : 'Pelo menos 8 caracteres'} type={visible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 8} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/><button type="button" onClick={()=>setVisible(!visible)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{mode === 'cadastro' && <p className="field-help">Use pelo menos 8 caracteres.</p>}</>}
 {mode === 'reset' && <><label className="field-label" htmlFor="client-confirm">Confirme a nova senha</label><input className="field" id="client-confirm" type="password" autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} minLength={8} maxLength={256} required disabled={busy}/></>}
 {mode === 'login' && <Link className="entrance-forgot" to="/recuperar-senha">Esqueci minha senha</Link>}
 {error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status" className="notice entrance-notice">{message}</p>}
 <Button type="submit" className="w-full mt-6 min-h-11" disabled={busy || (mode === 'reset' && !token)}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar no painel' : mode === 'cadastro' ? 'Criar minha conta' : mode === 'recuperacao' ? 'Enviar link de recuperação' : 'Salvar nova senha'}{!busy && <ArrowRight size={17}/>}</Button></form>
 <div className="entrance-links">{mode === 'login' ? <>Ainda não tem conta? <Link to="/cadastro">Cadastre-se</Link></> : <Link to="/login">Voltar para o login</Link>}{mode === 'recuperacao' && <Link to="/cadastro">Criar uma conta</Link>}</div><div className="entrance-bottom"><ShieldCheck size={14}/><span>Sua conta, seu acesso.</span><span className="entrance-footer-dot" aria-hidden="true">·</span><Link to="/termos">Termos de uso</Link></div></section></main>;
}
