'use client';
import { useMemo, useState } from 'react';
import Screen, { type Check } from '../ui/Screen';
import Grid from '../ui/Grid';
import { MonthCond, TextCond, useConds, useEditable, useExcel, useUpload } from '../ui/common';
import { useApp } from '../lib/store';
import type { Col, Row } from '../lib/types';
import * as C from './cols';
import { activeRules, dropSummary, partition } from '../lib/exclude';
import { laborDept, laborPnl, laborShipper, workload } from '../calc/labor';
import { delivBasisFromM03, delivBasisFromTrips } from '../calc/trunk';
import { deptCode } from '../lib/judge';
import { n, s, stamp, sumCol, ymDash } from '../lib/util';

const TABS = [{ key: 'shipper', title: '화주별' }, { key: 'dept', title: '부서별' }, { key: 'work', title: '작업량' }, { key: 'input', title: '작업비입력' }, { key: 'pnl', title: '손익반영' }];
const TABLE: Record<string, string> = { shipper: 'M11.shipper', dept: 'M11.dept', work: 'M11.work', input: 'M11.input', pnl: 'M11.pnl' };
const COLS: Record<string, Col[]> = { shipper: C.M11_SHIPPER, dept: C.M11_DEPT, work: C.M11_WORK, input: C.M11_INPUT, pnl: C.M11_PNL };

export default function M11() {
  const app = useApp();
  const { month, user, trips, res } = app;
  const [tab, setTab] = useState('shipper');
  const conds = useConds({ 화주: '', 부서: '', 세부항목: '' });
  const ed = useEditable('M11.input', 'M11');
  const [checked, setChecked] = useState<Set<Row>>(new Set());
  const upload = useUpload();
  const xl = useExcel(COLS[tab], `${month}_노무비배분_${TABS.find((t) => t.key === tab)?.title}.xlsx`);
  const rules = useMemo(() => activeRules(app.rows('X.rules'), month, '노무비'), [app, month, app.version]);
  const raw = tab === 'input' ? ed.rows : app.rows(TABLE[tab]);
  const rows = conds.apply(raw, { 화주: ['화주코드', '화주명', '화주'], 부서: ['관리부서', '부서명', '부서'], 세부항목: ['세부항목'] });

  const gen = () => app.run('작업비 배분생성', async () => {
    const m03 = [...app.rows('M03.actual'), ...app.rows('M03.adj')];
    if (!m03.length) { app.say('배송 물동량이 없습니다. 피킹건수를 낼 수 없습니다.'); return; }
    const st = stamp(user);
    const extra = app.rows('M12.extra');
    const fix = extra.length ? new Map(extra.map((r) => [s(r.화주코드), n(r.보관가중치)])) : null;
    let work = workload(m03, [...app.rows('M04.actual'), ...app.rows('M04.adj')], app.rows('M01.head'), app.rows('M02.work'), app.rows('M02.transport'), fix, st, app.rows('M01.detail'));
    const pw = partition(work, rules, { 화주: (r) => [s(r.화주코드), s(r.화주명)], 거래처: (r) => [s(r.코드), s(r.거래처명)], 센터: (r) => [s(r.출고센터명), s(r.출고센터명)], 부서: (r) => [String(deptCode(s(r.부서명))), s(r.부서명)] });
    work = pw.kept;
    const pi = partition(app.rows('M11.input'), rules, { 센터: (r) => [s(r.센터코드), s(r.센터명)], 부서: (r) => [String(deptCode(s(r.관리부서))), s(r.관리부서)] });
    const sh = laborShipper(work, pi.kept, month, st, app.rows('M02.transport'));
    const basis = m03.length ? delivBasisFromM03(m03) : trips ? delivBasisFromTrips(trips, res) : [];
    const dept = laborDept(sh, basis, st);
    const pnl = laborPnl(dept, month, st);
    await app.put('M11.work', work, `작업량 ${work.length}행 (제외 ${pw.dropped.length})`, 'M11');
    await app.put('M11.shipper', sh, `노무비 화주별 ${sh.length}행 ${sumCol(sh, '배분액').toLocaleString()}원`, 'M11');
    await app.put('M11.dept', dept, `노무비 부서별 ${dept.length}행`, 'M11');
    await app.put('M11.pnl', pnl, `노무비 손익 ${pnl.length}행`, 'M11');
    app.say(`작업량 ${work.length.toLocaleString()} · 화주별 ${sh.length.toLocaleString()} · 부서별 ${dept.length.toLocaleString()}행${fix ? ' (추가배분 난이도 가중치 적용)' : ''}`);
    setTab('shipper');
  });
  const reflect = () => app.run('손익반영', async () => {
    const pnl = app.rows('M11.pnl'); if (!pnl.length) { app.say('손익 데이터가 없습니다.'); return; }
    await app.put('M11.pnl', pnl.map((r) => ({ ...r, 배분여부: 'Y' })), `손익반영 ${pnl.length}행`, 'M11');
    app.say('손익반영 표시(배분여부 Y)를 했습니다.');
  });

  const checks: Check[] = useMemo(() => {
    const c: Check[] = [];
    const input = app.rows('M11.input'), sh = app.rows('M11.shipper'), dept = app.rows('M11.dept'), work = app.rows('M11.work'), pnl = app.rows('M11.pnl');
    c.push(input.length ? { level: 'ok', title: `작업비입력 ${input.length}행 ${sumCol(input, '총계').toLocaleString()}원` } : { level: 'block', title: '작업비입력(도급료)이 없습니다' });
    if (!app.has('M03.actual')) c.push({ level: 'block', title: '배송 물동량이 없습니다', detail: '피킹건수(작업량)의 원천입니다.' });
    const pi = partition(input, rules, { 센터: (r) => [s(r.센터코드), s(r.센터명)], 부서: (r) => [String(deptCode(s(r.관리부서))), s(r.관리부서)] });
    if (sh.length) {
      const pool = new Map<string, number>(); pi.kept.forEach((r) => pool.set(s(r.관리부서), (pool.get(s(r.관리부서)) ?? 0) + n(r.총계)));
      const got = new Map<string, number>(); sh.forEach((r) => got.set(s(r.관리부서), (got.get(s(r.관리부서)) ?? 0) + n(r.배분액)));
      const noWork = [...pool].filter(([d, v]) => v && !got.get(d));
      if (noWork.length) c.push({ level: 'block', title: `작업량이 없어 배분되지 않은 도급료 ${noWork.length}개 부서`, detail: noWork.map(([d, v]) => `${d} ${v.toLocaleString()}`).join(', ') + ' — 그 부서 출고센터의 배송/이고 물동량을 확인' });
      const noPool = [...got.keys()].filter((d) => !pool.has(d));
      const workNoPool = work.filter((r) => noPool.includes(s(r.부서명)));
      if (workNoPool.length) c.push({ level: 'warn', title: `도급료가 없는 부서의 작업량 ${workNoPool.length}행`, detail: `${noPool.join(', ') || '(부서 없음)'} — 배분액 0. 출고센터 → 운영부서 매핑(기준관리 운송비 탭)을 확인` });
      const tin = sumCol(pi.kept, '총계'), tsh = sumCol(sh, '배분액');
      c.push(Math.abs(tin - tsh) < 1 ? { level: 'ok', title: '도급료 합계 = 화주별 배분액 합계', detail: tsh.toLocaleString() } : { level: 'warn', title: '도급료 합계 ≠ 화주별 배분액 합계', detail: `${tin.toLocaleString()} / ${tsh.toLocaleString()} / 차이 ${(tin - tsh).toLocaleString()}` });
      c.push(Math.abs(sumCol(dept, '배분액') - tsh) < 1 ? { level: 'ok', title: '부서별 합계 = 화주별 합계' } : { level: 'block', title: '부서별 합계 ≠ 화주별 합계' });
      if (pnl.length) c.push(Math.abs(sumCol(pnl, '금액') - tsh) < 1 ? { level: 'ok', title: '손익 합계 = 화주별 합계' } : { level: 'block', title: '손익 합계 ≠ 화주별 합계' });
      const tw = sumCol(work, '계'), ts = sumCol(sh, '작업량');
      c.push(Math.abs(tw - ts) < 0.01 ? { level: 'ok', title: '작업량 탭 합계 = 화주별 작업량 합계', detail: tw.toLocaleString(undefined, { maximumFractionDigits: 1 }) } : { level: 'warn', title: '작업량 탭 합계 ≠ 화주별 작업량 합계', detail: `${tw.toFixed(1)} / ${ts.toFixed(1)} (9월 종합정보에서도 약 1만 차이가 있었음)` });
      const noW = work.filter((r) => !app.rows('M02.work').some((w) => s(w.화주코드) === s(r.화주코드)));
      const ns = new Set(noW.map((r) => s(r.화주코드)));
      if (ns.size) c.push({ level: 'warn', title: `작업비 가중치가 없는 화주 ${ns.size}개 (보관 1.5 기본값)`, detail: [...ns].slice(0, 15).join(', ') });
    }
    if (pi.dropped.length) c.push({ level: 'info', title: `제외 기준으로 뺀 도급료 ${pi.dropped.length}행`, detail: dropSummary(pi.dropped, (r) => n(r.총계)).map((d) => `${s(d.명칭) || s(d.코드)} ${n(d.금액).toLocaleString()}`).join(', ') });
    if (rules.length) c.push({ level: 'info', title: `적용 중인 제외 기준 ${rules.length}개`, detail: rules.map((r) => `${r.kind} ${r.name || r.code}`).join(', ') });
    if (app.has('M12.extra')) c.push({ level: 'info', title: '화주별 노무비 추가배분의 난이도 가중치를 보관 가중치로 씀' });
    return c;
  }, [app, app.version, rules]);

  const isEdit = tab === 'input';
  return (
    <Screen id="JTPF040110" title="노무비 배분 조회" menu="M11" tabs={TABS} tab={tab} onTab={(k) => { setTab(k); setChecked(new Set()); }}
      conds={<><MonthCond range /><TextCond label="화주코드" k="화주" conds={conds} /><TextCond label="부서" k="부서" conds={conds} /><TextCond label="세부항목" k="세부항목" conds={conds} /></>}
      actions={[{ label: '작업비\n배분생성', onClick: gen }, { label: '손익반영', onClick: reflect }, { label: '전체선택', onClick: () => setChecked(new Set(ed.rows)), tabs: ['input'] }]}
      onQuery={() => { ed.reset(); app.say('1개의 테이블이 조회되었습니다.'); }}
      onNew={isEdit ? () => ed.add({ 년월: `${ymDash(month)}-01`, 원가구분: '인건노무비', 세부항목: '도급료' }) : undefined}
      onSave={isEdit ? () => ed.save('작업비입력 저장') : undefined}
      onDelete={isEdit ? () => { ed.remove(checked); setChecked(new Set()); } : undefined}
      dirty={isEdit && ed.dirty}
      onExcel={xl.exportNow} onTemplate={isEdit ? xl.templateNow : undefined}
      onUpload={isEdit ? (f) => upload(f, 'M11.input', C.M11_INPUT, 'M11', { fill: (r) => ({ 년월: `${ymDash(month)}-01`, 원가구분: '인건노무비', 세부항목: '도급료', ...r }) }) : undefined}
      checks={checks} help={<Help />}
    >
      <Grid cols={COLS[tab]} rows={rows} onView={xl.onView} check={isEdit} checked={checked} onCheck={setChecked} onEdit={isEdit ? ed.edit : undefined} />
    </Screen>
  );
}

function Help() {
  return (
    <div>
      <h4>무엇을 하나</h4><p>센터 도급료(인건노무비)를 화주 작업량 비율로 나눈다.</p>
      <h4>순서</h4>
      <ol>
        <li><b>작업비입력</b>: 센터·관리부서별 도급료 (9월 8행 1,365,132,716).</li>
        <li><b>작업량</b>: 배송 물동량(배송센터 출고) + 이고 물동량(메인센터 출고)의 피킹건수 × 가중치. 보관 가중치 = 기준관리 작업비 탭(화주별 1.5~2.1, 추가배분 난이도 가중치가 있으면 그것), C/D 1.0.</li>
        <li><b>화주별</b>: 관리부서(출고센터의 운영부서) 도급료 × (화주·출고센터 작업량 ÷ 관리부서 작업량). 9월 예: 화성운영팀 작업량 1당 1,066.6원 → 미트밸리 화성 24.0 = 25,598.</li>
        <li><b>부서별</b>: 권역간(이고 피킹) 금액을 그 화주의 배송부서·배송센터 배송CBM 비율로. 9월 예: 52,718 × 9.46% = 4,987.</li>
        <li><b>손익반영</b>.</li>
      </ol>
      <h4>확인 못 한 부분</h4><p>피킹건수를 물동량 행 수로 셉니다. 종합정보가 주문 라인/수량 중 무엇을 쓰는지 확인이 필요합니다.</p>
      <h4>제외</h4><p>화주·거래처 제외 → 작업량에서 빼서 나머지가 나눠 가짐. 센터·부서 제외 → 그 도급료를 뺌.</p>
    </div>
  );
}
