import json,sys
d={'nodes':{}}
for f in ['design/nodes.json','design/pages.json','design/forms.json']:
    try: d['nodes'].update(json.load(open(f))['nodes'])
    except FileNotFoundError: pass
idx={}
def index(n):
    idx[n['id']]=n
    for c in n.get('children',[]): index(c)
for v in d['nodes'].values(): index(v['document'])
SKIP=('Pattern/Sidebar','Topbar')
def walk(n,out):
    if n.get('visible') is False or n['name'] in SKIP: return
    if n['type']=='TEXT': out.append(n['characters'].replace('\n',' ⏎ '))
    for c in n.get('children',[]): walk(c,out)
out=[]; walk(idx[sys.argv[1]],out); print(' | '.join(out))
