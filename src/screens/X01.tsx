'use client';
import { useMemo, useState } from 'react';
import Screen, { type Check } from '../ui/Screen';
import Grid from '../ui/Grid';
import { useEditable, useExcel, useUpload } from '../ui/common';
import { useApp } from '../lib/store';
import type { Col, Row } from '../lib/types';
import * as C from './cols';
import { activeRules, COSTS, KINDS, partition, type Kind } from '../lib/exclude';
import { amountsOf, deptCode, DEPTS } from '../lib/judge';
import { n, s, sum, ymDash } from '../lib/util';

const TABS = [{ key: 'rules', title: '제외 기준' }, { key: 'impact', title: '제외 영향 미리보기' }, { key: 'team', title: '팀별 원가배부(권역조정)' }, { key: 'center', title: '권역판정 배송센터' }];
const TEAM_COLS: Col[] = [{ k: '부서코드', w: 70, align: 'c' }, { k: '부서명', w: 120 }, { k: '원가배부', w: 80, align: 'c', edit: true, opts: ['Y', 'N'], bg: '#f3e8f8' }, { k: '간선 운행', w: 90, type: 'int', sum: true }, { k: '권역내 판정 금액', w: 130, type: 'int', sum: true }, { k: '설명', w: 380 }];
const CENTER_COLS: Col[] = [{ k: '코드', w: 70, edit: true, align: 'c' }, { k: '배송센터명', w: 140, edit: true }, { k: '운영부서', w: 110, edit: true }, { k: '사용', w: 50, edit: true, opts: ['Y', 'N'], align: 'c' }, { k: '적용시작', w: 80 }, { k: '상차 운행', w: 90, type: 'int' }];
const IMPACT_COLS: Col[] = [{ k: '구분', w: 56, align: 'c' }, { k: '코드', w: 80 }, { k: '명칭', w: 150 }, { k: '적용원가', w: 70 }, { k: '사유', w: 200 }, { k: '운행 건수', w: 80, type: 'int', sum: true },
  { k: '운행 금액', w: 110, type: 'int', sum: true }, { k: '배송물동량 행', w: 90, type: 'int', sum: true }, { k: '원가입력 행', w: 80, type: 'int', sum: true }, { k: '원가입력 금액', w: 110, type: 'int', sum: true }, { k: '판정', w: 260 }];

export default function X01() {
  const app = useApp();
  const { month, trips, res, judge } = app;
  const [tab, setTab] = useState('rules');
  const ed = useEditable('X.rules', 'X01');
  const [checked, setChecked] = useState<Set<Row>>(new Set());
  const upload = useUpload();
  const xl = useExcel(C.X_RULES, '배분제외기준.xlsx');

  const lists = useMemo(() => {
    const sh = new Map<string, string>(); const dst = new Map<string, number>(); const centers = new Set<string>();
    trips?.forEach((t) => { sh.set(t.shipperId, t.shipper); dst.set(t.dst, (dst.get(t.dst) ?? 0) + 1); centers.add(t.src); });
    app.rows('M01.head').forEach((r) => sh.set(s(r.화주코드), s(r.화주명)));
    app.rows('M02.transport').forEach((r) => centers.add(s(r.배송센터명)));
    return {
      화주: [...sh].map(([c, nm]) => `${c} ${nm}`).sort(),
      거래처: [...dst].sort((a, b) => b[1] - a[1]).slice(0, 3000).map(([k]) => k),
      부서: DEPTS.map((d) => `${d.code} ${d.name}`),
      센터: [...centers].filter(Boolean).sort(),
    } as Record<Kind, string[]>;
  }, [trips, app, app.version]);

  // 편집: "1762 미트밸리"처럼 고른 값을 코드/명칭으로 나눠 넣는다
  const onEdit = (r: Row, k: string, v: string | number) => {
    if (k === '명칭' || k === '코드') {
      const m = String(v).match(/^(\S+)\s+(.+)$/);
      if (m && (s(r.구분) === '화주' || s(r.구분) === '부서')) { ed.setRows(ed.rows.map((x) => (x === r ? { ...x, 코드: m[1], 명칭: m[2] } : x))); return; }
    }
    ed.edit(r, k, v);
  };

  const impact = useMemo<Row[]>(() => {
    if (tab !== 'impact') return [];
    const out: Row[] = [];
    const m03 = app.rows('M03.actual');
    const inputs: [string, string][] = [['M08.input', '총계'], ['M11.input', '총계'], ['M13.input', '금액'], ['M10.input', '합계']];
    for (const r of ed.rows.filter((x) => s(x.사용) !== 'N')) {
      const kind = s(r.구분) as Kind, code = s(r.코드), nm = s(r.명칭);
      const hit = (c: string, name: string) => (code && (code === c || code === name)) || (!code && nm && nm === name);
      let tc = 0, ta = 0;
      trips?.forEach((t, i) => {
        const ok = kind === '화주' ? hit(t.shipperId, t.shipper) : kind === '거래처' ? hit('', t.dst) : kind === '부서' ? hit(String(deptCode(t.dept)), t.dept) : hit(t.src, t.src);
        if (ok && res[i]) { tc++; ta += sum(amountsOf(t)); }
      });
      const mc = m03.filter((x) => (kind === '화주' ? hit(s(x.화주코드), s(x.화주명)) : kind === '거래처' ? hit(s(x.배송처코드), s(x.배송처명)) : kind === '부서' ? hit(s(x.부서코드), s(x.배송부서명)) : hit(s(x.배송센터), s(x.배송센터명)))).length;
      let ic = 0, ia = 0;
      if (kind === '부서' || kind === '센터') for (const [tb, col] of inputs) app.rows(tb).forEach((x) => {
        const ok = kind === '부서' ? hit(s(x.부서) || String(deptCode(s(x.관리부서))), s(x.관리부서) || s(x.부서명)) : hit(s(x.센터코드), s(x.센터명));
        if (ok) { ic++; ia += n(x[col]); }
      });
      const verdict = !tc && !mc && !ic ? '맞는 데이터 없음 — 코드/명칭 확인' : kind === '화주' || kind === '거래처' ? '물동량에서 빠지고 원가는 다른 화주로 다시 나눔' : '원가 입력에서 빠짐(배분 안 함)';
      out.push({ 구분: kind, 코드: code, 명칭: nm, 적용원가: s(r.적용원가) || '전체', 사유: r.사유, '운행 건수': tc, '운행 금액': ta, '배송물동량 행': mc, '원가입력 행': ic, '원가입력 금액': ia, 판정: verdict, _warn: !tc && !mc && !ic ? 1 : null });
    }
    return out;
  }, [tab, ed.rows, trips, res, app, app.version]);

  const teamRows = useMemo<Row[]>(() => {
    if (!judge) return [];
    const cnt = new Map<string, number>(); const intra = new Map<string, number>();
    trips?.forEach((t, i) => { if (res[i]?.v !== '배송') cnt.set(t.dept, (cnt.get(t.dept) ?? 0) + 1); if (res[i]?.v === '권역내') intra.set(t.dept, (intra.get(t.dept) ?? 0) + sum(amountsOf(t))); });
    return DEPTS.map((d) => ({ 부서코드: d.code, 부서명: d.name, 원가배부: judge.alloc[d.name] === false ? 'N' : 'Y', '간선 운행': cnt.get(d.name) ?? 0, '권역내 판정 금액': intra.get(d.name) ?? 0,
      설명: judge.alloc[d.name] === false ? '권역조정 행을 만들지 않음 → 권역내 판정 금액도 권역간(전 부서 공동) 풀에 남음' : '권역내 판정 금액을 권역간 → 권역내로 옮김' }));
  }, [judge, trips, res]);
  const centerRows = useMemo<Row[]>(() => {
    if (!judge) return [];
    const cnt = new Map<string, number>(); trips?.forEach((t) => cnt.set(t.src, (cnt.get(t.src) ?? 0) + 1));
    return judge.centers.map((c) => ({ 코드: c.code, 배송센터명: c.name, 운영부서: c.dept, 사용: c.use, 적용시작: c.from, '상차 운행': cnt.get(c.name) ?? 0 }));
  }, [judge, trips]);

  const checks: Check[] = useMemo(() => {
    const c: Check[] = [];
    const all = ed.rows;
    const act = COSTS.map((k) => [k, activeRules(all, month, k).length] as const);
    c.push({ level: 'info', title: `이달(${ymDash(month)}) 적용 규칙`, detail: act.map(([k, v]) => `${k} ${v}`).join(', ') });
    const noWhy = all.filter((r) => s(r.사용) !== 'N' && !s(r.사유).trim());
    if (noWhy.length) c.push({ level: 'block', title: `사유가 없는 규칙 ${noWhy.length}개`, detail: '제외는 원가를 바꾸므로 사유를 꼭 남기세요.' });
    const noKey = all.filter((r) => !s(r.코드) && !s(r.명칭));
    if (noKey.length) c.push({ level: 'block', title: `코드·명칭이 모두 빈 규칙 ${noKey.length}개` });
    const badKind = all.filter((r) => !KINDS.includes(s(r.구분) as Kind));
    if (badKind.length) c.push({ level: 'block', title: `구분이 잘못된 규칙 ${badKind.length}개`, detail: '화주/거래처/부서/센터 중 하나' });
    if (trips) {
      const idx = trips.map((_, i) => i);
      const p = partition(idx, activeRules(all, month, '배송비'), { 화주: (i) => [trips[i].shipperId, trips[i].shipper], 거래처: (i) => ['', trips[i].dst], 부서: (i) => [String(deptCode(trips[i].dept)), trips[i].dept], 센터: (i) => [trips[i].src, trips[i].src] });
      c.push({ level: 'info', title: `배송비 기준으로 이달 운행 ${p.dropped.length.toLocaleString()}건이 제외에 걸림` });
    }
    const off = DEPTS.filter((d) => judge?.alloc[d.name] === false).map((d) => d.name);
    c.push({ level: 'info', title: '팀별 원가배부(권역조정) 제외', detail: off.join(', ') || '없음' });
    return c;
  }, [ed.rows, month, trips, judge]);

  const saveTeam = (r: Row, _k: string, v: string | number) => {
    if (!judge) return;
    void app.setJudge({ ...judge, alloc: { ...judge.alloc, [s(r.부서명)]: v === 'Y' } });
    app.say(`${s(r.부서명)} 원가배부 ${v}. 간선비 권역조정 계산부터 다시 하세요.`);
  };
  const saveCenter = (r: Row, k: string, v: string | number) => {
    if (!judge) return;
    const map: Record<string, keyof typeof judge.centers[number]> = { 코드: 'code', 배송센터명: 'name', 운영부서: 'dept', 사용: 'use' };
    void app.setJudge({ ...judge, centers: judge.centers.map((c) => (c.name === s(r.배송센터명) && c.code === s(r.코드) ? { ...c, [map[k]]: v } : c)) });
  };

  const rows = tab === 'rules' ? ed.rows : tab === 'impact' ? impact : tab === 'team' ? teamRows : centerRows;
  const cols = tab === 'rules' ? C.X_RULES.map((c) => (c.k === '명칭' || c.k === '코드' ? { ...c, list: 'xl-list' } : c)) : tab === 'impact' ? IMPACT_COLS : tab === 'team' ? TEAM_COLS : CENTER_COLS;
  return (
    <Screen id="CA-X01" title="배분 제외 기준" menu="X01" tabs={TABS} tab={tab} onTab={setTab}
      conds={<span className="hint">원가 배분에 넣지 말아야 할 화주·거래처·부서·센터를 원가 종류와 기간별로 정합니다. 명칭 칸은 두 번 눌러 고칩니다.</span>}
      actions={tab === 'center' ? [{ label: '센터 추가', onClick: () => judge && void app.setJudge({ ...judge, centers: [...judge.centers, { code: '', name: window.prompt('배송센터명(운행실적 상차지명과 같게)') ?? '', type: '배송', dept: '', use: 'Y' as const, from: ymDash(month) }].filter((c) => c.name) }) }] : []}
      onQuery={() => { ed.reset(); app.say('조회되었습니다.'); }}
      onNew={tab === 'rules' ? () => ed.add({ 사용: 'Y', 구분: '화주', 적용원가: '전체', 시작월: ymDash(month), 종료월: '' }) : undefined}
      onSave={tab === 'rules' ? () => ed.save(`제외 기준 저장 ${ed.rows.length}개`) : undefined}
      onDelete={tab === 'rules' ? () => { ed.remove(checked); setChecked(new Set()); } : undefined}
      dirty={tab === 'rules' && ed.dirty}
      onExcel={xl.exportNow} onTemplate={tab === 'rules' ? xl.templateNow : undefined}
      onUpload={tab === 'rules' ? (f) => upload(f, 'X.rules', C.X_RULES, 'X01', { append: true }) : undefined}
      checks={checks}
      help={<div>
        <h4>무엇을 하나</h4><p>현행 종합정보에서 가장 어려웠던 "반영하면 안 되는 대상"을 한 곳에서 정한다. 모든 배분 화면이 이 기준을 읽고, 검증 패널에 제외로 빠진 건수·금액을 보여 준다.</p>
        <h4>구분별 처리</h4>
        <ul>
          <li><b>화주·거래처</b>: 배분 기준 물동량(CBM·작업량)에서 뺀다. 원가는 남은 화주에게 다시 나뉜다. (배송비를 운행 금액으로 나눌 때는 그 운행 금액을 뺀다)</li>
          <li><b>부서·센터</b>: 원가 입력(보관비·도급료·일반관리비·간선비) 단계에서 뺀다. 배분하지 않는다.</li>
        </ul>
        <h4>칸</h4>
        <ul><li>적용원가: 전체 또는 한 원가만</li><li>시작월~종료월: 비우면 계속</li><li>사유: 필수</li><li>사용 N: 지우지 않고 끄기</li></ul>
        <h4>제외 영향 미리보기</h4><p>각 규칙이 이달 데이터에서 몇 건·얼마에 걸리는지 보여 준다. "맞는 데이터 없음"이면 코드나 명칭이 틀린 것이다.</p>
        <h4>팀별 원가배부(권역조정)</h4><p>간선비 권역조정 앱의 팀별 체크와 같다. N이면 그 팀은 권역내 판정 운행이 있어도 조정 행을 만들지 않는다. 현재 기본: 오산운영1·오산운영2·이천운영팀·밀양센터 N.</p>
        <h4>권역판정 배송센터</h4><p>운행 상차지가 이 목록에 있으면 배송(R1)으로 본다. 이천센터·유통2·밀양(3PL) 포함.</p>
      </div>}
    >
      {tab === 'rules' && <datalist id="xl-list">{[...lists.화주, ...lists.부서, ...lists.센터].slice(0, 5000).map((x) => <option key={x} value={x} />)}</datalist>}
      <Grid cols={cols} rows={rows} onView={xl.onView} check={tab === 'rules'} checked={checked} onCheck={setChecked}
        onEdit={tab === 'rules' ? onEdit : tab === 'team' ? saveTeam : tab === 'center' ? saveCenter : undefined}
        empty={tab === 'rules' ? '제외 기준이 없습니다. [신규]로 추가하세요.' : undefined} />
    </Screen>
  );
}
