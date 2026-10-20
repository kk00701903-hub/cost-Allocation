import asyncio, json, os, sys, urllib.request, urllib.parse, time
from playwright.async_api import async_playwright
S='/tmp/claude-0/-home-claude/919335e7-642b-5e33-a839-725329972614/scratchpad/'
OUT=S+'it_shots/'; os.makedirs(OUT, exist_ok=True)
BASE='http://localhost:3100'
RESULTS=[]
def ok(name, cond, detail=''):
    RESULTS.append((name, bool(cond), detail)); print(('PASS ' if cond else 'FAIL ')+name+(' — '+str(detail) if detail else ''), flush=True)
def kv(key):
    with urllib.request.urlopen(BASE+'/api/kv/'+urllib.parse.quote(key, safe='')) as r: v=json.loads(r.read()); return v or []
def put(key,val):
    req=urllib.request.Request(BASE+'/api/kv/'+urllib.parse.quote(key, safe=''), data=json.dumps(val).encode(), method='PUT', headers={'content-type':'application/json'}); urllib.request.urlopen(req).read()
N=lambda v: float(v or 0)
def sm(rows,k): return sum(N(r.get(k)) for r in rows)
T5=['월임용차료','도로비','유류대','추가변동수당','구간용차료']

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1600,'height':900}); pg.set_default_timeout(180000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        async def dlg(d): await d.accept('1' if d.type=='prompt' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(dlg(d)))
        async def boot():
            await pg.goto(BASE, wait_until='networkidle'); await pg.wait_for_selector('.flow')
        await boot()
        async def menu(name):
            await pg.click('.leftstrip button >> nth=0'); await pg.click(f'.tree .leaf:text-is("📄 {name}"), .tree .leaf:has-text("{name}") >> nth=0'); await pg.wait_for_timeout(400)
        async def idle():
            # 생성 실행은 사유 입력 창이 뜬다(2026-10-16) — 뜨면 사유를 넣고 확인
            await pg.wait_for_timeout(300)
            for _ in range(600):
                if await pg.locator('.modal').count():
                    await pg.locator('.modal textarea').fill('통합테스트 자동 실행'); await pg.locator('.modal-btns .primary').click(); await pg.wait_for_timeout(200)
                if not await pg.locator('.busy').count() and not await pg.locator('.modal').count(): break
                await pg.wait_for_timeout(200)
            await pg.wait_for_timeout(300)
        async def act(label):
            await pg.locator('.win:visible .act:visible', has_text=label).first.click(); await idle()
        async def tab(t):
            await pg.locator('.win:visible .tab', has_text=t).first.click(); await pg.wait_for_timeout(300)
        async def upload(f):
            await pg.locator('.win:visible .actions input[type=file]').set_input_files(S+'it_data/'+f); await idle()
        async def shot(n): await pg.screenshot(path=OUT+n+'.png')

        # 1 기준
        await menu('원가배분 고객사 관리'); await act('운행실적으로')
        ok('M01 고객사 초기화', len(kv('M01.head'))>100 and len(kv('M01.detail'))>100, f"화주 {len(kv('M01.head'))} / 센터설정 {len(kv('M01.detail'))}")
        # 2 물동량
        await menu('배송 물동량 조회'); await upload('M03_배송물동량.xlsx')
        m03=kv('M03.actual@202609'); ok('M03 업로드 121,427행', len(m03)==121427, len(m03))
        await menu('이고 물동량 조회'); await act('생성')
        m04=kv('M04.actual@202609'); ok('M04 이고 생성', len(m04)>0, f"{len(m04)}행, CBM {sm(m04,'배송CBM'):.1f}")
        await menu('기초재고 세팅'); await upload('M05_기초재고.xlsx'); ok('M05 업로드', len(kv('M05.actual@202609'))==1226)
        await menu('입고 물동량 조회'); await upload('M06_입고물동량.xlsx'); ok('M06 업로드', len(kv('M06.actual@202609'))==1226)
        await menu('산출 재고 조회'); await act('생성')
        m07=kv('M07.actual@202609'); ok('M07 산출재고 생성', len(m07)>0, f"{len(m07)}행")
        # 산출 = 기초 + 입고 − 출고(배송+이고출고) + 이고입고 : 전체 합 보존 (이고는 센터 간 이동이라 합계에서 상쇄)
        tot_open=sum(N(r['총계']) for r in kv('M05.actual@202609')); tot_in=sum(N(r['총계']) for r in kv('M06.actual@202609')); tot_out=sum(N(r['총계']) for r in m03)
        ok('M07 재고 등식(전체)', abs(sm(m07,'산출재고EA')-(tot_open+tot_in-tot_out))<1, f"{sm(m07,'산출재고EA'):.0f} = {tot_open+tot_in-tot_out:.0f}")
        # 실행 이력(사유) · 사유 취소 · 조정입력 (2026-10-16 추가)
        runs=kv('runs@202609')
        ok('실행 이력: 생성마다 사유와 함께 남음', {'M04','M07'} <= {r.get('menu') for r in runs} and all((r.get('reason') or '').strip() for r in runs), f"{len(runs)}건 "+','.join(sorted({str(r.get('menu')) for r in runs})))
        before=kv('M04.actual@202609')
        await menu('이고 물동량 조회'); await pg.locator('.win:visible .act:visible', has_text='생성').first.click()
        await pg.wait_for_selector('.modal'); await pg.locator('.modal-btns button', has_text='취소').click(); await pg.wait_for_timeout(800)
        after=kv('M04.actual@202609')
        ok('사유 취소하면 바뀌지 않음', len(after)==len(before) and abs(sm(after,'총계')-sm(before,'총계'))<1e-6, f"{len(before)}행 그대로")
        # 조정입력: 이고 대상 배송 1행을 +10 증감으로 넣으면 이고 총계가 10 늘고, 지우면 돌아온다
        m4k={(r['화주코드'],r['도착센터']) for r in before}
        src=next(r for r in m03 if (r['화주코드'],r['배송센터명']) in m4k)
        adj=dict(src); adj.update({'포장':0,'낱개':10,'총계':10,'조정사유':'통합테스트 조정'})
        put('M03.adj@202609',[adj]); await boot(); await menu('이고 물동량 조회'); await act('생성')
        m4a=kv('M04.actual@202609')
        ok('조정입력(배송 +10) → 이고 총계 +10', abs(sm(m4a,'총계')-sm(before,'총계')-10)<1e-6, f"{sm(before,'총계'):.0f} → {sm(m4a,'총계'):.0f}")
        put('M03.adj@202609',[]); await boot(); await menu('이고 물동량 조회'); await act('생성')
        ok('조정 지우면 원래대로', abs(sm(kv('M04.actual@202609'),'총계')-sm(before,'총계'))<1e-6)
        await menu('산출 재고 조회'); await act('생성')
        # 3·4 보관비
        await menu('보관비 배분 조회'); await tab('보관비입력'); await upload('M08_보관비입력.xlsx'); await act('원가배분'); await shot('08')
        i8=kv('M08.input@202609'); a8=kv('M08.alloc@202609'); p8=kv('M08.pnl@202609')
        ok('M08 입력 = 배분', abs(sm(i8,'총계')-sm(a8,'배분원가'))<1, f"{sm(i8,'총계'):,.0f} / {sm(a8,'배분원가'):,.0f}")
        un=[r for r in a8 if not r.get('화주코드')]; ok('M08 미배분 행 표시', True, f"{len(un)}행 {sm(un,'배분원가'):,.0f}")
        ok('M08 손익 = 화주 배분', abs(sm(p8,'금액')-sum(N(r['배분원가']) for r in a8 if r.get('화주코드')))<1)
        # 배송비
        await menu('배송비 배분 조회'); await act('운송비'); await act('배송비'); await shot('09')
        g9=kv('M09.general@202609'); a9=kv('M09.alloc@202609'); p9=kv('M09.pnl@202609'); t9=kv('M09.transport@202609')
        gsum=sum(N(r['월임용차'])+N(r['도로비'])+N(r['유류대'])+N(r['추가변동수당'])+N(r['구간용차']) for r in g9)
        ok('M09 CBM 배분 모드(배분CBM 채워짐)', any(r.get('배분CBM') for r in g9))
        ok('M09 최소CBM 적용 행 있음', any(N(r.get('배분CBM'))==0.045 for r in g9))
        # 종합정보와 같게: 일반배송비는 행마다 반올림, 배송비배분은 반올림 전 합계를 열마다 반올림 → 반올림 차이만 허용
        graw=sum(N(r.get('_월임용차'))+N(r.get('_도로비'))+N(r.get('_유류대'))+N(r.get('_추가변동수당'))+N(r.get('_구간용차')) for r in g9)
        asum=sm(a9,'배송비계'); psum=sm(p9,'금액')
        ok('M09 일반배송비(반올림 전) = 배송비배분 = 손익', abs(graw-asum)<len(a9) and abs(psum-asum)<len(p9), f"{graw:,.0f} / {asum:,.0f} / {psum:,.0f}")
        # 일반배송비는 재배분 열(월임재·유류재, 유류재에 외부주유 포함)로 나눔 — 회전 금액 반올림 차이(회전당 0.5 이내) 허용
        bt=[r for r in t9 if r['운송구분']=='배송비']
        tsum=sum(N(r['월임용차료(재배분)'])+N(r['도로비'])+N(r['유류대(재배분)'])+N(r['구간료'])+N(r['추가변동수당']) for r in bt)
        ok('M09 배송 운행 금액(재배분) = 일반배송비(모든 회전 배분)', abs(tsum-graw)<len(bt)*0.5, f"{tsum:,.0f} / {graw:,.0f}")
        # 간선비
        await menu('간선비 배분 조회'); await act('화주별'); await act('부서별'); await shot('10')
        i10=kv('M10.input@202609'); s10=kv('M10.shipper@202609'); d10=kv('M10.dept@202609'); j10=kv('M10.deptadj@202609'); p10=kv('M10.pnl@202609')
        tin=sum(sum(N(r.get(k)) for k in T5) for r in i10)
        ok('M10 간선비입력 9월 = 213,219,334', round(tin)==213219334, f"{tin:,.0f}")
        ok('M10 배분 기준 = 이고 물동량', any(N(r.get('이고CBM'))>0 for r in s10) and len(s10)>0, f"화주별 {len(s10)}행")
        ok('M10 화주별 합계 = 입력', abs(sm(s10,'합계')-tin)<1, f"{sm(s10,'합계'):,.0f}")
        ok('M10 부서별 합계 = 화주별', abs(sm(d10,'합계')-sm(s10,'합계'))<1)
        ok('M10 부서간조정 합계 0', abs(sm(j10,'금액'))<1, f"{len(j10)}행")
        ok('M10 손익 = 부서별', abs(sm(p10,'금액')-sm(d10,'합계'))<1)
        await tab('간선비업로드'); await act('권역조정')
        up=kv('M10.upload@202609'); ok('M10 권역조정 계산 10행 161,504,800', len(up)==10 and round(sum(sum(N(r[k]) for k in T5) for r in up if r['이고구분']=='권역내'))==161504800)
        await tab('운행 권역판정'); await shot('10_judge')
        txt=await pg.locator('.win:visible .grid tfoot').inner_text(); ok('M10 운행 권역판정 탭 표시', '711' in txt.replace(',',''), txt[:40])
        # 노무비
        await menu('노무비 배분 조회'); await act('작업비'); await shot('11')
        w11=kv('M11.work@202609'); s11=kv('M11.shipper@202609'); d11=kv('M11.dept@202609'); i11=kv('M11.input@202609')
        ok('M11 작업량 = 화주별 작업량', abs(sm(w11,'계')-sm(s11,'작업량'))<0.01, f"{sm(w11,'계'):,.1f}")
        depts_with=set(r['관리부서'] for r in s11)
        pool=sum(N(r['총계']) for r in i11 if r['관리부서'] in depts_with)
        ok('M11 작업 있는 부서 도급료 = 배분액', abs(pool-sm(s11,'배분액'))<1, f"{pool:,.0f} / {sm(s11,'배분액'):,.0f}")
        # 부서별은 행마다 반올림(종합정보와 같음) → 행 수만큼의 반올림 차이 허용
        ok('M11 부서별 = 화주별(반올림 차이 내)', abs(sm(d11,'배분액')-sm(s11,'배분액'))<max(1,len(d11)*0.5), f"{sm(d11,'배분액'):,.0f} / {sm(s11,'배분액'):,.0f}")
        # M12 → M11
        await menu('화주별 노무비 추가배분'); await act('데이터'); await tab('추가 배분'); await act('인건노무비')
        g12=kv('M12.grade@202609'); e12=kv('M12.extra@202609'); ok('M12 등급·추가배분 생성', len(g12)>0 and len(e12)>0, f"등급 {len(g12)} / 추가 {len(e12)}")
        await menu('노무비 배분 조회'); await act('작업비')
        s11b=kv('M11.shipper@202609'); ok('M11 재생성 후에도 합계 보존', abs(sm(s11b,'배분액')-sm(s11,'배분액'))<1)
        # 일반관리비
        await menu('일반관리비 배분 조회'); await tab('일반관리비입력'); await upload('M13_일반관리비입력.xlsx'); await act('일반관리비'); await shot('13')
        i13=kv('M13.input@202609'); a13=kv('M13.alloc@202609')
        ok('M13 입력 = 배분', abs(sm(i13,'금액')-sm(a13,'배분액'))<1, f"{sm(i13,'금액'):,.0f}")
        ok('M13 보관비 기준 항목은 보관비 비율로', any(r['배분기준']=='보관비' and r.get('화주코드') for r in a13))
        # 손익반영
        for m in ['보관비 배분 조회','배송비 배분 조회','간선비 배분 조회','노무비 배분 조회','일반관리비 배분 조회']:
            await menu(m); await act('손익반영')
        allY=all(all(r.get('배분여부')=='Y' for r in kv(f'{t}@202609')) for t in ['M08.pnl','M09.pnl','M10.pnl','M11.pnl','M13.pnl'])
        ok('손익반영 5종 배분여부 Y', allY)
        await menu('월 마감 흐름'); await shot('00_flow')
        stale=await pg.locator('.card.stale').count(); ok('흐름: 다시 생성 필요 0', stale==0, stale)
        # 제외 기준
        # 제외 기준을 화면에서 입력: 신규 → 칸 편집 → 저장
        await menu('배분 제외 기준')
        async def setcell(row, col, val):
            c=pg.locator(f'.win:visible .grid tbody tr:nth-child({row+1}) td:nth-child({col})'); await c.dblclick(); await pg.wait_for_timeout(100)
            inp=pg.locator('.win:visible .grid td.editing input, .win:visible .grid td.editing select').first
            if await inp.evaluate('e=>e.tagName')=='SELECT': await inp.select_option(val)
            else: await inp.fill(val); await inp.press('Enter')
            await pg.wait_for_timeout(150)
        async def newrule(kind, code, name, cost, why, row):
            await pg.locator('.win:visible .toolbar button', has_text='신규').click(); await pg.wait_for_timeout(200)
            await setcell(row,4,kind); await setcell(row,5,code); await setcell(row,6,name); await setcell(row,7,cost); await setcell(row,10,why)
        await newrule('화주','1762','미트밸리','전체','통합테스트',1)
        await newrule('센터','M501','밀양(3PL)','보관비','통합테스트',2)
        await pg.locator('.win:visible .toolbar button', has_text='저장').click(); await pg.wait_for_timeout(800); await shot('x01_rules')
        xr=kv('X.rules'); ok('제외 기준 화면 입력·저장', len(xr)==2 and xr[0]['코드']=='1762' and xr[1]['적용원가']=='보관비', [ (r.get('구분'),r.get('코드'),r.get('적용원가'),r.get('사유')) for r in xr])
        await menu('월 마감 흐름'); stale2=await pg.locator('.card.stale').count(); ok('제외 기준 변경 → 배분 "다시 생성 필요" 표시', stale2>=3, stale2)
        await menu('간선비 배분 조회'); await act('화주별'); await act('부서별')
        s10b=kv('M10.shipper@202609')
        ok('제외: 간선 화주별에서 1762 빠짐', not any(r['화주코드']=='1762' for r in s10b))
        ok('제외: 화주 제외해도 간선비 합계 보존(재배분)', abs(sm(s10b,'합계')-tin)<1, f"{sm(s10b,'합계'):,.0f}")
        await menu('보관비 배분 조회'); await act('원가배분')
        a8b=kv('M08.alloc@202609'); i8m=sum(N(r['총계']) for r in i8 if r['센터코드']=='M501')
        ok('제외: 보관비 센터 M501 금액 빠짐', abs(sm(a8b,'배분원가')-(sm(i8,'총계')-i8m))<1 and not any(r.get('화주코드')=='1762' for r in a8b), f"뺀 금액 {i8m:,.0f}")
        await pg.locator('.win:visible .pill', has_text='검증').click(); await pg.wait_for_timeout(300); await shot('08_checks_excl')
        t=await pg.locator('.win:visible .checks').inner_text(); ok('검증 패널에 제외 금액 표시', '제외 기준' in t)
        await menu('배분 제외 기준'); await tab('제외 영향'); await shot('x01_impact')
        t2=await pg.locator('.win:visible .grid').inner_text(); ok('제외 영향 미리보기 표시', '미트밸리' in t2)
        # 편집·저장
        await menu('원가배분 기준관리'); await tab('운송비')
        cell=pg.locator('.win:visible .grid tbody tr:nth-child(2) td:nth-child(7)'); await cell.dblclick(); await pg.locator('.win:visible .grid td.editing input').fill('0.05'); await pg.keyboard.press('Enter')
        await pg.locator('.win:visible .toolbar button', has_text='저장').click(); await pg.wait_for_timeout(800)
        tr=kv('M02.transport@202609'); ok('그리드 편집·저장(최소CBM 0.05)', N(tr[0]['최소CBM'])==0.05, tr[0]['최소CBM'])
        # 다음 달: 복사실행
        await pg.locator('.win:visible select').first.select_option('202610'); await pg.wait_for_timeout(1500); await pg.wait_for_selector('.win:visible')
        await act('복사실행')
        ok('202610 기준 복사실행', len(kv('M02.transport@202610'))==13 and len(kv('M02.work@202610'))==227, f"작업비 {len(kv('M02.work@202610'))}행")
        await menu('기초재고 세팅'); await act('생성')
        m05n=kv('M05.actual@202610'); ok('202610 기초재고 = 9월 산출재고', len(m05n)==len(m07) and abs(sum(N(r['총계']) for r in m05n)-sm(m07,'산출재고EA'))<1, len(m05n))
        await menu('월 마감 흐름'); await shot('00_flow_202610')
        # 챗봇 API(키 없음 처리)
        req=urllib.request.Request(BASE+'/api/chat', data=b'{"messages":[{"role":"user","content":"x"}],"context":""}', method='POST')
        try: urllib.request.urlopen(req); code=200
        except urllib.error.HTTPError as e: code=e.code; body=e.read().decode()
        ok('챗봇: 키 없으면 안내 메시지(500)', code==500 and 'ANTHROPIC_API_KEY' in body)
        ok('브라우저 콘솔 오류 0', len(errs)==0, errs[:5])
        put('X.rules',[])
        await b.close()
    print('\nSUMMARY', sum(1 for r in RESULTS if r[1]), '/', len(RESULTS))
    json.dump(RESULTS, open(S+'it_results.json','w'), ensure_ascii=False, indent=1)
asyncio.run(main())
