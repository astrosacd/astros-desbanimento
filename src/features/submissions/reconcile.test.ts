import {expect,it} from 'vitest';
import {reconciliationDecision,receiptMatches,type ServiceJob} from '../../../supabase/functions/astros-submit-number/reconcile';
const job:ServiceJob={id:'ref',user_id:'own',number:'85999999999',kind:'new',amount_cents:500,target_status:'EM ANÁLISE PELA META',state:'processing',protocol_version:2,remote_phase:'uncertain',lease_key:'lease',check_attempts:1,remote_intent:{email:'own@example.com',country:'BR',number:'85999999999',targetStatus:'EM ANÁLISE PELA META',markerField:'field_9999'}};
const row={id:1,field_4741:'85999999999',field_4773:'own@example.com',field_4784:'nacional',field_4831:{value:'DESBANIMENTO OK'},field_9999:'ref'};
it('confirms the exact receipt even after the operational status changed',()=>{expect(receiptMatches(row,job)).toBe(true);expect(reconciliationDecision(job,[row])).toBe('completed');});
it.each(['prepared','rejected'])('refunds only a proved %s failure',phase=>expect(reconciliationDecision({...job,remote_phase:phase},[])).toBe('failed'));
it('never refunds merely because a receipt was not found after an uncertain write',()=>{expect(reconciliationDecision(job,[])).toBe('processing');expect(reconciliationDecision({...job,check_attempts:12},[])).toBe('review');});
it('keeps ambiguous receipts or ownership mismatches for staff checking',()=>{expect(reconciliationDecision(job,[row,row])).toBe('review');expect(reconciliationDecision(job,[{...row,field_4773:'other@example.com'}])).toBe('review');});
it('does not finalize another request or an untracked legacy job',()=>{expect(reconciliationDecision(job,[{...row,field_9999:'other'}])).toBe('processing');expect(()=>reconciliationDecision({...job,protocol_version:1},[row])).toThrow();});
