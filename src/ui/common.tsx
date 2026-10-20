'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Col, Row } from '../lib/types';
import { useApp } from '../lib/store';
import { readRows, exportRows, template } from '../lib/excel';
import { s, stamp, ymDash } from '../lib/util';
import { Cond } from './Screen';

/** 편집 가능한 표: 저장 전까지는 작업 사본을 고친다 */
export function useEditable(name: string, menu: string) {
  const app = useApp();
  const base = app.rows(name);
  const [work, setWork] = useState<Row[] | null>(null);
  useEffect(() => { setWork(null); }, [name, app.month]);
  const rows = work ?? base;
  const edit = useCallback((r: Row, k: string, v: string | number) => {
    setWork((w) => (w ?? base).map((x) => (x === r ? { ...x, [k]: v, 이력: stamp(app.user) } : x)));
  }, [base, app.user]);
  return {
    rows, dirty: work !== null, edit,
    setRows: (r: Row[]) => setWork(r),
    add: (row: Row) => setWork([...(work ?? base), { ...row, 이력: stamp(app.user) }]),
    remove: (sel: Set<Row>) => setWork((work ?? base).filter((x) => !sel.has(x))),
    save: async (what?: string) => { if (work) { await app.put(name, work, what ?? `${name} 저장 ${work.length}행`, menu); setWork(null); app.say('저장되었습니다.'); } },
    reset: () => setWork(null),
  };
}

/** Excel Upload: 열 이름으로 읽어 표를 바꾼다(또는 덧붙인다) */
export function useUpload() {
  const app = useApp();
  return async (file: File, name: string, cols: Col[], menu: string, opts: { append?: boolean; fill?: (r: Row) => Row } = {}) => {
    await app.run('엑셀 읽는 중', async () => {
      const { rows, matched, missing, sheet } = await readRows(file, cols);
      const msg = `${file.name} [${sheet}] ${rows.length.toLocaleString()}행\n맞춘 열 ${matched.length}개${missing.length ? `\n없는 열(빈 값으로 둠): ${missing.join(', ')}` : ''}\n\n${opts.append ? '기존 행 뒤에 덧붙입니다.' : `이 달(${ymDash(app.month)}) 기존 ${app.rows(name).length.toLocaleString()}행을 바꿉니다.`} 계속할까요?`;
      if (!window.confirm(msg)) return;
      const st = stamp(app.user);
      const out = rows.map((r) => ({ ...(opts.fill ? opts.fill(r) : r), 이력: s(r.이력) || st }));
      await app.put(name, opts.append ? [...app.rows(name), ...out] : out, `Excel Upload ${file.name} ${out.length}행`, menu);
      app.say(`${out.length.toLocaleString()}개의 행을 올렸습니다.`);
    });
  };
}

export function useExcel(cols: Col[], fileName: string) {
  const [view, setView] = useState<Row[]>([]);
  return { onView: setView, exportNow: () => exportRows(cols, view, fileName), templateNow: () => template(cols, fileName.replace('.xlsx', '_양식.xlsx')) };
}

const MONTHS = (() => { const a: string[] = []; for (let y = 2025; y <= 2027; y++) for (let m = 1; m <= 12; m++) a.push(`${y}${String(m).padStart(2, '0')}`); return a; })();

export function MonthCond({ label = '기준월', range = false }: { label?: string; range?: boolean }) {
  const { month, setMonth } = useApp();
  const sel = (
    <select value={month} onChange={(e) => setMonth(e.target.value)}>
      {MONTHS.map((m) => <option key={m} value={m}>{ymDash(m)}</option>)}
    </select>
  );
  return <Cond label={label}>{sel}{range && <><span className="tilde">~</span><select value={month} disabled><option>{ymDash(month)}</option></select></>}</Cond>;
}

/** 조건 칸들 → 행 필터 */
export function useConds(init: Record<string, string>) {
  const [c, setC] = useState(init);
  const set = (k: string, v: string) => setC((x) => ({ ...x, [k]: v }));
  const apply = useCallback((rows: Row[], map: Record<string, string | string[]>) => {
    const act = Object.entries(c).filter(([, v]) => v);
    if (!act.length) return rows;
    return rows.filter((r) => act.every(([k, v]) => {
      const cols = map[k]; if (!cols) return true;
      return (Array.isArray(cols) ? cols : [cols]).some((col) => s(r[col]).includes(v));
    }));
  }, [c]);
  return { c, set, apply };
}

export function TextCond({ label, k, conds, list, width = 110 }: { label: string; k: string; conds: ReturnType<typeof useConds>; list?: string[]; width?: number }) {
  const id = `dl-${k}`;
  return (
    <Cond label={label}>
      <input style={{ width }} value={conds.c[k] ?? ''} onChange={(e) => conds.set(k, e.target.value)} list={list ? id : undefined} />
      {list && <datalist id={id}>{list.map((x) => <option key={x} value={x} />)}</datalist>}
    </Cond>
  );
}
export function SelCond({ label, k, conds, opts }: { label: string; k: string; conds: ReturnType<typeof useConds>; opts: string[] }) {
  return (
    <Cond label={label}>
      <select value={conds.c[k] ?? ''} onChange={(e) => conds.set(k, e.target.value)}>
        <option value="">전체</option>{opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </Cond>
  );
}

export const uniq = (rows: Row[], k: string) => [...new Set(rows.map((r) => s(r[k])).filter(Boolean))].sort();
export const useUniq = (rows: Row[], k: string) => useMemo(() => uniq(rows, k), [rows, k]);
