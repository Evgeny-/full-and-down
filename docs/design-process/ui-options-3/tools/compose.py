# compare.png (L12 mid + ready: Now / Polished / Polished+) and compare-L2.png (Now / Polished / Polished+).
# usage: python3 tools/compose.py   (after tools/capture.mjs and tools/render.sh)
import os
from PIL import Image, ImageDraw, ImageFont

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.abspath(os.path.join(D, '..', '..', '..'))
FONTS = os.path.join(ROOT, 'node_modules/@fontsource-variable')


def font(name, size, weight):
    f = ImageFont.truetype(os.path.join(FONTS, name), size)
    f.set_variation_by_axes([weight])
    return f


OSW = 'oswald/files/oswald-latin-wght-normal.woff2'
SOF = 'sofia-sans/files/sofia-sans-latin-wght-normal.woff2'


def sheet(out, title, groups, cw):
    """groups: [(group label, [(column name, png)])]"""
    M, G, GG, TOP, HEAD = 20, 16, 30, 58, 60
    scale = cw / 780
    ph = round(1688 * scale)
    n = sum(len(c) for _, c in groups)
    W = M * 2 + n * cw + (n - len(groups)) * G + (len(groups) - 1) * GG
    img = Image.new('RGB', (W, TOP + HEAD + ph + M), '#172238')
    d = ImageDraw.Draw(img)
    d.text((M, 16), title, font=font(SOF, 24, 700), fill='#b9c4d6')
    fg, fc = font(SOF, 17, 800), font(OSW, 30, 600)
    x = M
    for g, cols in groups:
        if g:
            d.text((x, TOP - 2), g.upper(), font=fg, fill='#8fa0bb')
        for name, png in cols:
            d.text((x, TOP + 16), name.upper(), font=fc, fill='#f5c518' if name == 'Now' else '#f8f7f2')
            img.paste(Image.open(os.path.join(D, png)).convert('RGB').resize((cw, ph), Image.LANCZOS), (x, TOP + HEAD))
            x += cw + G
        x += GG - G
    img.save(os.path.join(D, out))
    print('saved', out, img.size)


sheet('compare.png', 'Full & Down · HUD polish · Level 12 "Short Stem" at Kiel: same layout and components, set to read.', [
    ('Mid-plan · 5 t aboard · 1 t short at Copenhagen', [('Now', 'now-L12-mid.png'), ('Polished', 'polished-L12-mid.png'), ('Polished+', 'polished-plus-L12-mid.png')]),
    ('Ready to sail · 6 t aboard · Copenhagen on the reserve', [('Now', 'now-L12-ready.png'), ('Polished', 'polished-L12-ready.png'), ('Polished+', 'polished-plus-L12-ready.png')]),
], 365)
sheet('compare-L2.png', 'Full & Down · HUD polish · Level 2 "The Stripe", Rotterdam to Esbjerg, at the start: 1 t aboard, 2 t short.', [
    ('', [('Now', 'now-L2.png'), ('Polished', 'polished-L2.png'), ('Polished+', 'polished-plus-L2.png')]),
], 444)
