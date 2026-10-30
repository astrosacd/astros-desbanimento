import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const folder=process.env.DIGITAL_SHOTS??'/tmp/digital-shots';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 const check=async()=>{const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dialog:[...document.querySelectorAll('[role="dialog"]')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}),height:innerHeight}));if(dimensions.scroll>dimensions.width+1)throw Error('Page overflows: '+JSON.stringify(dimensions));for(const r of dimensions.dialog)if(r.left<0||r.right>dimensions.width+1||r.top<0||r.bottom>dimensions.height+1)throw Error('Dialog outside viewport: '+JSON.stringify(dimensions));};
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',375,900]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4187/');await page.getByRole('button',{name:/Usar ferramenta/}).first().waitFor();await check();await page.screenshot({path:`${folder}/ferramentas-${label}.png`,fullPage:true});
  await page.getByRole('button',{name:/Usar ferramenta/}).first().click();await page.getByLabel('Palavra-chave').fill('odontologia Fortaleza');await check();await page.getByRole('button',{name:'Conferir e continuar'}).click();await page.getByRole('dialog').waitFor();await check();await page.screenshot({path:`${folder}/confirmacao-${label}.png`,fullPage:true});
  await page.goto('http://127.0.0.1:4187/?admin');await page.getByRole('button',{name:'Salvar configuração'}).waitFor();await check();await page.screenshot({path:`${folder}/admin-${label}.png`,fullPage:true});
  await page.goto('http://127.0.0.1:4187/?results');await page.getByRole('dialog').waitFor();await check();await page.screenshot({path:`${folder}/resultados-${label}.png`,fullPage:true});
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: real module, catalog, price confirmation and profile results at 1440px/375px; no page errors or viewport overflow.');
}finally{await browser.close();}
