// Dedicated Astros mailer. Deploy with --no-verify-jwt; the internal secret is mandatory.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@7';
import { timingSafeEqual } from 'node:crypto';
const env = (key: string) => Deno.env.get(key) || '';
const reply = (status: number, message: string) => new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function matches(actual: string, expected: string) {
 const a = new TextEncoder().encode(actual), b = new TextEncoder().encode(expected);
 return a.length === b.length && timingSafeEqual(a, b);
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
function mail(type: 'signup' | 'recovery', link: string, appUrl: string) {
 const title = type === 'signup' ? 'Confirme sua conta na Astros' : 'Redefina sua senha';
 const text = type === 'signup' ? 'Falta só um passo para concluir seu cadastro no Painel de Desbanimento. Confirme seu e-mail pelo botão abaixo.' : 'Recebemos uma solicitação para redefinir a senha da sua conta. Use o botão abaixo para escolher uma nova senha.';
 const action = type === 'signup' ? 'Confirmar meu e-mail' : 'Criar nova senha';
 return { subject: type === 'signup' ? 'Confirme seu cadastro | Astros' : 'Recuperação de senha | Astros',
 text: `${title}\n\n${text}\n\n${link}\n\nSe você não fez essa solicitação, ignore este e-mail.\nAstros Comunicação Digital®`,
 html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f0f4f8;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:30px;background:#050b14"><img src="${escape(appUrl)}/brand/astros-logo.png" alt="ASTROS Comunicação Digital" width="190" style="display:block;max-width:100%;height:auto"><p style="color:#65e5df;font-size:11px;letter-spacing:1px;margin:18px 0 0">PAINEL DE DESBANIMENTO</p></td></tr><tr><td style="padding:32px;color:#142133"><h1 style="font-size:25px;margin:0 0 20px">${title}</h1><p style="font-size:15px;line-height:1.8">${text}</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#00c9d2;border-radius:8px"><a href="${escape(link)}" style="display:inline-block;padding:16px 24px;color:#04101a;font-weight:bold;text-decoration:none">${action}</a></td></tr></table><p style="font-size:12px;line-height:1.7;color:#68788d;margin-top:26px">Esse link é pessoal e tem validade limitada. Se você não fez essa solicitação, ignore este e-mail.</p><p style="font-size:11px;color:#68788d;word-break:break-all">Se o botão não abrir, copie este endereço:<br>${escape(link)}</p></td></tr><tr><td style="padding:22px 32px;border-top:1px solid #e7edf3;color:#68788d;font-size:11px">Astros Comunicação Digital®<br>Ecossistema de Crescimento Digital</td></tr></table></td></tr></table></body></html>` };
}
Deno.serve(async request => {
 if (request.method !== 'POST') return reply(405, 'Método indisponível.');
 const secret = env('ASTROS_EMAIL_INTERNAL_SECRET');
 if (secret.length < 32 || !matches(request.headers.get('x-astros-email-secret') || '', secret)) return reply(401, 'Acesso não autorizado.');
 const app = env('ASTROS_APP_URL'), gmail = env('ASTROS_GMAIL_USER'), password = env('ASTROS_GMAIL_APP_PASSWORD');
 if (!app.startsWith('https://') || !gmail || !password) return reply(503, 'Envio ainda não configurado.');
 try {
  const input = await request.json();
  if (!['signup', 'recovery'].includes(input.type) || typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return reply(400, 'Confira os dados.');
  const email = input.email.trim().toLowerCase();
  if (input.type === 'signup' && (typeof input.name !== 'string' || input.name.trim().split(/\s+/).length < 2 || input.name.length > 120 || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 256 || !/^[1-9]\d{9,14}$/.test(input.whatsapp || ''))) return reply(400, 'Confira os dados do cadastro.');
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)))).map(n => n.toString(16).padStart(2, '0')).join('');
  const { data: allowed, error: limiterError } = await supabase.rpc('astros_mail_allow', { recipient_hash: hash });
  if (limiterError) return reply(503, 'Envio temporariamente indisponível.');
  if (!allowed) return reply(429, 'Aguarde alguns minutos antes de tentar novamente.');
  if (input.type === 'signup') {
   // Create only: duplicate accounts are never modified or re-confirmed here.
   const { error } = await supabase.auth.admin.createUser({ email, password: input.password, email_confirm: false, user_metadata: { nome: input.name.trim(), whatsapp: input.whatsapp } });
   if (error) {
    if (error.code === 'email_exists' || error.code === 'user_already_exists') return reply(200, 'Confira seu e-mail. Se já tem conta, entre ou recupere a senha.');
    return reply(400, 'Não foi possível concluir o cadastro.');
   }
  } else {
   // Limit this panel's recovery flow to accounts with a profile in its own table.
   const { data: profile, error } = await supabase.from('painel_de_desbanimento').select('id').eq('email', email).limit(1).maybeSingle();
   if (error) return reply(503, 'Não foi possível solicitar a recuperação.');
   if (!profile) return reply(200, 'Se houver uma conta, enviaremos o link.');
  }
  const redirectTo = app.replace(/\/$/, '') + (input.type === 'signup' ? '/login' : '/reset-password');
  const { data, error } = await supabase.auth.admin.generateLink({ type: input.type, email, ...(input.type === 'signup' ? { password: input.password } : {}), options: { redirectTo } });
  if (error || !data.properties?.action_link) return reply(503, 'Não foi possível preparar o e-mail.');
  const content = mail(input.type, data.properties.action_link, app.replace(/\/$/, ''));
  const smtp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: gmail, pass: password.replace(/\s/g, '') }, connectionTimeout: 10000, socketTimeout: 15000 });
  try { await smtp.sendMail({ from: { name: 'Astros Comunicação Digital', address: gmail }, to: email, ...content }); }
  finally { smtp.close(); }
  return reply(200, 'Confira seu e-mail.');
 } catch { return reply(503, 'Não foi possível enviar o e-mail agora. Tente novamente mais tarde.'); }
});
