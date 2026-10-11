const REDIRECTS = new Set([301, 302, 303, 307, 308]);
// Only follow canonical redirects inside this exact HTTPS API endpoint.
// Never forward the private credential to another origin or drop ownership filters.
export async function fetchNumberRows(initial: URL, token: string): Promise<Response> {
 let current = new URL(initial);
 const signal = AbortSignal.timeout(30000);
 for (let attempt = 0; attempt < 4; attempt++) {
  const response = await fetch(current.toString(), { headers: { Authorization: `Token ${token}` }, redirect: 'manual', signal });
  if (!REDIRECTS.has(response.status)) return response;
  const location = response.headers.get('location');
  if (!location) throw new Error('redirect missing location');
  const destination = new URL(location, current);
  if (destination.origin !== initial.origin || destination.username || destination.password || destination.pathname.replace(/\/$/, '') !== initial.pathname.replace(/\/$/, '')) throw new Error('redirect unsafe destination');
  destination.search = initial.search;
  destination.hash = '';
  current = destination;
 }
 throw new Error('redirect loop');
}
