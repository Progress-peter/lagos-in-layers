import rasterio as r, numpy as np, pandas as pd, json, sys, os, time, concurrent.futures as cf
from pyproj import Transformer
os.environ['GDAL_DISABLE_READDIR_ON_OPEN']='EMPTY_DIR'; os.environ['GDAL_HTTP_MULTIRANGE']='YES'; os.environ['GDAL_HTTP_MERGE_CONSECUTIVE_RANGES']='YES'; os.environ['VSI_CACHE']='FALSE'
df=pd.read_parquet('bld_lagos.parquet',columns=['lon','lat'])
tr=Transformer.from_crs(4326,32631,always_xy=True); E,N=tr.transform(df.lon.values,df.lat.values)
sel=json.load(open('tiles_sel.json'))
OV=int(sys.argv[1])
years=list(range(2016,2024))
pres=np.full((len(df),8),np.nan,np.float32); hgt=np.full(len(df),np.nan,np.float32)
def job(args):
    u,yi=args; y=years[yi]
    url='/vsicurl/https://storage.googleapis.com/'+u[5:].replace('_2023_06_30',f'_{y}_06_30')
    with r.open(url, overview_level=OV) as d:
        b=d.bounds; m=(E>=b.left)&(E<b.right)&(N>b.bottom)&(N<=b.top); idx=np.where(m)[0]
        if len(idx)==0: return u,yi,idx,None,None
        T=~d.transform; cc,rr=T*(E[idx],N[idx]); rows=np.floor(rr).astype(int); cols=np.floor(cc).astype(int); rows=np.clip(rows,0,d.height-1); cols=np.clip(cols,0,d.width-1)
        p=d.read(3)[rows,cols]
        h=d.read(2)[rows,cols] if y==2023 else None
    return u,yi,idx,p,h
# tiles with buildings
need=[]
for u,_,bb in sel:
    pass
jobs=[(u,yi) for u,_,_ in sel for yi in range(8)]
if len(sys.argv)>2: jobs=jobs[:int(sys.argv[2])]
t0=time.time(); n=0
with cf.ThreadPoolExecutor(6) as ex:
    for u,yi,idx,p,h in ex.map(job,jobs):
        n+=1
        if p is not None:
            v=p>=0; pres[idx[v],yi]=p[v]
            if h is not None:
                v=h>=0; hgt[idx[v]]=h[v]
        if n%20==0: print(n,len(jobs),round(time.time()-t0),flush=True)
np.save('pres.npy',pres); np.save('hgt.npy',hgt); print('done',time.time()-t0)
