'use client';
import { useMemo, useState } from 'react';
import Screen, { type Check } from '../ui/Screen';
import Grid from '../ui/Grid';
import { MonthCond, TextCond, useConds, useEditable, useExcel, useUpload } from '../ui/common';
import { useApp } from '../lib/store';
import type { Col, Row } from '../lib/types';
import * as C from './cols';
import { activeRules, dropSummary, partition } from '../lib/exclude';
import { storageAlloc, storagePnl, storageVolume } from '../calc/storage';
import { productInfo } from '../calc/volume';
import { deptCode } from '../lib/judge';
import { n, s, stamp, sumCol, ymDash } from '../lib/util';

const TABS = [{ key: 'alloc', title: '보관비배분' }, { key: 'volume', title: '물동량' }, { key: 'input', title: '보관비입력' }, { key: 'pnl', title: '손익생성' }];
const TABLE: Record<string, string> = { alloc: 'M08.alloc', volume: 'M08.volume', input: 'M08.input', pnl: 'M08.pnl' };
const COLS: Record<string, Col[]> = { alloc: C.M08_ALLOC, volume: C.M08_VOLUME, input: C.M08_INPUT, pnl: C.PNL };

export default function M08() {
  const app = useApp();
  const { month, user } = app;
  const [tab, setTab] = useState('alloc');
  const conds = useConds({ 화주: '', 부서: '', 센터: '', 세부항목: '' });
  const ed = useEditable('M08.input', 'M08');
  const [checked, setChecked] = useState<Set<Row>>(new Set());
  const upload = useUpload();
  const xl = useExcel(COLS[tab], `${month}_보관비배분_${TABS.find((t) => t.key === tab)?.title}.xlsx`);
  const rules = useMemo(() => activeRules(app.rows('X.rules'), month, '보관비'), [app, month, app.version]);
  const raw = tab === 'input' ? ed.rows : app.rows(TABLE[tab]);
  const rows = conds.apply(raw, { 화주: ['화주코드', '화주명', '화주'], 부서: ['부서명', '부서코드', '관리부서', '부서'], 센터: ['센터', '센터코드', '센터명', '메인센터'], 세부항목: ['세부항목'] });
  const shipperBiz = useMemo(() => new Map(app.rows('M01.head').map((h) => [s(h.화주코드), s(h.사업영역)])), [app, app.version]);

  const gen = () => app.run('원가배분', async () => {
    const stock = app.rows('M07.actual');
    if (!stock.length) { app.say('산출재고가 없습니다. 산출 재고 조회에서 생성하세요.'); return; }
    const st = stamp(user);
    const prod = productInfo(app.rows('M03.actual'), app.rows('M05.actual'), app.rows('M04.actual'), app.rows('M06.actual')); // 입고 단위CBM도 씀(재고만 있고 배송이 없는 제품)
    let vol = storageVolume(stock, app.rows('M02.storage'), app.rows('M01.head'), prod, app.rows('M02.transport'), st, [...app.rows('M03.actual'), ...app.rows('M03.adj')], app.rows('M01.detail'));
    const pv = partition(vol, rules, { 화주: (r) => [s(r.화주코드), s(r.화주명)], 센터: (r) => [s(r.메인센터), s(r.메인센터)], 부서: (r) => [String(deptCode(s(r.관리부서))), s(r.관리부서)] });
    vol = pv.kept;
    const pi = partition(app.rows('M08.input'), rules, { 센터: (r) => [s(r.센터코드), s(r.센터명)], 부서: (r) => [String(deptCode(s(r.관리부서))), s(r.관리부서)] });
    const alloc = storageAlloc(vol, pi.kept, app.rows('M02.transport'), st);
    const pnl = storagePnl(alloc, shipperBiz, month, st);
    await app.put('M08.volume', vol, `보관비 물동량 ${vol.length}행 (제외 ${pv.dropped.length})`, 'M08');
    await app.put('M08.alloc', alloc, `보관비 배분 ${alloc.length}행 ${sumCol(alloc, '배분원가').toLocaleString()}원 (원가 제외 ${pi.dropped.length})`, 'M08');
    await app.put('M08.pnl', pnl, `손익생성 ${pnl.length}행`, 'M08');
    app.say(`물동량 ${vol.length.toLocaleString()} · 배분 ${alloc.length.toLocaleString()} · 손익 ${pnl.length.toLocaleString()}행`);
    setTab('alloc');
  });
  const reflect = () => app.run('손익반영', async () => {
    const pnl = app.rows('M08.pnl'); if (!pnl.length) { app.say('손익생성 데이터가 없습니다.'); return; }
    await app.put('M08.pnl', pnl.map((r) => ({ ...r, 배분여부: 'Y' })), `손익반영 ${pnl.length}행`, 'M08');
    app.say('손익반영 표시(배분여부 Y)를 했습니다.');
  });

  const checks: Check[] = useMemo(() => {
    const c: Check[] = [];
    const input = app.rows('M08.input'), alloc = app.rows('M08.alloc'), vol = app.rows('M08.volume'), pnl = app.rows('M08.pnl');
    if (!input.length) c.push({ level: 'block', title: '보관비입력이 없습니다', detail: '원천 금액(센터·부서·온도·세부항목)을 Excel Upload 하세요. 9월 종합정보는 115행 1,404,039,557원.' });
    else c.push({ level: 'ok', title: `보관비입력 ${input.length}행 ${sumCol(input, '총계').toLocaleString()}원` });
    if (!app.has('M07.actual')) c.push({ level: 'block', title: '산출재고가 없습니다', detail: '기초재고·입고·배송 물동량 → 산출 재고 생성 순서로 준비하세요.' });
    const pi = partition(input, rules, { 센터: (r) => [s(r.센터코드), s(r.센터명)], 부서: (r) => [String(deptCode(s(r.관리부서))), s(r.관리부서)] });
    if (alloc.length) {
      const tin = sumCol(pi.kept, '총계'), tal = sumCol(alloc, '배분원가');
      c.push(Math.abs(tin - tal) < 1 ? { level: 'ok', title: '보관비입력 합계 = 배분원가 합계', detail: tal.toLocaleString() } : { level: 'block', title: '보관비입력 합계 ≠ 배분원가 합계', detail: `${tin.toLocaleString()} / ${tal.toLocaleString()} — 다시 [원가배분]` });
      const un = alloc.filter((r) => !s(r.화주코드));
      if (un.length) c.push({ level: 'warn', title: `나눌 화주가 없는 보관비 ${un.length}행 (미배분)`, detail: un.slice(0, 6).map((r) => `${s(r.센터)} ${s(r.온도)} ${s(r.세부항목)} ${n(r.배분원가).toLocaleString()}`).join(', ') + ' — 그 부서·온도의 재고 CBM이 없습니다.' });
      const negs = vol.filter((r) => n(r.CBM계) < 0);
      if (negs.length) c.push({ level: 'warn', title: `CBM이 음수인 재고 ${negs.length}행`, detail: '산출재고 음수에서 옵니다.' });
      const noCbm = vol.filter((r) => !n(r.단위CBM));
      if (noCbm.length) c.push({ level: 'warn', title: `단위CBM이 없는 제품 ${noCbm.length.toLocaleString()}행`, detail: '배송 물동량·기초재고 업로드에 단위CBM 열이 있어야 합니다. CBM 0으로 계산됨.' });
      if (pnl.length) c.push(Math.abs(sumCol(pnl, '금액') - sumCol(alloc.filter((r) => s(r.화주코드)), '배분원가')) < 1 ? { level: 'ok', title: '손익생성 합계 = 화주 배분 합계' } : { level: 'block', title: '손익생성 합계 ≠ 화주 배분 합계' });
      const noAcct = pnl.filter((r) => !s(r.소계정));
      if (noAcct.length) c.push({ level: 'warn', title: `소계정이 없는 세부항목 ${[...new Set(noAcct.map((r) => s(r.세부항목)))].join(', ')}` });
    }
    if (pi.dropped.length) c.push({ level: 'info', title: `제외 기준으로 뺀 보관비 ${pi.dropped.length}행`, detail: dropSummary(pi.dropped, (r) => n(r.총계)).map((d) => `${s(d.명칭) || s(d.코드)} ${n(d.금액).toLocaleString()}`).join(', ') });
    if (rules.length) c.push({ level: 'info', title: `적용 중인 제외 기준 ${rules.length}개`, detail: rules.map((r) => `${r.kind} ${r.name || r.code}`).join(', ') });
    return c;
  }, [app, app.version, rules]);

  const isEdit = tab === 'input';
  return (
    <Screen id="JTPF040080" title="보관비 배분 조회" menu="M08" tabs={TABS} tab={tab} onTab={(k) => { setTab(k); setChecked(new Set()); }}
      conds={<><MonthCond range /><TextCond label="화주코드" k="화주" conds={conds} /><TextCond label="부서" k="부서" conds={conds} /><TextCond label="센터" k="센터" conds={conds} /><TextCond label="세부항목" k="세부항목" conds={conds} /></>}
      actions={[{ label: '원가배분', onClick: gen }, { label: '손익반영', onClick: reflect }, { label: '전체선택', onClick: () => setChecked(new Set(ed.rows)), tabs: ['input'] }]}
      onQuery={() => { ed.reset(); app.say('1개의 테이블이 조회되었습니다.'); }}
      onNew={isEdit ? () => ed.add({ 년월: `${ymDash(month)}-01`, 원가구분: '보관비', 온도: '상온' }) : undefined}
      onSave={isEdit ? () => ed.save('보관비입력 저장') : undefined}
      onDelete={isEdit ? () => { ed.remove(checked); setChecked(new Set()); } : undefined}
      dirty={isEdit && ed.dirty}
      onExcel={xl.exportNow} onTemplate={isEdit ? xl.templateNow : undefined}
      onUpload={isEdit ? (f) => upload(f, 'M08.input', C.M08_INPUT, 'M08', { fill: (r) => ({ 년월: `${ymDash(month)}-01`, 원가구분: '보관비', ...r }) }) : undefined}
      checks={checks} help={<Help />}
    >
      <Grid cols={COLS[tab]} rows={rows} onView={xl.onView} check={isEdit} checked={checked} onCheck={setChecked} onEdit={isEdit ? ed.edit : undefined} />
    </Screen>
  );
}

function Help() {
  return (
    <div>
      <h4>무엇을 하나</h4><p>센터·온도별 보관 원가(전력비, 감가상각비, 창고관리비, 창고임차료, 드라이아이스 등)를 화주의 보관 CBM 비율로 나눈다.</p>
      <h4>순서</h4>
      <ol>
        <li><b>보관비입력</b>: 센터 × 온도 × 세부항목 금액 (Excel Upload).</li>
        <li><b>원가배분 → 물동량</b>: 산출재고 일평균 × 단위CBM × 가중치. 가중치는 기준관리 보관비 탭(메인센터=배송센터, 배송): 재고타입 C/D·보관, 상온이면 상온 가중치를 곱함.</li>
        <li><b>원가배분 → 보관비배분</b>: 입력 금액 × (화주 CBM계 ÷ 같은 센터·온도 CBM계 합). 예: 밀양 와플대학 냉장 49.12CBM → 13.67%.</li>
        <li><b>손익생성 → 손익반영</b>: 22116 드라이아이스, 22411 창고임차료, 22412 전력비, 22423 창고관리비, 22511 감가상각비.</li>
      </ol>
      <h4>제외</h4><p>화주 제외 → 그 재고 CBM을 빼고 나머지 화주가 나눠 가짐. 센터·부서 제외 → 그 보관비 금액을 뺌.</p>
      <h4>확인 못 한 부분</h4><p>종합정보의 일평균/월말 재고 사용 여부와 출고센터별 가중치 적용 방식은 화면으로 확정하지 못해, 메인센터 기준 가중치·일평균재고로 계산한다.</p>
    </div>
  );
}
