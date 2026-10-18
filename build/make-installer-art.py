"""Draws the NSIS installer's sidebar (164x314) and header (150x57) bitmaps
from build/icon.png in the app's colours. Run it again after changing the
logo: `python build/make-installer-art.py` (needs Pillow).
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = Image.open(os.path.join(HERE, 'icon.png')).convert('RGBA')

# The app's palette (src/renderer/src/styles/theme.css) and the logo's own greens.
PARCHMENT = (250, 246, 236)
PARCHMENT_DIM = (214, 202, 178)
EMBER = (181, 80, 44)
INK_TOP = (24, 32, 18)
INK_BOTTOM = (46, 60, 30)
INK_TEXT = (36, 48, 24)

FONT_DIR = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts')


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (name, 'georgiab.ttf'):
        path = os.path.join(FONT_DIR, candidate)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def logo(size: int) -> Image.Image:
    return LOGO.resize((size, size), Image.LANCZOS)


def gradient(w: int, h: int, top: tuple, bottom: tuple) -> Image.Image:
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def centred(draw: ImageDraw.ImageDraw, w: int, y: int, text: str, f: ImageFont.FreeTypeFont, fill: tuple) -> None:
    box = draw.textbbox((0, 0), text, font=f)
    draw.text(((w - (box[2] - box[0])) / 2 - box[0], y), text, font=f, fill=fill)


def sidebar() -> Image.Image:
    w, h = 164, 314
    img = gradient(w, h, INK_TOP, INK_BOTTOM)
    # A soft parchment glow behind the logo.
    glow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(glow).ellipse((22, 44, w - 22, 44 + w - 44), fill=70)
    img.paste(Image.new('RGB', (w, h), PARCHMENT_DIM), (0, 0), glow.filter(ImageFilter.GaussianBlur(18)))
    mark = logo(116)
    img.paste(mark, ((w - 116) // 2, 52), mark)
    d = ImageDraw.Draw(img)
    centred(d, w, 186, 'NoteGoblin', font('cambriab.ttf', 22), PARCHMENT)
    d.line((40, 220, w - 40, 220), fill=EMBER, width=2)
    centred(d, w, 230, 'for your D&D table', font('cambriai.ttf', 12), PARCHMENT_DIM)
    # An ember edge where the sidebar meets the page.
    d.rectangle((w - 3, 0, w - 1, h), fill=EMBER)
    return img


def header() -> Image.Image:
    w, h = 150, 57
    img = Image.new('RGB', (w, h), PARCHMENT)
    mark = logo(42)
    img.paste(mark, (w - 42 - 8, (h - 42) // 2), mark)
    d = ImageDraw.Draw(img)
    f = font('cambriab.ttf', 17)
    box = d.textbbox((0, 0), 'NoteGoblin', font=f)
    d.text((w - 42 - 14 - (box[2] - box[0]) - box[0], (h - (box[3] - box[1])) / 2 - box[1]), 'NoteGoblin', font=f, fill=INK_TEXT)
    d.rectangle((0, h - 2, w, h), fill=EMBER)
    return img


if __name__ == '__main__':
    sidebar().save(os.path.join(HERE, 'installerSidebar.bmp'))
    sidebar().save(os.path.join(HERE, 'uninstallerSidebar.bmp'))
    header().save(os.path.join(HERE, 'installerHeader.bmp'))
    print('wrote installerSidebar.bmp, uninstallerSidebar.bmp, installerHeader.bmp')
