from pathlib import Path
root = Path(__file__).resolve().parent.parent
core = (root / 'src/features/client-import/core.ts').read_text()
(root / 'supabase/functions/astros-import-clients/core.ts').write_text(core)
main = (root / 'supabase/functions/astros-import-clients/index.ts').read_text()
(root / 'supabase/astros-import-clients.deploy.ts').write_text(main.replace("import {validateClient,excludedEmail} from './core.ts';", core))
print('Arquivo completo de importação gerado, sem dados de clientes.')
