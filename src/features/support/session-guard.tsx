import {useEffect} from 'react';
import {clearSupportSession} from './widget';
export function SupportSessionGuard({userId}:{userId?:string|undefined}){useEffect(()=>()=>clearSupportSession(),[userId]);return null;}
