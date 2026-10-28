import re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
folder=root/'supabase/functions/astros-digital-research'
core=(folder/'core.ts').read_text()
handler=re.sub(r'import\s*\{[^}]*\}\s*from\s*[\'"]\./core\.ts[\'"];?\s*', '', (folder/'index.ts').read_text(), count=1)
(root/'supabase/astros-digital-research.deploy.ts').write_text(core+'\n'+handler)
