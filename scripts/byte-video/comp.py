# Put the transparent frames on a HeapHop background (dark or light) with the soft accent glow.
import sys, os
from PIL import Image, ImageDraw, ImageFilter
src, theme, out = sys.argv[1], sys.argv[2], sys.argv[3]
BG = {"dark": (11, 22, 34), "light": (244, 247, 250)}[theme]
GLOW = {"dark": (61, 214, 198, 38), "light": (11, 116, 128, 26)}[theme]
os.makedirs(out, exist_ok=True)
files = sorted(f for f in os.listdir(src) if f.endswith(".png"))
W = Image.open(os.path.join(src, files[0])).width
base = Image.new("RGBA", (W, W), BG + (255,))
glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(glow)
d.ellipse((W * 0.2, W * 0.18, W * 0.8, W * 0.82), fill=GLOW)
glow = glow.filter(ImageFilter.GaussianBlur(W * 0.09))
base.alpha_composite(glow)
for f in files:
    im = base.copy()
    im.alpha_composite(Image.open(os.path.join(src, f)).convert("RGBA"))
    im.convert("RGB").save(os.path.join(out, f))
