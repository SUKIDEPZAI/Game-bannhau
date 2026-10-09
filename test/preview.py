import json, math, sys
from PIL import Image, ImageDraw
D = json.load(open('/home/claude/preview.json')); S = 2; N = 640 * S
def col(c, a):
    c = c.lstrip('#'); 
    if len(c) == 3: c = ''.join(x*2 for x in c)
    return (int(c[0:2],16), int(c[2:4],16), int(c[4:6],16), int(255*max(0,min(1,a))))
def parse(c, a):
    if c.startswith('rgba'):
        v = [float(x) for x in c[5:-1].split(',')]; return (int(v[0]),int(v[1]),int(v[2]), int(255*v[3]*a))
    return col(c, a)
def render(cmds, path):
    img = Image.new('RGBA', (N, N), (22, 32, 44, 255)); path_pts = []; cur = None; subs = []
    def flush_layer(kind, st):
        lay = Image.new('RGBA', (N, N), (0,0,0,0)); d = ImageDraw.Draw(lay)
        c = parse(st['f'] if kind == 'fill' else st['s'], st['a'])
        for sp in subs:
            if sp[0] == 'circle':
                _, x, y, r, a0, a1 = sp
                if abs(a1 - a0) >= 6.28:
                    bb = [(x-r)*S, (y-r)*S, (x+r)*S, (y+r)*S]
                    d.ellipse(bb, fill=c) if kind == 'fill' else d.ellipse(bb, outline=c, width=max(1,int(st['w']*S)))
                else:
                    bb = [(x-r)*S, (y-r)*S, (x+r)*S, (y+r)*S]; d.arc(bb, math.degrees(a0), math.degrees(a1), fill=c, width=max(1,int(st['w']*S)))
            else:
                pts = [(px*S, py*S) for px, py in sp[1]]
                if kind == 'fill' and len(pts) > 2: d.polygon(pts, fill=c)
                elif kind == 'stroke' and len(pts) > 1:
                    d.line(pts, fill=c, width=max(1,int(st['w']*S)), joint='curve')
                    for p in (pts[0], pts[-1]):
                        rr = max(1, st['w']*S/2); d.ellipse([p[0]-rr,p[1]-rr,p[0]+rr,p[1]+rr], fill=c)
        return Image.alpha_composite(img, lay)
    poly = None
    for k, a, st in cmds:
        if k == 'beginPath': subs = []; poly = None
        elif k == 'moveTo': poly = ('poly', [(a[0], a[1])]); subs.append(poly)
        elif k == 'lineTo':
            if poly is None: poly = ('poly', []); subs.append(poly)
            poly[1].append((a[0], a[1]))
        elif k == 'arc': subs.append(('circle', a[0], a[1], a[2], a[3], a[4])); poly = None
        elif k == 'closePath': pass
        elif k == 'fill': img = flush_layer('fill', st)
        elif k == 'stroke': img = flush_layer('stroke', st)
    img.resize((640, 640), Image.LANCZOS).convert('RGB').save(path)
for name, cmds in D.items(): render(cmds, f'/home/claude/prev_{name}.png')
# ghép
names = list(D.keys()); sheet = Image.new('RGB', (640*2, 640*2))
for i, n in enumerate(names): sheet.paste(Image.open(f'/home/claude/prev_{n}.png'), ((i%2)*640, (i//2)*640))
sheet.resize((960, 960)).save('/home/claude/prev_sheet.png'); print('ok', names)
