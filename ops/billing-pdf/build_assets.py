"""Build functions/_lib/pdf-assets.js from the firm's letterhead (AWAL_letterhead.docx).

Quotations, invoices, receipts and engagement letters are printed on the real letterhead:
the letterhead itself is converted to PDF (header and footer exactly as designed, nothing
redrawn) and used as the background of every page. So the PDFs match a printed letter.

What it produces:
  TEMPLATES[n]   blank letterhead PDFs with n pages (n = 1..4), so the footer's own
                 "Page x of n" is used; TEMPLATES[0] has no page number (longer documents)
  FONTS          the letterhead's own embedded fonts (DM Sans AGC regular/bold, Fraunces AGC),
                 reduced to WinAnsi characters with widths worked out here, so the Worker can
                 embed them without parsing a font (keeps each PDF to a few ms of CPU)
  HEADER_PNG / FOOTER_PNG   images of the header and footer for the web view of a document
  SIGNATURE_JPG / SEAL_JPG  from functions/_lib/brand-assets.js, flattened onto white

Needs LibreOffice (soffice), poppler (pdftoppm), and: pip install fonttools pillow

  python3 ops/billing-pdf/build_assets.py /path/to/AWAL_letterhead.docx
"""
import base64, io, os, re, subprocess, sys, tempfile, zipfile, zlib, json
from fontTools.ttLib import TTFont
from fontTools import subset
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = sys.argv[1]
WORK = tempfile.mkdtemp(prefix='letterhead-')
BODY_TOP, BODY_BOTTOM = 118, 770   # points from the top: below the header rule, above the footer rule

z = zipfile.ZipFile(SRC)
files = {n: z.read(n) for n in z.namelist()}
doc = files['word/document.xml'].decode()
footer = files['word/footer1.xml'].decode()


# ── 1. Blank letterhead templates ──────────────────────────────────────────
def template(pages, numbers=True):
    i = doc.index('<w:body>') + len('<w:body>'); j = doc.rindex('<w:sectPr')
    body = '<w:p/>' + ''.join('<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>' for _ in range(pages - 1))
    f = footer
    if not numbers:  # drop " Page {PAGE} of {NUMPAGES}" from the footer's last paragraph
        k = f.rindex('<w:r>', 0, f.index('<w:t xml:space="preserve"> Page </w:t>'))
        f = f[:k] + '</w:p></w:ftr>'
    name = os.path.join(WORK, f'T{pages if numbers else 0}.docx')
    with zipfile.ZipFile(name, 'w', zipfile.ZIP_DEFLATED) as w:
        for n, b in files.items():
            w.writestr(n, (doc[:i] + body + doc[j:]).encode() if n == 'word/document.xml' else f.encode() if n == 'word/footer1.xml' else b)
    return name

docs = [template(n) for n in (1, 2, 3, 4)] + [template(1, False)]
subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', WORK] + docs, check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)
templates = {}
for n in (0, 1, 2, 3, 4):
    p = os.path.join(WORK, f'T{n}.pdf')
    pages = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', p], capture_output=True, text=True).stdout).group(1))
    assert pages == max(n, 1), (p, pages)
    templates[n] = open(p, 'rb').read()


# ── 2. Header and footer images for the web view ──────────────────────────
subprocess.run(['pdftoppm', '-r', '200', '-png', os.path.join(WORK, 'T0.pdf'), os.path.join(WORK, 'page')], check=True)
page = Image.open(os.path.join(WORK, 'page-1.png')).convert('RGB')
s = page.width / 595.28
def png(img):
    b = io.BytesIO(); img.quantize(colors=128, method=Image.Quantize.MEDIANCUT).save(b, 'PNG', optimize=True); return b.getvalue()
header_png = png(page.crop((0, 0, page.width, round(112 * s))))
footer_png = png(page.crop((0, round(772 * s), page.width, page.height)))


# ── 3. The letterhead's own fonts, ready to embed ─────────────────────────
ft = files['word/fontTable.xml'].decode()
rels = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', files['word/_rels/fontTable.xml.rels'].decode()))
def embedded(font, kind):
    block = re.search(r'<w:font w:name="%s">(.*?)</w:font>' % re.escape(font), ft, re.S).group(1)
    rid, guid = re.search(r'<w:%s r:id="(rId\d+)" w:fontKey="\{([^}]+)\}"' % kind, block).groups()
    b = bytearray(files['word/' + rels[rid]])
    key = bytes.fromhex(guid.replace('-', ''))[::-1]
    for i in range(32): b[i] ^= key[i % 16]
    return bytes(b)

WINANSI = {}
for code in range(32, 256):
    try: WINANSI[code] = bytes([code]).decode('cp1252')
    except UnicodeDecodeError: pass

def prepare(raw, ps_name):
    f = TTFont(io.BytesIO(raw))
    cmap = f.getBestCmap()
    chars = ''.join(ch for ch in WINANSI.values() if ord(ch) in cmap)
    o = subset.Options(); o.layout_features = []; o.hinting = False; o.notdef_outline = True
    o.name_IDs = [1, 2, 4, 6]; o.drop_tables += ['GSUB', 'GPOS', 'GDEF', 'STAT', 'gasp']
    sub = subset.Subsetter(o); sub.populate(text=chars); sub.subset(f)
    out = io.BytesIO(); f.save(out); data = out.getvalue()
    f = TTFont(io.BytesIO(data)); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
    sc = lambda v: round(v * 1000 / upm)
    widths = [sc(f['hmtx'][cmap[ord(WINANSI[c])]][0]) if c in WINANSI and ord(WINANSI[c]) in cmap else 0 for c in range(32, 256)]
    os2, head, post = f['OS/2'], f['head'], f['post']
    return {
        'name': ps_name, 'file': base64.b64encode(zlib.compress(data, 9)).decode(), 'length1': len(data),
        'widths': widths, 'codes': [ord(WINANSI[c]) for c in range(32, 256) if c in WINANSI and ord(WINANSI[c]) in cmap],
        'bbox': [sc(head.xMin), sc(head.yMin), sc(head.xMax), sc(head.yMax)],
        'ascent': sc(os2.sTypoAscender), 'descent': sc(os2.sTypoDescender), 'capHeight': sc(getattr(os2, 'sCapHeight', 700) or 700),
        'italicAngle': post.italicAngle, 'flags': 32 | (2 if 'Fraunces' in ps_name else 0), 'stemV': 120 if 'Bold' in ps_name else 80,
    }

fonts = {
    'regular': prepare(embedded('DM Sans AGC', 'embedRegular'), 'DMSansAGC-Regular'),
    'bold': prepare(embedded('DM Sans AGC', 'embedBold'), 'DMSansAGC-Bold'),
    'serif': prepare(embedded('Fraunces AGC', 'embedRegular'), 'FrauncesAGC'),
}


# ── 4. Signature and seal ──────────────────────────────────────────────────
brand = open(os.path.join(ROOT, 'functions/_lib/brand-assets.js')).read()
def jpeg(name):
    b64 = re.search(r"export const %s = 'data:image/png;base64,([^']+)'" % name, brand).group(1)
    im = Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGBA')
    bg = Image.new('RGB', im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[3])
    b = io.BytesIO(); bg.save(b, 'JPEG', quality=90, optimize=True); return b.getvalue()


b64 = lambda b: base64.b64encode(b).decode()
out = os.path.join(ROOT, 'functions/_lib/pdf-assets.js')
with open(out, 'w') as w:
    w.write("/**\n * The firm's letterhead and fonts for PDF copies of issued documents (see billing-pdf.js).\n"
            " * Generated by ops/billing-pdf/build_assets.py from AWAL_letterhead.docx: do not edit by hand.\n"
            " * The signature and seal are deliberately not website files.\n */\n")
    w.write(f"export const BODY_TOP = {BODY_TOP};\nexport const BODY_BOTTOM = {BODY_BOTTOM};\n")
    w.write('export const TEMPLATES = {\n' + ''.join(f"  {n}: '{b64(t)}',\n" for n, t in templates.items()) + '};\n')
    w.write('export const FONTS = ' + json.dumps(fonts, separators=(',', ':')) + ';\n')
    w.write(f"export const HEADER_PNG = 'data:image/png;base64,{b64(header_png)}';\n")
    w.write(f"export const FOOTER_PNG = 'data:image/png;base64,{b64(footer_png)}';\n")
    w.write(f"export const SIGNATURE_JPG = '{b64(jpeg('SIGNATURE'))}';\nexport const SEAL_JPG = '{b64(jpeg('SEAL'))}';\n")
print('templates', {n: len(t) for n, t in templates.items()}, 'header', len(header_png), 'footer', len(footer_png),
      'fonts', {k: (v['length1'], len(v['file'])) for k, v in fonts.items()}, 'total', os.path.getsize(out))
