/**
 * M10 간선비 배분 조회 (JTPF040100)
 *
 * 9월 화면 숫자로 확인한 산식
 *  1) 권역간 풀 = 간선비입력에서 이고구분 '권역간' 행(SYSTEM + EXCEL 조정)의 항목별 합. 전 부서 공동.
 *     화주별 권역간 금액 = 풀 × (그 화주·구간 이고CBM ÷ 전체 권역간 이고CBM)
 *     예) 월임 풀 31,508,267 ÷ 권역간 CBM 3,243.4 = CBM당 9,714.5 → 미트밸리 부산→호남 21.22CBM = 206,141
 *     이고비율 = 화주 권역간 CBM 합 ÷ 전체 권역간 CBM (미트밸리 53.30 ÷ 3,243.4 = 1.643%)
 *  2) 권역내 풀 = 부서별 간선비입력 '권역내' 행(EXCEL). 그 부서(이고부서)의 권역내 구간에만 이고CBM 비율로 나눈다.
 *  3) 부서별 = 화주별 권역간 금액을 그 화주의 차량부서·출고센터별 배송CBM 비율로 다시 나눈다.
 *     예) 대현푸드빌 권역간 월임 223,344 × 오산운영1팀(유통1) 56.44% = 126,056. 권역내는 이고부서에 그대로.
 *  4) 부서간조정(화주 9005 3PL공통) = 부서별 결과의 부서 합 − 간선비입력 부서 합(권역간·권역내 모두). 부서 합계 0.
 *  5) 손익생성 = 부서별 결과를 소계정(22111 월임운송료, 22112 구간운송료, 22113 도로비, 22114 유류대)으로 펼친 것.
 */
import type { Judged, Row, Trip } from '../lib/types';
import { amountsOf, deptCode, deptName, intraByDept, DEPTS } from '../lib/judge';
import { BIZ_CODE } from '../lib/seed';
import { n, s, sum } from '../lib/util';

export const T_ITEMS = ['월임용차료', '도로비', '유류대', '추가변동수당', '구간용차료'] as const;
export const T_ACCT: Record<string, [string, string]> = {
  월임용차료: ['22111', '월임운송료'], 구간용차료: ['22112', '구간운송료'], 도로비: ['22113', '도로비'], 유류대: ['22114', '유류대'], 추가변동수당: ['22115', '추가변동수당'],
};

/** 이고 구간(화주 × 출고센터 × 도착센터 × 이고부서 × 이고구분)과 그 이고CBM */
export interface Route { 화주코드: string; 화주명: string; 출고센터: string; 도착센터: string; 운영부서: string; 이고구분: string; cbm: number; biz?: string }

/** M04 이고 물동량에서 구간을 만든다 (정식 기준) */
export function routesFromTransfer(m04: readonly Row[]): Route[] {
  const m = new Map<string, Route>();
  for (const r of m04) {
    const k = [r.화주코드, r.출고센터, r.도착센터, r.이고부서, r.이고구분].map(s).join('|');
    const e = m.get(k) ?? { 화주코드: s(r.화주코드), 화주명: s(r.화주명), 출고센터: s(r.출고센터), 도착센터: s(r.도착센터), 운영부서: s(r.이고부서), 이고구분: s(r.이고구분), cbm: 0 };
    e.cbm += n(r.배송CBM);
    m.set(k, e);
  }
  return [...m.values()];
}

/**
 * 이고 물동량이 없을 때의 대체 기준: 화주별 운행실적(SCE)의 간선 운행 금액을 CBM 대신 쓴다.
 * 원가배부(권역조정) 제외 팀은 권역내 판정 운행도 권역간으로 본다(조정이 없으므로 권역간 풀에 남음).
 */
export function routesFromTrips(trips: readonly Trip[], res: readonly Judged[], alloc: Record<string, boolean>): Route[] {
  const m = new Map<string, Route>();
  trips.forEach((t, i) => {
    const v = res[i].v;
    if (v === '배송') return;
    const k0 = v === '권역내' && alloc[t.dept] !== false ? '권역내' : '권역간';
    const k = [t.shipperId, t.src, t.dst, t.dept, k0].join('|');
    const e = m.get(k) ?? { 화주코드: t.shipperId, 화주명: t.shipper, 출고센터: t.src, 도착센터: t.dst, 운영부서: t.dept, 이고구분: k0, cbm: 0, biz: t.biz };
    e.cbm += sum(amountsOf(t));
    m.set(k, e);
  });
  return [...m.values()].filter((r) => r.cbm > 0);
}

const items = (r: Row) => T_ITEMS.map((k) => n(r[k]));

/** 간선비입력 행들 → 권역간 풀(항목 5개), 부서별 권역내 풀 */
export function pools(input: readonly Row[]) {
  const inter = [0, 0, 0, 0, 0];
  const intra = new Map<string, number[]>();
  for (const r of input) {
    const a = items(r);
    if (s(r.이고구분) === '권역내') {
      const d = deptName(n(r.부서)) || s(r.부서명);
      const p = intra.get(d) ?? [0, 0, 0, 0, 0];
      a.forEach((x, j) => { p[j] += x; });
      intra.set(d, p);
    } else a.forEach((x, j) => { inter[j] += x; });
  }
  return { inter, intra };
}

/** 화주별 탭
 * 반올림 (2026-10-16 종합정보 9월 254행으로 확인)
 *  - 권역간: 간선비입력을 부서별로 모아 부서 풀마다 화주·구간 CBM 비율로 나누고 행마다 반올림해 더한다.
 *    권역간 전체 끝수는 마지막 행(화주코드·도착센터코드 순)에 더한다. → 213행 중 항목별 1~3행만 ±1
 *  - 권역내: 부서 풀을 그 부서 권역내 구간에 나누고 행마다 반올림(끝수 맞춤 없음).
 *    권역내 구간이 없는 부서의 풀과 반올림 끝수는 권역내 마지막 행에 더한다(9월: 오산운영1팀 630,000 → 4067 천안1, +1)
 */
export function shipperAlloc(input: readonly Row[], routes: readonly Route[], ym: string, stamp: string, centers: readonly Row[] = []): Row[] {
  const { inter, intra } = pools(input);
  const ccode = new Map(centers.map((c) => [s(c.배송센터명), s(c.배송센터)]));
  const order = (a: Route, b: Route) => a.화주코드.localeCompare(b.화주코드, undefined, { numeric: true }) || (ccode.get(a.도착센터) ?? a.도착센터).localeCompare(ccode.get(b.도착센터) ?? b.도착센터);
  const round = (x: number) => Math.round(x + 1e-9);
  const out: Row[] = [];
  // 권역간: 부서별 풀
  const interByDept = new Map<string, number[]>();
  for (const r of input) {
    if (s(r.이고구분) === '권역내') continue;
    const d = deptName(n(r.부서)) || s(r.부서명) || '';
    const p = interByDept.get(d) ?? [0, 0, 0, 0, 0];
    items(r).forEach((x, j) => { p[j] += x; });
    interByDept.set(d, p);
  }
  const interR = routes.filter((r) => r.이고구분 === '권역간').slice().sort(order);
  const totI = sum(interR.map((r) => r.cbm));
  const byShipper = new Map<string, number>();
  interR.forEach((r) => byShipper.set(r.화주코드, (byShipper.get(r.화주코드) ?? 0) + r.cbm));
  const amtsI = interR.map(() => [0, 0, 0, 0, 0]);
  if (totI) {
    for (const p of interByDept.values()) interR.forEach((r, i) => p.forEach((x, j) => { amtsI[i][j] += round((x * r.cbm) / totI); }));
    if (interR.length) inter.forEach((x, j) => { amtsI[interR.length - 1][j] += Math.round(x) - sum(amtsI.map((a) => a[j])); });
  }
  interR.forEach((r, i) => out.push(row(r, (byShipper.get(r.화주코드)! / (totI || 1)) * 100, totI ? amtsI[i] : null)));

  // 권역내: 부서 풀 → 그 부서 구간
  const intraR = routes.filter((r) => r.이고구분 === '권역내').slice().sort(order);
  const intraOut: Row[] = [];
  const byDept = new Map<string, Route[]>();
  intraR.forEach((r) => byDept.set(r.운영부서, [...(byDept.get(r.운영부서) ?? []), r]));
  const given = [0, 0, 0, 0, 0];
  const rowsOf = new Map<Route, Row>();
  for (const [d, rs] of byDept) {
    const pool = intra.get(d);
    const tot = sum(rs.map((r) => r.cbm));
    const sh = new Map<string, number>();
    rs.forEach((r) => sh.set(r.화주코드, (sh.get(r.화주코드) ?? 0) + r.cbm));
    rs.forEach((r) => {
      const a = pool && tot ? pool.map((x) => round((x * r.cbm) / tot)) : null;
      if (a) a.forEach((x, j) => { given[j] += x; });
      rowsOf.set(r, row(r, (sh.get(r.화주코드)! / (tot || 1)) * 100, a));
    });
  }
  intraR.forEach((r) => intraOut.push(rowsOf.get(r)!));
  const intraTot = [0, 0, 0, 0, 0];
  for (const p of intra.values()) p.forEach((x, j) => { intraTot[j] += x; });
  const rest = intraTot.map((x, j) => Math.round(x) - given[j]);
  if (rest.some((x) => x)) {
    if (intraOut.length) {
      const last = intraOut[intraOut.length - 1];
      T_ITEMS.forEach((k, j) => { if (rest[j]) last[k] = n(last[k]) + rest[j]; });
      last.합계 = sum(T_ITEMS.map((k) => n(last[k])));
    } else {
      for (const [d, p] of intra) if (sum(p)) intraOut.push(row({ 화주코드: '', 화주명: '(권역내 구간 없음)', 출고센터: '', 도착센터: '', 운영부서: d, 이고구분: '권역내', cbm: 0 }, 0, p));
    }
  }
  out.push(...intraOut);
  return out.sort((a, b) => s(a.화주코드).localeCompare(s(b.화주코드), undefined, { numeric: true }) || s(a.이고구분).localeCompare(s(b.이고구분)));

  function row(r: Route, ratio: number, a: number[] | null): Row {
    const o: Row = {
      실적월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 화주코드: r.화주코드, 화주명: r.화주명, 출고센터: r.출고센터, 도착센터: r.도착센터,
      운영부서: r.운영부서, 이고구분: r.이고구분, 이고CBM: r.cbm, 이고비율: ratio, 사업영역: r.biz ?? '', 이력: stamp,
    };
    T_ITEMS.forEach((k, j) => { o[k] = a ? a[j] : null; });
    o.합계 = a ? sum(a) : null;
    return o;
  }
}

/** 화주의 차량부서·출고센터별 배송량 (부서별 재배분 기준) */
export interface DelivBasis { 화주코드: string; 차량부서: string; 출고센터: string; cbm: number }

export function delivBasisFromM03(m03: readonly Row[]): DelivBasis[] {
  const m = new Map<string, DelivBasis>();
  for (const r of m03) {
    const k = [r.화주코드, r.배송부서명, r.배송센터명].map(s).join('|');
    const e = m.get(k) ?? { 화주코드: s(r.화주코드), 차량부서: s(r.배송부서명), 출고센터: s(r.배송센터명), cbm: 0 };
    e.cbm += n(r.배송CBM);
    m.set(k, e);
  }
  return [...m.values()];
}
export function delivBasisFromTrips(trips: readonly Trip[], res: readonly Judged[]): DelivBasis[] {
  const m = new Map<string, DelivBasis>();
  trips.forEach((t, i) => {
    if (res[i].v !== '배송') return;
    const k = [t.shipperId, t.dept, t.src].join('|');
    const e = m.get(k) ?? { 화주코드: t.shipperId, 차량부서: t.dept, 출고센터: t.src, cbm: 0 };
    e.cbm += sum(amountsOf(t));
    m.set(k, e);
  });
  return [...m.values()].filter((x) => x.cbm > 0);
}

/** 부서별 탭
 * (2026-10-16 종합정보 9월 부서별 443행 100%, 프로시저 BCKNL_CL_PL_TRUNKLINEDEPT로 확인)
 *  - 기준 CBM = 배송 물동량 + 조정입력(EXCEL 테이블)을 배송부서·배송센터로 모은 TOTAL_CBM. 비율 = 그 행 ÷ 화주 합
 *  - 금액 = ROUND(비율 × 화주 권역간 금액), 화주 합과의 차이는 MAX(배송센터코드) 행에 UPDATE로 더함
 *  - 권역간: 화주 권역간 금액(항목별 합)을 그 화주의 배송부서·배송센터 CBM 비율로 나누고 행마다 반올림.
 *    끝수는 배송센터코드 순 마지막 행(경산 Y501이 있으면 경산)에 더한다.
 *  - 권역내: 화주 × 이고부서마다 한 행. 배송CBM = 그 부서 권역내 이고CBM 전체, 배분율 100, 금액이 없으면 0원 행으로 보인다.
 */
export function deptAlloc(shipperRows: readonly Row[], basis: readonly DelivBasis[], stamp: string, centers: readonly Row[] = []): Row[] {
  const ccode = new Map(centers.map((c) => [s(c.배송센터명), s(c.배송센터)]));
  const cc = (v: string) => ccode.get(v) ?? v;
  const bySh = new Map<string, DelivBasis[]>();
  basis.forEach((b) => bySh.set(b.화주코드, [...(bySh.get(b.화주코드) ?? []), b]));
  const out: Row[] = [];
  const g = new Map<string, Row[]>();
  const intraCbm = new Map<string, number>();
  for (const r of shipperRows) {
    const intra = s(r.이고구분) === '권역내';
    if (intra) intraCbm.set(s(r.운영부서), (intraCbm.get(s(r.운영부서)) ?? 0) + n(r.이고CBM));
    if (!intra && (r.월임용차료 === null || r.월임용차료 === undefined)) continue;
    const k = `${s(r.화주코드)}|${s(r.이고구분)}|${intra ? s(r.운영부서) : ''}`;
    g.set(k, [...(g.get(k) ?? []), r]);
  }
  for (const [k, rs] of g) {
    const [code, kind, dept] = k.split('|');
    const a = T_ITEMS.map((it) => sum(rs.map((r) => n(r[it]))));
    const base: Row = { 실적월: rs[0].실적월, 화주코드: code, 화주명: rs[0].화주명, 이고구분: kind, 사업영역: rs[0].사업영역, 이력: stamp };
    if (kind === '권역내') { out.push(mk(base, dept, s(rs[0].출고센터), intraCbm.get(dept) ?? 0, 100, a)); continue; }
    const bs = (bySh.get(code) ?? []).slice().sort((x, y) => cc(x.출고센터).localeCompare(cc(y.출고센터)) || x.차량부서.localeCompare(y.차량부서));
    if (!bs.length) { out.push(mk(base, s(rs[0].운영부서), s(rs[0].출고센터), sum(rs.map((r) => n(r.이고CBM))), 100, a)); continue; }
    const tot = sum(bs.map((b) => b.cbm));
    const parts = a.map((x) => {
      const p = bs.map((b) => (tot ? Math.round((x * b.cbm) / tot + 1e-9) : 0));
      p[p.length - 1] += Math.round(x) - sum(p);
      return p;
    });
    bs.forEach((b, i) => out.push(mk(base, b.차량부서, b.출고센터, b.cbm, tot ? (b.cbm / tot) * 100 : 0, parts.map((p) => p[i]))));
  }
  return out.sort((a, b) => n(a.차량부서) - n(b.차량부서) || s(a.화주코드).localeCompare(s(b.화주코드), undefined, { numeric: true }));

  function mk(base: Row, d: string, center: string, cbm: number, ratio: number, a: number[]): Row {
    const o: Row = { ...base, 차량부서: deptCode(d) || '', 차량부서명: d, 출고센터: center, 배송CBM: cbm, 배분율: ratio };
    T_ITEMS.forEach((it, j) => { o[it] = a[j]; });
    o.합계 = sum(a);
    return o;
  }
}

/** 부서간조정 탭 (3PL공통 9005로 부서 사이 이동) */
export function deptAdjust(deptRows: readonly Row[], input: readonly Row[], ym: string, stamp: string): Row[] {
  // 권역간·권역내 모두 포함 (2026-10-16 종합정보 9월 24행 100%: 권역내 구간 없는 부서 풀이 다른 부서 행으로 간 만큼도 조정됨)
  const alloc = new Map<number, number[]>();
  for (const r of deptRows) {
    const d = n(r.차량부서); const a = alloc.get(d) ?? [0, 0, 0, 0, 0];
    T_ITEMS.forEach((it, j) => { a[j] += n(r[it]); });
    alloc.set(d, a);
  }
  const own = new Map<number, number[]>();
  for (const r of input) {
    const d = n(r.부서); const a = own.get(d) ?? [0, 0, 0, 0, 0];
    T_ITEMS.forEach((it, j) => { a[j] += n(r[it]); });
    own.set(d, a);
  }
  const out: Row[] = [];
  const depts = [...new Set([...alloc.keys(), ...own.keys()])].filter(Boolean).sort((a, b) => a - b);
  for (const d of depts) {
    const A = alloc.get(d) ?? [0, 0, 0, 0, 0], O = own.get(d) ?? [0, 0, 0, 0, 0];
    T_ITEMS.forEach((it, j) => {
      const v = Math.round(A[j] - O[j]);
      if (!v) return;
      const [acc, nm] = T_ACCT[it];
      out.push({ 기준월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 부서: d, 화주: '9005', 부문: '3PL부문', 사업영역: '12213', 중구분: 'K21', 소계정: acc, 배분여부: 'N', 금액: v, 화주명: '3PL공통', 세부항목: nm, 부서명: deptName(d), 생성이력: stamp });
    });
  }
  return out;
}

/** 손익생성 탭 */
export function trunkPnl(deptRows: readonly Row[], ym: string, stamp: string): Row[] {
  const m = new Map<string, Row>();
  for (const r of deptRows) {
    for (const it of T_ITEMS) {
      const v = n(r[it]); if (!v) continue;
      const [acc, nm] = T_ACCT[it];
      const k = `${s(r.차량부서)}|${s(r.화주코드)}|${acc}`;
      const e = m.get(k) ?? {
        기준월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 부서: r.차량부서, 화주: r.화주코드, 부문: '3PL부문', 사업영역: BIZ_CODE[s(r.사업영역)] ?? '12213',
        중구분: 'K21', 소계정: acc, 배분여부: 'N', 금액: 0, 화주명: r.화주명, 세부항목: nm, 부서명: r.차량부서명, 생성이력: stamp,
      };
      e.금액 = n(e.금액) + v;
      m.set(k, e);
    }
  }
  return [...m.values()];
}

/**
 * 간선비업로드 탭: 권역조정(권역간 → 권역내) 행. 운행 판정에서 권역내로 나온 간선 금액을 부서별로 옮긴다.
 * 원가배부 제외 팀은 만들지 않는다.
 */
export function adjustRows(trips: readonly Trip[], res: readonly Judged[], alloc: Record<string, boolean>, ym: string, stamp: string): Row[] {
  const agg = intraByDept(trips, res);
  const out: Row[] = [];
  for (const d of DEPTS) {
    if (alloc[d.name] === false) continue;
    const a = (agg.get(d.name) ?? [0, 0, 0, 0, 0]).map(Math.round);
    if (!sum(a)) continue;
    for (const [k, sg] of [['권역간', -1], ['권역내', 1]] as const) {
      const o: Row = { 선택: 'Y', 실적월: `${ym.slice(0, 4)}-${ym.slice(4)}`, 부서코드: d.code, 부서명: d.name, 비용구분: '간선비', 이고구분: k };
      T_ITEMS.forEach((it, j) => { o[it] = sg * a[j] || 0; });
      o.합계 = sg * sum(a); o.이력 = stamp;
      out.push(o);
    }
  }
  return out;
}

/** 간선비업로드 행 → 간선비입력 EXCEL 행 */
export function uploadToInput(up: Row, ym: string): Row {
  const o: Row = { 실적월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 부서: n(up.부서코드), 부서명: up.부서명, 비용구분: '간선비', 이고구분: up.이고구분 };
  T_ITEMS.forEach((it) => { o[it] = n(up[it]); });
  o.합계 = sum(T_ITEMS.map((it) => n(up[it])));
  o.생성구분 = 'EXCEL';
  return o;
}

/** 운행실적으로 SYSTEM 행 만들기 (간선 판정 운행 전부를 실행부서별 권역간으로) */
export function systemFromTrips(trips: readonly Trip[], res: readonly Judged[], ym: string): Row[] {
  const m = new Map<string, number[]>();
  trips.forEach((t, i) => {
    if (res[i].v === '배송') return;
    const a = m.get(t.dept) ?? [0, 0, 0, 0, 0];
    amountsOf(t).forEach((x, j) => { a[j] += x; });
    m.set(t.dept, a);
  });
  return DEPTS.filter((d) => m.has(d.name)).map((d) => {
    const a = m.get(d.name)!.map(Math.round);
    const o: Row = { 실적월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 부서: d.code, 부서명: d.name, 비용구분: '간선비', 이고구분: '권역간' };
    T_ITEMS.forEach((it, j) => { o[it] = a[j]; });
    o.합계 = sum(a); o.생성구분 = 'SYSTEM';
    return o;
  });
}
