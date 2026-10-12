const ENDPOINT='https://tevljvidqbvrcgzqypwf.supabase.co/functions/v1/astros-submit-number';
const KEY='sb_publishable_wvwHQDOVefSPivb227u1Iw_lH5qEM_j';
// Keep this project's function URL fixed. Never forward a session to another host.
export async function callSubmission(token:string,data:unknown){
 const original=new URL(ENDPOINT);let current=original;const signal=AbortSignal.timeout(90000);
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch(current.toString(),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,apikey:KEY},body:JSON.stringify(data),redirect:'manual',signal});
  if(![301,302,303,307,308].includes(r.status))return r;
  if(r.status===303)throw Error('SUBMISSION_UNSAFE_REDIRECT');
  const location=r.headers.get('location');if(!location)throw Error('SUBMISSION_REDIRECT_MISSING');
  const next=new URL(location,current);
  if(next.origin!==original.origin||next.username||next.password||next.pathname.replace(/\/$/,'')!==original.pathname.replace(/\/$/,'')||next.search!==original.search)throw Error('SUBMISSION_UNSAFE_REDIRECT');
  // Canonical endpoint redirects preserve the method/body and the request UUID.
  current=next;
 }
 throw Error('SUBMISSION_REDIRECT_LOOP');
}
