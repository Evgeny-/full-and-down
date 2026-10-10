# Crop the HUD regions of a rendered concept for close inspection: crop.py <png> <out> <phone 0|1|2> <y0> <y1>
import sys
from PIL import Image
src, out, ph, y0, y1 = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = Image.open(src)
x = (24 + ph * 414) * 2
top = (22 + 44 + 30) * 2
im.crop((x, top + y0 * 2, x + 780, top + y1 * 2)).save(out)
