import os
import json, requests, io, os, time, concurrent.futures as cf, numpy as np, pandas as pd
from PIL import Image
T=os.environ['MAPILLARY_TOKEN']  # your own Mapillary client token
D='/home/claude/data/mly/'; O='/home/claude/v2/data/'
best=json.load(open(D+'match.json'))
os.makedirs(D+'img',exist_ok=True)
S=requests.Session()
ids=[v['id'] for v in best.values() if not os.path.exists(D+'img/'+v['id']+'.jpg')]
print('to fetch',len(ids),flush=True)
urls={}
for k in range(0,len(ids),50):
    b=ids[k:k+50]
    for t in range(4):
        r=S.get('https://graph.mapillary.com/',params=dict(ids=','.join(b),fields='thumb_1024_url',access_token=T),timeout=60)
        if r.ok: break
        time.sleep(3)
    for i,v in r.json().items():
        if isinstance(v,dict) and v.get('thumb_1024_url'): urls[i]=v['thumb_1024_url']
print('urls',len(urls),flush=True)
def dl(i):
    for t in range(3):
        try:
            r=S.get(urls[i],timeout=60)
            if r.ok:
                im=Image.open(io.BytesIO(r.content)).convert('RGB'); im.thumbnail((440,330))
                im.save(D+'img/'+i+'.jpg','JPEG',quality=68,optimize=True,progressive=True); return True
        except Exception as e: time.sleep(2)
    return False
ok=0
with cf.ThreadPoolExecutor(10) as ex:
    for n,r in enumerate(ex.map(dl,list(urls))):
        ok+=r
        if n%300==0: print(n,ok,flush=True)
print('downloaded',ok)
# pack by chunk
df=pd.read_parquet('/home/claude/data/bld_lagos.parquet',columns=['lon','lat'])
CS=0.05; X0=2.65; Y0=6.30
os.makedirs(O+'photos',exist_ok=True)
packs={}; index={}
for gid,v in best.items():
    f=D+'img/'+v['id']+'.jpg'
    if not os.path.exists(f): continue
    g=int(gid); i=int((df.lon.values[g]-X0)//CS); j=int((df.lat.values[g]-Y0)//CS)
    packs.setdefault(f'm{i}_{j}',[]).append((gid,v,open(f,'rb').read()))
for name,items in packs.items():
    blob=bytearray()
    for gid,v,b in items:
        index[gid]=dict(p=name,o=len(blob),l=len(b),y=time.strftime('%Y',time.gmtime(v['t']/1000)),by=v['by'],id=v['id'])
        blob+=b
    open(O+'photos/'+name+'.wasm','wb').write(blob)
json.dump(index,open(O+'mly.json','w'),separators=(',',':'))
tot=sum(os.path.getsize(O+'photos/'+n+'.wasm') for n in packs)
print('packs',len(packs),'photos',len(index),'MB',tot/1e6)
