import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeading } from '../demo/requests';
import { updateClientProfile } from './actions';
import { profileSchema } from './validation';
export function ProfilePage({ identity }: { identity: { name: string; email: string } }) {
 const router = useRouter();
 const [name, setName] = useState(identity.name);
 const [currentPassword, setCurrentPassword] = useState('');
 const [newPassword, setNewPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 async function submit(e: React.FormEvent) {
  e.preventDefault(); setError('');
  const data = profileSchema.safeParse({ name, currentPassword, newPassword });
  if (!data.success) { setError(data.error.issues[0]?.message || 'Confira os campos.'); return; }
  if (newPassword !== confirmPassword) { setError('A confirmação da nova senha não confere.'); return; }
  setBusy(true);
  try { await updateClientProfile({ data: data.data }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); await router.invalidate(); toast.success('Perfil atualizado com sucesso.'); }
  catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o perfil.'); }
  finally { setBusy(false); }
 }
 return <><PageHeading title="Meu perfil" subtitle="Atualize seus dados e cuide da segurança da sua conta."/><div className="form-layout"><form className="form-section space-y-5" onSubmit={submit}>
 <div><label className="field-label" htmlFor="profile-name">Nome completo</label><input id="profile-name" className="field" autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={120} required disabled={busy}/></div>
 <div><label className="field-label" htmlFor="profile-email">E-mail da conta</label><input id="profile-email" type="email" className="field opacity-70" value={identity.email} readOnly aria-describedby="email-help"/><p id="email-help" className="text-xs text-muted-foreground mt-2">Seu e-mail não pode ser alterado. Para usar outro e-mail, crie uma nova conta.</p></div>
 <fieldset className="border-t pt-5 space-y-4" disabled={busy}><legend className="flex items-center gap-2 font-semibold"><LockKeyhole size={17}/>Alterar senha</legend><p className="text-xs text-muted-foreground">Deixe estes campos em branco para manter sua senha atual.</p>
 {[{id:'current-password',label:'Senha atual',value:currentPassword,set:setCurrentPassword,auto:'current-password'},{id:'new-password',label:'Nova senha',value:newPassword,set:setNewPassword,auto:'new-password'},{id:'confirm-password',label:'Confirme a nova senha',value:confirmPassword,set:setConfirmPassword,auto:'new-password'}].map(f => <div key={f.id}><label className="field-label" htmlFor={f.id}>{f.label}</label><input id={f.id} type="password" className="field" autoComplete={f.auto} value={f.value} onChange={e => f.set(e.target.value)} maxLength={256} required={Boolean(newPassword)}/></div>)}<p className="text-xs text-muted-foreground">A nova senha deve ter pelo menos 8 caracteres.</p></fieldset>
 {error && <p className="error-text" role="alert">{error}</p>}<Button type="submit" disabled={busy}><Save size={16}/>{busy ? 'Salvando…' : 'Salvar alterações'}</Button></form>
 <aside className="summary-box"><ShieldCheck className="text-primary mb-3"/><h2>Sua conta, seus dados</h2><p className="text-sm text-muted-foreground mt-3">As alterações são salvas na sua conta. Para mudar a senha, confirme sua senha atual.</p></aside></div></>;
}
