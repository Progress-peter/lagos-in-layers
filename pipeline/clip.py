import geopandas as g, pandas as pd, numpy as np, shapely, pyarrow.parquet as pq, gc
lgas=g.read_file('lgas.geojson'); [shapely.prepare(p) for p in lgas.geometry]
pf=pq.ParquetFile('bld_raw.parquet'); out=[]
for t in pf.iter_batches(200000,columns=['id','geometry','height','num_floors','class','names','sources']):
    geom=shapely.from_wkb(t.column('geometry').to_numpy(zero_copy_only=False))
    c=shapely.centroid(geom); lon=shapely.get_x(c); lat=shapely.get_y(c)
    lga=np.full(len(geom),-1,np.int16)
    for i,p in enumerate(lgas.geometry): lga[shapely.contains_xy(p,lon,lat)]=i
    k=np.where(lga>=0)[0]; t=t.take(k); geom=geom[k]
    df=pd.DataFrame({'id':t.column('id').to_numpy(zero_copy_only=False),'height':t.column('height').to_pandas().to_numpy(),
     'floors':t.column('num_floors').to_pandas().to_numpy(),'cls':t.column('class').to_numpy(zero_copy_only=False),
     'name':[n['primary'] if n else None for n in t.column('names').to_pylist()],
     'src':[s[0]['dataset'] if s else None for s in t.column('sources').to_pylist()],
     'lon':lon[k],'lat':lat[k],'lga':lga[k]})
    df['wkb']=shapely.to_wkb(geom)
    sc=np.array([110574*np.cos(np.radians(6.5)),110574])
    df['area']=shapely.area(shapely.transform(geom, lambda xy: xy*sc))
    out.append(df); gc.collect()
df=pd.concat(out,ignore_index=True); print(len(df))
print(df.lga.map(dict(enumerate(lgas.name))).value_counts()); print(df.src.value_counts()); print('height',df.height.notna().sum(),'floors',df.floors.notna().sum()); print(df.height.describe()); print('named',df.name.notna().sum()); print(df.cls.value_counts().head(12)); print(df.area.describe())
df.to_parquet('bld_lagos.parquet')
