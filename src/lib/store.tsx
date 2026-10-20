'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Judged, JudgeSettings, LogEntry, Row, Trip } from './types';
import { dbGet, dbSet } from './db';
import { defaultJudgeSettings, judgeAll } from './judge';
import { getJson, loadBundledTrips, loadCenters, loadMaster } from './data';
import { now } from './util';
import type { Meta } from './flow';
import { NODES } from './flow';
import { inputsOf, isGenTable, summarize, tableLabel, type RunEntry, type RunOutput } from './runlog';
import ReasonModal, { type ReasonRequest } from '../ui/ReasonModal';
import * as SEED from './seed';

/** 월과 무관한 표 */
const GLOBAL = new Set(['M01.head', 'M01.detail', 'M12.score', 'M12.piece', 'X.rules']);
/** 2026-09 캡처 기준값 */
const SEEDS: Record<string, Row[]> = {
  'M02.transport': SEED.SEED_M02_TRANSPORT, 'M02.storage': SEED.SEED_M02_STORAGE, 'M02.work': SEED.SEED_M02_WORK, 'M02.admin': SEED.SEED_M02_ADMIN,
  'M11.input': SEED.SEED_M11_INPUT, 'M10.input': SEED.SEED_M10_INPUT, 'M10.upload': SEED.SEED_M10_UPLOAD, 'M10.deptadj': SEED.SEED_M10_DEPTADJ,
  'M08.input': SEED.SEED_M08_INPUT, 'M13.input': SEED.SEED_M13_INPUT,
};
const SEED_GLOBAL: Record<string, Row[]> = { 'M12.score': SEED.SEED_M12_SCORE };

const MENU_TITLE: Record<string, string> = {
  M01: '원가배분 고객사 관리', M02: '원가배분 기준관리', M03: '배송 물동량 조회', M04: '이고 물동량 조회', M05: '기초재고 세팅', M06: '입고 물동량 조회', M07: '산출 재고 조회',
  M08: '보관비 배분 조회', M09: '배송비 배분 조회', M10: '간선비 배분 조회', M11: '노무비 배분 조회', M12: '화주별 노무비 추가배분', M13: '일반관리비 배분 조회', X01: '배분 제외 기준',
};

export const keyOf = (name: string, month: string) => (GLOBAL.has(name) ? name : `${name}@${month}`);

interface Ctx {
  month: string; setMonth: (m: string) => void;
  user: string; setUser: (u: string) => void;
  rows: (name: string) => Row[];
  has: (name: string) => boolean;
  put: (name: string, rows: Row[], what?: string, menu?: string) => Promise<void>;
  trips: Trip[] | null; tripSource: string; setTrips: (t: Trip[], source: string) => Promise<void>;
  res: Judged[]; judge: JudgeSettings | null; setJudge: (j: JudgeSettings) => Promise<void>;
  status: string; say: (m: string) => void;
  busy: string; run: <T>(label: string, fn: () => T | Promise<T>) => Promise<T | undefined>;
  log: LogEntry[];
  runs: RunEntry[];
  addRunNote: (id: string, text: string) => Promise<void>;
  meta: Record<string, Meta>;
  screens: React.MutableRefObject<Record<string, ScreenInfo>>;
  register: (menu: string, info: ScreenInfo) => void;
  count: (name: string) => number;
  ready: boolean;
  version: number;
}
export interface ScreenInfo { title: string; tab?: string; checks: { level: string; title: string; detail?: string }[] }
const C = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(C); if (!c) throw new Error('no ctx'); return c; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(() => { try { return localStorage.getItem('ca.month') || '202609'; } catch { return '202609'; } });
  const [user, setUserS] = useState(() => { try { return localStorage.getItem('ca.user') || 'LOCAL'; } catch { return 'LOCAL'; } });
  const cache = useRef(new Map<string, Row[]>());
  const [version, setVersion] = useState(0);
  const [trips, setTripsS] = useState<Trip[] | null>(null);
  const tripsRef = useRef<Trip[] | null>(null); tripsRef.current = trips;
  const [tripSource, setTripSource] = useState('');
  const [judge, setJudgeS] = useState<JudgeSettings | null>(null);
  const [master, setMaster] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const runsRef = useRef<RunEntry[]>([]); runsRef.current = runs;
  const [reasonReq, setReasonReq] = useState<(ReasonRequest & { resolve: (r: string | null) => void }) | null>(null);
  // 지금 실행 중인 작업(사유·바뀐 표)
  const runCtx = useRef<{ id: string; label: string; menu: string; reason: string | null; outputs: RunOutput[]; t: number } | null>(null);
  const metaRef = useRef<Record<string, Meta>>({});
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  metaRef.current = meta;
  const screens = useRef<Record<string, ScreenInfo>>({});
  const register = useCallback((menu: string, info: ScreenInfo) => { screens.current[menu] = info; }, []);
  const touch = useCallback((name: string, rows: number) => {
    setMeta((m) => { const nm = { ...m, [name]: { t: Date.now(), at: now(), who: userRef.current, n: rows } }; void dbSet(`meta@${monthRef.current}`, nm); return nm; });
  }, []);
  const userRef = useRef(user); userRef.current = user;
  const monthRef = useRef(month); monthRef.current = month;

  const say = useCallback((m: string) => setStatus(`[${now()}] - ${m}`), []);
  const setUser = (u: string) => { setUserS(u); try { localStorage.setItem('ca.user', u); } catch { /* */ } };

  // 기준 데이터(판정 설정, 마스터, 로그)
  useEffect(() => {
    (async () => {
      const [m, centers] = await Promise.all([loadMaster().catch(() => ({})), loadCenters().catch(() => [])]);
      setMaster(m);
      setJudgeS((await dbGet<JudgeSettings>('judge.settings')) ?? defaultJudgeSettings(centers));
      setLog((await dbGet<LogEntry[]>('log')) ?? []);
      for (const [k, v] of Object.entries(SEED_GLOBAL)) {
        const cur = await dbGet<Row[]>(k);
        if (!cur) await dbSet(k, v);
      }
      // 원가배분 고객사: 비어 있으면 종합정보 2026-10-16 추출본(3,118개)으로 채운다
      if (!(await dbGet<Row[]>('M01.head'))) {
        const h = await getJson<Row[]>('m01_head.json').catch(() => null);
        if (h) await dbSet('M01.head', h);
      }
      // 화주×배송센터 설정: 비어 있으면 종합정보 2026-10-16 추출본(7,015행: 일반주문·이고, 배송물동량·이고여부·입고여부)으로 채운다
      if (!(await dbGet<Row[]>('M01.detail'))) {
        const d = await getJson<Row[]>('m01_detail.json').catch(() => null);
        if (d) await dbSet('M01.detail', d);
      }
    })();
  }, []);

  // 월이 바뀌면 그 달 표 전부와 운행실적을 읽는다
  useEffect(() => {
    let alive = true;
    setReady(false);
    try { localStorage.setItem('ca.month', month); } catch { /* */ }
    (async () => {
      const names = ['M01.head', 'M01.detail', 'M02.storage', 'M02.transport', 'M02.work', 'M02.admin', 'M03.actual', 'M03.adj', 'M04.actual', 'M04.adj',
        'M05.actual', 'M05.adj', 'M06.actual', 'M07.actual', 'M07.adj', 'M08.volume', 'M08.input', 'M08.alloc', 'M08.pnl', 'M09.transport', 'M09.general', 'M09.alloc', 'M09.pnl',
        'M10.shipper', 'M10.dept', 'M10.input', 'M10.deptadj', 'M10.pnl', 'M10.upload', 'M11.work', 'M11.shipper', 'M11.dept', 'M11.input', 'M11.pnl',
        'M12.score', 'M12.grade', 'M12.extra', 'M12.piece', 'M13.alloc', 'M13.input', 'M13.pnl', 'X.rules'];
      const next = new Map<string, Row[]>();
      for (const nm of names) {
        const k = keyOf(nm, month);
        let v = await dbGet<Row[]>(k);
        if (!v && month === '202609' && SEEDS[nm]) { v = SEEDS[nm]; await dbSet(k, v); }
        next.set(nm, v ?? []);
      }
      let t = await dbGet<{ trips: Trip[]; source: string }>(`trips@${month}`);
      if (!t) {
        const b = await loadBundledTrips(month);
        if (b) t = { trips: b, source: `내장 데이터 ${month} 화주별 운행실적 (${b.length.toLocaleString()}건)` };
      }
      const mt = (await dbGet<Record<string, Meta>>(`meta@${month}`)) ?? {};
      const rn = (await dbGet<RunEntry[]>(`runs@${month}`)) ?? [];
      if (!alive) return;
      cache.current = next;
      setMeta(mt);
      setRuns(rn);
      setTripsS(t?.trips ?? null); setTripSource(t?.source ?? '운행실적 없음 — 배송비 배분 조회 › 운송비 탭에서 가져오기');
      setVersion((x) => x + 1);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [month]);

  const res = useMemo(() => (trips && judge ? judgeAll(trips, judge, master) : []), [trips, judge, master]);

  const cnt = (nm: string) => (nm === 'trips' ? tripsRef.current?.length ?? 0 : cache.current.get(nm)?.length ?? 0);
  const askReason = (req: ReasonRequest) => new Promise<string | null>((resolve) => setReasonReq({ ...req, resolve }));
  const saveRun = useCallback(async (e: RunEntry) => {
    const nl = [e, ...runsRef.current].slice(0, 300);
    setRuns(nl); runsRef.current = nl;
    await dbSet(`runs@${monthRef.current}`, nl);
  }, []);

  const put = useCallback(async (name: string, rows: Row[], what?: string, menu?: string) => {
    if (isGenTable(name)) {
      const implicit = !runCtx.current;
      if (implicit) runCtx.current = { id: `${Date.now()}`, label: what ?? tableLabel(name), menu: menu ?? name.split('.')[0], reason: null, outputs: [], t: Date.now() };
      const ctx = runCtx.current!;
      if (menu && !ctx.menu) ctx.menu = menu;
      if (ctx.reason === null) {
        const mn = menu ?? name.split('.')[0];
        const last = runsRef.current.find((r) => r.menu === mn) ?? null;
        const nodeIns = new Set(NODES.filter((nd) => nd.menu === mn).flatMap((nd) => nd.inputs));
        const stale = last ? [...nodeIns].filter((i) => (metaRef.current[i]?.t ?? 0) > last.t).map(tableLabel) : [];
        const tables = NODES.filter((nd) => nd.menu === mn && nd.how === 'gen').map((nd) => nd.label);
        const reason = await askReason({ action: ctx.label, menu: mn, menuName: MENU_TITLE[mn] ?? mn, tables: tables.length ? tables : [tableLabel(name)], last, staleInputs: stale });
        if (!reason) { if (implicit) runCtx.current = null; throw new Error('실행 사유를 입력하지 않아 취소했습니다(바뀐 것 없음).'); }
        ctx.reason = reason; ctx.menu = mn;
      }
      const prev = cache.current.get(name) ?? [];
      ctx.outputs = [...ctx.outputs.filter((o) => o.name !== name), summarize(name, prev, rows)];
      if (implicit) {
        cache.current.set(name, rows); setVersion((x) => x + 1); await dbSet(keyOf(name, month), rows); touch(name, rows.length);
        runCtx.current = null;
        await saveRun({ id: ctx.id, at: now(), t: Date.now(), who: user, month, menu: ctx.menu, action: ctx.label, reason: ctx.reason!, outputs: ctx.outputs, inputs: inputsOf(ctx.outputs.map((o) => o.name), metaRef.current, cnt) });
        if (what) { const e: LogEntry = { at: now(), who: user, menu: ctx.menu, what: `${what} — 사유: ${ctx.reason}` }; setLog((l) => { const nl = [e, ...l].slice(0, 500); void dbSet('log', nl); return nl; }); }
        return;
      }
      if (what) what = `${what} — 사유: ${ctx.reason}`;
    }
    cache.current.set(name, rows);
    setVersion((x) => x + 1);
    await dbSet(keyOf(name, month), rows);
    touch(name, rows.length);
    if (what) {
      const e: LogEntry = { at: now(), who: user, menu: menu ?? name.split('.')[0], what };
      setLog((l) => { const nl = [e, ...l].slice(0, 500); void dbSet('log', nl); return nl; });
    }
  }, [month, user, touch]);

  const setTrips = useCallback(async (t: Trip[], source: string) => {
    setTripsS(t); setTripSource(source);
    await dbSet(`trips@${month}`, { trips: t, source });
    touch('trips', t.length);
  }, [month, touch]);

  const setJudge = useCallback(async (j: JudgeSettings) => { setJudgeS(j); await dbSet('judge.settings', j); touch('judge', 1); }, [touch]);

  const run = useCallback(async <T,>(label: string, fn: () => T | Promise<T>) => {
    setBusy(label);
    const outer = !runCtx.current;
    if (outer) runCtx.current = { id: `${Date.now()}`, label, menu: '', reason: null, outputs: [], t: Date.now() };
    await new Promise((r) => setTimeout(r, 30));
    try { return await fn(); } catch (e) { say(`오류: ${(e as Error).message}`); return undefined; } finally {
      const ctx = runCtx.current;
      if (outer) {
        runCtx.current = null;
        // 생성 표를 하나라도 바꿨으면 실행 이력을 남긴다(중간에 오류가 나도 이미 바뀐 표는 기록)
        if (ctx && ctx.reason && ctx.outputs.length) {
          await saveRun({ id: ctx.id, at: now(), t: Date.now(), who: userRef.current, month: monthRef.current, menu: ctx.menu, action: ctx.label, reason: ctx.reason, outputs: ctx.outputs,
            inputs: inputsOf(ctx.outputs.map((o) => o.name), metaRef.current, cnt) });
        }
      }
      setBusy('');
    }
  }, [say, saveRun]);

  const addRunNote = useCallback(async (id: string, text: string) => {
    const nl = runsRef.current.map((r) => (r.id === id ? { ...r, notes: [...(r.notes ?? []), { at: now(), who: userRef.current, text }] } : r));
    setRuns(nl); runsRef.current = nl;
    await dbSet(`runs@${monthRef.current}`, nl);
  }, []);

  const value: Ctx = {
    month, setMonth, user, setUser,
    rows: (nm) => cache.current.get(nm) ?? [],
    has: (nm) => (cache.current.get(nm)?.length ?? 0) > 0,
    put, trips, tripSource, setTrips, res, judge, setJudge, status, say, busy, run, log, runs, addRunNote, ready, version, meta, screens, register,
    count: (nm) => (nm === 'trips' ? trips?.length ?? 0 : nm === 'judge' ? 1 : cache.current.get(nm)?.length ?? 0),
  };
  return (
    <C.Provider value={value}>
      {children}
      {reasonReq && <ReasonModal req={reasonReq} onDone={(r) => { const res = reasonReq.resolve; setReasonReq(null); res(r); }} />}
    </C.Provider>
  );
}
