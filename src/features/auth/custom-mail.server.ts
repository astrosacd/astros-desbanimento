// Never import this module into browser code. Secrets are server environment only.
export function customMailEnabled() { return process.env['ASTROS_CUSTOM_EMAIL_ENABLED'] === 'true'; }
export async function customMail(data: { type: 'signup' | 'recovery'; email: string; name?: string; whatsapp?: string; password?: string; signupPermit?: string | undefined; referralCode?: string | undefined }) {
 const secret = process.env['ASTROS_EMAIL_INTERNAL_SECRET'];
 const url = (process.env['SUPABASE_URL'] ?? 'https://tevljvidqbvrcgzqypwf.supabase.co').replace(/\/$/, '');
 if (!secret || secret.length < 32 || !url.startsWith('https://')) throw new Error('O envio de e-mails da Astros ainda não foi configurado.');
 let response: Response;
 try { response = await fetch(`${url}/functions/v1/astros-auth-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-astros-email-secret': secret }, body: JSON.stringify(data), cache: 'no-store', signal: AbortSignal.timeout(30000) }); }
 catch { throw new Error('Não foi possível enviar o e-mail agora. Tente novamente mais tarde.'); }
 if (!response.ok) {
  if (response.status === 429) throw new Error('Aguarde alguns minutos antes de tentar novamente.');
  throw new Error('Não foi possível concluir o envio. Tente novamente mais tarde.');
 }
 // Do not expose admin API results, generated links or tokens to the browser.
 return { success: true };
}
