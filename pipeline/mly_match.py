import os
import json, numpy as np, pandas as pd, requests, concurrent.futures as cf, math, time, os, shapely
T=os.environ['MAPILLARY_TOKEN']  # your own Mapillary client token
D='/home/claude/data/'
L=json.load(open('/home/claude/v2/data/layers.json'))['layers']
df=pd.read_parquet(D+'bld_lagos.parquet',columns=['lon','lat','height','area','wkb'])
# target buildings: story items + wiki + bits from layer rules via rebuilding lay quickly from chunks is heavy; recompute from places
targets={}
for l in L:
    for it in l['items']:
        if it['gid']>=0: targets[it['gid']]=('story',l['name'])
wk=json.load(open(D+'wiki/pages.json'))
for v in wk.values(): targets.setdefault(v['gid'],('wiki',v['title']))
import geopandas as g
from scipy.spatial import cKDTree
LON0,LAT0=3.3958,6.4531; KX=111320*np.cos(np.radians(LAT0)); KY=110574.0
X=(df.lon.values-LON0)*KX; Z=-(df.lat.values-LAT0)*KY; tree=cKDTree(np.c_[X,Z])
pl=g.read_parquet(D+'places2.parquet')
cat=pl.basic_category.fillna('')
keep=cat.isin(['historic_site','college_university','government_office','shopping_mall','hotel','hospital','museum','music_venue','arts_and_entertainment','christian_place_of_worship','religious_organization','place_of_learning','elementary_school','bank_or_credit_union'])
pl=pl[keep]
px=(pl.geometry.x.values-LON0)*KX; pz=-(pl.geometry.y.values-LAT0)*KY
d,i=tree.query(np.c_[px,pz],distance_upper_bound=25)
for dd,ii,c in zip(d,i,cat[keep]):
    if np.isfinite(dd): targets.setdefault(int(ii),('place',c))
tall=np.where(df.height.fillna(0).values>=30)[0]
for t in tall: targets.setdefault(int(t),('tall',''))
print('targets',len(targets))
S=requests.Session()
def fetch(gid):
    lon,lat=df.lon.values[gid],df.lat.values[gid]
    dl=0.0007
    for t in range(4):
        try:
            r=S.get('https://graph.mapillary.com/images',params=dict(access_token=T,fields='id,captured_at,compass_angle,computed_geometry,creator,is_pano',bbox=f'{lon-dl},{lat-dl},{lon+dl},{lat+dl}',limit=100),timeout=30)
            if r.status_code==429: time.sleep(5); continue
            return gid, r.json().get('data',[])
        except Exception as e: time.sleep(2)
    return gid, []
best={}
with cf.ThreadPoolExecutor(12) as ex:
    for n,(gid,imgs) in enumerate(ex.map(fetch,list(targets))):
        lon,lat=df.lon.values[gid],df.lat.values[gid]
        cands=[]
        for im in imgs:
            c=(im.get('computed_geometry') or {}).get('coordinates');
            if not c: continue
            dx=(lon-c[0])*KX; dy=(lat-c[1])*KY; dist=math.hypot(dx,dy)
            if dist<6 or dist>70: continue
            brg=(math.degrees(math.atan2(dx,dy))+360)%360
            ang=im.get('compass_angle')
            diff=180 if ang is None else abs((brg-ang+180)%360-180)
            if im.get('is_pano'): diff=min(diff,20)
            if diff>35: continue
            age=(time.time()*1000-im['captured_at'])/3.15e10
            cands.append((dist/70+diff/35+0.08*age, im, dist))
        if cands:
            cands.sort(key=lambda x:x[0]); s,im,dist=cands[0]
            best[gid]=dict(id=im['id'],t=im['captured_at'],by=(im.get('creator') or {}).get('username',''),d=round(dist),kind=targets[gid][0],pano=bool(im.get('is_pano')))
        if n%500==0: print(n,len(best),flush=True)
json.dump({str(k):v for k,v in best.items()},open(D+'mly/match.json','w'))
print('matched',len(best),'of',len(targets))
