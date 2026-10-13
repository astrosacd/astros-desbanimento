from pathlib import Path
root=Path(__file__).resolve().parents[1]
base=root/'supabase/functions/astros-submit-number'
source=(base/'index.ts').read_text()
for declaration,filename in [
 ("import { classify, confirmed, normalize, type Row } from './core.ts';",'core.ts'),
 ("import { canonicalPhone } from './phone.ts';",'phone.ts'),
 ("import { scanRows } from './scan.ts';",'scan.ts'),
 ("import {receiptMatches,reconciliationDecision,jobResponse,type ServiceJob} from './reconcile.ts';",'reconcile.ts')]:
 contents=(base/filename).read_text().replace("import type {Row} from './core.ts';\n",'').replace("import {normalize,type Row} from './core.ts';\n",'')
 source=source.replace(declaration,contents)
source='// Arquivo único para colar no editor Supabase. Gerado a partir de functions/astros-submit-number.\n'+source
for filename in ['astros-submit-number-com-api.ts','astros-submit-number-sim-nao-aprovisionado.ts','astros-submit-number.deploy.ts','astros-submit-number-com-pais-e-saldo.ts','astros-submit-number-automatico.ts','astros-submit-number-com-pais-nas-observacoes.ts']:
 (root/'supabase'/filename).write_text(source)
