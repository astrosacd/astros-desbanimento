export function validCpf(value:string){
 const digits=value.replace(/\D/g,'');
 if(!/^\d{11}$/.test(digits)||/^(\d)\1{10}$/.test(digits))return false;
 for(let length=9;length<=10;length++){
  let sum=0;for(let i=0;i<length;i++)sum+=Number(digits[i])*(length+1-i);
  const check=(sum*10)%11;
  if(Number(digits[length])!==(check===10?0:check))return false;
 }
 return true;
}
export function cpfMessage(value:string){return value.replace(/\D/g,'').length!==11?'Informe o CPF do pagador com 11 dígitos.':'Esse CPF não parece válido. Confira os números e tente novamente.';}
export function friendlyRechargeError(error:unknown){
 const message=error instanceof Error?error.message:'';
 try{const issues=JSON.parse(message);if(Array.isArray(issues)){if(issues.some(i=>Array.isArray(i?.path)&&i.path.includes('cpf')))return 'Confira o CPF do pagador e tente novamente.';return 'Confira os dados da recarga e tente novamente.';}}catch{}
 return message||'Não foi possível gerar o pagamento agora. Tente novamente.';
}
