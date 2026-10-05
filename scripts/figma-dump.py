import json,sys
import glob
d={'nodes':{}}
for f in ['design/nodes.json','design/pages.json','design/dash.json']:
    try: d['nodes'].update(json.load(open(f))['nodes'])
    except FileNotFoundError: pass
idx={}
def index(n):
    idx[n['id']]=n
    for c in n.get('children',[]): index(c)
for v in d['nodes'].values(): index(v['document'])
def col(p):
    if p.get('visible') is False: return None
    if p['type']=='SOLID':
        c=p['color'];a=p.get('opacity',1)*c.get('a',1)
        h='#%02x%02x%02x'%(round(c['r']*255),round(c['g']*255),round(c['b']*255))
        bv=p.get('boundVariables',{}).get('color')
        return h+('' if a==1 else '@%.2f'%a)
    return p['type']
def desc(n):
    bb=n.get('absoluteBoundingBox') or {}
    parts=[n['type'],repr(n['name'][:40]),'%sx%s'%(round(bb.get('width',0)),round(bb.get('height',0)))]
    f=[col(p) for p in n.get('fills',[]) if col(p)]
    if f: parts.append('fill='+','.join(f))
    s=[col(p) for p in n.get('strokes',[]) if col(p)]
    if s: parts.append('stroke=%s/%s'%(','.join(s),n.get('strokeWeight')))
    if n.get('cornerRadius'): parts.append('r=%s'%n['cornerRadius'])
    if n.get('layoutMode'): parts.append('%s gap=%s pad=%s,%s,%s,%s align=%s/%s'%(n['layoutMode'],n.get('itemSpacing',0),n.get('paddingTop',0),n.get('paddingRight',0),n.get('paddingBottom',0),n.get('paddingLeft',0),n.get('primaryAxisAlignItems'),n.get('counterAxisAlignItems')))
    if n['type']=='TEXT':
        st=n['style'];parts.append('txt=%r %s/%s/%s'%(n['characters'][:30],st['fontFamily'],st['fontWeight'],st['fontSize']))
    if n.get('effects'): parts.append('fx=%s'%[(e['type'],e.get('radius'),col(e) if 'color' in e and False else '') for e in n['effects'] if e.get('visible',True)])
    if n['type'] in('INSTANCE','COMPONENT') and n.get('componentProperties'):
        parts.append('props=%s'%{k:v['value'] for k,v in n['componentProperties'].items()})
    return ' '.join(parts)
def walk(n,depth,maxd):
    print('  '*depth+n['id']+' '+desc(n))
    if depth<maxd:
        for c in n.get('children',[]): walk(c,depth+1,maxd)
nid=sys.argv[1]; maxd=int(sys.argv[2]) if len(sys.argv)>2 else 99
walk(idx[nid],0,maxd)
