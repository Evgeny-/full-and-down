# Compose the comparison sheets from the rendered concept pages.
#   compare.png       — Now + each concept, mid-plan (level 12 at Kiel, 1 t short at Copenhagen)
#   compare-calm.png  — Now + each concept, ready to sail
# usage: python3 tools/compose.py   (after tools/render.sh 1 2 3 4 and tools/now-states.mjs)
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(D, '..', '..', '..'))
OSW = os.path.join(ROOT, 'node_modules/@fontsource-variable/oswald/files/oswald-latin-wght-normal.woff2')
SOF = os.path.join(ROOT, 'node_modules/@fontsource-variable/sofia-sans/files/sofia-sans-latin-wght-normal.woff2')


def font(path, size, weight):
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def phone(png, i):
    """Crop phone i (0-based) out of a rendered concept page (2x)."""
    im = Image.open(os.path.join(D, png)).convert('RGB')
    x = (24 + i * 414) * 2
    y = (22 + 44 + 30) * 2
    return im.crop((x, y, x + 780, y + 1688))


CONCEPTS = [
    ('1 · Her marks', 'The ship is the gauge: the sea against her side, the bands painted on as marks.', 'concept-1.png', 0, 2),
    ('2 · Fuel ribbon', 'Route and bunkers in one line under the thumb: fuel aboard, port to port.', 'concept-2.png', 0, 1),
    ('3 · The slip', "The bunker sum as a mate writes it: aboard − each leg = ROB at the next pump.", 'concept-3.png', 0, 1),
    ('4 · Quiet until touched', 'Two numbers at rest; a thumb on the fuel opens the working.', 'concept-4.png', 0, 2),
]


def sheet(out, title, now_png, which):
    cols = [('Now', 'The game today: bar, chips and strip.', Image.open(os.path.join(D, now_png)).convert('RGB'))]
    for name, sub, png, mid, ready in CONCEPTS:
        cols.append((name, sub, phone(png, mid if which == 'mid' else ready)))
    M, G, CW = 24, 24, 444
    scale = CW / 780
    PH = round(1688 * scale)
    HEAD, TOP = 104, 64
    W = M * 2 + len(cols) * CW + (len(cols) - 1) * G
    H = TOP + HEAD + PH + M
    img = Image.new('RGB', (W, H), '#172238')
    d = ImageDraw.Draw(img)
    d.text((M, 18), title, font=font(SOF, 24, 700), fill='#b9c4d6')
    fn, fs = font(OSW, 34, 600), font(SOF, 19, 600)
    for k, (name, sub, ph) in enumerate(cols):
        x = M + k * (CW + G)
        d.text((x, TOP), name.upper(), font=fn, fill='#f8f7f2' if k else '#f5c518')
        # wrap the subtitle to the column
        words, lines, cur = sub.split(), [], ''
        for w in words:
            t = (cur + ' ' + w).strip()
            if d.textlength(t, font=fs) > CW:
                lines.append(cur)
                cur = w
            else:
                cur = t
        lines.append(cur)
        for j, ln in enumerate(lines[:2]):
            d.text((x, TOP + 48 + j * 24), ln, font=fs, fill='#b9c4d6')
        img.paste(ph.resize((CW, PH), Image.LANCZOS), (x, TOP + HEAD))
    img.save(os.path.join(D, out))
    print('saved', out, img.size)


sheet('compare.png', 'Full & Down · HUD round 2 · Level 12 "Short Stem" at Kiel, mid-plan: the 3 t Copenhagen box and 5 t of bunkers aboard; 1 t short at Copenhagen (Lübeck sells none).', 'now-L12-mid.png', 'mid')
sheet('compare-calm.png', 'Full & Down · HUD round 2 · Level 12 at Kiel, ready to sail: the same box, 6 t of bunkers aboard; Copenhagen on the reserve.', 'now-L12-ready.png', 'ready')
