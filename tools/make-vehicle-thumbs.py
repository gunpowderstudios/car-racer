#!/usr/bin/env python3
"""
Make the little vehicle pictures for the menu gallery (cars/thumbs/<id>.webp).

Run it again whenever a car is added or its model changes:
    python3 tools/make-vehicle-thumbs.py            # every car in src/vehicleChoice.js
    python3 tools/make-vehicle-thumbs.py mini bmw   # just these

It starts a local web server, opens the game's own menu preview for each car, freezes it at a fixed
three-quarter angle and saves the transparent 3D canvas as a small .webp. Needs: pip install playwright pillow
(and `playwright install chromium`). Set THREE_DIR to a local copy of the `three` package if the machine
cannot reach the CDN the game loads three.js from.
"""
import base64, io, os, re, subprocess, sys, time, mimetypes
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8123
THREE_DIR = os.environ.get('THREE_DIR')
YAW = 2.56                      # front three-quarter view (the menu preview's own default, -0.58, shows the rear)
SIZE = (320, 206)

ids = re.findall(r"^\s*(?:\{\s*)?id: '([^']+)'", open(os.path.join(ROOT, 'src/vehicleChoice.js')).read(), re.M)
want = sys.argv[1:] or ids

server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

def route_three(route):
    rel = route.request.url.split('three@')[1].split('/', 1)[1].split('?')[0]
    path = os.path.join(THREE_DIR, rel)
    if os.path.exists(path):
        route.fulfill(path=path, content_type=mimetypes.guess_type(path)[0] or 'application/javascript', headers={'access-control-allow-origin': '*'})
    else:
        route.abort()

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'])
        for vid in want:
            page = b.new_context(viewport={'width': 1800, 'height': 1000}, device_scale_factor=2).new_page()
            if THREE_DIR: page.route('**/cdn.jsdelivr.net/npm/three@*/**', route_three)
            page.route('**/peerjs**', lambda r: r.abort())
            page.add_init_script(f"try{{localStorage.setItem('cr.vehicle','{vid}')}}catch(e){{}}; window.__previewYaw = {YAW};")
            page.goto(f'http://localhost:{PORT}/index.html', wait_until='domcontentloaded', timeout=120000)
            page.wait_for_function("document.getElementById('menu-vehicle-preview') && document.getElementById('menu-vehicle-preview').classList.contains('ready')", timeout=240000)
            page.wait_for_timeout(1500)
            data = page.evaluate("""() => new Promise((res) => {
              const c = document.getElementById('menu-vehicle-canvas');
              requestAnimationFrame(() => requestAnimationFrame(() => res(c.toDataURL('image/png'))));
            })""")
            im = Image.open(io.BytesIO(base64.b64decode(data.split(',')[1]))).convert('RGBA')
            box = im.getbbox()                                   # trim the empty margin, then fit into the card
            if box: im = im.crop(box)
            k = min((SIZE[0] - 8) / im.width, (SIZE[1] - 8) / im.height)      # fill the card (the canvas is rendered larger than this, so it stays sharp)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            out = Image.new('RGBA', SIZE, (0, 0, 0, 0))
            out.paste(im, ((SIZE[0] - im.width) // 2, (SIZE[1] - im.height) // 2), im)
            out.save(os.path.join(ROOT, 'cars', 'thumbs', f'{vid}.webp'), 'WEBP', quality=82, method=6)
            print('made', vid, im.size)
            page.context.close()
        b.close()
finally:
    server.terminate()
