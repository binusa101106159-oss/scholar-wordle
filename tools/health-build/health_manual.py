"""Image-only source tables, transcribed at 300 dpi; never edit generated JSON.
Source: 完整版.pdf PDF446 / printed441, Table 1.1, all 18 data rows and a-e notes.
Unicode subscripts/superscripts retain the printed chemical notation as selectable text.
"""
import hashlib

IMAGE_SHA256='12869f578ce35d30f0431852de1ddbfea67261225db0774dac49907ce7257d8c'

TITLE='Table 1.1 Chemical names, CAS numbers, synonyms, and molecular formulae of arsenic and arsenic compounds'
ROWS=[
 ['Chemical name','CAS Reg. No.','Synonyms','Formula'],
 ['Arsanilic acid','98-50-0','Arsonic acid, (4-aminophenyl)-','C₆H₈AsNO₃'],
 ['Arsenicᵃ','7440-38-2','Metallic arsenic','As'],
 ['Arsenic(V) pentoxideᵇ','1303-28-2','Arsenic oxide [As₂O₅]','As₂O₅'],
 ['Arsenic(III) sulfide','1303-33-9','Arsenic sulfide [As₂S₃]','As₂S₃'],
 ['Arsenic(III) trichloride','7784-34-1','Arsenic chloride [AsCl₃]','AsCl₃'],
 ['Arsenic(III) trioxideᵃ,ᶜ','1327-53-3','Arsenic oxide [As₂O₃]','As₂O₃'],
 ['Arsenobetaine','64436-13-1','Arsonium, (carboxymethyl) trimethyl-, hydroxide, inner salt; 2-(trimethylarsonio)acetate','C₅H₁₁AsO₂'],
 ['Arsine','7784-42-1','Arsenic hydride','AsH₃'],
 ['Calcium arsenate','7778-44-1','Arsenic acid [H₃AsO₄] calcium salt (2:3)','(AsO₄)₂.3Ca'],
 ['Dimethylarsinic acid','75-60-5','Cacodylic acid','C₂H₇AsO₂'],
 ['Lead arsenate','7784-40-9','Arsenic acid [H₃AsO₄], lead (2+) salt (1:1)','HAsO₄.Pb'],
 ['Methanearsonic acid, disodium salt','144-21-8','Arsonic acid, methyl-, disodium salt','CH₃AsO₃.2Na'],
 ['Methanearsonic acid, monosodium salt','2163-80-6','Arsonic acid, methyl-, monosodium salt','CH₄AsO₃.Na'],
 ['Potassium arsenateᵈ','7784-41-0','Arsenic acid [H₃AsO₄], monopotassium salt','H₂AsO₄.K'],
 ['Potassium arsenite','13464-35-2','Arsenous acid, potassium salt','AsO₂.K'],
 ['Sodium arsenateᵉ','7631-89-2','Arsenic acid, [H₃AsO₄], monosodium salt','H₂AsO₄.Na'],
 ['Sodium arsenite','7784-46-5','Arsenous acid, sodium salt','AsO₂.Na'],
 ['Sodium cacodylate','124-65-2','Arsinic acid, dimethyl-, sodium salt','C₂H₆AsO₂.Na'],
]
NOTES=[
 'ᵃ As₂O₃ is sometimes erroneously called ‘arsenic’.',
 'ᵇ The name ‘arsenic acid’ is commonly used for As₂O₅ as well as for the various hydrated products (H₃AsO₄, H₄As₂O₇).',
 'ᶜ As₂O₃ is sometimes called ‘arsenic oxide’, but this name is more properly used for As₂O₅.',
 'ᵈ The other salts, K₃AsO₄ and K₂HAsO₄, do not appear to be produced commercially.',
 'ᵉ The name ‘sodium arsenate’ is also applied to both the disodium [7778-43-0] and the trisodium [13464-38-5] salts; it is therefore not always possible to determine which substance is under discussion.',
]

def apply(document,gid,imgdir):
 if gid!='full19':return None
 matches=[(i,b) for i,b in enumerate(document['blocks']) if b.get('att')=='full19-t2' and b['t']=='img']
 assert len(matches)==1,'Image-only source table changed; visually recheck PDF446 before updating transcription.'
 i,original=matches[0]
 image=imgdir/original['img'][0]['src']
 digest=hashlib.sha256(image.read_bytes()).hexdigest()
 assert digest==IMAGE_SHA256,'Source table image changed; transcription needs a new visual check.'
 def cell(text,c=0,cs=1):return dict(text=text,c=c,cs=cs,rs=1)
 rows=[[cell(TITLE,cs=4)]]+[[cell(text,c) for c,text in enumerate(row)] for row in ROWS]+[[cell(note,cs=4)] for note in NOTES]
 document['blocks'][i]=dict(t='table',widths=[105,65,178,82],head=2,rows=rows,att=original['att'])
 assert len(ROWS)==19 and len(NOTES)==5 and all(len(row)==4 for row in ROWS)
 return dict(source_pdf_page=446,source_image_sha256=digest,data_rows=18,columns=4,footnotes=5,checked_dpi=300,method='Complete visual transcription of image-only table; Unicode chemical subscripts and note markers.')
