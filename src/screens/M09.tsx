'use client';
import { useMemo, useRef, useState } from 'react';
import Screen, { type Check } from '../ui/Screen';
import Grid from '../ui/Grid';
import { MonthCond, SelCond, TextCond, useConds, useExcel } from '../ui/common';
import { useApp } from '../lib/store';
import type { Col } from '../lib/types';
import * as C from './cols';
import { activeRules, dropSummary, partition } from '../lib/exclude';
import { deliveryAlloc, deliveryPnl, generalRows, isHomeplus, transportRows } from '../calc/delivery';
import { deptCode } from '../lib/judge';
import { readTrips } from '../lib/excel';
import { n, s, stamp, sum, sumCol } from '../lib/util';

const TABS = [{ key: 'alloc', title: '배송비배분' }, { key: 'transport', title: '운송비' }, { key: 'homeplus', title: '홈플러스배송비' }, { key: 'general', title: '일반배송비' }, { key: 'pnl', title: '손익생성' }];
const TABLE: Record<string, string> = { alloc: 'M09.alloc', transport: 'M09.transport', homeplus: 'M09.general', general: 'M09.general', pnl: 'M09.pnl' };
const COLS: Record<string, Col[]> = { alloc: C.M09_ALLOC, transport: C.M09_TRANSPORT, homeplus: C.M09_GENERAL, general: C.M09_GENERAL, pnl: C.PNL };

export default function M09() {
  const app = useApp();
  const { month, user, trips, res } = app;
  const [tab, setTab] = useState('alloc');
  const conds = useConds({ 화주: '', 부서: '', 차량구분: '', 차량번호: '', 운송구분: '' });
  const xl = useExcel(COLS[tab], `${month}_배송비배분_${TABS.find((t) => t.key === tab)?.title}.xlsx`);
  const file = useRef<HTMLInputElement>(null);
  const rules = useMemo(() => activeRules(app.rows('X.rules'), month, '배송비'), [app, month, app.version]);
  // 원가배분 고객사 관리에서 사용여부 Y가 아닌(N·빈칸·미등록) 화주의 운행은 운송비부터 뺀다.
  // 9월 종합정보 확인: 3869 한솥 = 사용 N, 4005·4091·4098 = 고객사 미등록(빈칸). 이 4개를 빼면 운송비 13,858행 금액이 모두 같다.
  const offShippers = useMemo(() => {
    const heads = app.rows('M01.head');
    if (!heads.length || !trips) return new Set<string>();
    const on = new Set(heads.filter((r) => s(r.사용여부) === 'Y').map((r) => s(r.화주코드)));
    return new Set(trips.map((t) => t.shipperId).filter((id) => !on.has(id)));
  }, [app, app.version, trips]);
  const minCbm = useMemo(() => Object.fromEntries(app.rows('M02.transport').map((r) => [s(r.배송센터명), n(r.최소CBM) || 0.045])), [app, app.version]);

  let raw = app.rows(TABLE[tab]);
  if (tab === 'homeplus') raw = raw.filter(isHomeplus);
  if (tab === 'general') raw = raw.filter((r) => !isHomeplus(r));
  const rows = conds.apply(raw, { 화주: ['화주코드', '화주명'], 부서: ['차량부서', '부서명', '부서코드', '부서'], 차량구분: ['차량구분', '운송구분'], 차량번호: ['차량번호', '차량ID'], 운송구분: ['운송구분'] });

  const sceIF = () => app.run('운송비 SCE I/F', async () => {
    if (!trips) { file.current?.click(); return; }
    const choice = window.prompt(`운행실적: ${app.tripSource}\n\n1 = 지금 운행실적으로 운송비 탭 만들기\n2 = 다른 화주별 운행실적 엑셀 가져오기`, '1');
    if (choice === '2') { file.current?.click(); return; }
    if (choice !== '1') return;
    const ix = trips.map((_, i) => i).filter((i) => !offShippers.has(trips[i].shipperId));
    const out = transportRows(ix.map((i) => trips[i]), ix.map((i) => res[i]), stamp(user), app.rows('M03.actual'));
    await app.put('M09.transport', out, `운송비 SCE I/F ${out.length}행`, 'M09');
    app.say(`운송비 ${out.length.toLocaleString()}행 (차량·회전·운송구분 단위)`);
    setTab('transport');
  });
  const importFile = (f: File) => app.run('운행실적 가져오기', async () => {
    const { trips: t, month: m, sheet } = await readTrips(f, (x) => app.say(x));
    if (m && m !== month && !window.confirm(`파일은 ${m} 운행이 가장 많습니다. 지금 기준월은 ${month}입니다. 그래도 ${month}로 넣을까요?`)) return;
    await app.setTrips(t, `${f.name} [${sheet}] ${t.length.toLocaleString()}건`);
    app.say(`운행실적 ${t.length.toLocaleString()}건을 가져왔습니다. [운송비 SCE I/F]를 다시 누르세요.`);
  });
  const gen = () => app.run('배송비 생성', async () => {
    if (!trips) { app.say('운행실적이 없습니다.'); return; }
    const m03 = app.rows('M03.actual');
    // 제외: 부서·센터는 운행(금액)에서, 화주·거래처는 물동량 기준(있으면) 또는 운행에서
    const keyT = { 부서: (i: number) => [String(deptCode(trips[i].dept)), trips[i].dept] as [string, string], 센터: (i: number) => [trips[i].src, trips[i].src] as [string, string] };
    const idx = trips.map((_, i) => i).filter((i) => !offShippers.has(trips[i].shipperId));
    const cbmMode = m03.some((r) => s(r.차량ID) && n(r.회전));
    const pT = partition(idx, rules, cbmMode ? keyT : { ...keyT, 화주: (i) => [trips[i].shipperId, trips[i].shipper], 거래처: (i) => ['', trips[i].dst] });
    const keep = new Set(pT.kept);
    const tr = trips.filter((_, i) => keep.has(i)); const rr = res.filter((_, i) => keep.has(i));
    const pM = partition(m03, cbmMode ? rules : [], { 화주: (r) => [s(r.화주코드), s(r.화주명)], 거래처: (r) => [s(r.배송처코드), s(r.배송처명)] });
    const st = stamp(user);
    const general = generalRows(tr, rr, pM.kept, minCbm, st);
    const alloc = deliveryAlloc(general, st);
    const pnl = deliveryPnl(alloc, month, st, Object.fromEntries(app.rows('M01.head').map((r) => [s(r.화주코드), s(r.사업영역)])));
    await app.put('M09.general', general, `일반배송비 ${general.length}행 (${cbmMode ? '배송 물동량 CBM' : '운행실적 금액'}), 제외 ${pT.dropped.length + pM.dropped.length}건`, 'M09');
    await app.put('M09.alloc', alloc, `배송비배분 ${alloc.length}행`, 'M09');
    await app.put('M09.pnl', pnl, `손익생성 ${pnl.length}행`, 'M09');
    if (!app.has('M09.transport')) await app.put('M09.transport', transportRows(idx.map((i) => trips[i]), idx.map((i) => res[i]), st, m03), '운송비 SCE I/F(자동)', 'M09');
    app.say(`배송비배분 ${alloc.length.toLocaleString()}행 · 일반배송비 ${general.length.toLocaleString()}행 · 손익 ${pnl.length.toLocaleString()}행`);
    setTab('alloc');
  });
  const reflect = () => app.run('손익반영', async () => {
    const pnl = app.rows('M09.pnl'); if (!pnl.length) { app.say('손익생성 데이터가 없습니다.'); return; }
    await app.put('M09.pnl', pnl.map((r) => ({ ...r, 배분여부: 'Y' })), `손익반영 ${pnl.length}행 ${sumCol(pnl, '금액').toLocaleString()}원`, 'M09');
    app.say('손익반영 표시(배분여부 Y)를 했습니다.');
  });

  const checks: Check[] = useMemo(() => {
    const c: Check[] = [];
    if (!trips) { c.push({ level: 'block', title: '운행실적이 없습니다', detail: '[운송비 SCE I/F]로 화주별 운행실적 엑셀을 가져오세요.' }); return c; }
    c.push({ level: 'info', title: '운행실적', detail: app.tripSource });
    const tr = app.rows('M09.transport'), gen = app.rows('M09.general'), al = app.rows('M09.alloc'), pnl = app.rows('M09.pnl');
    const deliv = trips.filter((_, i) => res[i]?.v === '배송');
    const tDeliv = sum(deliv.map((t) => t.fee + t.road + t.fuel + t.extFuel + t.extra + t.section));
    const tAll = sum(trips.filter((t) => !offShippers.has(t.shipperId)).map((t) => t.fee + t.road + t.fuel + t.extFuel + t.extra + t.section));
    c.push({ level: 'info', title: '운행 금액', detail: `전체 ${tAll.toLocaleString()} = 배송비 ${tDeliv.toLocaleString()} + 간선비 ${(tAll - tDeliv).toLocaleString()} (간선비는 간선비 배분 조회에서 등록 간선비로 배분)` });
    if (tr.length) {
      const tt = sum(tr.map((r) => n(r.월임용차료) + n(r.도로비) + n(r.유류대) + n(r.외부주유) + n(r.구간료) + n(r.추가변동수당)));
      c.push(Math.abs(tt - tAll) < 1 ? { level: 'ok', title: '운송비 탭 합계 = 운행실적 합계' } : { level: 'block', title: '운송비 탭 합계 ≠ 운행실적 합계', detail: `${tt.toLocaleString()} / ${tAll.toLocaleString()} — SCE I/F를 다시 하세요` });
    }
    if (gen.length) {
      const tg = sum(gen.map((r) => n(r.월임용차) + n(r.도로비) + n(r.유류대) + n(r.추가변동수당) + n(r.구간용차)));
      const trD = tr.filter((r) => s(r.운송구분) === '배송비');
      const base = trD.length ? sum(trD.map((r) => n(r['월임용차료(재배분)']) + n(r.도로비) + n(r['유류대(재배분)']) + n(r.추가변동수당) + n(r.구간료))) : tDeliv;
      const diff = base - tg;
      c.push(Math.abs(diff) < Math.max(1, gen.length * 0.5) ? { level: 'ok', title: '일반배송비 합계 = 운송비 탭 배송비(재배분) 합계', detail: `${tg.toLocaleString()} (끝수 차이 ${diff.toLocaleString()}원 — 행마다 반올림)` }
        : { level: 'warn', title: '일반배송비 합계 ≠ 운송비 탭 배송비(재배분) 합계', detail: `차이 ${diff.toLocaleString()}원 — 제외 기준으로 뺀 금액이거나(아래), 배송 물동량에 화주·배송처가 없는 회전` });
      const ta = sumCol(al, '배송비계');
      c.push(Math.abs(ta - tg) <= Math.max(1, al.length) ? { level: 'ok', title: '배송비배분 합계 = 일반배송비 합계' } : { level: 'block', title: '배송비배분 합계 ≠ 일반배송비 합계' });
      if (pnl.length) c.push(Math.abs(sumCol(pnl, '금액') - ta) <= Math.max(1, al.length) ? { level: 'ok', title: '손익생성 합계 = 배송비배분 합계' } : { level: 'block', title: '손익생성 합계 ≠ 배송비배분 합계' });
      const noShipper = gen.filter((r) => !s(r.화주코드));
      if (noShipper.length) c.push({ level: 'warn', title: `화주코드 없는 배송 ${noShipper.length}행`, detail: `${sum(noShipper.map((r) => n(r.월임용차) + n(r.구간용차))).toLocaleString()}원` });
      const hp = gen.filter(isHomeplus);
      c.push({ level: 'info', title: `홈플러스 배송 ${hp.length.toLocaleString()}행`, detail: '배송처·화주명에 "홈플러스"가 있는 행을 홈플러스배송비 탭으로 나눕니다.' });
    }
    const pend = res.filter((x) => x.v === '확인필요').length;
    if (pend) c.push({ level: 'warn', title: `권역 판정 확인필요 ${pend}건은 간선비로 분류됨`, detail: '간선비 배분 조회 › 운행 권역판정 탭에서 확인' });
    c.push({ level: 'info', title: '배분 기준', detail: app.has('M03.actual') ? '배송 물동량(차량ID·회전)에 있는 회전 = 배송비. 그 회전의 재배분 금액(월임: 차량·회전번호 월평균, 유류: 차량 월 유류 × 거리비율)을 배분CBM = max(배송CBM, 최소CBM) 비율로' : '배송 물동량 없음 → SCE가 화주별로 나눈 운행 금액 그대로' });
    if (offShippers.size) {
      const off = trips.filter((t) => offShippers.has(t.shipperId));
      c.push({ level: 'info', title: `고객사 관리에 없거나 사용여부 N인 화주 운행 ${off.length.toLocaleString()}건 제외`, detail: `${[...new Set(off.map((t) => `${t.shipperId} ${t.shipper}`))].slice(0, 10).join(', ')} — ${sum(off.map((t) => t.fee + t.road + t.fuel + t.extFuel + t.extra + t.section)).toLocaleString()}원. 넣으려면 원가배분 고객사 관리에 등록(사용 Y)` });
    }
    if (rules.length && trips) {
      const idx = trips.map((_, i) => i);
      const p = partition(idx, rules, { 부서: (i) => [String(deptCode(trips[i].dept)), trips[i].dept], 센터: (i) => [trips[i].src, trips[i].src], 화주: (i) => [trips[i].shipperId, trips[i].shipper], 거래처: (i) => ['', trips[i].dst] });
      const ds = dropSummary(p.dropped.filter((d) => res[d.x]?.v === '배송'), (i) => { const t = trips[i]; return t.fee + t.road + t.fuel + t.extFuel + t.extra + t.section; });
      c.push({ level: 'info', title: `제외 기준으로 빠진 배송 운행 ${sum(ds.map((d) => n(d.건수))).toLocaleString()}건`, detail: ds.map((d) => `${s(d.구분)} ${s(d.명칭) || s(d.코드)}: ${n(d.건수)}건 ${n(d.금액).toLocaleString()}원`).join(' / ') || '없음' });
    }
    return c;
  }, [app, app.version, trips, res, rules, offShippers]);

  return (
    <Screen id="JTPF040090" title="배송비 배분 조회" menu="M09" tabs={TABS} tab={tab} onTab={setTab}
      conds={<>
        <MonthCond range />
        <TextCond label="화주코드" k="화주" conds={conds} />
        <TextCond label="부서" k="부서" conds={conds} />
        {(tab === 'transport' || tab === 'general' || tab === 'homeplus') && <><SelCond label="차량구분" k="차량구분" conds={conds} opts={['월임차량', '구간차량']} /><TextCond label="차량번호" k="차량번호" conds={conds} /></>}
        {tab === 'transport' && <SelCond label="운송구분" k="운송구분" conds={conds} opts={['배송비', '간선비']} />}
      </>}
      actions={[{ label: '운송비\nSCE I/F', onClick: sceIF }, { label: '배송비\n생성', onClick: gen }, { label: '손익반영', onClick: reflect }]}
      onQuery={() => app.say('1개의 테이블이 조회되었습니다.')}
      onExcel={xl.exportNow}
      checks={checks} help={<Help />}
    >
      <input ref={file} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
      <Grid cols={COLS[tab]} rows={rows} onView={xl.onView} />
    </Screen>
  );
}

function Help() {
  return (
    <div>
      <h4>무엇을 하나</h4>
      <p>SCE 운행(화주별 운행실적)의 배송 운행 금액을 화주에게 나눠 배송비 손익을 만든다. 간선 운행은 여기서 금액만 보이고 배분은 간선비 배분 조회에서 한다.</p>
      <h4>순서</h4>
      <ol>
        <li><b>운송비 SCE I/F</b>: 화주별 운행실적을 차량·회전 단위로 모은다(원가배분 고객사 관리에 없거나 사용여부 N인 화주는 뺀다).<br />운송구분 = 배송 물동량에 그 차량·회전이 있으면 배송비, 없으면 간선비(배송 물동량이 없는 날은 권역 판정으로 대신).<br />월임용차료(재배분) = 같은 차량·회전번호의 월 운송료 ÷ 회전 수. 유류대(재배분) = 차량 월 (유류대+외부주유) × 회전 거리 ÷ 차량 월 거리.</li>
        <li><b>배송비 생성</b>: 일반배송비(화주·배송처 단위) → 배송비배분(부서·화주·차량구분 합) → 손익생성.<br />배송비 회전의 재배분 금액 × 배분CBM 비율(배분CBM = max(배송CBM, 최소CBM 0.045)), 행마다 반올림. 9월 예: 61,500 × 22.17% = 13,635.<br />배송 물동량이 없으면 SCE가 이미 화주별로 나눈 금액을 그대로 쓴다.</li>
        <li><b>손익반영</b>: 손익생성 행의 배분여부를 Y로.</li>
      </ol>
      <h4>제외</h4>
      <p>부서·센터 제외 → 그 운행 금액을 뺀다. 화주·거래처 제외 → 배송 물동량이 있으면 회전 안에서 다른 화주에게 다시 나누고, 없으면 그 금액을 뺀다.</p>
      <h4>알아둘 점</h4>
      <p>2026-10-16 종합정보 9월 자료와 대사: 운송비 탭 13,858행의 금액·재배분·거리 100% 일치, 9/1 운송구분 100% 일치, 9/1~9/3 일반배송비 금액 공식 100% 일치(같은 CBM 기준). 9월 운행실적 중 3869 (주)한솥·4005 (주)딜리버리랩·4091 (주)비엘컴퍼니·4098 화덕으로간고등어는 종합정보 운송비에 없다(종합정보 고객사 관리 확인: 한솥 사용 N, 나머지 3개 미등록).</p>
    </div>
  );
}
