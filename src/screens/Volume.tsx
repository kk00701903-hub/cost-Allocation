'use client';
import { useMemo, useState, type ReactNode } from 'react';
import Screen, { type Check } from '../ui/Screen';
import Grid from '../ui/Grid';
import { MonthCond, TextCond, useConds, useEditable, useExcel, useUpload } from '../ui/common';
import { useApp } from '../lib/store';
import type { Col, Row } from '../lib/types';
import * as C from './cols';
import { computeStock, eaOf, transferFromDelivery } from '../calc/volume';
import { n, prevYm, s, stamp, sumCol, ymDash } from '../lib/util';
import { dbGet } from '../lib/db';

interface TabDef { key: string; title: string; table: string; cols: Col[]; upload?: boolean; edit?: boolean }
interface Cfg {
  id: string; title: string; menu: string; tabs: TabDef[];
  conds: { label: string; k: string; cols: string[] }[];
  gen?: { label: string; run: (ctx: ReturnType<typeof useApp>) => Promise<string | void> }[];
  checks: (ctx: ReturnType<typeof useApp>) => Check[];
  help: ReactNode;
}

function VolumeScreen({ cfg }: { cfg: Cfg }) {
  const app = useApp();
  const [tab, setTab] = useState(cfg.tabs[0].key);
  const td = cfg.tabs.find((t) => t.key === tab)!;
  const conds = useConds(Object.fromEntries(cfg.conds.map((c) => [c.k, ''])));
  const ed = useEditable(td.table, cfg.menu);
  const [checked, setChecked] = useState<Set<Row>>(new Set());
  const upload = useUpload();
  const xl = useExcel(td.cols, `${app.month}_${cfg.title}_${td.title}.xlsx`);
  const rows = conds.apply(td.edit ? ed.rows : app.rows(td.table), Object.fromEntries(cfg.conds.map((c) => [c.k, c.cols])));
  const checks = useMemo(() => cfg.checks(app), [app, app.version]);  // eslint-disable-line
  return (
    <Screen id={cfg.id} title={cfg.title} menu={cfg.menu} tabs={cfg.tabs.map(({ key, title }) => ({ key, title }))} tab={tab} onTab={(k) => { setTab(k); setChecked(new Set()); }}
      conds={<><MonthCond range />{cfg.conds.map((c) => <TextCond key={c.k} label={c.label} k={c.k} conds={conds} />)}</>}
      actions={(cfg.gen ?? []).map((g) => ({ label: g.label, onClick: () => app.run(g.label, async () => { const m = await g.run(app); if (m) app.say(m); }) }))}
      onQuery={() => { ed.reset(); app.say('1개의 테이블이 조회되었습니다.'); }}
      onNew={td.edit ? () => ed.add({}) : undefined}
      onSave={td.edit ? () => ed.save(`${td.title} 저장`) : undefined}
      onDelete={td.edit ? () => { ed.remove(checked); setChecked(new Set()); } : undefined}
      dirty={td.edit && ed.dirty}
      onExcel={xl.exportNow} onTemplate={td.upload ? xl.templateNow : undefined}
      onUpload={td.upload ? (f) => upload(f, td.table, td.cols, cfg.menu) : undefined}
      checks={checks} help={cfg.help}
    >
      <Grid cols={td.cols} rows={rows} onView={xl.onView} check={td.edit} checked={checked} onCheck={setChecked} onEdit={td.edit ? ed.edit : undefined}
        empty={td.upload ? '데이터가 없습니다. 종합정보 화면에서 엑셀로 내려받은 파일을 Excel Upload로 올리세요(열 이름으로 맞춥니다).' : undefined} />
    </Screen>
  );
}

const upCheck = (app: ReturnType<typeof useApp>, table: string, what: string): Check =>
  app.has(table) ? { level: 'ok', title: `${what} ${app.rows(table).length.toLocaleString()}행` } : { level: 'warn', title: `${what} 없음`, detail: '종합정보에서 내려받은 엑셀을 Excel Upload로 올리세요.' };
const capCheck = (rows: Row[]): Check | null => (rows.length === 100001 || rows.length === 100000 ? { level: 'block', title: '행 수가 정확히 100,001행', detail: '종합정보 조회 상한에 걸려 잘린 파일일 수 있습니다. 기간을 나눠 내려받아 덧붙이세요.' } : null);
const negCheck = (rows: Row[], what: string): Check | null => {
  const neg = rows.filter((r) => n(r.총계) < 0 || eaOf(r) < 0);
  return neg.length ? { level: 'warn', title: `${what} 음수 ${neg.length.toLocaleString()}행`, detail: `예: ${neg.slice(0, 3).map((r) => `${s(r.화주코드)} ${s(r.제품코드)} ${n(r.총계)}`).join(', ')}` } : null;
};

export function M03() {
  return <VolumeScreen cfg={{
    id: 'JTPF040030', title: '배송 물동량 조회', menu: 'M03',
    tabs: [{ key: 'a', title: '실적', table: 'M03.actual', cols: C.M03, upload: true }, { key: 'b', title: '조정입력', table: 'M03.adj', cols: C.M03_ADJ, upload: true, edit: true }],
    conds: [{ label: '화주코드', k: 'sh', cols: ['화주코드', '화주명'] }, { label: '배송부서', k: 'dp', cols: ['배송부서명', '부서코드'] }, { label: '배송센터', k: 'ct', cols: ['배송센터', '배송센터명'] }],
    gen: [{ label: '생성', run: async () => '원천(블루버 주문) 연동 전입니다. 종합정보 배송 물동량 조회를 엑셀로 내려받아 Excel Upload 하세요.' }],
    checks: (app) => {
      const r = app.rows('M03.actual');
      const adj = app.rows('M03.adj');
      const noReason = adj.filter((x) => !s(x.조정사유)).length;
      return [upCheck(app, 'M03.actual', '배송 실적'), capCheck(r), negCheck(r, '배송'),
        adj.length ? { level: noReason ? 'warn' : 'info', title: `조정입력 ${adj.length.toLocaleString()}행 (총계 ${sumCol(adj, '총계').toLocaleString()})`, detail: noReason ? `조정사유가 없는 행 ${noReason}개 — 사유를 채우세요.` : '실적에 증감으로 더해져 이고·산출재고·배송비·노무비에 쓰입니다.' } : null,
        r.length ? { level: 'info', title: '배송CBM 합계', detail: sumCol(r, '배송CBM').toLocaleString(undefined, { maximumFractionDigits: 1 }) } : null,
        r.length && !r.some((x) => s(x.차량ID)) ? { level: 'warn', title: '차량ID·회전이 없음', detail: '배송비를 회전 CBM으로 나눌 수 없어 운행실적 금액으로 대신합니다.' } : null,
      ].filter(Boolean) as Check[];
    },
    help: <div><h4>무엇을 하나</h4><p>화주·배송센터·배송처·제품별 배송량과 배송CBM. 배송비(회전 CBM), 간선비 부서별(배송CBM 비율), 노무비(피킹건수), 이고 물동량 생성의 원천.</p>
      <h4>원천</h4><p>블루버 주문(가상센터 주문번호 끝 -1 제외). 지금은 종합정보 화면 엑셀을 Excel Upload. 배송CBM = 단위CBM × 총계.</p>
      <h4>조정입력</h4><p>실적과 같은 열 + 조정사유. 행은 실적에 <b>증감으로 더해진다</b>(빼려면 음수). 이고 생성·산출재고·배송비·간선비 부서별·노무비에 함께 쓰인다. 종합정보 설계서(2015): Excel Upload + 업로드 이력. 저장한 사람·시각은 이력 열에 남는다.</p></div>,
  }} />;
}

export function M04() {
  return <VolumeScreen cfg={{
    id: 'JTPF040040', title: '이고 물동량 조회', menu: 'M04',
    tabs: [{ key: 'a', title: '실적', table: 'M04.actual', cols: C.M04, upload: true }, { key: 'b', title: '조정입력', table: 'M04.adj', cols: C.M04_ADJ, upload: true, edit: true }],
    conds: [{ label: '화주코드', k: 'sh', cols: ['화주코드', '화주명'] }, { label: '부서', k: 'dp', cols: ['이고부서'] }, { label: '이고구분', k: 'k', cols: ['이고구분'] }],
    gen: [{ label: '생성', run: async (app) => {
      const m03 = [...app.rows('M03.actual'), ...app.rows('M03.adj')];
      if (!m03.length) return '배송 물동량이 없습니다.';
      const out = transferFromDelivery(m03, app.rows('M01.head'), app.rows('M01.detail'), app.rows('M02.transport'), stamp(app.user));
      if (!window.confirm(`배송 물동량 ${m03.length.toLocaleString()}행 중 고객사 관리에서 이고로 설정된 ${out.length.toLocaleString()}행을 이고 실적으로 만듭니다. 기존 실적을 바꿀까요?`)) return;
      await app.put('M04.actual', out, `이고 생성 ${out.length}행`, 'M04');
      return `이고 ${out.length.toLocaleString()}행을 만들었습니다.`;
    } }],
    checks: (app) => {
      const r = app.rows('M04.actual');
      const adj = app.rows('M04.adj');
      const noReason = adj.filter((x) => !s(x.조정사유)).length;
      const c = [upCheck(app, 'M04.actual', '이고 실적'), capCheck(r),
        adj.length ? { level: noReason ? 'warn' : 'info', title: `조정입력 ${adj.length.toLocaleString()}행`, detail: noReason ? `조정사유가 없는 행 ${noReason}개` : '이고 실적에 증감으로 더해져 간선비·노무비에 쓰입니다.' } as Check : null];
      if (r.length) {
        const k = new Map<string, number>(); r.forEach((x) => k.set(s(x.이고구분), (k.get(s(x.이고구분)) ?? 0) + n(x.배송CBM)));
        c.push({ level: 'info', title: '이고구분별 CBM', detail: [...k].map(([a, b]) => `${a || '(빈값)'} ${b.toLocaleString(undefined, { maximumFractionDigits: 1 })}`).join(', ') });
        const noDept = r.filter((x) => !s(x.이고부서));
        if (noDept.length) c.push({ level: 'warn', title: `이고부서 없는 행 ${noDept.length}`, detail: '고객사 관리의 이고부서를 채우세요.' });
      }
      return c.filter(Boolean) as Check[];
    },
    help: <div><h4>무엇을 하나</h4><p>메인센터 → 배송센터로 옮긴 화주별 물량과 이고CBM. 간선비 화주별 배분의 기준.</p>
      <h4>생성</h4><p>배송 물동량 중 고객사 관리에서 주문타입 '이고'·이고여부 Y로 설정된 (화주, 배송센터) 분을 메인센터 출고 → 배송센터 도착으로 만든다. 이고구분은 그 설정의 출고구분(권역간/권역내).</p>
      <h4>조정입력</h4><p>이고 실적과 같은 열 + 조정사유. 이고 실적에 증감으로 더해진다. 종합정보는 2015~2026-09 동안 이고 조정입력이 한 건도 없었다(2026-10-16 확인).</p><h4>주의</h4><p>메인센터 자기 자신으로의 이고 설정(예: K501→K501)은 무시한다. 종합정보 화면은 100,001행에서 잘린다. 엑셀로 올릴 땐 기간을 나눠 덧붙이세요.</p></div>,
  }} />;
}

export function M05() {
  return <VolumeScreen cfg={{
    id: 'JTPF040050', title: '기초재고 세팅', menu: 'M05',
    tabs: [{ key: 'a', title: '기초재고', table: 'M05.actual', cols: C.M05, upload: true }, { key: 'b', title: '조정입력', table: 'M05.adj', cols: C.M05, upload: true, edit: true }],
    conds: [{ label: '센터', k: 'ct', cols: ['보관센터', '보관센터명'] }, { label: '화주코드', k: 'sh', cols: ['화주코드', '화주명'] }, { label: '재고타입', k: 't', cols: ['재고타입'] }],
    gen: [{ label: '생성', run: async (app) => {
      const prev = (await dbGet<Row[]>(`M07.actual@${prevYm(app.month)}`)) ?? [];
      if (!prev.length) return `전월(${ymDash(prevYm(app.month))}) 산출재고가 없습니다. 기초재고를 Excel Upload 하세요.`;
      const st = stamp(app.user);
      const out = prev.map((r) => ({ 재고일자: `${ymDash(app.month)}-01`, 화주코드: r.화주코드, 화주명: r.화주명, 보관센터: r.보관센터, 보관센터명: r.보관센터명, 제품코드: r.제품코드, 제품명: r.제품명, UOM: r.UOM, 재고타입: r.재고타입,
        포장: r['산출재고 포장'], 낱개: r['산출재고 낱개'], 총계: r.산출재고EA, 구분: '생성', 이력: st }));
      if (!window.confirm(`전월 산출재고 ${out.length.toLocaleString()}행을 이달 기초재고로 만듭니다.`)) return;
      await app.put('M05.actual', out, `기초재고 생성(전월 산출재고) ${out.length}행`, 'M05');
      return `기초재고 ${out.length.toLocaleString()}행`;
    } }, { label: '조정분\n반영', run: async (app) => {
      // 종합정보처럼 조정입력 행을 기초재고에 "증감 행"으로 더한다(생성분은 그대로). 다시 누르면 이전 조정 행을 바꾼다.
      const a = app.rows('M05.actual'), b = app.rows('M05.adj');
      if (!b.length) return '조정입력이 없습니다.';
      const base = a.filter((r) => s(r.구분) !== '조정');
      const out = [...base, ...b.map((r) => ({ ...r, 구분: '조정' }))];
      if (!window.confirm(`생성분 ${base.length.toLocaleString()}행에 조정 ${b.length.toLocaleString()}행을 더해 ${out.length.toLocaleString()}행으로 만듭니다.`)) return;
      await app.put('M05.actual', out, `기초재고 조정분 반영(증감 행 추가) ${b.length}행`, 'M05');
      return '조정분을 반영했습니다.';
    } }],
    checks: (app) => {
      const a = app.rows('M05.actual'), b = app.rows('M05.adj');
      const key = (r: Row) => [r.화주코드, r.보관센터, r.제품코드, r.재고타입].map(s).join('|');
      const ka = new Set(a.map(key));
      const dup = b.filter((r) => ka.has(key(r)));
      const c: (Check | null)[] = [upCheck(app, 'M05.actual', '기초재고'), negCheck(a, '기초재고'), negCheck(b, '조정입력')];
      if (dup.length) c.push({ level: 'info', title: `조정분이 있는 제품 ${dup.length.toLocaleString()}행`, detail: '조정입력은 생성분에 더해지는 증감입니다(종합정보 9월 산출재고로 확인: 전일재고 = 생성분 + 조정분). [조정분 반영]으로 기초재고에 증감 행을 넣으세요.' });
      const dk = new Map<string, number>(); a.filter((r) => s(r.구분) !== '조정').forEach((r) => dk.set(key(r), (dk.get(key(r)) ?? 0) + 1));
      const dd = [...dk].filter(([, v]) => v > 1).length;
      if (dd) c.push({ level: 'warn', title: `기초재고 안에 같은 제품 중복 ${dd}건` });
      return c.filter(Boolean) as Check[];
    },
    help: <div><h4>무엇을 하나</h4><p>월초 재고. 산출재고 = 기초재고 + 입고 − 출고 + 조정 의 시작점이며 보관비 배분의 기초.</p>
      <h4>생성</h4><p>전월 산출재고 월말값을 이달 기초재고로. 조정입력은 실사 등으로 바꿀 값.</p>
      <h4>조정분</h4><p>종합정보 기초재고에는 같은 제품이 생성분·조정분 두 줄로 들어간다. 조정분은 증감이라 두 줄을 더한 값이 전일재고가 된다(9월 가토미작 152행 확인). [조정분 반영]이 같은 일을 한다.</p></div>,
  }} />;
}

export function M06() {
  return <VolumeScreen cfg={{
    id: 'JTPF040060', title: '입고 물동량 조회', menu: 'M06',
    tabs: [{ key: 'a', title: '실적', table: 'M06.actual', cols: C.M06, upload: true }],
    conds: [{ label: '화주코드', k: 'sh', cols: ['화주코드', '화주명'] }, { label: '부서', k: 'dp', cols: ['부서명', '부서코드'] }],
    gen: [{ label: '생성', run: async () => '원천(블루버 입고확정) 연동 전입니다. 종합정보 입고 물동량 조회 엑셀을 Excel Upload 하세요.' }],
    checks: (app) => [upCheck(app, 'M06.actual', '입고 실적'), negCheck(app.rows('M06.actual'), '입고')].filter(Boolean) as Check[],
    help: <div><h4>무엇을 하나</h4><p>센터별 입고량(생산입고 등). 산출재고의 입고량.</p><h4>원천</h4><p>블루버 입고확정 — 고객사 관리에서 입고여부 Y인 센터.</p></div>,
  }} />;
}

export function M07() {
  return <VolumeScreen cfg={{
    id: 'JTPF040070', title: '산출 재고 조회', menu: 'M07',
    tabs: [{ key: 'a', title: '산출재고', table: 'M07.actual', cols: C.M07 }, { key: 'b', title: '조정입력', table: 'M07.adj', cols: C.M07_ADJ, upload: true, edit: true }],
    conds: [{ label: '화주코드', k: 'sh', cols: ['화주코드', '화주명'] }, { label: '센터', k: 'ct', cols: ['보관센터', '보관센터명'] }, { label: '재고타입', k: 't', cols: ['재고타입'] }],
    gen: [{ label: '생성', run: async (app) => {
      const out = computeStock(app.month, app.rows('M05.actual'), app.rows('M06.actual'), [...app.rows('M03.actual'), ...app.rows('M03.adj')], [...app.rows('M04.actual'), ...app.rows('M04.adj')], app.rows('M07.adj'), app.rows('M02.transport'), stamp(app.user), app.rows('M01.head'));
      if (!out.length) return '기초재고·입고·배송 물동량이 없습니다.';
      await app.put('M07.actual', out, `산출재고 생성 ${out.length}행`, 'M07');
      return `산출재고 ${out.length.toLocaleString()}행`;
    } }],
    checks: (app) => {
      const r = app.rows('M07.actual');
      const c: (Check | null)[] = [r.length ? { level: 'ok', title: `산출재고 ${r.length.toLocaleString()}행` } : { level: 'warn', title: '산출재고 없음', detail: '[생성]을 누르세요.' }];
      const neg = r.filter((x) => n(x.산출재고EA) < 0);
      if (neg.length) c.push({ level: 'block', title: `월말 재고 음수 ${neg.length.toLocaleString()}행`, detail: '출고가 재고보다 많습니다. 기초재고·입고 누락이나 기초재고 중복을 먼저 확인하세요.' });
      const avgNeg = r.filter((x) => n(x.일평균재고EA) < 0);
      if (avgNeg.length) c.push({ level: 'warn', title: `일평균 재고 음수 ${avgNeg.length.toLocaleString()}행`, detail: '보관비 물동량에서 음수 CBM이 됩니다.' });
      return c.filter(Boolean) as Check[];
    },
    help: <div><h4>무엇을 하나</h4><p>제품별 월 재고 흐름: 전일(월초)재고 + 입고량 − 출고량 + 조정량 = 산출재고. 일별로 굴려 일평균재고도 낸다(보관비 물동량의 기준).</p>
      <h4>출고량</h4><p>배송 물동량(배송센터 기준) + 이고 출고(출고센터). 이고 도착분은 도착센터 입고로 더한다.</p>
      <h4>환산</h4><p>UOM "PK / 24" → 포장 1 = 낱개 24. 9월 예: 4포장17낱개 − 23낱개 = 3포장18낱개.</p></div>,
  }} />;
}
