import {expect,it} from 'vitest';
import {matchingContact,widgetIdentity} from '../../../supabase/functions/astros-support-identity/core';
const contact={id:7,email:'Own@example.com',identifier:'5585866559119@s.whatsapp.net',name:'Contato antigo',phone_number:'+5585866559119'};
it('reuses the exact verified-email contact and preserves its identifier/name/phone',()=>{const found=matchingContact([contact,{...contact,id:8,email:'someone@example.com'}],'own@example.com');expect(widgetIdentity({id:'uuid',email:'own@example.com',name:'Maria'},'+5585999999999',found)).toMatchObject({id:contact.identifier,widgetName:contact.name,contactPhone:contact.phone_number,phone:'+5585999999999'});});
it('blocks ambiguous matches instead of selecting a contact arbitrarily',()=>expect(()=>matchingContact([contact,{...contact,id:8}],'own@example.com')).toThrow('mais de um'));
it('does not associate a fuzzy email hit with the logged-in account',()=>{expect(matchingContact([{...contact,email:'otherown@example.com'}],'own@example.com')).toBeNull();expect(widgetIdentity({id:'uuid',email:'own@example.com',name:'Maria'},'+5585999999999',null).id).toBe('uuid');});
