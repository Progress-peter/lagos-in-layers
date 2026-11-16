import numpy as np, pandas as pd, geopandas as g, shapely, json, gzip, os, struct, mapbox_earcut as ec
from scipy.spatial import cKDTree
D='/home/claude/data/'; O='/home/claude/v2/data/'
LON0,LAT0=3.3958,6.4531
KX=111320*np.cos(np.radians(LAT0)); KY=110574.0
def loc(lon,lat): return (np.asarray(lon)-LON0)*KX, -(np.asarray(lat)-LAT0)*KY
pad4=lambda b: b+b'\0'*(-len(b)%4)

df=pd.read_parquet(D+'bld_lagos.parquet',columns=['height','floors','src','lon','lat','lga','wkb','area','name'])
N=len(df)
year=np.load(D+'year_final.npy'); flag=np.load(D+'flag_final.npy'); period=np.load(D+'period_final.npy')
hr=np.load(D+'hgt.npy')
lgas=g.read_file(D+'lgas.geojson')
h=df.height.to_numpy(float).copy(); fl=df.floors.to_numpy(float)
m=np.isnan(h)&~np.isnan(fl); h[m]=fl[m]*3.2
m=np.isnan(h); hh=np.nan_to_num(hr,nan=0); h[m]=np.where(hh[m]>=2.5,hh[m],3.0)
h=np.clip(h,2.5,300)
srcmap={'OpenStreetMap':0,'Google Open Buildings':1,'Microsoft ML Buildings':2}
src=df.src.map(srcmap).fillna(0).astype(np.uint8).to_numpy()
lga=df.lga.to_numpy().astype(np.uint8)
area=np.clip(np.round(df.area.to_numpy()),0,65535).astype(np.uint16)

# ---------- layers ----------
lay=np.zeros(N,np.uint32)
stories=json.load(open('/home/claude/site/stories.json'))
X,Z=loc(df.lon.values,df.lat.values)
tree=cKDTree(np.c_[X,Z])
geoms=shapely.from_wkb(df.wkb.to_numpy())
import re
names=df.name.fillna('').str.lower().to_numpy()
def toks(s): return set(w for w in re.findall(r'[a-z]+',s.lower()) if len(w)>3 and w not in ('lagos','nigeria','church','approximate','building','house','national'))
year=year.copy(); flag=flag.copy(); period=period.copy(); DOC={}
for li,L in enumerate(stories):
    for it in L['items']:
        x,z=loc(it['lon'],it['lat']); pt=shapely.Point(it['lon'],it['lat'])
        near=tree.query_ball_point([x,z],400)
        tk=toks(it['name']); best=None
        for i in near:
            if names[i] and tk and len(tk & toks(names[i]))>=max(1,len(tk)//2): 
                d=(X[i]-x)**2+(Z[i]-z)**2
                if best is None or d<best[0]: best=(d,i)
        contained=False
        if best: gid=best[1]
        else:
            idx=sorted(tree.query_ball_point([x,z],70),key=lambda i:(X[i]-x)**2+(Z[i]-z)**2)
            inside=[i for i in idx if geoms[i].contains(pt)]
            contained=bool(inside); gid=inside[0] if inside else (idx[0] if idx else -1)
        if 'approximate' in it['name']: gid=-1
        it['gid']=int(gid)
        if gid>=0:
            lay[gid]|=1<<li
            gx_,gz_=X[gid],Z[gid]; it['x']=round(float(gx_),1); it['z']=round(float(gz_),1)
            m=re.search(r'(1[6-9]\d\d|20[0-2]\d)',it['year'] or '')
            BLD={'Iga Idunganran','Cathedral Church of Christ, Marina','Holy Cross Cathedral','Seriki Williams Abass Slave Museum','First Storey Building in Nigeria','Independence House','National Stadium, Surulere','National Theatre, Iganmu','Kalakuta Museum','Dangote Refinery','Iddo Terminus'}
            if m and (best or contained) and 'approximate' not in it['name'] and it['name'] not in ('Eko Atlantic','Makoko','Campos Square','Freedom Park','Kalakuta Museum','New Afrika Shrine'):
                yy=int(re.findall(r'(1[6-9]\d\d|20[0-2]\d)',it['year'])[-1])
                DOC[gid]=yy
        else: it['x']=round(float(x),1); it['z']=round(float(z),1)
        print(it['name'], gid, names[gid] if gid>=0 else '', year[gid] if gid>=0 else '')
lay[h>=30]|=1<<7
divs=g.read_parquet(D+'divs.parquet'); divs['name']=divs.names.apply(lambda n:n['primary'])
for bit,nm in ((8,'Eko Atlantic'),(9,'Banana Island')):
    poly=divs[divs.name==nm].geometry.iloc[0]; shapely.prepare(poly)
    lay[shapely.contains_xy(poly,df.lon.values,df.lat.values)]|=1<<bit

# ---------- layers from Overture places (point -> nearest building within 25 m) ----------
pl_=g.read_parquet(D+'places2.parquet'); pl_['nm']=pl_.names.apply(lambda n:(n or {}).get('primary') or '')
px_,pz_=loc(pl_.geometry.x.values,pl_.geometry.y.values)
dd_,ii_=tree.query(np.c_[px_,pz_],distance_upper_bound=25)
pl_['gid']=np.where(np.isfinite(dd_),ii_,-1)
pl_=pl_[pl_.gid>=0]
cat=pl_.basic_category.fillna(''); nm=pl_.nm.str.lower()
MOS=nm.str.contains('mosque|masjid|islam|ansar|nasrul|jamaat|jama|muslim|quran|zumratul')
RULES={10:(cat.eq('christian_place_of_worship')|(cat.eq('religious_organization')&nm.str.contains('church|chapel|parish|cathedral|assembly|ministr|redeemed|cherubim|apostolic|baptist|anglican|catholic|methodist|tabernacle'))),
 11:((cat.isin(['religious_organization','mosque','muslim_place_of_worship']))&MOS),
 12:cat.isin(['elementary_school','place_of_learning','education','specialty_school','educational_service','high_school','school','middle_school','preschool']),
 13:cat.eq('college_university'),
 14:cat.isin(['hospital','health_care','clinic','medical_center']),
 15:cat.eq('historic_site'),
 16:cat.isin(['hotel','lodging']),
 17:cat.isin(['shopping_mall','shopping','market','marketplace']),
 18:cat.isin(['music_venue','arts_and_entertainment','museum','theatre','art_gallery']),
 20:cat.eq('government_office')}
for bit,m in RULES.items():
    lay[pl_.gid.values[m.values]]|=np.uint32(1<<bit)
    print('rule',bit,int(m.sum()))
wk=json.load(open(D+'wiki/pages.json'))
for v in wk.values(): lay[v['gid']]|=np.uint32(1<<19)
# ---------- geometry ----------
ext=[]
parts,pidx=shapely.get_parts(geoms,return_index=True)
pa=shapely.area(parts); order=np.lexsort((-pa,pidx)); _,fi=np.unique(pidx[order],return_index=True)
poly=parts[order][fi]
ring=shapely.get_exterior_ring(poly)
ring=shapely.simplify(ring,3.5e-6,preserve_topology=False)
coords,ridx=shapely.get_coordinates(ring,return_index=True)
nv=np.bincount(ridx,minlength=N)
starts=np.r_[0,np.cumsum(nv)[:-1]]
keep=np.ones(len(coords),bool); keep[starts+nv-1]=False
coords=coords[keep]; nv=nv-1; starts=np.r_[0,np.cumsum(nv)[:-1]]
cx,cz=loc(coords[:,0],coords[:,1])
valid=(nv>=3)&(nv<=250)
# ---------- periods from the 2025 State of Lagos Housing Market Report ----------
QUOTA=[325000,457119,376813,88656,928895]
PBOUND=[(1966,1975),(1976,2000),(2001,2010),(2011,2015),(2016,2025)]
S_all=np.load(D+'ghsl_all.npy').astype(float)   # built surface per epoch 1975..2020
pres=np.load(D+'pres.npy'); mxp=np.nanmax(np.where(pres<0,np.nan,pres),1); mxp=np.nan_to_num(mxp)
ep=np.arange(1975,2025,5)
y0=year.astype(float)
# tie-break inside an estimate: the more built-up the surrounding block already was, the older
ei=np.clip(np.searchsorted(ep,np.where(flag==1,year,1975)),0,len(ep)-1)
dens=S_all[np.arange(N),ei]/10000.0
score=np.where(flag==0, y0+0.5, y0+0.98-0.97*np.clip(dens,0,1))
und=(flag==2)
total=int(valid.sum()); n_undated=total-sum(QUOTA)
cand=np.where(valid&und)[0]
cand=cand[np.argsort(mxp[cand])]          # least visible to the satellites first
nd=cand[:n_undated]; rest_und=cand[n_undated:]
score[rest_und]=2024.5
newp=np.full(N,7,np.uint8); newy=np.zeros(N,np.int16); newf=flag.copy()
docs=[g_ for g_ in DOC if valid[g_]]
q=QUOTA.copy()
for g_ in docs:
    yy=DOC[g_]; pi=next(i for i,(a,b) in enumerate(PBOUND) if yy<=b) if yy<=2025 else 4
    newp[g_]=pi; newy[g_]=yy; newf[g_]=3; q[pi]-=1
mask=valid.copy(); mask[nd]=False; mask[docs]=False
order=np.where(mask)[0]; order=order[np.argsort(score[order],kind='stable')]
assert len(order)==sum(q), (len(order),sum(q))
pos=0
for pi,(a,b) in enumerate(PBOUND):
    ids=order[pos:pos+q[pi]]; pos+=q[pi]
    newp[ids]=pi
    yrs=np.arange(a,b+1); w=1.0392**(yrs-a); cw=np.cumsum(w)/w.sum()
    r=(np.arange(len(ids))+0.5)/max(len(ids),1)
    synth=yrs[np.searchsorted(cw,r)]
    keep=(flag[ids]==0)&(year[ids]>=a)&(year[ids]<=b)
    newy[ids]=np.where(keep,year[ids],synth)
    newf[ids]=np.where(keep,0,1)
newf[nd]=2; newy[nd]=0
year,flag,period=newy,newf,newp
print('period counts',np.bincount(period[valid],minlength=8))
print('dropped',(~valid).sum())

CS=0.05; X0=2.65; Y0=6.30
ci=((df.lon.values-X0)//CS).astype(int); cj=((df.lat.values-Y0)//CS).astype(int)
key=ci*100+cj
index=[]; os.makedirs(O+'chunks',exist_ok=True)
for k in np.unique(key[valid]):
    ids=np.where((key==k)&valid)[0]
    i,j=divmod(int(k),100)
    ox,oz=loc(X0+(i+.5)*CS, Y0+(j+.5)*CS); ox,oz=float(ox),float(oz)
    xs=[];tris=[]
    for b in ids:
        s=starts[b]; n=nv[b]
        px=cx[s:s+n]; pz=cz[s:s+n]
        t=ec.triangulate_float64(np.c_[px,pz],np.array([n],np.uint32))
        if len(t)!=3*(n-2):  # degenerate: fan
            t=np.array([[0,q,q+1] for q in range(1,n-1)]).ravel()
        tris.append(t.astype(np.uint8))
        xs.append(np.c_[px-ox,pz-oz])
    V=np.round(np.concatenate(xs)*4).clip(-32767,32767).astype('<i2')
    T=np.concatenate(tris)
    nB=len(ids); nV=len(V); nT=len(T)//3
    out=struct.pack('<3I2f',nB,nV,nT,ox,oz)
    out+=pad4(ids.astype('<u4').tobytes())
    out+=pad4(year[ids].astype('<i2').tobytes())+pad4(np.round(h[ids]*10).astype('<u2').tobytes())
    out+=pad4(area[ids].astype('<u2').tobytes())+pad4(lay[ids].astype('<u4').tobytes())
    for arr in (period[ids],flag[ids],lga[ids],src[ids],nv[ids].astype(np.uint8)): out+=pad4(arr.astype('u1').tobytes())
    out+=pad4(V.tobytes())+pad4(T.tobytes())
    fn=f'c{i}_{j}.wasm'
    open(O+'chunks/'+fn,'wb').write(gzip.compress(out,6))
    x0,z0=loc(X0+i*CS,Y0+(j+1)*CS); x1,z1=loc(X0+(i+1)*CS,Y0+j*CS)
    index.append(dict(f=fn,n=int(nB),b=[round(float(x0)),round(float(z0)),round(float(x1)),round(float(z1))],c=[round(ox),round(oz)]))
tot=sum(os.path.getsize(O+'chunks/'+c['f']) for c in index); print('chunks',len(index),tot/1e6,'MB')

# ---------- overview cells (440 m) ----------
G=440.0
gx=np.floor(X/G).astype(int); gz=np.floor(Z/G).astype(int)
cell=pd.DataFrame({'gx':gx,'gz':gz,'p':period,'h':h})
cnt=cell.groupby(['gx','gz','p']).size().unstack(fill_value=0).reindex(columns=range(8),fill_value=0)
mh=cell.groupby(['gx','gz']).h.mean()
cnt=cnt[cnt.sum(1)>=3]
ov=np.zeros((len(cnt),11),np.float32)
ov[:,0]=(cnt.index.get_level_values(0)+.5)*G; ov[:,1]=(cnt.index.get_level_values(1)+.5)*G
ov[:,2:10]=np.minimum(cnt.values,65535); ov[:,10]=mh.reindex(cnt.index).values
open(O+'overview.wasm','wb').write(gzip.compress(struct.pack('<I',len(ov))+ov.tobytes(),6))
print('cells',len(ov))

# ---------- histogram ----------
hist={}
dfh=pd.DataFrame({'y':np.maximum(year[valid],1966),'p':period[valid]}); dfh=dfh[dfh.p<7]
for (y_,p_),c in dfh.groupby(['y','p']).size().items():
    hist.setdefault(int(y_),[0]*5); hist[int(y_)][int(p_)]+=int(c)


PERIODS=[("Before 1976","Colonial and early Independence Lagos",1900,1975,"#7b2d26"),
 ("1976–2000","Early urban expansion",1976,2000,"#c8642c"),
 ("2001–2010","Megacity sprawl",2001,2010,"#e3a83a"),
 ("2011–2015","Lekki Corridor / Eko Atlantic",2011,2015,"#2f8f83"),
 ("2016–2025","Recent urban expansion",2016,2025,"#3b4cc0")]
counts=np.bincount(period[valid],minlength=8).tolist()

# ---------- land / water ----------
def tri_polys(geom,tol):
    geom=shapely.simplify(geom,tol); P=[];I=[]
    for p in getattr(geom,'geoms',[geom]):
        if p.geom_type!='Polygon' or p.is_empty: continue
        rings=[np.array(p.exterior.coords)[:-1]]+[np.array(r.coords)[:-1] for r in p.interiors if len(r.coords)>3]
        pts=np.concatenate(rings); ends=np.cumsum([len(r) for r in rings]).astype(np.uint32)
        x,z=loc(pts[:,0],pts[:,1]); t=ec.triangulate_float64(np.c_[x,z],ends)
        base=sum(len(q) for q in P); P.append(np.c_[x,z]); I.append(t+base)
    if not P: return np.zeros((0,2)),np.zeros(0,np.uint32)
    return np.concatenate(P),np.concatenate(I)
def write_mesh(fn,geoms,tol):
    Ps=[];Is=[];off=0
    for gm in geoms:
        p,i=tri_polys(gm,tol); Ps.append(p); Is.append(i+off); off+=len(p)
    P=np.concatenate(Ps).astype('<f4'); I=np.concatenate(Is).astype('<u4')
    open(O+fn,'wb').write(gzip.compress(struct.pack('<2I',len(P),len(I))+P.tobytes()+I.tobytes(),6)); print(fn,len(P),len(I)//3)
box=shapely.box(2.3,6.0,4.8,7.1)
lag=divs[(divs.subtype=='county')&(divs.region=='NG-LA')].geometry.tolist()
oth=[gm.intersection(box) for gm in divs[((divs.subtype=='region')&(divs.region!='NG-LA'))|((divs.subtype=='country')&(divs['class']=='land')&(divs.country!='NG'))].geometry]
write_mesh('land.wasm',lag+oth,0.00012)
w=g.read_parquet(D+'water.parquet'); w=w[w.geometry.geom_type.isin(['Polygon','MultiPolygon'])&w.subtype.isin(['river','water','lake','canal','pond'])]
write_mesh('water.wasm',list(w.geometry),0.00005)
# LGA boundaries as lines
lines=[]
for nm,gm in zip(lgas.name,lgas.geometry):
    for p in getattr(gm,'geoms',[gm]):
        c=np.array(shapely.simplify(p,0.0002).exterior.coords); x,z=loc(c[:,0],c[:,1]); lines.append([[round(a,1),round(b,1)] for a,b in zip(x,z)])

# ---------- labels ----------
dp=g.read_parquet(D+'divpts.parquet'); dp=dp[dp.country=='NG']; dp['name']=dp.names.apply(lambda n:n['primary'] if n else None)
allg=shapely.union_all(list(lgas.geometry)); shapely.prepare(allg)
dp=dp[dp.subtype.isin(['macrohood','neighborhood','locality'])&shapely.contains_xy(allg,dp.geometry.x,dp.geometry.y)]
labels=[]
for nm,gm in zip(lgas.name,lgas.geometry):
    rp=gm.representative_point(); x,z=loc(rp.x,rp.y); labels.append(dict(n=nm.upper(),x=round(float(x)),z=round(float(z)),t=0))
for nm,st,gm in zip(dp.name,dp.subtype,dp.geometry):
    x,z=loc(gm.x,gm.y); labels.append(dict(n=nm,x=round(float(x)),z=round(float(z)),t=1 if st=='macrohood' else 2))
print('labels',len(labels))

# ---------- search ----------
pl=g.read_parquet(D+'places2.parquet'); pl['name']=pl.names.apply(lambda n:n['primary'] if n else None)
pl=pl[pl.name.notna()&(pl.confidence>=0.75)&shapely.contains_xy(allg,pl.geometry.x,pl.geometry.y)]
pl['cat']=pl.basic_category.fillna('')
pl=pl.drop_duplicates('name')
px,pz=loc(pl.geometry.x.values,pl.geometry.y.values)
search=[[n,c.replace('_',' '),round(float(a)),round(float(b))] for n,c,a,b in zip(pl.name,pl['cat'],px,pz)]
for L in labels: search.append([L['n'].title() if L['t']==0 else L['n'],'LGA' if L['t']==0 else 'area',L['x'],L['z']])
open(O+'search.json','w').write(json.dumps(search,separators=(',',':'),ensure_ascii=False)); print('search',len(search))

# ---------- layers json ----------
def yrs(mask):
    s=pd.Series(year[mask&(period<7)&valid]).value_counts(); return {int(k):int(v) for k,v in s.items()}
layers=[]
cnt=lambda b:int(((((lay>>b)&1)==1)&(period<7)&valid).sum())
ERA={'eko':'1670–1960','aguda':'1880s–1890s','badagry':'1736–1880s','nation':'1961–1976','fela':'1970–2012','water':'1800s–1990','edge':'2009–2023'}
CATS=[('colony','Old Eko and the colony'),('slave','The slave trade'),('nation','Independence and the state'),('faith','Faith and community'),
      ('learn','Learning and health'),('arts','Arts and music'),('trade','Trade and leisure'),('water','Water and land'),('modern','The modern city')]
STORYCAT={'eko':'colony','aguda':'colony','badagry':'slave','nation':'nation','fela':'arts','water':'water','edge':'modern'}
for li,L in enumerate(stories):
    layers.append(dict(id=L['id'],cat=STORYCAT[L['id']],name=L['name'],era=ERA[L['id']],intro=L['blurb'],kind='stories',groups=[dict(bit=li,label=L['name'],n=cnt(li))],
        items=[{k:it[k] for k in ('name','year','text','source','url','gid','x','z','lat','lon')} for it in L['items']]))
def rule(id_,cat_,name,era,intro,groups):
    layers.append(dict(id=id_,cat=cat_,name=name,era=era,intro=intro,kind='rule',groups=[dict(bit=b,label=l,n=cnt(b)) for b,l in groups],items=[]))
rule('historic','colony','Historic sites','All periods','Buildings at places listed as historic sites in Overture Maps.',[(15,'Historic site')])
rule('gov','nation','Government offices','All periods','Buildings holding a government office, from Overture Maps places.',[(20,'Government office')])
rule('worship','faith','Churches and mosques','All periods','Places of worship from Overture Maps, each matched to the nearest building within 25 m.',[(10,'Churches'),(11,'Mosques')])
rule('schools','learn','Schools','All periods','Schools from Overture Maps places.',[(12,'Schools')])
rule('unis','learn','Universities and colleges','All periods','Universities, polytechnics and colleges from Overture Maps places.',[(13,'Universities and colleges')])
rule('health','learn','Hospitals and clinics','All periods','Hospitals and health centres from Overture Maps places.',[(14,'Hospitals and clinics')])
rule('venues','arts','Music, arts and museums','All periods','Music venues, galleries, theatres and museums from Overture Maps places.',[(18,'Venues')])
rule('markets','trade','Markets and malls','All periods','Shopping malls and markets from Overture Maps places.',[(17,'Markets and malls')])
rule('hotels','trade','Hotels','All periods','Hotels and lodgings from Overture Maps places.',[(16,'Hotels')])
rule('reclaimed','water','Land from water','1990s–today','Districts built on land made from water: Banana Island, an artificial island off Ikoyi, and Eko Atlantic, sand pumped from the sea in front of Bar Beach.',[(8,'Eko Atlantic'),(9,'Banana Island')])
rule('tall','modern','High-rises','1961–today','Buildings 30 m and taller: about ten storeys or more.',[(7,'30 m and taller')])
rule('wiki','modern','Buildings on Wikipedia','All periods','Buildings with their own Wikipedia article, with its opening lines on each card.',[(19,'On Wikipedia')])
order={c:i for i,(c,_) in enumerate(CATS)}
layers.sort(key=lambda L: order[L['cat']])
for L in layers:
    for gr in L['groups']: gr['years']=yrs(((lay>>gr['bit'])&1)==1)
config=dict(origin=[LON0,LAT0],kx=KX,ky=KY,periods=[dict(label=a,era=b,from_=c,to=d,color=e,n=counts[i]) for i,(a,b,c,d,e) in enumerate(PERIODS)],
    undated=counts[7],housing=dict(total=2176483,source='2025 State of Lagos Housing Market Report'),yearMin=1966,yearMax=2025,histogram=hist,chunks=index,stats=dict(buildings=int(valid.sum()),exact=int((flag==0).sum()),approx=int((flag==1).sum()),undated=int((flag==2).sum())),
    lgas=lgas.name.tolist(),lines=lines,labels=labels,
    home=dict(x=round(float(loc(3.428,6.437)[0])),z=round(float(loc(3.428,6.437)[1])),azimuth=200,elevation=34,dist=6200),
    state=dict(x=round(float(loc(3.52,6.53)[0])),z=round(float(loc(3.52,6.53)[1])),azimuth=180,elevation=52,dist=150000))
open(O+'config.json','w').write(json.dumps(config,separators=(',',':'),ensure_ascii=False).replace('"from_"','"from"'))
open(O+'layers.json','w').write(json.dumps(dict(cats=[dict(id=a,name=b) for a,b in CATS],layers=layers),separators=(',',':'),ensure_ascii=False))
print('done', counts)
