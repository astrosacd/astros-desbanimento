from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'supabase/functions/astros-prospecting'
geography=(source/'geography.ts').read_text()
website=(source/'website.ts').read_text()
reader=(source/'reader.ts').read_text().replace("import {publicWebsite,publicIPv4,socialWebsite,siteEvidence,publishedContacts,contactLink} from './website.ts';\n",'')
cnpj=(source/'cnpj.ts').read_text().replace('type Obj = Record<string, any>;\n','')
handler=(source/'index.ts').read_text().replace("import { handleCnpj } from './cnpj.ts';\n",'').replace("import { brazilCities } from './geography.ts';\n",'').replace("import {checkWebsite,publicWebsite,contactLink} from './website.ts';\n",'').replace("import {readWebsite,enrichWebsite} from './reader.ts';\n",'').replace("import {Buffer} from 'node:buffer';\n",'')
(root/'supabase/astros-prospecting.deploy.ts').write_text(geography+'\n'+website+'\n'+reader+'\n'+cnpj+'\n'+handler)
