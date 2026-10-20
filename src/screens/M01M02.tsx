'use client';
import { useMemo, useState } from 'react';
import Screen, { type Check } from '../ui/Screen';
import Grid from '../ui/Grid';
import { MonthCond, SelCond, TextCond, useConds, useEditable, useExcel, useUpload } from '../ui/common';
import { useApp } from '../lib/store';
import type { Col, Row } from '../lib/types';
import * as C from './cols';
import { customersFromTrips } from '../calc/volume';
import { dbGet } from '../lib/db';
import { n, prevYm, s, stamp, ymDash } from '../lib/util';

// ======================= M01 원가배분 고객사 관리 =======================
export function M01() {
  const app = useApp();
  const conds = useConds({ 화주: '', 관리부서: '', 메인센터: '', 사용여부: '', 보관여부: '' });
  const head = useEditable('M01.head', 'M01');
  const det = useEditable('M01.detail', 'M01');
  const [pick, setPick] = useState<Row | null>(null);
  const [chkH, setChkH] = useState<Set<Row>>(new Set());
  const [chkD, setChkD] = useState<Set<Row>>(new Set());
  const xl = useExcel(C.M01_HEAD, '원가배분고객사.xlsx');
  const heads = conds.apply(head.rows, { 화주: ['화주코드', '화주명'], 관리부서: ['관리부서'], 메인센터: ['메인센터'], 사용여부: ['사용여부'], 보관여부: ['보관여부'] });
  const details = pick ? det.rows.filter((r) => s(r.화주코드) === s(pick.화주코드)) : [];

  const init = () => app.run('운행실적으로 초기화', async () => {
    if (!app.trips) { app.say('운행실적이 없습니다.'); return; }
    const { heads: h, details: d } = customersFromTrips(app.trips, app.res, app.rows('M02.transport'), stamp(app.user));
    const exist = new Set(app.rows('M01.head').map((r) => s(r.화주코드)));
    // 이미 고객사가 있으면 새로 찾은 화주는 사용여부 N으로 넣는다(종합정보처럼 등록·확인 전에는 배분하지 않음)
    const newH = h.filter((r) => !exist.has(s(r.화주코드))).map((r) => (exist.size ? { ...r, 사용여부: 'N', 상태: '신규(확인필요)' } : r));
    const newD = d.filter((r) => !exist.has(s(r.화주코드)));
    if (!window.confirm(`운행실적에 있는 화주 ${h.length}개 중 아직 없는 ${newH.length}개와 배송센터 ${newD.length}행을 추가합니다(기존 설정은 그대로${exist.size ? ', 새 화주는 사용여부 N — 확인 후 Y로 바꾸세요' : ''}).`)) return;
    await app.put('M01.head', [...app.rows('M01.head'), ...newH], `고객사 ${newH.length}개 추가(운행실적)`, 'M01');
    await app.put('M01.detail', [...app.rows('M01.detail'), ...newD], `배송센터 설정 ${newD.length}행 추가`, 'M01');
  });
  const copySel = () => {
    if (!pick) { app.say('복사할 원본 화주를 왼쪽에서 고르세요.'); return; }
    const to = window.prompt('설정을 복사해 받을 화주코드(쉼표로 여러 개)');
    if (!to) return;
    const src = det.rows.filter((r) => s(r.화주코드) === s(pick.화주코드));
    const add = to.split(',').map((x) => x.trim()).filter(Boolean).flatMap((code) => src.map((r) => ({ ...r, 화주코드: code, 이력: stamp(app.user) })));
    det.setRows([...det.rows, ...add]);
    app.say(`${add.length}행을 복사했습니다. [저장]을 누르세요.`);
  };

  const checks: Check[] = useMemo(() => {
    const c: Check[] = [];
    const h = app.rows('M01.head'), d = app.rows('M01.detail');
    c.push(h.length ? { level: 'ok', title: `고객사 ${h.length}개 (사용 Y ${h.filter((r) => s(r.사용여부) !== 'N').length})` } : { level: 'warn', title: '고객사가 없습니다', detail: '[운행실적으로 초기화] 또는 Excel Upload' });
    const noMain = h.filter((r) => s(r.사용여부) !== 'N' && !s(r.메인센터));
    if (noMain.length) c.push({ level: 'warn', title: `메인센터 없는 화주 ${noMain.length}개`, detail: noMain.slice(0, 10).map((r) => `${s(r.화주코드)} ${s(r.화주명)}`).join(', ') });
    const hs = new Set(h.map((r) => s(r.화주코드)));
    const orphan = d.filter((r) => !hs.has(s(r.화주코드)));
    if (orphan.length) c.push({ level: 'warn', title: `고객사에 없는 화주의 배송센터 설정 ${orphan.length}행` });
    const noKind = d.filter((r) => s(r.주문타입) === '이고' && !['권역간', '권역내'].includes(s(r.출고구분)));
    if (noKind.length) c.push({ level: 'block', title: `이고인데 출고구분이 권역간/권역내가 아닌 행 ${noKind.length}` });
    if (app.trips) {
      const tripSh = new Set(app.trips.map((t) => t.shipperId));
      const missing = [...tripSh].filter((x) => !hs.has(x));
      if (missing.length && h.length) c.push({ level: 'warn', title: `운행실적에는 있는데 고객사에 없는 화주 ${missing.length}개`, detail: missing.slice(0, 15).join(', ') });
    }
    return c;
  }, [app, app.version]);

  return (
    <Screen id="JTPF040010" title="원가배분 고객사 관리" menu="M01"
      conds={<>
        <TextCond label="화주코드" k="화주" conds={conds} /><TextCond label="관리부서" k="관리부서" conds={conds} /><TextCond label="메인센터" k="메인센터" conds={conds} width={70} />
        <SelCond label="사용여부" k="사용여부" conds={conds} opts={['Y', 'N']} /><SelCond label="보관여부" k="보관여부" conds={conds} opts={['Y', 'N']} />
      </>}
      actions={[{ label: '전체선택', onClick: () => setChkH(new Set(heads)) }, { label: '선택복사', onClick: copySel }, { label: '운행실적으로\n초기화', onClick: init, added: true }]}
      onQuery={() => { head.reset(); det.reset(); app.say('1개의 테이블이 조회되었습니다.'); }}
      onNew={() => head.add({ 사용여부: 'Y', 보관여부: 'Y', 간선여부: 'Y', 상태: '거래중' })}
      onSave={async () => { await head.save('고객사 저장'); await det.save('배송센터 설정 저장'); }}
      onDelete={() => { head.remove(chkH); setChkH(new Set()); }}
      dirty={head.dirty || det.dirty}
      onExcel={xl.exportNow} onTemplate={xl.templateNow}
      checks={checks}
      help={<div>
        <h4>무엇을 하나</h4><p>원가배분 대상 화주와, 화주가 어느 배송센터에서 어떤 출고구분(배송/권역간/권역내)으로 나가는지를 정한다. 이고 물동량 생성과 노무비 관리부서의 기준.</p>
        <h4>오른쪽 표</h4><p>왼쪽에서 화주를 누르면 그 화주의 배송센터 설정이 나온다. 주문타입 이고 + 이고여부 Y인 배송센터만 이고 물동량이 생긴다. 권역내는 부서별 재배분에서 빠지고 이고부서 원가로 남는다.</p>
        <h4>사용여부 N</h4><p>사용여부 N인 화주는 대부분 2015-09 등록 후 방치된 것. 배분에서 빼려면 배분 제외 기준을 쓰는 것이 이력이 남아 안전하다.</p>
      </div>}
    >
      <div className="split">
        <div className="pane"><Grid cols={C.M01_HEAD} rows={heads} onView={xl.onView} check checked={chkH} onCheck={setChkH} onEdit={head.edit} onPick={setPick} picked={pick} /></div>
        <div className="pane">
          <div className="panebar">
            <b>{pick ? `${s(pick.화주코드)} ${s(pick.화주명)}` : '왼쪽에서 화주를 고르세요'}</b>
            <span className="grow" />
            <button type="button" disabled={!pick} onClick={() => pick && det.add({ 화주코드: pick.화주코드, 주문타입: '일반주문', 배송물동량: 'Y', 출고구분: '배송', 이고여부: 'N', 입고여부: 'N' })}>행추가</button>
            <button type="button" disabled={!chkD.size} onClick={() => { det.remove(chkD); setChkD(new Set()); }}>행삭제</button>
            <button type="button" onClick={() => setChkD(new Set(details))}>전체선택</button>
            <button type="button" onClick={() => det.save('배송센터 설정 저장')} className={det.dirty ? 'dirty' : ''}>저장</button>
            <button type="button" disabled={!chkD.size} onClick={async () => { if (!window.confirm(`체크한 ${chkD.size}행을 삭제하고 저장합니다.`)) return; const rest = det.rows.filter((r) => !chkD.has(r)); setChkD(new Set()); await app.put('M01.detail', rest, `배송센터 설정 ${chkD.size}행 삭제`, 'M01'); det.reset(); }}>삭제</button>
          </div>
          <Grid cols={C.M01_DETAIL} rows={details} check checked={chkD} onCheck={setChkD} onEdit={det.edit} />
        </div>
      </div>
    </Screen>
  );
}

// ======================= M02 원가배분 기준관리 =======================
const T2 = [{ key: 'storage', title: '보관비' }, { key: 'transport', title: '운송비' }, { key: 'work', title: '작업비' }, { key: 'admin', title: '일반관리비' }];
const CL2: Record<string, Col[]> = { storage: C.M02_STORAGE, transport: C.M02_TRANSPORT, work: C.M02_WORK, admin: C.M02_ADMIN };

export function M02() {
  const app = useApp();
  const [tab, setTab] = useState('storage');
  const table = `M02.${tab}`;
  const ed = useEditable(table, 'M02');
  const conds = useConds({ 사용여부: '', 출고구분: '', 부서: '', 화주: '' });
  const [checked, setChecked] = useState<Set<Row>>(new Set());
  const upload = useUpload();
  const xl = useExcel(CL2[tab], `${app.month}_원가배분기준_${T2.find((t) => t.key === tab)?.title}.xlsx`);
  const rows = conds.apply(ed.rows, { 사용여부: ['사용여부'], 출고구분: ['출고구분'], 부서: ['운영부서명'], 화주: ['화주코드', '화주명'] });

  const copyPrev = () => app.run('복사실행', async () => {
    const pm = prevYm(app.month);
    const names = ['M02.storage', 'M02.transport', 'M02.work', 'M02.admin'];
    const got = await Promise.all(names.map((nm) => dbGet<Row[]>(`${nm}@${pm}`)));
    if (got.every((g) => !g?.length)) { app.say(`전월(${ymDash(pm)}) 기준이 없습니다.`); return; }
    if (!window.confirm(`전월 ${ymDash(pm)} 기준 4개 탭을 ${ymDash(app.month)}로 복사합니다. 이달 기준은 바뀝니다.`)) return;
    const st = stamp(app.user);
    for (let i = 0; i < names.length; i++) if (got[i]?.length) await app.put(names[i], got[i]!.map((r) => ({ ...r, 년월: ymDash(app.month), 이력: st })), `복사실행 ${ymDash(pm)} → ${ymDash(app.month)}`, 'M02');
  });

  const checks: Check[] = useMemo(() => {
    const c: Check[] = [];
    const tr = app.rows('M02.transport'), st = app.rows('M02.storage'), wk = app.rows('M02.work'), ad = app.rows('M02.admin');
    c.push({ level: tr.length ? 'ok' : 'warn', title: `운송비(배송센터) ${tr.length}행`, detail: tr.length ? tr.map((r) => `${s(r.배송센터)} ${s(r.배송센터명)}`).join(', ') : '배송센터가 없으면 배송비 최소CBM·노무비 관리부서를 못 찾습니다.' });
    const judge = app.judge?.centers.filter((x) => x.use === 'Y').map((x) => x.name) ?? [];
    const sysNames = new Set(tr.map((r) => s(r.배송센터명)));
    const onlyJudge = judge.filter((x) => !sysNames.has(x));
    if (onlyJudge.length) c.push({ level: 'info', title: `권역 판정(배송센터)에는 있고 운송비 탭에 없는 센터 ${onlyJudge.length}`, detail: onlyJudge.join(', ') });
    c.push({ level: st.length > 33 ? 'ok' : 'warn', title: `보관비 가중치 ${st.length}행`, detail: st.length <= 33 ? '캡처에 보인 33행만 들어 있습니다. 종합정보 보관비 탭을 엑셀로 내려받아 Excel Upload 하세요.' : undefined });
    c.push({ level: wk.length > 32 ? 'ok' : 'warn', title: `작업비 가중치 ${wk.length}행`, detail: wk.length <= 32 ? '캡처에 보인 32개 화주만 들어 있습니다. 나머지는 Excel Upload.' : undefined });
    c.push({ level: ad.length > 33 ? 'ok' : 'warn', title: `일반관리비 배분기준 ${ad.length}행`, detail: ad.length <= 33 ? '캡처에 보인 33행만. 나머지는 Excel Upload.' : undefined });
    const badMin = tr.filter((r) => !(n(r.최소CBM) > 0));
    if (badMin.length) c.push({ level: 'warn', title: `최소CBM이 0인 센터 ${badMin.length}` });
    return c;
  }, [app, app.version]);

  return (
    <Screen id="JTPF040020" title="원가배분 기준관리" menu="M02" tabs={T2} tab={tab} onTab={(k) => { setTab(k); setChecked(new Set()); }}
      conds={<>
        <MonthCond />
        <SelCond label="사용여부" k="사용여부" conds={conds} opts={['Y', 'N']} />
        {(tab === 'storage' || tab === 'transport') && <SelCond label="출고구분" k="출고구분" conds={conds} opts={['배송', '권역간', '권역내']} />}
        {(tab === 'storage' || tab === 'transport') && <TextCond label="부서" k="부서" conds={conds} />}
        {tab === 'work' && <TextCond label="화주코드" k="화주" conds={conds} />}
      </>}
      actions={[{ label: '전체선택', onClick: () => setChecked(new Set(rows)) }, { label: '복사실행', onClick: copyPrev }]}
      onQuery={() => { ed.reset(); app.say('1개의 테이블이 조회되었습니다.'); }}
      onNew={() => ed.add({ 년월: ymDash(app.month), 사용여부: 'Y', ...(tab === 'admin' ? { 원가항목: '일반관리비', 배분기준: '작업비' } : tab === 'transport' ? { 출고구분: '배송', 최소CBM: 0.045 } : tab === 'work' ? { 'C/D': 1, 보관: 1.5, '이고여부(권역간)': 'Y' } : { 출고구분: '배송', 'C/D': 1, 보관: 1.5, 상온: 1 }) })}
      onSave={() => ed.save(`${T2.find((t) => t.key === tab)?.title} 기준 저장`)}
      onDelete={() => { ed.remove(checked); setChecked(new Set()); }}
      dirty={ed.dirty}
      onExcel={xl.exportNow} onTemplate={xl.templateNow}
      onUpload={(f) => upload(f, table, CL2[tab], 'M02', { fill: (r) => ({ 년월: ymDash(app.month), 사용여부: 'Y', ...(tab === 'admin' ? { 원가항목: '일반관리비' } : {}), ...r }) })}
      checks={checks}
      help={<div>
        <h4>무엇을 하나</h4><p>월마다 바뀌는 배분 기준값. [복사실행]으로 전월 기준을 그대로 가져온 뒤 바뀐 것만 고친다.</p>
        <ul>
          <li><b>보관비</b>: 메인센터 × 배송센터 × 출고구분별 가중치(C/D 1.0, 보관 1.4~1.5, 상온 1.0~1.5). 보관 CBM에 곱한다.</li>
          <li><b>운송비</b>: 배송센터와 최소CBM(0.045), 운영부서. 배송 1건의 CBM이 최소CBM보다 작으면 최소CBM으로 본다. 노무비 관리부서(출고센터 → 운영부서)도 여기서 찾는다.</li>
          <li><b>작업비</b>: 화주별 C/D·보관 가중치(보관 1.5~2.1 = 노무비 추가배분 등급 가중치).</li>
          <li><b>일반관리비</b>: 세부항목별 배분기준(작업비/보관비)과 사용여부.</li>
        </ul>
        <p>9월 값은 종합정보 화면 캡처에서 읽었다. 운송비는 13행 전부, 나머지 탭은 화면에 보인 행만이므로 전체는 Excel Upload로 채운다.</p>
      </div>}
    >
      <Grid cols={CL2[tab]} rows={rows} onView={xl.onView} check checked={checked} onCheck={setChecked} onEdit={ed.edit} />
    </Screen>
  );
}
