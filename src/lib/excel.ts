import * as XLSX from 'xlsx';
import type { Col, Row, Trip } from './types';
import { n, s } from './util';

function save(wb: XLSX.WorkBook, name: string) {
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** 그리드에 보이는 그대로(필터·정렬 반영) 내려받기 */
export function exportRows(cols: Col[], rows: Row[], name: string, sheet = 'Sheet1') {
  const head = cols.map((c) => (c.group ? `${c.group} ${c.t ?? c.k}` : (c.t ?? c.k)).replace(/\n/g, ''));
  const aoa = [head, ...rows.map((r) => cols.map((c) => { const v = r[c.k]; return c.type && c.type !== 'text' ? (v === null || v === undefined || v === '' ? null : n(v)) : s(v); }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(6, Math.round((c.w ?? 90) / 7)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  save(wb, name);
}

export const template = (cols: Col[], name: string) => exportRows(cols, [], name, '양식');

const norm = (x: unknown) => s(x).replace(/\s+/g, '').replace(/[()]/g, '');

/**
 * 종합정보에서 내려받은 엑셀(또는 양식)을 읽는다. 열 이름으로 찾으므로 열 순서·여분 열은 상관없다.
 * 머리글이 2줄(그룹 + 열)이어도 "그룹 열" 형태로 맞춘다.
 */
export async function readRows(file: File, cols: Col[]): Promise<{ rows: Row[]; matched: string[]; missing: string[]; sheet: string }> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, dense: true });
  const want = cols.map((c) => ({ c, keys: [norm(c.k), norm(c.t ?? c.k), norm(`${c.group ?? ''}${c.t ?? c.k}`)] }));
  let best: { sheet: string; hr: number; map: Map<number, Col>; score: number; aoa: unknown[][] } | null = null;
  for (const sn of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null });
    for (let hr = 0; hr < Math.min(10, aoa.length); hr++) {
      const row = aoa[hr] ?? []; const up = hr > 0 ? aoa[hr - 1] ?? [] : [];
      const map = new Map<number, Col>();
      let lastGroup = '';
      row.forEach((h, i) => {
        if (s(up[i])) lastGroup = norm(up[i]);
        const cand = [norm(h), `${lastGroup}${norm(h)}`, norm(up[i])];
        const hit = want.find((w) => w.keys.some((k) => cand.includes(k)) && ![...map.values()].includes(w.c));
        if (hit && norm(h)) map.set(i, hit.c);
      });
      if (!best || map.size > best.score) best = { sheet: sn, hr, map, score: map.size, aoa };
    }
  }
  if (!best || best.score < Math.min(3, cols.length)) throw new Error('머리글이 화면 열과 맞는 시트를 찾지 못했습니다. 양식 받기로 받은 열 이름을 확인하세요.');
  const rows: Row[] = [];
  for (let i = best.hr + 1; i < best.aoa.length; i++) {
    const r = best.aoa[i]; if (!r || r.every((x) => x === null || x === '')) continue;
    const first = s(r[[...best.map.keys()][0]]);
    if (/합계/.test(first)) continue;
    const o: Row = {};
    for (const [ci, c] of best.map) {
      let v = r[ci] as string | number | null;
      if (typeof v === 'number' && (!c.type || c.type === 'text') && /일자|일$|월$|월일|날짜/.test(c.k)) {
        const d = XLSX.SSF.parse_date_code(v);
        if (d) v = /월$/.test(c.k) && !/월일/.test(c.k) ? `${d.y}-${String(d.m).padStart(2, '0')}` : `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      }
      o[c.k] = c.type && c.type !== 'text' ? n(v) : v === null ? '' : String(v).replace(/\r\n/g, '\n');
    }
    rows.push(o);
  }
  const matched = [...best.map.values()].map((c) => c.k);
  return { rows, matched, missing: cols.map((c) => c.k).filter((k) => !matched.includes(k)), sheet: best.sheet };
}

/** 화주별 운행실적(SCE) 엑셀 → 운행 목록. 기존 간선비 작업 엑셀의 '1 STEP' 시트나 SCE 원본 모두 머리글로 찾는다. */
export async function readTrips(file: File, onStep: (m: string) => void): Promise<{ trips: Trip[]; month: string; sheet: string }> {
  onStep('파일 읽는 중…');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', dense: true, cellFormula: false });
  onStep('운행실적 시트 찾는 중…');
  const need = ['관리화주ID', '상차지명', '하차지명', '실행부서'];
  for (const sn of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null });
    const head = (aoa[0] ?? []).map((x) => s(x).trim());
    if (!need.every((k) => head.includes(k))) continue;
    const ix = (k: string) => head.indexOf(k);
    const S = (r: (string | number | null)[], k: string) => (ix(k) < 0 ? '' : s(r[ix(k)]).replace(/\r\n/g, '\n'));
    const N = (r: (string | number | null)[], k: string) => (ix(k) < 0 ? 0 : Math.round(n(r[ix(k)])));
    const D = (v: unknown) => {
      if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : ''; }
      const m = s(v).match(/(\d{4})-?(\d{2})-?(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : s(v);
    };
    const trips: Trip[] = []; const months = new Map<string, number>();
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i]; if (!r || !S(r, '관리화주ID') && !S(r, '상차지명')) continue;
      if (ix('기준월') >= 0 && (r[ix('기준월')] === null || r[ix('기준월')] === '')) continue;
      const date = D(r[ix('배송일')]);
      const ym = date.replace(/-/g, '').slice(0, 6); months.set(ym, (months.get(ym) ?? 0) + 1);
      trips.push({
        id: trips.length, date, bizDept: S(r, '부서'), dept: S(r, '실행부서'), shipperId: S(r, '관리화주ID'), shipper: S(r, '관리화주명'), turn: N(r, '회전'),
        carId: S(r, '차량ID'), carNo: S(r, '차량번호'), carKind: S(r, '차종구분'), carType: S(r, '차량구분'), carrier: S(r, '운송사'), item: S(r, '품목'),
        src: S(r, '상차지명'), srcAddr: S(r, '상차지주소'), dst: S(r, '하차지명'), dstAddr: S(r, '하차지주소'), dist: n(r[ix('거리')]), biz: S(r, '사업영역'),
        sales: N(r, '매출액'), fee: N(r, '운송료'), road: N(r, '도로비'), fuel: N(r, '유류대'), extFuel: N(r, '외부주유'), section: N(r, '구간료'), extra: N(r, '추가변동수당'),
        srcZone: S(r, '상차지권역'), dstZone: S(r, '하차지권역'), zone: S(r, '권역구분'), xlsKind: S(r, '배송구분'),
      });
    }
    const month = [...months].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    return { trips, month, sheet: sn };
  }
  throw new Error('관리화주ID·상차지명·하차지명·실행부서 열이 있는 시트가 없습니다.');
}
