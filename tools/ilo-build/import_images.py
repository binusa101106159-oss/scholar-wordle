"""Copy original ILO teaching JPEGs byte-for-byte; derive small navigation thumbnails."""
import hashlib,json,shutil,sys
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path(sys.argv[1]) if len(sys.argv)>1 else Path(r'A:/職醫/ILO標準片檔案/ilo-radiographs-jpegs')
OUT=ROOT/'ilo';(OUT/'images').mkdir(exist_ok=True);(OUT/'thumbs').mkdir(exist_ok=True)
rows=[('00_Normal_1.jpg','normal-1','正常例1','normal','0/0','',1,24),('00_Normal_2.jpg','normal-2','正常例2','normal','0/0','',2,24)]
for group,shape in [('pp','p/p'),('qq','q/q'),('rr','r/r'),('ss','s/s'),('tt','t/t')]:
 for grade in [1,2,3]:
  suffix='ts' if group=='tt' and grade==3 else group
  quality={('qq',1):1,('rr',3):1,('ss',2):1}.get((group,grade),2)
  source_page=24 if (group=='pp' or (group=='qq' and grade==1)) else 25 if (group=='qq' or group=='rr' or (group=='ss' and grade==1)) else 26
  rows.append((f'{grade}{grade}_{suffix}.jpg',f'{suffix}-{grade}{grade}',f'{grade}/{grade} {"t/s" if suffix=="ts" else shape}','small',f'{grade}/{grade}','t/s' if suffix=='ts' else shape,quality,source_page))
rows.extend([('123u_Analog.jpg','u-composite','u/u四分格合成片','composite','','u/u',None,26),('A_22_qq.jpg','large-a','大陰影 A','large','2/3','q/r',2,27),('B_23_qr.jpg','large-b','大陰影 B','large','2/3','q/r',1,27),('C_3+_rr.jpg','large-c','大陰影 C','large','3/+','r/r',2,27),('pleural.jpg','pleural','肋膜異常例片','pleural','','',2,27),('cpangle.jpg','cp-angle','肋膈角鈍化校準片','pleural','','',2,27)])
films=[]
for filename,id,label,group,profusion,shape,quality,page in rows:
 src=SOURCE/filename;raw=src.read_bytes();shutil.copy2(src,OUT/'images'/filename)
 with Image.open(src) as im:
  width,height=im.size;im.thumbnail((320,320),Image.Resampling.LANCZOS);im.save(OUT/'thumbs'/filename,quality=82,optimize=True)
 film=dict(id=id,file=filename,label=label,group=group,profusion=profusion,shape=shape,quality=quality,page=page,width=width,height=height,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
 if group=='large':film['large']=id[-1].upper()
 if id=='large-a':film['note']='原始檔名 A_22_qq.jpg 與指引的標註不同；本頁依附錄C記錄為2/3、q/r。'
 if id=='u-composite':film['note']='同一合成片包含0/0及1/1、2/2、3/3的u/u示例；沿用2011-D影像。'
 films.append(film)
(OUT/'films.json').write_text(json.dumps(dict(version=1,edition=2022,source='ILO 2022 Guidelines, Appendix C, pp. 23–27',sourceURL='https://www.ilo.org/resource/other/ilo-international-classification-radiographs-pneumoconioses',films=films),ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
print('Original JPEG bytes',sum(f['bytes'] for f in films),'thumbnail bytes',sum(p.stat().st_size for p in (OUT/'thumbs').iterdir()),'films',len(films))
