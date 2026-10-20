'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Col, Row } from '../lib/types';
import { fmt, n, s } from '../lib/util';

const RH = 32;
const CHECK_W = 36;
const RN_MIN = 48;

/** 열 제목 기준 최소 폭 */
const headW = (c: Col) =>
  Math.max(
    ...(c.t ?? c.k)
      .split('\n')
      .map((line) => [...line].reduce((a, ch) => a + (/[\u3131-\uD79D]/.test(ch) ? 12 : 7), 0) + 20),
  );
const colW = (c: Col) => Math.max(c.w ?? 88, headW(c));

const cellW = (w: number): CSSProperties => ({
  width: w,
  minWidth: w,
  maxWidth: w,
});

export interface GridProps {
  cols: Col[];
  rows: Row[];
  check?: boolean;
  checked?: Set<Row>;
  onCheck?: (next: Set<Row>) => void;
  onEdit?: (row: Row, key: string, value: string | number) => void;
  onPick?: (row: Row) => void;
  picked?: Row | null;
  onView?: (rows: Row[]) => void;
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
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    setFilter({});
    setSort(null);
    if (box.current) box.current.scrollTop = 0;
    setTop(0);
  }, [cols]);

  const view = useMemo(() => {
    let v = rows;
    const fs = Object.entries(filter).filter(([, x]) => x.trim());
    if (fs.length) {
      v = v.filter((r) =>
        fs.every(([k, x]) => {
          const t = x.trim();
          if (/^[<>]=?-?\d/.test(t)) {
            const op = t.match(/^[<>]=?/)![0];
            const val = Number(t.slice(op.length));
            const c = n(r[k]);
            return op === '>' ? c > val : op === '>=' ? c >= val : op === '<' ? c < val : c <= val;
          }
          if (t === '(빈값)') return !s(r[k]);
          return s(r[k]).toLowerCase().includes(t.toLowerCase());
        }),
      );
    }
    if (sort) {
      const c = cols.find((x) => x.k === sort.k);
      const num = c?.type && c.type !== 'text';
      v = [...v].sort(
        (a, b) => (num ? n(a[sort.k]) - n(b[sort.k]) : s(a[sort.k]).localeCompare(s(b[sort.k]))) * sort.d,
      );
    }
    return v;
  }, [rows, filter, sort, cols]);
  useEffect(() => {
    onView?.(view);
  }, [view, onView]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of cols) if (c.sum) t[c.k] = view.reduce((a, r) => a + n(r[c.k]), 0);
    return t;
  }, [view, cols]);

  const widths = useMemo(() => cols.map(colW), [cols]);
  const groups = cols.some((c) => c.group);
  const head1: { t: string; span: number; rowSpan: number; c?: Col; wi?: number }[] = [];
  if (groups) {
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const last = head1[head1.length - 1];
      if (c.group && last && last.t === c.group && !last.c) {
        last.span++;
        last.wi = (last.wi ?? 0) + widths[i];
      } else if (c.group) head1.push({ t: c.group, span: 1, rowSpan: 1, wi: widths[i] });
      else head1.push({ t: c.t ?? c.k, span: 1, rowSpan: 2, c, wi: widths[i] });
    }
  }

  const first = Math.max(0, Math.floor(top / RH) - 10);
  const count = Math.ceil(h / RH) + 20;
  const slice = view.slice(first, first + count);
  const allChecked = check && checked && view.length > 0 && view.every((r) => checked.has(r));
  const rnW = Math.max(RN_MIN, String(view.length.toLocaleString()).length * 8 + 16);
  const colCount = 1 + (check ? 1 : 0) + cols.length;
  const tableW = rnW + (check ? CHECK_W : 0) + widths.reduce((a, w) => a + w, 0);

  const toggleSort = (k: string) =>
    setSort((p) => (p?.k === k ? (p.d === 1 ? { k, d: -1 } : null) : { k, d: 1 }));

  const headCell = (c: Col, w: number, rowSpan = 1) => {
    const label = (c.t ?? c.k).replace(/\n/g, ' ');
    const num = c.type && c.type !== 'text';
    return (
      <th
        key={c.k}
        rowSpan={rowSpan}
        className={num ? 'n' : c.align === 'c' ? 'c' : ''}
        style={cellW(w)}
        onClick={() => toggleSort(c.k)}
        title={`${c.k} — 클릭해 정렬`}
      >
        <span className="g-hlabel">{label}</span>
        {sort?.k === c.k && <span className="sortmark">{sort.d === 1 ? '↑' : '↓'}</span>}
      </th>
    );
  };

  const spacer = (px: number, key: string) =>
    px > 0 ? (
      <tr key={key} className="g-spacer" aria-hidden>
        <td colSpan={colCount} style={{ height: px, padding: 0, border: 0, lineHeight: 0 }} />
      </tr>
    ) : null;

  return (
    <div className="grid" ref={box} onScroll={(e) => setTop((e.target as HTMLDivElement).scrollTop)}>
      <table style={{ width: tableW }}>
        <colgroup>
          <col style={{ width: rnW }} />
          {check && <col style={{ width: CHECK_W }} />}
          {widths.map((w, i) => (
            <col key={cols[i].k} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          {groups ? (
            <>
              <tr>
                <th rowSpan={2} className="rn" style={cellW(rnW)} />
                {check && <th rowSpan={2} className="chk" style={cellW(CHECK_W)} />}
                {head1.map((g, i) =>
                  g.c ? (
                    headCell(g.c, g.wi ?? colW(g.c), 2)
                  ) : (
                    <th key={`g${i}`} colSpan={g.span} className="grp" style={cellW(g.wi ?? 0)}>
                      {g.t}
                    </th>
                  ),
                )}
              </tr>
              <tr>
                {cols.map((c, i) => (c.group ? headCell(c, widths[i]) : null))}
              </tr>
            </>
          ) : (
            <tr>
              <th className="rn" style={cellW(rnW)} />
              {check && <th className="chk" style={cellW(CHECK_W)} />}
              {cols.map((c, i) => headCell(c, widths[i]))}
            </tr>
          )}
          <tr className="filter">
            <th className="rn" style={cellW(rnW)} title="필터: 포함, >100, <=0, (빈값)">
              <span className="g-filter-ico">⌕</span>
            </th>
            {check && (
              <th className="chk" style={cellW(CHECK_W)}>
                <input
                  type="checkbox"
                  checked={!!allChecked}
                  onChange={() => {
                    const nx = new Set(checked);
                    if (allChecked) view.forEach((r) => nx.delete(r));
                    else view.forEach((r) => nx.add(r));
                    onCheck?.(nx);
                  }}
                  aria-label="전체 선택"
                />
              </th>
            )}
            {cols.map((c, i) => (
              <th key={c.k} style={cellW(widths[i])}>
                <input
                  className="g-filter"
                  value={filter[c.k] ?? ''}
                  onChange={(e) => setFilter((f) => ({ ...f, [c.k]: e.target.value }))}
                  placeholder="필터"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spacer(first * RH, 'sp-top')}
          {slice.map((r, i) => {
            const idx = first + i;
            return (
              <tr
                key={idx}
                className={`${picked === r ? 'picked' : ''} ${r._warn ? 'warnrow' : ''}`}
                onClick={() => onPick?.(r)}
              >
                <td className="rn" style={cellW(rnW)}>
                  {idx + 1}
                </td>
                {check && (
                  <td className="chk c" style={cellW(CHECK_W)}>
                    <input
                      type="checkbox"
                      checked={!!checked?.has(r)}
                      onChange={() => {
                        const nx = new Set(checked);
                        if (nx.has(r)) nx.delete(r);
                        else nx.add(r);
                        onCheck?.(nx);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                )}
                {cols.map((c, ci) => {
                  const v = r[c.k];
                  const num = c.type && c.type !== 'text';
                  const neg = num && n(v) < 0;
                  const w = widths[ci];
                  if (editing && editing.r === r && editing.k === c.k) {
                    const commit = (val: string) => {
                      setEditing(null);
                      onEdit?.(r, c.k, num ? n(val) : val);
                    };
                    return (
                      <td key={c.k} className="editing" style={cellW(w)}>
                        {c.opts ? (
                          <select
                            autoFocus
                            defaultValue={s(v)}
                            onChange={(e) => commit(e.target.value)}
                            onBlur={(e) => commit(e.target.value)}
                          >
                            {c.opts.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            autoFocus
                            list={c.list}
                            defaultValue={s(v)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
                              if (e.key === 'Escape') setEditing(null);
                            }}
                            onBlur={(e) => commit(e.target.value)}
                          />
                        )}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={c.k}
                      className={`${num ? 'n' : c.align === 'c' ? 'c' : ''} ${neg ? 'neg' : ''} ${c.edit ? 'ed' : ''}`}
                      style={{ ...cellW(w), ...(c.bg ? { ['--col-tint' as string]: c.bg } : {}) }}
                      data-tint={c.bg ? '1' : undefined}
                      onDoubleClick={() => {
                        if (c.edit && onEdit) setEditing({ r, k: c.k });
                      }}
                      title={s(v)}
                    >
                      {fmt(v, c.type, c.dec ?? (c.type === 'pct' ? 3 : c.type === 'dec' ? 4 : 0))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {spacer(Math.max(0, (view.length - first - slice.length) * RH), 'sp-bot')}
          {view.length === 0 && (
            <tr>
              <td colSpan={colCount} className="emptyrow">
                <div className="g-empty">
                  <strong>{empty ?? '조회된 데이터가 없습니다'}</strong>
                  <span>조건을 바꾸거나 조회·생성을 실행하세요</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className="rn" style={cellW(rnW)} title={`조회 ${view.length.toLocaleString()}행`}>
              {view.length.toLocaleString()}
            </td>
            {check && <td className="chk" style={cellW(CHECK_W)} />}
            {cols.map((c, i) => (
              <td key={c.k} className={c.sum ? 'n' : ''} style={cellW(widths[i])}>
                {i === 0 ? (
                  <span className="sumlabel">합계</span>
                ) : c.sum ? (
                  fmt(totals[c.k], c.type === 'text' ? 'int' : c.type, c.dec ?? (c.type === 'dec' ? 4 : c.type === 'pct' ? 3 : 0))
                ) : (
                  ''
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
