import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import { request } from '../admin/auth.server';
import { profileSchema } from './validation';
export async function updateProfile(input: unknown) {
 const data = profileSchema.parse(input);
 setResponseHeader('Cache-Control', 'private, no-store');
 const token = getCookie('astros_client_session');
 if (!token) throw new Error('Entre novamente para atualizar seu perfil.');
 const verified = await request('/auth/v1/user', token);
 if (!verified.ok) throw new Error('Sua sessão expirou. Entre novamente.');
 const user = await verified.json();
 if (!user.id || !user.email) throw new Error('Não foi possível verificar sua conta.');
 if (data.newPassword) {
  const check = await request('/auth/v1/token?grant_type=password', undefined, { method: 'POST', body: JSON.stringify({ email: user.email, password: data.currentPassword }) });
  if (!check.ok) throw new Error('A senha atual não está correta.');
  const session = await check.json();
  if (session.user?.id !== user.id) throw new Error('Não foi possível verificar sua conta.');
 }
 const saved = await request('/rest/v1/rpc/astros_update_own_name', token, { method: 'POST', body: JSON.stringify({ new_name: data.name }) });
 if (!saved.ok) throw new Error('Não foi possível salvar o nome. Confira se a configuração de perfil foi ativada no Supabase.');
 if (data.newPassword) {
  const changed = await request('/auth/v1/user', token, { method: 'PUT', body: JSON.stringify({ password: data.newPassword }) });
  if (!changed.ok) throw new Error('O nome foi salvo, mas a senha não foi alterada. Tente novamente.');
 }
 return { success: true, passwordChanged: Boolean(data.newPassword) };
}
