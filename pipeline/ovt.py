import sys, os, pyarrow as pa, pyarrow.parquet as pq, pyarrow.fs as pafs, concurrent.futures as cf
theme, typ, out = sys.argv[1], sys.argv[2], sys.argv[3]
cols = sys.argv[4].split(',') if len(sys.argv)>4 else None
X0,Y0,X1,Y1 = 2.65,6.33,4.40,6.75
px=os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
fs=pafs.S3FileSystem(anonymous=True, region='us-west-2', proxy_options=px, endpoint_override='https://s3.amazonaws.com', force_virtual_addressing=True)
base=f'overturemaps-us-west-2/release/2026-09-23.1/theme={theme}/type={typ}'
files=[f.path for f in fs.get_file_info(pafs.FileSelector(base)) if f.path.endswith('.parquet') or 'part-' in f.path]
print(len(files),'files', flush=True)
def stats(md, rg, name):
    s=md.row_group(rg)
    for i in range(s.num_columns):
        c=s.column(i)
        if c.path_in_schema==name: return c.statistics
def work(p):
    f=pq.ParquetFile(fs.open_input_file(p)); md=f.metadata; keep=[]
    for rg in range(md.num_row_groups):
        a=stats(md,rg,'bbox.xmin'); b=stats(md,rg,'bbox.xmax'); c=stats(md,rg,'bbox.ymin'); d=stats(md,rg,'bbox.ymax')
        if a.min<=X1 and b.max>=X0 and c.min<=Y1 and d.max>=Y0: keep.append(rg)
    if not keep: return None
    t=f.read_row_groups(keep, columns=cols)
    bb=t.column('bbox').combine_chunks()
    import pyarrow.compute as pc
    m=pc.and_(pc.and_(pc.less_equal(bb.field('xmin'),X1),pc.greater_equal(bb.field('xmax'),X0)),pc.and_(pc.less_equal(bb.field('ymin'),Y1),pc.greater_equal(bb.field('ymax'),Y0)))
    return t.filter(m)
tabs=[]
with cf.ThreadPoolExecutor(16) as ex:
    for i,t in enumerate(ex.map(work, files)):
        if t is not None and t.num_rows: tabs.append(t); print(files[i].split('/')[-1], t.num_rows, flush=True)
T=pa.concat_tables(tabs); pq.write_table(T,out); print('total',T.num_rows)
