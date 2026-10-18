from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'supabase/functions/astros-prospecting'
website=(source/'website.ts').read_text()
reader=(source/'reader.ts').read_text().replace("import {publicWebsite,publicIPv4,socialWebsite,siteEvidence} from './website.ts';\n",'')
handler=(source/'index.ts').read_text().replace("import {checkWebsite,publicWebsite} from './website.ts';\n",'').replace("import {readWebsite,enrichWebsite} from './reader.ts';\n",'').replace("import {Buffer} from 'node:buffer';\n",'')
(root/'supabase/astros-prospecting.deploy.ts').write_text(website+'\n'+reader+'\n'+handler)
