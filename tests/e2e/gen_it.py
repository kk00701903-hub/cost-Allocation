import json, random, collections
from openpyxl import Workbook
random.seed(7)
S='/tmp/claude-0/-home-claude/919335e7-642b-5e33-a839-725329972614/scratchpad/'
P=json.load(open(S+'ca/public/data/202609/trips.json'))
ix={c:i for i,c in enumerate(P['cols'])}; D=P['dict']; num=set(P['num'])
def g(r,c): v=r[ix[c]]; return v if (c in num or c=='배송일') else D[v]
centers={c['name']:c for c in json.load(open(S+'ca/public/data/centers.json'))}
DEPT={'밀양센터':3212,'오산운영1팀':4450,'오산운영2팀':4470,'이천운영팀':4700,'화성운영팀':6110,'호남운영팀':6410,'김해운영2팀':6500,'경산운영팀':6510,'김해운영1팀':6520}
def save(name, head, rows):
    wb=Workbook(); ws=wb.active; ws.append(head)
    for r in rows: ws.append([r.get(h) for h in head])
    wb.save(S+'it_data/'+name); print(name, len(rows))
m03=[]
for r in P['rows']:
    src=g(r,'상차지명')
    if src not in centers or centers[src]['use']!='Y': continue
    sid=g(r,'관리화주ID'); temp='냉동' if '냉동' in g(r,'품목') else '상온'
    for k in range(random.choice([1,1,2])):
        typ='C/D' if (hash(sid)+k)%3==0 else '보관'
        box=random.randint(0,20); ea=random.randint(0,9); tot=box*10+ea
        m03.append({'배송일':g(r,'배송일'),'화주코드':sid,'화주명':g(r,'관리화주명'),'배송센터':centers[src]['code'],'배송센터명':src,'배송처코드':'','배송처명':g(r,'하차지명'),
          '부서코드':DEPT.get(g(r,'실행부서'),''),'배송부서명':g(r,'실행부서'),'제품코드':f'P{sid}-{k}{typ[0]}','제품명':f'{g(r,"관리화주명")} 제품{k}','UOM':'BOX / 10','재고타입':typ,'온도':temp,
          '포장':box,'낱개':ea,'총계':tot,'단위CBM':0.002,'배송CBM':round(tot*0.002,6),'차량ID':g(r,'차량ID'),'회전':g(r,'회전')})
H03=['배송일','화주코드','화주명','배송센터','배송센터명','배송처코드','배송처명','부서코드','배송부서명','제품코드','제품명','UOM','재고타입','온도','포장','낱개','총계','단위CBM','배송CBM','차량ID','회전']
save('M03_배송물동량.xlsx',H03,m03)
out=collections.defaultdict(int); meta={}
for r in m03:
    k=(r['화주코드'],r['배송센터'],r['제품코드'],r['재고타입']); out[k]+=r['총계']; meta[k]=r
m05=[];m06=[]
for k,v in out.items():
    r=meta[k]; open_=int(v*0.6)
    m05.append({'재고일자':'2026-09-01','화주코드':k[0],'화주명':r['화주명'],'보관센터':k[1],'보관센터명':r['배송센터명'],'제품코드':k[2],'제품명':r['제품명'],'UOM':'BOX / 10','재고타입':k[3],'온도':r['온도'],'단위CBM':0.002,'포장':open_//10,'낱개':open_%10,'총계':open_})
    inb=int(v*0.7)
    m06.append({'입고일자':'2026-09-05','화주코드':k[0],'화주명':r['화주명'],'입고센터':k[1],'입고센터명':r['배송센터명'],'입고타입':'생산입고','부서코드':r['부서코드'],'부서명':r['배송부서명'],'제품코드':k[2],'제품명':r['제품명'],'UOM':'BOX / 10','재고타입':k[3],'포장':inb//10,'낱개':inb%10,'총계':inb,'입고처':r['화주명']})
save('M05_기초재고.xlsx',['재고일자','화주코드','화주명','보관센터','보관센터명','제품코드','제품명','UOM','재고타입','온도','단위CBM','포장','낱개','총계'],m05)
save('M06_입고물동량.xlsx',['입고일자','화주코드','화주명','입고센터','입고센터명','입고타입','부서코드','부서명','제품코드','제품명','UOM','재고타입','포장','낱개','총계','입고처'],m06)
TD={'Y501':'경산운영팀','S507':'화성운영팀','N504':'호남운영팀','S501':'화성운영팀','S504':'화성운영팀','S505':'화성운영팀','K501':'김해운영1팀','Y504':'경산운영팀','S512':'오산운영1팀','U501':'오산운영2팀','E501':'이천운영팀','M501':'밀양센터'}
cs=sorted({(r['배송센터'],r['배송센터명']) for r in m03})
m08=[];m13=[]
for code,nm in cs:
    for t in ('상온','냉동'):
        for it in ('전력비','창고관리비','감가상각비'):
            m08.append({'년월':'2026-09-01','센터코드':code,'센터명':nm,'관리부서':TD[code],'원가구분':'보관비','세부항목':it,'온도':t,'총계':random.randint(1,30)*100000})
    for it in ('창고임차료','기타소모품비','지급수수료'):
        m13.append({'년월':'2026-09-01','센터코드':code,'센터명':nm,'관리부서':TD[code],'원가구분':'일반관리비','세부항목':it,'금액':random.randint(1,20)*100000})
save('M08_보관비입력.xlsx',['년월','센터코드','센터명','관리부서','원가구분','세부항목','온도','총계'],m08)
save('M13_일반관리비입력.xlsx',['년월','센터코드','센터명','관리부서','원가구분','세부항목','금액'],m13)
print('centers',cs)
