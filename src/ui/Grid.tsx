import { useEffect, useMemo, useRef, useState } from 'react';
import type { Col, Row } from '../lib/types';
import { fmt, n, s } from '../lib/util';

const RH = 28;   // LDS compact row height

/** 열 제목이 잘리지 않을 최소 폭 */
const headW = (c: Col) => Math.max(...(c.t ?? c.k).split('\n').map((line) => [...line].reduce((a, ch) => a + (/[\u3131-\uD79D]/.test(ch) ? 13 : 8), 0) + 14));
const colW = (c: Col) => Math.max(c.w ?? 90, headW(c));

export interface GridProps {
  cols: Col[];
  rows: Row[];
  check?: boolean;                                  // 맨 앞 체크박스 열
  checked?: Set<Row>;
  onCheck?: (next: Set<Row>) => void;
  onEdit?: (row: Row, key: string, value: string | number) => void;
  onPick?: (row: Row) => void;                      // 행 클릭
  picked?: Row | null;
  onView?: (rows: Row[]) => void;                   // 필터·정렬 후 행 (엑셀 내려받기용)
  empty?: string;
}

export default function Grid({ cols, rows, check, checked, onCheck, onEdit, onPick, picked, onView, empty }: GridProps) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [h, setH] = useState(600);
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ k: string; d: 1 | -1 } | null>(null);
  const [editing, setEditing] = useState<{ r: Row; k: string } | null>(null);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el); setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setFilter({}); setSort(null); if (box.current) box.current.scrollTop = 0; setTop(0); }, [cols]);

  const view = useMemo(() => {
    let v = rows;
    const fs = Object.entries(filter).filter(([, x]) => x.trim());
    if (fs.length) v = v.filter((r) => fs.every(([k, x]) => {
      const t = x.trim();
      if (/^[<>]=?-?\d/.test(t)) { const op = t.match(/^[<>]=?/)![0]; const val = Number(t.slice(op.length)); const c = n(r[k]); return op === '>' ? c > val : op === '>=' ? c >= val : op === '<' ? c < val : c <= val; }
      if (t === '(빈값)') return !s(r[k]);
      return s(r[k]).toLowerCase().includes(t.toLowerCase());
    }));
    if (sort) {
      const c = cols.find((x) => x.k === sort.k);
      const num = c?.type && c.type !== 'text';
      v = [...v].sort((a, b) => (num ? n(a[sort.k]) - n(b[sort.k]) : s(a[sort.k]).localeCompare(s(b[sort.k]))) * sort.d);
    }
    return v;
  }, [rows, filter, sort, cols]);
  useEffect(() => { onView?.(view); }, [view, onView]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of cols) if (c.sum) t[c.k] = view.reduce((a, r) => a + n(r[c.k]), 0);
    return t;
  }, [view, cols]);

  const groups = cols.some((c) => c.group);
  const head1: { t: string; span: number; rowSpan: number; c?: Col }[] = [];
  if (groups) {
    for (const c of cols) {
      const last = head1[head1.length - 1];
      if (c.group && last && last.t === c.group && !last.c) last.span++;
      else if (c.group) head1.push({ t: c.group, span: 1, rowSpan: 1 });
      else head1.push({ t: c.t ?? c.k, span: 1, rowSpan: 2, c });
    }
  }
  const first = Math.max(0, Math.floor(top / RH) - 10);
  const count = Math.ceil(h / RH) + 20;
  const slice = view.slice(first, first + count);
  const allChecked = check && checked && view.length > 0 && view.every((r) => checked.has(r));
  const rnW = Math.max(46, String(view.length.toLocaleString()).length * 7 + 14);   // 행번호·건수 칸: 건수가 잘리지 않게
  const width = (check ? 26 : 0) + rnW + cols.reduce((a, c) => a + colW(c), 0);

  const headCell = (c: Col, rowSpan = 1) => (
    <th key={c.k} rowSpan={rowSpan} onClick={() => setSort((p) => (p?.k === c.k ? (p.d === 1 ? { k: c.k, d: -1 } : null) : { k: c.k, d: 1 }))}
      title={`${c.k} — 클릭해 정렬`}>
      {(c.t ?? c.k).split('\n').map((x, i) => <div key={i}>{x}</div>)}
      {sort?.k === c.k && <span className="sortmark">{sort.d === 1 ? '▲' : '▼'}</span>}
    </th>
  );

  return (
    <div className="grid" ref={box} onScroll={(e) => setTop((e.target as HTMLDivElement).scrollTop)}>
      <table style={{ width }}>
        <colgroup>
          <col style={{ width: rnW }} />
          {check && <col style={{ width: 26 }} />}
          {cols.map((c) => <col key={c.k} style={{ width: colW(c) }} />)}
        </colgroup>
        <thead>
          {groups ? (
            <>
              <tr>
                <th rowSpan={2} className="rn" />
                {check && <th rowSpan={2} />}
                {head1.map((g, i) => (g.c ? headCell(g.c, 2) : <th key={`g${i}`} colSpan={g.span} className="grp">{g.t}</th>))}
              </tr>
              <tr>{cols.filter((c) => c.group).map((c) => headCell(c))}</tr>
            </>
          ) : (
            <tr><th className="rn" />{check && <th />}{cols.map((c) => headCell(c))}</tr>
          )}
          <tr className="filter">
            <th className="rn" title="필터: 글자 포함, >100, <=0, (빈값)">▽</th>
            {check && <th><input type="checkbox" checked={!!allChecked} onChange={() => {
              const nx = new Set(checked); if (allChecked) view.forEach((r) => nx.delete(r)); else view.forEach((r) => nx.add(r)); onCheck?.(nx);
            }} /></th>}
            {cols.map((c) => (
              <th key={c.k} style={{ background: c.bg }}>
                <input value={filter[c.k] ?? ''} onChange={(e) => setFilter((f) => ({ ...f, [c.k]: e.target.value }))} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr style={{ height: first * RH }} />
          {slice.map((r, i) => {
            const idx = first + i;
            return (
              <tr key={idx} className={`${picked === r ? 'picked' : ''} ${r._warn ? 'warnrow' : ''}`} onClick={() => onPick?.(r)} style={{ height: RH }}>
                <td className="rn">{idx + 1}{picked === r ? ' ▸' : ''}</td>
                {check && <td className="c"><input type="checkbox" checked={!!checked?.has(r)} onChange={() => { const nx = new Set(checked); if (nx.has(r)) nx.delete(r); else nx.add(r); onCheck?.(nx); }} /></td>}
                {cols.map((c) => {
                  const v = r[c.k];
                  const num = c.type && c.type !== 'text';
                  const neg = num && n(v) < 0;
                  if (editing && editing.r === r && editing.k === c.k) {
                    const commit = (val: string) => { setEditing(null); onEdit?.(r, c.k, num ? n(val) : val); };
                    return (
                      <td key={c.k} className="editing">
                        {c.opts ? (
                          <select autoFocus defaultValue={s(v)} onChange={(e) => commit(e.target.value)} onBlur={(e) => commit(e.target.value)}>
                            {c.opts.map((o) => <option key={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input autoFocus list={c.list} defaultValue={s(v)} onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditing(null); }}
                            onBlur={(e) => commit(e.target.value)} />
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={c.k} className={`${num ? 'n' : c.align === 'c' ? 'c' : ''} ${neg ? 'neg' : ''} ${c.edit ? 'ed' : ''}`} style={{ background: c.bg }}
                      onDoubleClick={() => { if (c.edit && onEdit) setEditing({ r, k: c.k }); }} title={s(v)}>
                      {fmt(v, c.type, c.dec ?? (c.type === 'pct' ? 3 : c.type === 'dec' ? 4 : 0))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr style={{ height: Math.max(0, (view.length - first - slice.length) * RH) }} />
          {view.length === 0 && <tr><td colSpan={cols.length + (check ? 2 : 1)} className="emptyrow">{empty ?? '조회된 데이터가 없습니다.'}</td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td className="rn" title={`조회 ${view.length.toLocaleString()}행`}>{view.length.toLocaleString()}</td>
            {check && <td />}
            {cols.map((c, i) => (
              <td key={c.k} className={c.sum ? 'n' : ''}>
                {i === 0 ? <b className="sumlabel">[합계]</b> : c.sum ? fmt(totals[c.k], c.type === 'text' ? 'int' : c.type, c.dec ?? (c.type === 'dec' ? 4 : c.type === 'pct' ? 3 : 0)) : ''}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
