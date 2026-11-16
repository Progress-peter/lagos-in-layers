import numpy as np, pandas as pd, rasterio as r, glob
df=pd.read_parquet('bld_lagos.parquet',columns=['lon','lat'])
lon,lat=df.lon.values,df.lat.values
def samp(path,lon,lat,out,mask=None):
    d=r.open(path); a=d.read(1); T=~d.transform; c,rw=T*(lon,lat); c=np.floor(c).astype(int); rw=np.floor(rw).astype(int)
    ok=(c>=0)&(c<d.width)&(rw>=0)&(rw<d.height)
    out[ok]=a[rw[ok],c[ok]]
w=np.zeros(len(df),np.int32)
samp('wsf/wsf_2_6.tif',lon,lat,w)
m=lon>=4.0; w2=np.zeros(len(df),np.int32); samp('wsf/wsf_4_6.tif',lon,lat,w2); w[m]=w2[m]
np.save('wsf.npy',w)
print(pd.Series(w).value_counts().sort_index().to_string())
for y in (1975,1980,1985):
    g=np.zeros(len(df),np.int32); samp(glob.glob(f'ghsl/g{y}/*.tif')[0],lon,lat,g); np.save(f'ghsl{y}.npy',g)
    print(y,'pct>0',(g>0).mean().round(3),'pct>500',(g>500).mean().round(3), np.percentile(g,[50,90]))
