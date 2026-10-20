'use client';
import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { NODES, STEPS, nodeState } from '../lib/flow';
import { MonthCond, useExcel } from '../ui/common';
import { n, s, sumCol, ymDash } from '../lib/util';
import { T_ITEMS } from '../calc/trunk';
import Grid from '../ui/Grid';
import { Cond } from '../ui/Screen';
import type { Col, Row } from '../lib/types';

const MENU_NAME: Record<string, string> = {
  X01: '배분 제외 기준', M01: '원가배분 고객사 관리', M02: '원가배분 기준관리', M03: '배송 물동량 조회', M04: '이고 물동량 조회', M05: '기초재고 세팅', M06: '입고 물동량 조회',
  M07: '산출 재고 조회', M08: '보관비 배분 조회', M09: '배송비 배분 조회', M10: '간선비 배분 조회', M11: '노무비 배분 조회', M12: '화주별 노무비 추가배분', M13: '일반관리비 배분 조회',
};
const RECON_COLS: Col[] = [{ k: '원가', w: 90 }, { k: '원천(입력) 금액', w: 140, type: 'int', sum: true }, { k: '배분 금액', w: 140, type: 'int', sum: true }, { k: '미배분·차이', w: 120, type: 'int', sum: true },
  { k: '손익생성 금액', w: 140, type: 'int', sum: true }, { k: '손익반영', w: 80, align: 'c' }, { k: '화면', w: 140 }, { k: '메모', w: 360 }];

export default function N00({ open }: { open: (menu: string) => void }) {
  const app = useApp();
  const { meta, count } = app;
  const states = NODES.map((nd) => ({ nd, st: nodeState(nd, meta, count) }));
  const next = states.find((x) => x.st !== '완료');

  const recon = useMemo<Row[]>(() => {
    const yn = (t: string) => { const r = app.rows(t); if (!r.length) return '—'; return r.every((x) => s(x.배분여부) === 'Y') ? 'Y' : 'N'; };
    const m10in = app.rows('M10.input');
    const trunkIn = m10in.reduce((a, r) => a + T_ITEMS.reduce((b, k) => b + n(r[k]), 0), 0);
    const m09 = app.rows('M09.alloc');
    const tripsDeliv = app.trips ? app.trips.filter((_, i) => app.res[i]?.v === '배송').reduce((a, t) => a + t.fee + t.road + t.fuel + t.extFuel + t.extra + t.section, 0) : 0;
    const rows: Row[] = [
      { 원가: '보관비', '원천(입력) 금액': sumCol(app.rows('M08.input'), '총계'), '배분 금액': sumCol(app.rows('M08.alloc').filter((r) => s(r.화주코드)), '배분원가'), '손익생성 금액': sumCol(app.rows('M08.pnl'), '금액'), 손익반영: yn('M08.pnl'), 화면: MENU_NAME.M08, 메모: '9월 종합정보 1,404,039,557' },
      { 원가: '배송비', '원천(입력) 금액': tripsDeliv, '배분 금액': sumCol(m09, '배송비계'), '손익생성 금액': sumCol(app.rows('M09.pnl'), '금액'), 손익반영: yn('M09.pnl'), 화면: MENU_NAME.M09, 메모: '원천 = 운행실적 중 배송 판정 운행 금액' },
      { 원가: '간선비', '원천(입력) 금액': trunkIn, '배분 금액': sumCol(app.rows('M10.dept'), '합계'), '손익생성 금액': sumCol(app.rows('M10.pnl'), '금액'), 손익반영: yn('M10.pnl'), 화면: MENU_NAME.M10, 메모: '9월 종합정보 213,219,334' },
      { 원가: '노무비', '원천(입력) 금액': sumCol(app.rows('M11.input'), '총계'), '배분 금액': sumCol(app.rows('M11.shipper'), '배분액'), '손익생성 금액': sumCol(app.rows('M11.pnl'), '금액'), 손익반영: yn('M11.pnl'), 화면: MENU_NAME.M11, 메모: '9월 종합정보 1,365,132,716' },
      { 원가: '일반관리비', '원천(입력) 금액': sumCol(app.rows('M13.input'), '금액'), '배분 금액': sumCol(app.rows('M13.alloc').filter((r) => s(r.화주코드)), '배분액'), '손익생성 금액': sumCol(app.rows('M13.pnl'), '금액'), 손익반영: yn('M13.pnl'), 화면: MENU_NAME.M13, 메모: '9월 종합정보 74,986,473' },
    ];
    return rows.map((r) => ({ ...r, '미배분·차이': n(r['원천(입력) 금액']) - n(r['배분 금액']), _warn: Math.abs(n(r['원천(입력) 금액']) - n(r['배분 금액'])) > 1 ? 1 : null }));
  }, [app, app.version]);

  return (
    <div className="screen flowscreen">
      <div className="toolbar"><span className="screenid">월 마감 흐름 · {ymDash(app.month)}</span><span className="grow" /><MonthCond /></div>
      <div className="flowwrap">
        <div className="lead">
          {next ? <>다음 할 일: <button type="button" className="linkbtn" onClick={() => open(next.nd.menu)}>{MENU_NAME[next.nd.menu]} › {next.nd.label}</button> ({next.st})</> : '모든 단계가 완료되었습니다.'}
          <span className="muted"> · 산출물 위에 마우스를 올리면 생성 일시·작업자, 누르면 그 화면이 열립니다. 앞 단계가 바뀌면 "다시 생성 필요"로 바뀝니다.</span>
        </div>
        <div className="flow">
          {STEPS.map((st, i) => (
            <div key={st} className="step">
              <div className="stephead"><span className="num">{i + 1}</span>{st}</div>
              {states.filter((x) => x.nd.step === i).map(({ nd, st: state }) => {
                const m = meta[nd.name];
                return (
                  <button type="button" key={nd.name} className={`card ${state === '완료' ? 'done' : state === '없음' ? 'none' : 'stale'}`} onClick={() => open(nd.menu)}
                    title={m ? `${m.at} ${m.who}` : ''}>
                    <div className="cl">{nd.label}</div>
                    <div className="cs">{state}{count(nd.name) ? ` · ${count(nd.name).toLocaleString()}행` : ''}</div>
                    <div className="cm">{MENU_NAME[nd.menu]}{m ? ` · ${m.at.slice(5, 16)} ${m.who}` : nd.how === 'upload' ? ' · Excel Upload' : nd.how === 'gen' ? ' · 생성' : ''}</div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <h3>원가별 대사 — 원천 = 배분 = 손익</h3>
        <div className="recon"><Grid cols={RECON_COLS} rows={recon} /></div>
        <p className="muted">노란 행: 원천과 배분 금액이 다릅니다(미배분 잔액, 제외 기준, 생성 누락). 해당 화면의 검증 패널에서 원인을 볼 수 있습니다.</p>
      </div>
    </div>
  );
}

export function LogScreen() {
  const app = useApp();
  const [tab, setTab] = useState<'runs' | 'log'>('runs');
  const [pick, setPick] = useState<Row | null>(null);
  const [menuF, setMenuF] = useState('');
  const logCols: Col[] = [{ k: '일시', w: 150 }, { k: '작업자', w: 90 }, { k: '메뉴', w: 160 }, { k: '내용', w: 700 }];
  const logRows = app.log.map((l) => ({ 일시: l.at, 작업자: l.who, 메뉴: MENU_NAME[l.menu] ?? l.menu, 내용: l.what }));
  // 실행마다: 이후 입력이 다시 만들어졌는지(= 지금 결과가 오래된 입력 기준인지)
  const runRows: Row[] = app.runs.filter((r) => !menuF || r.menu === menuF).map((r) => {
    const later = r.inputs.filter((i) => (app.meta[i.name]?.t ?? 0) > r.t).map((i) => i.label);
    const newest = app.runs.find((x) => x.menu === r.menu)?.id === r.id;
    return {
      _id: r.id, 일시: r.at, 작업자: r.who, 메뉴: MENU_NAME[r.menu] ?? r.menu, 작업: r.action, 사유: r.reason,
      '바뀐 표': r.outputs.map((o) => `${o.label} ${o.prevRows.toLocaleString()}→${o.rows.toLocaleString()}행`).join(', '),
      '금액 변화': r.outputs.reduce((a, o) => a + (o.total - o.prevTotal), 0),
      상태: newest ? (later.length ? `이후 입력 변경: ${later.join(', ')}` : '최신') : '이전 실행',
      메모: (r.notes ?? []).map((x) => `${x.at.slice(5, 16)} ${x.who}: ${x.text}`).join(' / '),
    };
  });
  const runCols: Col[] = [{ k: '일시', w: 140 }, { k: '작업자', w: 80 }, { k: '메뉴', w: 130 }, { k: '작업', w: 110 }, { k: '사유', w: 260 }, { k: '바뀐 표', w: 260 },
    { k: '금액 변화', w: 110, type: 'int' }, { k: '상태', w: 200 }, { k: '메모', w: 200 }];
  const run = pick ? app.runs.find((r) => r.id === pick._id) : null;
  const outCols: Col[] = [{ k: '표', w: 140 }, { k: '이전 행', w: 70, type: 'int' }, { k: '이번 행', w: 70, type: 'int' }, { k: '금액 열', w: 70 }, { k: '이전 금액', w: 110, type: 'int' }, { k: '이번 금액', w: 110, type: 'int' }, { k: '차이', w: 100, type: 'int' }];
  const inCols: Col[] = [{ k: '입력 표', w: 150 }, { k: '그때 시각', w: 130 }, { k: '작업자', w: 80 }, { k: '행', w: 70, type: 'int' }, { k: '지금', w: 160 }];
  const diffCols: Col[] = [{ k: '표', w: 120 }, { k: '화주(부서)', w: 200 }, { k: '이전', w: 110, type: 'int', sum: true }, { k: '이번', w: 110, type: 'int', sum: true }, { k: '차이', w: 100, type: 'int', sum: true }];
  const diffs: Row[] = run ? run.outputs.flatMap((o) => {
    const keys = new Set([...Object.keys(o.prevBy), ...Object.keys(o.by)]);
    return [...keys].map((k) => ({ 표: o.label, '화주(부서)': k, 이전: Math.round(o.prevBy[k] ?? 0), 이번: Math.round(o.by[k] ?? 0), 차이: Math.round((o.by[k] ?? 0) - (o.prevBy[k] ?? 0)) }))
      .filter((r) => r.차이 !== 0);
  }).sort((a, b) => Math.abs(b.차이) - Math.abs(a.차이)) : [];
  const xl = useExcel(runCols, `${app.month}_실행이력.xlsx`);
  const menus = [...new Set(app.runs.map((r) => r.menu))];
  return (
    <div className="screen">
      <div className="toolbar">
        <button type="button" onClick={xl.exportNow} disabled={tab !== 'runs'}>📥 엑셀 내려받기</button>
        <span className="grow" />
        <span className="screenid">작업 이력 — 실행 이력(사유)·작업 이력</span>
      </div>
      <div className="condbar"><div className="conds">
        <MonthCond />
        <Cond label="메뉴"><select value={menuF} onChange={(e) => setMenuF(e.target.value)}><option value="">전체</option>{menus.map((m) => <option key={m} value={m}>{MENU_NAME[m] ?? m}</option>)}</select></Cond>
      </div></div>
      <div className="tabs">
        <button type="button" className={`tab ${tab === 'runs' ? 'on' : ''}`} onClick={() => setTab('runs')}>실행 이력(사유)</button>
        <button type="button" className={`tab ${tab === 'log' ? 'on' : ''}`} onClick={() => setTab('log')}>작업 이력</button>
      </div>
      <div className="body"><div className="main">
        {tab === 'log' ? <Grid cols={logCols} rows={logRows} empty="아직 이력이 없습니다." /> : (
          <div className="runlog">
            <div className="left"><Grid cols={runCols} rows={runRows} onPick={setPick} picked={pick} onView={xl.onView} empty="아직 실행 이력이 없습니다. 생성·배분·손익반영을 실행하면 사유와 함께 남습니다." /></div>
            <div className="right">
              {!run ? <p className="muted">왼쪽에서 실행을 고르면 쓴 입력, 바뀐 표, 화주별 금액 변화가 보입니다.</p> : <>
                <h4>{run.at} · {run.who} · {MENU_NAME[run.menu] ?? run.menu} · {run.action}</h4>
                <div>사유: <b>{run.reason}</b></div>
                {(run.notes ?? []).map((x, i) => <div key={i} className="muted">메모 {x.at} {x.who}: {x.text}</div>)}
                <div><button type="button" onClick={async () => { const t = window.prompt('이 실행에 남길 메모(예: 검토 결과, 회계팀 확인)'); if (t && t.trim()) await app.addRunNote(run.id, t.trim()); }}>메모 추가</button></div>
                <h4>바뀐 표</h4>
                <div style={{ height: 30 + 24 * Math.max(1, run.outputs.length) + 30 }}>
                  <Grid cols={outCols} rows={run.outputs.map((o) => ({ 표: o.label, '이전 행': o.prevRows, '이번 행': o.rows, '금액 열': o.amountCol, '이전 금액': Math.round(o.prevTotal), '이번 금액': Math.round(o.total), 차이: Math.round(o.total - o.prevTotal) }))} />
                </div>
                <h4>쓴 입력 (실행 시점)</h4>
                <div style={{ height: 30 + 24 * Math.max(1, run.inputs.length) + 30 }}>
                  <Grid cols={inCols} rows={run.inputs.map((i) => { const now2 = app.meta[i.name]; return { '입력 표': i.label, '그때 시각': i.at || '(없음)', 작업자: i.who, 행: i.rows,
                    지금: now2 && now2.t > run.t ? `다시 만들어짐 ${now2.at.slice(5, 16)} ${now2.who}` : '그대로' }; })} />
                </div>
                <h4>화주(부서)별 금액 변화 {diffs.length ? `${diffs.length.toLocaleString()}건` : '— 변화 없음'}</h4>
                <div style={{ height: 320 }}><Grid cols={diffCols} rows={diffs} empty="이전 실행과 금액이 같습니다." /></div>
              </>}
            </div>
          </div>
        )}
      </div></div>
    </div>
  );
}

export { MENU_NAME };
