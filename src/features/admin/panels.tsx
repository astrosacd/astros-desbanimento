import {useState,type ReactNode} from 'react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import './organization.css';
type Panel={id:string;label:string;description:string;content:ReactNode};
/** Presentation only. Existing forms remain mounted when switching panels. */
export function AdminPanels({label,items}:{label:string;items:Panel[]}){
 const [active,setActive]=useState(items[0]?.id??'');
 return <Tabs value={active} onValueChange={setActive} activationMode="manual" className="admin-panels"><TabsList aria-label={label} className="admin-panel-tabs">{items.map(item=><TabsTrigger key={item.id} value={item.id}><span>{item.label}</span><small>{item.description}</small></TabsTrigger>)}</TabsList>{items.map(item=><TabsContent key={item.id} value={item.id} forceMount hidden={active!==item.id} data-admin-panel className="admin-panel-content">{item.content}</TabsContent>)}</Tabs>;
}
