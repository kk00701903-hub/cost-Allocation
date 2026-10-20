'use client';
import { useMemo, useState } from 'react';
import Screen, { type Check } from '../ui/Screen';
import Grid from '../ui/Grid';
import { MonthCond, SelCond, TextCond, useConds, useEditable, useExcel, useUpload } from '../ui/common';
import { useApp } from '../lib/store';
import type { Col, Row } from '../lib/types';
import * as C from './cols';
import { activeRules, dropSummary, partition } from '../lib/exclude';
import { adjustRows, deptAdjust, deptAlloc, delivBasisFromM03, delivBasisFromTrips, routesFromTransfer, routesFromTrips, shipperAlloc, systemFromTrips, trunkPnl, uploadToInput, T_ITEMS, pools } from '../calc/trunk';
import { amountsOf, deptCode, deptName, DEPTS } from '../lib/judge';
import { n, s, stamp, sum, sumCol, ymDash } from '../lib/util';

const TABS = [
  { key: 'shipper', title: '화주별' }, { key: 'dept', title: '부서별' }, { key: 'input', title: '간선비입력' }, { key: 'deptadj', title: '부서간조정' },
  { key: 'pnl', title: '손익생성' }, { key: 'upload', title: '간선비업로드' }, { key: 'judge', title: '운행 권역판정', added: true },
];
const TABLE: Record<string, string> = { shipper: 'M10.shipper', dept: 'M10.dept', input: 'M10.input', deptadj: 'M10.deptadj', pnl: 'M10.pnl', upload: 'M10.upload' };
const COLS: Record<string, Col[]> = { shipper: C.M10_SHIPPER, dept: C.M10_DEPT, input: C.M10_INPUT, deptadj: C.M10_DEPTADJ, pnl: C.M10_PNL, upload: C.M10_UPLOAD, judge: C.M10_JUDGE };
const EDITABLE = new Set(['input', 'deptadj', 'upload']);

export default function M10() {
  const app = useApp();
  const { month, user, trips, res, judge } = app;
  const [tab, setTab] = useState('shipper');
  const conds = useConds({ 화주: '', 이고구분: '' });
  const table = TABLE[tab];
  const ed = useEditable(table ?? 'M10.none', 'M10');
  const [checked, setChecked] = useState<Set<Row>>(new Set());
  const upload = useUpload();
  const xl = useExcel(COLS[tab], `${month}_간선비배분_${TABS.find((t) => t.key === tab)?.title}.xlsx`);
  const alloc = judge?.alloc ?? {};
  const rules = useMemo(() => activeRules(app.rows('X.rules'), month, '간선비'), [app, month, app.version]);

  const judgeRows = useMemo<Row[]>(() => {
    if (tab !== 'judge' || !trips) return [];
    const out: Row[] = [];
    trips.forEach((t, i) => {
      if (res[i]?.v === '배송') return;
      out.push({ 배송일: t.date, 실행부서: t.dept, 관리화주ID: t.shipperId, 관리화주명: t.shipper, 상차지명: t.src, 하차지명: t.dst, 차량구분: t.carType,
        매출액: t.sales, 간선비: sum(amountsOf(t)), 판정: res[i]?.v, 근거: res[i]?.why, 원가배부: alloc[t.dept] === false ? '제외' : '대상', '원본 배송구분': t.xlsKind, _warn: res[i]?.v === '확인필요' ? 1 : null });
    });
    return out;
  }, [tab, trips, res, alloc]);

  const raw = tab === 'judge' ? judgeRows : EDITABLE.has(tab) ? ed.rows : app.rows(table);
  const rows = conds.apply(raw, { 화주: ['화주코드', '화주명', '화주', '관리화주명'], 이고구분: ['이고구분', '판정'] });

  // ---------- 생성 ----------
  const genShipper = () => app.run('화주별 생성', async () => {
    const m04 = [...app.rows('M04.actual'), ...app.rows('M04.adj')];
    const useM04 = m04.length > 0;
    let routes = useM04 ? routesFromTransfer(m04) : trips ? routesFromTrips(trips, res, alloc) : [];
    if (!routes.length) { app.say('이고 물동량도 운행실적도 없어 만들 수 없습니다.'); return; }
    // 종합정보: 원가배분 고객사 관리에서 간선여부 N인 화주의 이고는 간선비 배분에서 빠진다 (9월: 이천·유통2 메인 화주 72개)
    const heads = app.rows('M01.head');
    if (useM04 && heads.length) {
      const on = new Set(heads.filter((h) => s(h.간선여부) === 'Y').map((h) => s(h.화주코드)));
      routes = routes.filter((r) => on.has(r.화주코드));
    }
    const p = partition(routes, rules, { 화주: (r) => [r.화주코드, r.화주명], 부서: (r) => [String(deptCode(r.운영부서)), r.운영부서], 센터: (r) => [r.출고센터, r.출고센터] });
    routes = p.kept;
    const inp = partition(app.rows('M10.input'), rules, { 부서: (r) => [s(r.부서), s(r.부서명)] });
    const out = shipperAlloc(inp.kept, routes, month, stamp(user), app.rows('M02.transport'));
    await app.put('M10.shipper', out, `화주별 생성 ${out.length}행 (기준: ${useM04 ? '이고 물동량 CBM' : '운행실적 금액(대체)'}, 제외 ${p.dropped.length + inp.dropped.length}건)`, 'M10');
    app.say(`화주별 ${out.length.toLocaleString()}행 생성 — 배분 기준: ${useM04 ? '이고 물동량 이고CBM' : '화주별 운행실적 간선 금액(이고 물동량 없음)'}`);
    setTab('shipper');
  });
  const genDept = () => app.run('부서별 생성', async () => {
    const sh = app.rows('M10.shipper');
    if (!sh.length) { app.say('화주별 생성을 먼저 하세요.'); return; }
    // 종합정보 BCKNL_CL_PL_TRUNKLINEDEPT: 기준 CBM = 배송 물동량(BC_KNL_CL_TRANS_DELIVERY) + 조정입력(BC_KNL_CL_TRANS_DELIVERY_EXCEL) UNION ALL
    const m03 = [...app.rows('M03.actual'), ...app.rows('M03.adj')];
    const basis = m03.length ? delivBasisFromM03(m03) : trips ? delivBasisFromTrips(trips, res) : [];
    const st = stamp(user);
    const dept = deptAlloc(sh, basis, st, app.rows('M02.transport'));
    const adj = deptAdjust(dept, app.rows('M10.input'), month, st);
    const pnl = trunkPnl(dept, month, st);
    if (app.has('M10.deptadj') && !window.confirm(`부서간조정 ${app.rows('M10.deptadj').length}행을 새 계산값 ${adj.length}행으로 바꿉니다. 계속할까요?`)) return;
    await app.put('M10.dept', dept, `부서별 생성 ${dept.length}행 (기준: ${m03.length ? '배송 물동량 CBM' : '운행실적 배송 금액(대체)'})`, 'M10');
    await app.put('M10.deptadj', adj, `부서간조정 생성 ${adj.length}행`, 'M10');
    await app.put('M10.pnl', pnl, `손익생성 ${pnl.length}행`, 'M10');
    app.say(`부서별 ${dept.length.toLocaleString()}행, 부서간조정 ${adj.length}행, 손익 ${pnl.length.toLocaleString()}행을 만들었습니다.`);
    setTab('dept');
  });
  const reflect = () => app.run('손익반영', async () => {
    const pnl = app.rows('M10.pnl');
    if (!pnl.length) { app.say('손익생성 데이터가 없습니다.'); return; }
    if (checks.some((c) => c.level === 'block')) { if (!window.confirm('차단 검증이 남아 있습니다. 그래도 손익반영으로 표시할까요?')) return; }
    await app.put('M10.pnl', pnl.map((r) => ({ ...r, 배분여부: 'Y' })), `손익반영 ${pnl.length}행 ${sumCol(pnl, '금액').toLocaleString()}원`, 'M10');
    await app.put('M10.deptadj', app.rows('M10.deptadj').map((r) => ({ ...r, 배분여부: 'Y' })), '부서간조정 손익반영', 'M10');
    app.say('손익반영 표시(배분여부 Y)를 했습니다. 실제 종합정보 반영은 손익생성 탭을 엑셀로 내려받아 올리세요.');
  });
  const calcAdjust = () => app.run('권역조정 계산', async () => {
    if (!trips) { app.say('운행실적이 없습니다.'); return; }
    const pend = res.filter((x) => x.v === '확인필요').length;
    const rows2 = adjustRows(trips, res, alloc, month, stamp(user));
    if (!window.confirm(`권역조정 ${rows2.length}행(${rows2.length / 2}개 팀)을 간선비업로드 탭에 만듭니다.${pend ? `\n확인필요 운행 ${pend}건은 빠져 있습니다.` : ''}\n원가배부 제외 팀: ${DEPTS.filter((d) => alloc[d.name] === false).map((d) => d.name).join(', ') || '없음'}`)) return;
    await app.put('M10.upload', rows2, `권역조정 계산 ${rows2.length}행`, 'M10');
    setTab('upload');
  });
  const applyUpload = () => app.run('선택 반영', async () => {
    const sel = ed.rows.filter((r) => checked.has(r));
    if (!sel.length) { app.say('반영할 행을 체크하세요.'); return; }
    const depts = new Set(sel.map((r) => n(r.부서코드)));
    const keep = app.rows('M10.input').filter((r) => !(s(r.생성구분) === 'EXCEL' && depts.has(n(r.부서))));
    const next = [...keep, ...sel.map((r) => uploadToInput(r, month))].sort((a, b) => n(a.부서) - n(b.부서));
    if (!window.confirm(`${[...depts].join(', ')} 부서의 EXCEL 조정 행을 선택한 ${sel.length}행으로 바꿉니다.`)) return;
    await app.put('M10.input', next, `간선비업로드 → 간선비입력 반영 ${sel.length}행 (부서 ${[...depts].join(',')})`, 'M10');
    setChecked(new Set());
    app.say('간선비입력에 반영했습니다. 화주별 생성 → 부서별 생성을 다시 하세요.');
  });
  const sysFromTrips = () => app.run('SYSTEM 집계', async () => {
    if (!trips) return;
    const sys = systemFromTrips(trips, res, month);
    if (!window.confirm(`운행실적 간선 운행으로 SYSTEM 행 ${sys.length}개를 다시 만듭니다(EXCEL 행은 그대로). 종합정보 SYSTEM 값과 다를 수 있습니다. 계속할까요?`)) return;
    const next = [...app.rows('M10.input').filter((r) => s(r.생성구분) !== 'SYSTEM'), ...sys].sort((a, b) => n(a.부서) - n(b.부서));
    await app.put('M10.input', next, `SYSTEM 행 운행실적 집계 ${sys.length}행`, 'M10');
  });

  // ---------- 검증 ----------
  const checks: Check[] = useMemo(() => {
    const c: Check[] = [];
    const input = app.rows('M10.input'), sh = app.rows('M10.shipper'), dept = app.rows('M10.dept'), adj = app.rows('M10.deptadj'), pnl = app.rows('M10.pnl');
    const inp = partition(input, rules, { 부서: (r) => [s(r.부서), s(r.부서명)] });
    const totInKept = sum(inp.kept.map((r) => sum(T_ITEMS.map((k) => n(r[k])))));
    const totSh = sumCol(sh, '합계');
    if (sh.length) c.push(Math.abs(totInKept - totSh) < 1 ? { level: 'ok', title: '간선비입력 합계 = 화주별 배분 합계', detail: `${totSh.toLocaleString()}원` }
      : { level: 'block', title: '간선비입력 합계 ≠ 화주별 배분 합계', detail: `입력(제외 반영) ${totInKept.toLocaleString()} / 배분 ${totSh.toLocaleString()} / 차이 ${(totInKept - totSh).toLocaleString()} — 다시 생성하거나 권역내 구간 없는 부서를 확인` });
    const left = sh.filter((r) => s(r.화주명) === '(권역내 구간 없음)');
    if (left.length) c.push({ level: 'warn', title: `권역내 금액을 받을 구간이 없는 부서 ${left.length}개`, detail: left.map((r) => `${s(r.운영부서)} ${n(r.합계).toLocaleString()}`).join(', ') });
    if (dept.length) {
      const td = sumCol(dept, '합계');
      c.push(Math.abs(td - totSh) < 1 ? { level: 'ok', title: '부서별 합계 = 화주별 합계', detail: `${td.toLocaleString()}원` } : { level: 'block', title: '부서별 합계 ≠ 화주별 합계', detail: `${td.toLocaleString()} / ${totSh.toLocaleString()}` });
    }
    if (adj.length) {
      const t = sumCol(adj, '금액');
      c.push(Math.abs(t) < 1 ? { level: 'ok', title: '부서간조정 합계 0', detail: `${adj.length}행` } : { level: 'block', title: '부서간조정 합계가 0이 아님', detail: `${t.toLocaleString()}원` });
    }
    if (pnl.length && dept.length) {
      const tp = sumCol(pnl, '금액'), td = sumCol(dept, '합계');
      c.push(Math.abs(tp - td) < 1 ? { level: 'ok', title: '손익생성 합계 = 부서별 합계' } : { level: 'block', title: '손익생성 합계 ≠ 부서별 합계', detail: `${tp.toLocaleString()} / ${td.toLocaleString()}` });
    }
    // EXCEL 쌍 합계, 권역간 순액
    const ex = new Map<number, number>(); const net = new Map<number, number>();
    for (const r of input) {
      const v = sum(T_ITEMS.map((k) => n(r[k])));
      if (s(r.생성구분) === 'EXCEL') ex.set(n(r.부서), (ex.get(n(r.부서)) ?? 0) + v);
      if (s(r.이고구분) === '권역간') net.set(n(r.부서), (net.get(n(r.부서)) ?? 0) + v);
    }
    const badPair = [...ex].filter(([, v]) => Math.abs(v) > 0.5);
    c.push(badPair.length ? { level: 'block', title: 'EXCEL 조정 권역간/권역내 쌍 합계가 0이 아님', detail: badPair.map(([d, v]) => `${d} ${v.toLocaleString()}`).join(', ') } : { level: 'ok', title: `EXCEL 조정 쌍 합계 0 (${ex.size}개 부서)` });
    const negNet = [...net].filter(([, v]) => v < 0);
    if (negNet.length) c.push({ level: 'warn', title: '권역간 순액이 마이너스인 부서', detail: `${negNet.map(([d, v]) => `${d} ${deptName(d)} ${v.toLocaleString()}`).join(', ')} — 등록 간선비보다 많이 옮겼습니다. 화주 배분이 음수가 됩니다.` });
    const { intra } = pools(input);
    if (intra.size) c.push({ level: 'info', title: '권역내 풀(부서 안에서만 배분)', detail: [...intra].map(([d, a]) => `${d} ${sum(a).toLocaleString()}`).join(', ') });
    // 판정
    const pend = res.filter((x) => x.v === '확인필요').length;
    if (trips) c.push(pend ? { level: 'warn', title: `권역 판정 확인필요 ${pend}건`, detail: '운행 권역판정 탭에서 노란 행. 판정 마스터·배송센터를 보완하세요(간선비 권역조정 앱 S02와 같은 규칙).' } : { level: 'ok', title: '권역 판정 확인필요 0건' });
    const off = DEPTS.filter((d) => alloc[d.name] === false).map((d) => `${d.code} ${d.name}`);
    if (off.length) c.push({ level: 'info', title: '원가배부(권역조정) 제외 팀', detail: `${off.join(', ')} — 이 팀의 권역내 판정 운행은 권역간 풀에 남습니다.` });
    const offUp = input.filter((r) => s(r.생성구분) === 'EXCEL' && alloc[deptName(n(r.부서))] === false);
    if (offUp.length) c.push({ level: 'warn', title: '원가배부 제외 팀에 EXCEL 조정이 들어 있음', detail: [...new Set(offUp.map((r) => `${s(r.부서)} ${s(r.부서명)}`))].join(', ') + ' — 의도한 것인지 확인' });
    c.push({ level: 'info', title: '배분 기준', detail: `화주별: ${app.has('M04.actual') ? '이고 물동량 이고CBM' : '이고 물동량 없음 → 운행실적 간선 금액으로 대체'} / 부서별: ${app.has('M03.actual') ? '배송 물동량 배송CBM' : '배송 물동량 없음 → 운행실적 배송 금액으로 대체'}` });
    if (inp.dropped.length) c.push({ level: 'info', title: `제외 기준으로 빠진 간선비입력 ${inp.dropped.length}행`, detail: dropSummary(inp.dropped, (r) => sum(T_ITEMS.map((k) => n(r[k])))).map((d) => `${s(d.명칭) || s(d.코드)} ${n(d.금액).toLocaleString()}원`).join(', ') });
    if (rules.length) c.push({ level: 'info', title: `적용 중인 제외 기준 ${rules.length}개`, detail: rules.map((r) => `${r.kind} ${r.name || r.code}`).join(', ') });
    return c;
  }, [app, app.version, rules, res, trips, alloc]);

  const isEdit = EDITABLE.has(tab);
  return (
    <Screen id="JTPF040100" title="간선비 배분 조회" menu="M10" tabs={TABS} tab={tab} onTab={(k) => { setTab(k); setChecked(new Set()); }}
      conds={<>
        <MonthCond range />
        <TextCond label="화주코드" k="화주" conds={conds} />
        <SelCond label="이고구분" k="이고구분" conds={conds} opts={tab === 'judge' ? ['권역간', '권역내', '확인필요'] : ['권역간', '권역내']} />
      </>}
      actions={[
        { label: '화주별\n생성', onClick: genShipper },
        { label: '부서별\n생성', onClick: genDept },
        { label: '손익반영', onClick: reflect },
        { label: '권역조정\n계산', onClick: calcAdjust, tabs: ['upload'], added: true, title: '운행 판정에서 권역내로 나온 간선 금액을 팀별 권역간→권역내 조정 행으로' },
        { label: '선택 행\n입력 반영', onClick: applyUpload, tabs: ['upload'], added: true },
        { label: 'SYSTEM\n운행집계', onClick: sysFromTrips, tabs: ['input'], added: true, title: '운행실적 간선 운행으로 SYSTEM 행 다시 만들기' },
      ]}
      onQuery={() => { ed.reset(); app.say('1개의 테이블이 조회되었습니다.'); }}
      onNew={isEdit && tab !== 'upload' ? () => ed.add(tab === 'input' ? { 실적월: `${ymDash(month)}-01`, 비용구분: '간선비', 이고구분: '권역간', 생성구분: 'EXCEL' } : { 기준월: `${ymDash(month)}-01`, 화주: '9005', 화주명: '3PL공통', 부문: '3PL부문', 사업영역: '12213', 중구분: 'K21', 배분여부: 'N' }) : undefined}
      onSave={isEdit ? () => ed.save(`${TABS.find((t) => t.key === tab)?.title} 저장`) : undefined}
      onDelete={isEdit ? () => { ed.remove(checked); setChecked(new Set()); } : undefined}
      dirty={isEdit && ed.dirty}
      onExcel={xl.exportNow} onTemplate={tab === 'upload' ? xl.templateNow : undefined}
      onUpload={tab === 'upload' ? (f) => upload(f, 'M10.upload', C.M10_UPLOAD, 'M10', { fill: (r) => ({ 선택: 'Y', 비용구분: '간선비', ...r, 합계: sum(T_ITEMS.map((k) => n(r[k]))) }) }) : undefined}
      checks={checks}
      help={<Help />}
    >
      <Grid cols={COLS[tab]} rows={rows} onView={xl.onView} check={isEdit} checked={checked} onCheck={setChecked}
        onEdit={isEdit ? (r, k, v) => ed.edit(r, k, v) : undefined}
        empty={tab === 'judge' && !trips ? '운행실적이 없습니다. 배송비 배분 조회 › 운송비 SCE I/F에서 가져오세요.' : undefined} />
    </Screen>
  );
}

function Help() {
  return (
    <div>
      <h4>무엇을 하나</h4>
      <p>부서마다 등록된 간선비를 화주에게 나누고(화주별), 다시 실제 배송한 부서로 나눠(부서별) 손익 데이터를 만든다.</p>
      <h4>순서</h4>
      <ol>
        <li><b>간선비업로드</b>: [권역조정 계산]으로 배송센터 이름 없이 배차된 배송성 운행을 권역간→권역내로 옮기는 행을 만들고, 체크한 행을 [선택 행 입력 반영].</li>
        <li><b>간선비입력</b>: SYSTEM(등록 간선비) + EXCEL(권역조정). 권역간 행은 전 부서 공동 풀, 권역내 행은 그 부서 안에서만 쓴다.</li>
        <li><b>화주별 생성</b>: 권역간 풀 × (화주·구간 이고CBM ÷ 전체 권역간 이고CBM). 이고비율 = 화주 이고CBM 합 ÷ 전체.<br />9월 예: 월임 풀 31,508,267 ÷ 3,243.4CBM = CBM당 9,714.5 → 미트밸리 부산→호남 21.22CBM = 206,141</li>
        <li><b>부서별 생성</b>: 화주별 권역간 금액 × 그 화주의 차량부서·출고센터별 배송CBM 비율. 권역내는 이고부서에 그대로.<br />9월 예: 대현푸드빌 223,344 × 오산운영1팀 56.44% = 126,056</li>
        <li><b>부서간조정</b>(3PL공통 9005): 부서별 결과 부서 합 − 간선비입력 권역간 부서 합. 합계는 항상 0.</li>
        <li><b>손익생성 → 손익반영</b>: 소계정 22111 월임운송료, 22112 구간운송료, 22113 도로비, 22114 유류대.</li>
      </ol>
      <h4>원천이 없을 때</h4>
      <p>이고 물동량(M04)이 없으면 화주별 운행실적의 간선 금액을, 배송 물동량(M03)이 없으면 배송 금액을 비율 기준으로 대신 쓴다(검증 패널에 표시).</p>
      <h4>제외</h4>
      <p>배분 제외 기준의 화주는 배분 대상에서 빠지고(금액은 다른 화주로), 부서·센터는 간선비입력에서 빠진다. 팀별 원가배부(권역조정) 제외는 같은 메뉴의 팀 설정에서.</p>
      <h4>운행 권역판정 탭(신규)</h4>
      <p>R1 배송센터 → R2 판정 마스터 → R3 상차지=하차지 → R4 매출&gt;0 → R5 3PL공통 허브 → 확인필요. 노란 행이 확인필요.</p>
    </div>
  );
}
