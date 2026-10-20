"""Export app icons from the existing Astros symbol. Requires Pillow for asset generation only."""
from pathlib import Path
from base64 import b64encode
from PIL import Image
root = Path(__file__).resolve().parent.parent
source = Image.open(root / 'public/brand/astros-symbol.png').convert('RGB')
# Isolate the existing colored symbol, preserving its proportions and artwork.
mask = Image.new('L', source.size)
mask.putdata([255 if max(pixel) > 110 and max(pixel)-min(pixel) > 75 else 0 for pixel in source.getdata()])
bounds = mask.getbbox()
if not bounds:
    raise RuntimeError('Astros symbol not found')
symbol = source.convert('RGBA')
symbol.putalpha(mask)
symbol = symbol.crop(bounds)
output = root / 'public/pwa'
output.mkdir(exist_ok=True)
for name, size, fraction in [('icon-192.png',192,.80),('icon-512.png',512,.80),('icon-maskable-512.png',512,.64),('apple-touch-icon.png',180,.80)]:
    icon = Image.new('RGB',(size,size),'#060d17')
    scaled = symbol.copy()
    scaled.thumbnail((round(size*fraction),round(size*fraction)), Image.Resampling.LANCZOS)
    icon.paste(scaled,((size-scaled.width)//2,(size-scaled.height)//2),scaled)
    icon.save(output/name,optimize=True)
logo = b64encode((output/'icon-192.png').read_bytes()).decode()
(output/'offline.html').write_text('''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#171c27"><meta name="robots" content="noindex"><title>Sem conexão · Astros Mais</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;background:#f4f6fb;color:#172330;font-family:Arial,sans-serif;padding:24px;padding-bottom:max(24px,env(safe-area-inset-bottom))}main{width:100%;max-width:460px;padding:32px;border:1px solid #dfe6ee;border-radius:22px;background:white;box-shadow:0 16px 50px #142d4910;text-align:center;overflow-wrap:anywhere}img{width:76px;height:76px;border-radius:19px}small{display:block;letter-spacing:.15em;color:#087b89;font-size:11px;margin-top:22px;font-weight:700}h1{font-size:27px;line-height:1.3;margin:14px 0}p{font-size:15px;color:#526174;line-height:1.8}button{display:block;width:100%;min-height:48px;border:0;border-radius:11px;background:#087b89;color:white;font-weight:700;font-size:15px;cursor:pointer;margin:24px 0 14px;white-space:normal;padding:12px}button:focus-visible{outline:3px solid #00afc5;outline-offset:3px}.note{font-size:12px} @media(max-width:360px){main{padding:24px}h1{font-size:24px}}</style></head>
<body><main data-astros-offline><img src="data:image/png;base64,''' + logo + '''" alt="Logo da Astros"><small>ASTROS MAIS</small><h1>Vamos reconectar?</h1><p>Não foi possível conectar ao painel. Confira sua conexão e tente novamente.</p><button type="button" onclick="window.location.reload()">Tentar novamente</button><p class="note">Se uma solicitação já estava em andamento, confira o histórico ao reconectar antes de repetir o envio.</p></main></body></html>''',encoding='utf-8')
