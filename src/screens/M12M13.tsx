'use client';
import { useMemo, useState } from 'react';
import Screen, { type Check } from '../ui/Screen';
import Grid from '../ui/Grid';
import { MonthCond, TextCond, useConds, useEditable, useExcel, useUpload } from '../ui/common';
import { useApp } from '../lib/store';
import type { Col, Row } from '../lib/types';
import * as C from './cols';
import { extraAlloc, gradeRows } from '../calc/labor';
import { productInfo } from '../calc/volume';
import { adminAlloc, adminPnl } from '../calc/admin';
import { activeRules, dropSummary, partition } from '../lib/exclude';
import { deptCode, DEPTS } from '../lib/judge';
import { n, s, stamp, sumCol, ymDash } from '../lib/util';

// ======================= M12 화주별 노무비 추가배분 =======================
const T12 = [{ key: 'score', title: '점수표' }, { key: 'grade', title: '등급 구분' }, { key: 'extra', title: '추가 배분' }, { key: 'piece', title: '낱개피킹 가중치' }];
const TB12: Record<string, string> = { score: 'M12.score', grade: 'M12.grade', extra: 'M12.extra', piece: 'M12.piece' };
const CL12: Record<string, Col[]> = { score: C.M12_SCORE, grade: C.M12_GRADE, extra: C.M12_EXTRA, piece: C.M12_PIECE };
const ED12 = new Set(['score', 'grade', 'piece']);

export function M12() {
  const app = useApp();
  const { month, user } = app;
  const [tab, setTab] = useState('score');
  const conds = useConds({ 화주: '', 부서: '' });
  const ed = useEditable(TB12[tab], 'M12');
  const [checked, setChecked] = useState<Set<Row>>(new Set());
  const xl = useExcel(CL12[tab], `${month}_화주별노무비추가배분_${T12.find((t) => t.key === tab)?.title}.xlsx`);
  const rows = conds.apply(ED12.has(tab) ? ed.rows : app.rows(TB12[tab]), { 화주: ['화주코드', '화주명'], 부서: ['부서명', '부서코드'] });

  const genGrade = () => app.run('데이터 생성', async () => {
    const m03 = app.rows('M03.actual');
    if (!m03.length) { app.say('배송 물동량이 없습니다.'); return; }
    const prev = new Map(app.rows('M12.grade').map((g) => [s(g.화주코드), { 계근: s(g['계근 Y/N']) || 'N', 전용CD: s(g['전용C/D Y/N']) || 'N' }]));
    const out = gradeRows(m03, app.rows('M12.score'), prev, productInfo(m03, app.rows('M05.actual')), month, stamp(user));
    await app.put('M12.grade', out, `등급 구분 생성 ${out.length}행`, 'M12');
    if (!app.has('M12.piece')) {
      const sc = [...app.rows('M12.score')].sort((a, b) => s(a.등급).localeCompare(s(b.등급)));
      await app.put('M12.piece', DEPTS.map((d) => ({ 기준월: ymDash(month), 부서코드: d.code, 부서명: d.name, ...Object.fromEntries(sc.map((r) => [s(r.등급), n(r.가중치)])) })), '낱개피킹 가중치 기본값', 'M12');
    }
    app.say(`등급 ${out.length}개 화주. 계근작업·전용C/D는 칸을 두 번 눌러 Y/N으로 고치고 저장하세요.`);
    setTab('grade');
  });
  const iface = () => app.run('인건노무비 I/F', async () => {
    const work = app.rows('M11.work');
    if (!work.length) { app.say('노무비 배분 조회에서 작업비 배분생성을 먼저 하세요(작업량 필요).'); return; }
    const out = extraAlloc(work, app.rows('M12.grade'), [...app.rows('M03.actual'), ...app.rows('M03.adj')], app.rows('M12.piece'), app.rows('M01.head'), app.rows('M11.input'), month, stamp(user));
    await app.put('M12.extra', out, `추가 배분 ${out.length}행, 차이 ${sumCol(out, '차이분').toFixed(1)}`, 'M12');
    app.say('추가 배분을 만들었습니다. 노무비 배분 조회에서 [작업비 배분생성]을 다시 하면 난이도 가중치가 반영됩니다.');
    setTab('extra');
  });

  const checks: Check[] = useMemo(() => {
    const c: Check[] = [{ level: 'info', title: '산식 확인', detail: '등급 점수 기준과 수정 작업량 식은 9월 종합정보 화면 행으로 검산했습니다. 중량물(15kg 이상) 제품수는 원천에 무게가 없어 0입니다.' }];
    const g = app.rows('M12.grade');
    if (g.length) {
      const by = new Map<string, number>(); g.forEach((r) => by.set(s(r.난이도등급), (by.get(s(r.난이도등급)) ?? 0) + 1));
      c.push({ level: 'info', title: '난이도 등급 분포', detail: [...by].sort().map(([a, b]) => `${a} ${b}`).join(', ') });
      c.push({ level: 'warn', title: '중량물 계수는 원천에 없어 0', detail: '필요하면 등급 구분 탭에서 고치세요.' });
    }
    const e = app.rows('M12.extra');
    if (e.length) { c.push({ level: 'info', title: `추가 배분 작업량 차이 ${sumCol(e, '차이분').toLocaleString(undefined, { maximumFractionDigits: 1 })}`, detail: `기존 ${sumCol(e, '기존').toFixed(1)} → 수정 ${sumCol(e, '수정').toFixed(1)}` });
      const d = sumCol(e, '금액(수정)') - sumCol(e, '금액(기존)');
      c.push(Math.abs(d) < 1 ? { level: 'ok', title: '노무비 금액 기존 = 수정 합계 (부서 도급료 보존)', detail: sumCol(e, '금액(수정)').toLocaleString() } : { level: 'block', title: '노무비 금액 기존 ≠ 수정', detail: d.toLocaleString() }); }
    return c;
  }, [app, app.version]);

  const isEdit = ED12.has(tab);
  return (
    <Screen id="JTPF040130" title="화주별 노무비 추가배분" menu="M12" tabs={T12} tab={tab} onTab={(k) => { setTab(k); setChecked(new Set()); }}
      conds={<><MonthCond /><TextCond label="화주사" k="화주" conds={conds} /><TextCond label="부서" k="부서" conds={conds} /></>}
      actions={[{ label: '데이터\n생성', onClick: genGrade, tabs: ['grade', 'score'] }, { label: '인건노무비\nI/F', onClick: iface, tabs: ['extra', 'grade'] }]}
      onQuery={() => { ed.reset(); app.say('1개의 테이블이 조회되었습니다.'); }}
      onSave={isEdit ? () => ed.save(`${T12.find((t) => t.key === tab)?.title} 저장`) : undefined}
      onNew={tab === 'piece' ? () => ed.add({ 기준월: ymDash(month) }) : undefined}
      onDelete={isEdit ? () => { ed.remove(checked); setChecked(new Set()); } : undefined}
      dirty={isEdit && ed.dirty} onExcel={xl.exportNow}
      checks={checks} help={<div>
        <h4>무엇을 하나</h4><p>화주별 작업 난이도(등급 A~E)와 낱개 피킹 비율로 노무비 작업량 가중치를 조정한다(2023-08 추가된 화면).</p>
        <h4>순서</h4><ol>
          <li><b>점수표</b>: 등급별 기준과 점수, 점수합계별 가중치(14→2.3 … 6→1.5), 낱개 비율 구간 가중치.</li>
          <li><b>데이터 생성 → 등급 구분</b>: 배송 물동량에서 화주별 SKU 수·냉동 비율·CBM 0.1 이상 제품 수를 세고 등급·점수를 매김. 계근·전용C/D는 직접 Y/N.</li>
          <li><b>인건노무비 I/F → 추가 배분</b>: 수정 작업량 = (기존보관 − 낱개보관) × 보관가중치 + 낱개보관 × 낱개가중치 + C/D. 9월 화면 행으로 검산(세미기업 261×1.5+85 = 477). 노무비 금액 = 부서 도급료를 기존/수정 비율로 나눈 것.</li>
        </ol>
        <p>점수합계 가중치 1.5~2.3은 기준관리 작업비 탭의 보관 가중치(1.5·1.7·1.9·2.1)와 같은 값이다 — 등급이 그 가중치의 근거로 보인다.</p>
      </div>}
    >
      <Grid cols={CL12[tab]} rows={rows} onView={xl.onView} check={isEdit} checked={checked} onCheck={setChecked} onEdit={isEdit ? ed.edit : undefined} />
    </Screen>
  );
}

// ======================= M13 일반관리비 배분 조회 =======================
const T13 = [{ key: 'alloc', title: '일반관리비배분' }, { key: 'input', title: '일반관리비입력' }, { key: 'pnl', title: '손익반영' }];
const TB13: Record<string, string> = { alloc: 'M13.alloc', input: 'M13.input', pnl: 'M13.pnl' };
const CL13: Record<string, Col[]> = { alloc: C.M13_ALLOC, input: C.M13_INPUT, pnl: C.M13_PNL };

export function M13() {
  const app = useApp();
  const { month, user } = app;
  const [tab, setTab] = useState('alloc');
  const conds = useConds({ 부서: '', 화주: '', 세부항목: '' });
  const ed = useEditable('M13.input', 'M13');
  const [checked, setChecked] = useState<Set<Row>>(new Set());
  const upload = useUpload();
  const xl = useExcel(CL13[tab], `${month}_일반관리비배분_${T13.find((t) => t.key === tab)?.title}.xlsx`);
  const rules = useMemo(() => activeRules(app.rows('X.rules'), month, '일반관리비'), [app, month, app.version]);
  const rows = conds.apply(tab === 'input' ? ed.rows : app.rows(TB13[tab]), { 부서: ['관리부서', '부서명'], 화주: ['화주코드', '화주명', '화주'], 세부항목: ['세부항목'] });

  const gen = () => app.run('일반관리비 배분생성', async () => {
    const pi = partition(app.rows('M13.input'), rules, { 센터: (r) => [s(r.센터코드), s(r.센터명)], 부서: (r) => [String(deptCode(s(r.관리부서))), s(r.관리부서)] });
    const shRule = (rs: Row[]) => partition(rs, rules, { 화주: (r) => [s(r.화주코드), s(r.화주명)] }).kept;
    const out = adminAlloc(pi.kept, app.rows('M02.admin'), shRule(app.rows('M11.shipper')), shRule(app.rows('M08.alloc')), stamp(user));
    const pnl = adminPnl(out, month, stamp(user));
    await app.put('M13.alloc', out, `일반관리비 배분 ${out.length}행 ${sumCol(out, '배분액').toLocaleString()}원`, 'M13');
    await app.put('M13.pnl', pnl, `일반관리비 손익 ${pnl.length}행`, 'M13');
    app.say(`배분 ${out.length.toLocaleString()}행`); setTab('alloc');
  });
  const reflect = () => app.run('손익반영', async () => {
    const pnl = app.rows('M13.pnl'); if (!pnl.length) { app.say('손익 데이터가 없습니다.'); return; }
    await app.put('M13.pnl', pnl.map((r) => ({ ...r, 배분여부: 'Y' })), `손익반영 ${pnl.length}행`, 'M13');
    app.say('손익반영 표시(배분여부 Y)를 했습니다.');
  });

  const checks: Check[] = useMemo(() => {
    const c: Check[] = [];
    const input = app.rows('M13.input'), alloc = app.rows('M13.alloc');
    c.push(input.length ? { level: 'ok', title: `일반관리비입력 ${input.length}행 ${sumCol(input, '금액').toLocaleString()}원` } : { level: 'block', title: '일반관리비입력이 없습니다' });
    if (!app.has('M11.shipper')) c.push({ level: 'warn', title: '노무비 배분이 없습니다', detail: '배분기준이 작업비인 항목을 나눌 수 없습니다. 노무비를 먼저.' });
    if (!app.has('M08.alloc')) c.push({ level: 'warn', title: '보관비 배분이 없습니다', detail: '배분기준이 보관비인 항목(창고임차료·화재보험료 등)을 나눌 수 없습니다.' });
    const rules2 = new Map(app.rows('M02.admin').map((r) => [s(r.세부항목), r]));
    const noRule = [...new Set(input.map((r) => s(r.세부항목)).filter((x) => !rules2.has(x)))];
    if (noRule.length) c.push({ level: 'warn', title: `배분기준이 없는 세부항목 ${noRule.length}개 (작업비로 처리)`, detail: noRule.join(', ') + ' — 기준관리 일반관리비 탭에 추가하세요.' });
    const unused = input.filter((r) => s(rules2.get(s(r.세부항목))?.사용여부) === 'N');
    if (unused.length) c.push({ level: 'info', title: `사용여부 N 세부항목 ${unused.length}행은 배분하지 않음`, detail: `${sumCol(unused, '금액').toLocaleString()}원` });
    if (alloc.length) {
      const un = alloc.filter((r) => !s(r.화주코드));
      if (un.length) c.push({ level: 'warn', title: `배분 기준이 없는 금액 ${un.length}행`, detail: un.slice(0, 6).map((r) => `${s(r.관리부서)} ${s(r.세부항목)} ${n(r.배분액).toLocaleString()}`).join(', ') + ' — 그 부서의 노무비/보관비 배분이 없습니다.' });
      const pi = partition(input, rules, { 센터: (r) => [s(r.센터코드), s(r.센터명)], 부서: (r) => [String(deptCode(s(r.관리부서))), s(r.관리부서)] });
      const tin = sumCol(pi.kept.filter((r) => s(rules2.get(s(r.세부항목))?.사용여부) !== 'N'), '금액');
      c.push(Math.abs(tin - sumCol(alloc, '배분액')) < 1 ? { level: 'ok', title: '입력 합계 = 배분 합계', detail: tin.toLocaleString() } : { level: 'block', title: '입력 합계 ≠ 배분 합계', detail: `${tin.toLocaleString()} / ${sumCol(alloc, '배분액').toLocaleString()}` });
      if (pi.dropped.length) c.push({ level: 'info', title: `제외 기준으로 뺀 일반관리비 ${pi.dropped.length}행`, detail: dropSummary(pi.dropped, (r) => n(r.금액)).map((d) => `${s(d.명칭) || s(d.코드)} ${n(d.금액).toLocaleString()}`).join(', ') });
    }
    return c;
  }, [app, app.version, rules]);

  const isEdit = tab === 'input';
  return (
    <Screen id="JTPF040120" title="일반관리비 배분 조회" menu="M13" tabs={T13} tab={tab} onTab={(k) => { setTab(k); setChecked(new Set()); }}
      conds={<><MonthCond range /><TextCond label="부서" k="부서" conds={conds} /><TextCond label="화주코드" k="화주" conds={conds} /><TextCond label="세부항목" k="세부항목" conds={conds} /></>}
      actions={[{ label: '일반관리비\n배분생성', onClick: gen }, { label: '손익반영', onClick: reflect }, { label: '전체선택', onClick: () => setChecked(new Set(ed.rows)), tabs: ['input'] }]}
      onQuery={() => { ed.reset(); app.say('1개의 테이블이 조회되었습니다.'); }}
      onNew={isEdit ? () => ed.add({ 년월: `${ymDash(month)}-01`, 원가구분: '일반관리비' }) : undefined}
      onSave={isEdit ? () => ed.save('일반관리비입력 저장') : undefined}
      onDelete={isEdit ? () => { ed.remove(checked); setChecked(new Set()); } : undefined}
      dirty={isEdit && ed.dirty}
      onExcel={xl.exportNow} onTemplate={isEdit ? xl.templateNow : undefined}
      onUpload={isEdit ? (f) => upload(f, 'M13.input', C.M13_INPUT, 'M13', { fill: (r) => ({ 년월: `${ymDash(month)}-01`, 원가구분: '일반관리비', ...r }) }) : undefined}
      checks={checks} help={<div>
        <h4>무엇을 하나</h4><p>센터·관리부서별 일반관리비를 세부항목의 배분기준에 따라 화주에게 나눈다.</p>
        <h4>순서</h4><ol>
          <li><b>일반관리비입력</b>: 센터·관리부서·세부항목 금액 (9월 79행 74,986,473).</li>
          <li><b>배분생성</b>: 기준관리 일반관리비 탭의 배분기준이 작업비면 같은 관리부서 노무비 배분액 비율, 보관비면 보관비 배분원가 비율.</li>
          <li><b>손익반영</b>.</li>
        </ol>
        <h4>선행</h4><p>보관비·노무비 배분이 먼저 끝나야 한다.</p>
      </div>}
    >
      <Grid cols={CL13[tab]} rows={rows} onView={xl.onView} check={isEdit} checked={checked} onCheck={setChecked} onEdit={isEdit ? ed.edit : undefined} />
    </Screen>
  );
}
