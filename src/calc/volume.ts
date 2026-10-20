/**
 * 물동량 계열 (M01 고객사 초기화, M04 이고 생성, M07 산출재고 생성)
 * 원천(블루버 주문·입고·재고)은 각 화면 Excel Upload로 받는다. 열 이름은 종합정보 화면과 같다.
 */
import type { Judged, Row, Trip } from '../lib/types';
import { cbmOf, n, s, groupBy, lastDay } from '../lib/util';

/** "PK / 24" → 24 */
export const perBox = (uom: unknown) => { const m = String(uom ?? '').match(/\/\s*([\d.]+)/); return m ? Number(m[1]) || 1 : 1; };
export const eaOf = (r: Row) => n(r.포장) * perBox(r.UOM) + n(r.낱개);
const split2 = (ea: number, per: number) => ({ 포장: Math.trunc(ea / per), 낱개: ea - Math.trunc(ea / per) * per });

/** M01: 운행실적으로 고객사·배송센터 설정 초안 만들기 */
export function customersFromTrips(trips: readonly Trip[], res: readonly Judged[], centers: readonly Row[], stamp: string) {
  const code = new Map(centers.map((c) => [s(c.배송센터명), s(c.배송센터)]));
  const cdept = new Map(centers.map((c) => [s(c.배송센터명), s(c.운영부서명)]));
  const g = groupBy(trips.map((t, i) => ({ t, v: res[i].v })), (x) => x.t.shipperId);
  const heads: Row[] = []; const details: Row[] = [];
  for (const [sid, xs] of g) {
    const t0 = xs[0].t;
    const cnt = new Map<string, number>();
    const deptCnt = new Map<string, number>();
    xs.forEach(({ t, v }) => {
      deptCnt.set(t.dept, (deptCnt.get(t.dept) ?? 0) + 1);
      if (v === '배송' && code.has(t.src)) cnt.set(t.src, (cnt.get(t.src) ?? 0) + 1);
    });
    const main = [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const mainDept = cdept.get(main) || [...deptCnt].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const trunk = xs.some(({ v }) => v !== '배송');
    heads.push({ 선택: 'N', 화주코드: sid, 화주명: t0.shipper, 사업영역: t0.biz, 메인센터: code.get(main) ?? '', 관리부서: mainDept, 상태: '거래중', 사용여부: 'Y', 보관여부: 'Y', 간선여부: trunk ? 'Y' : 'N', 이력: stamp });
    for (const c of [...cnt.keys()].sort()) {
      const d = cdept.get(c) ?? '';
      const kind = c === main ? '배송' : d === mainDept ? '권역내' : '권역간';
      for (const ot of kind === '배송' ? ['일반주문'] : ['일반주문', '이고']) {
        details.push({ 선택: 'N', 화주코드: sid, 배송센터: code.get(c) ?? '', 배송센터명: c, 주문타입: ot, 운영부서: d, 배송물동량: ot === '일반주문' ? 'Y' : 'N',
          이고부서: mainDept, 출고구분: ot === '이고' ? kind : '배송', 이고여부: ot === '이고' ? 'Y' : 'N', 입고여부: c === main ? 'Y' : 'N', 이력: stamp });
      }
    }
  }
  return { heads: heads.sort((a, b) => s(a.화주코드).localeCompare(s(b.화주코드))), details };
}

/** M04 이고 물동량 생성: 배송 물동량 중 고객사 관리에서 이고(권역간/권역내)로 설정된 배송센터 분을 메인센터 → 배송센터 이고로 만든다 */
export function transferFromDelivery(m03: readonly Row[], heads: readonly Row[], details: readonly Row[], centers: readonly Row[], stamp: string): Row[] {
  const head = new Map(heads.map((h) => [s(h.화주코드), h]));
  const det = new Map(details.filter((d) => s(d.주문타입) === '이고' && s(d.이고여부) === 'Y').map((d) => [`${s(d.화주코드)}|${s(d.배송센터)}`, d]));
  const cname = new Map(centers.map((c) => [s(c.배송센터), s(c.배송센터명)]));
  const m = new Map<string, Row>();
  for (const r of m03) {
    const d = det.get(`${s(r.화주코드)}|${s(r.배송센터)}`);
    if (!d) continue;
    const h = head.get(s(r.화주코드));
    const main = s(h?.메인센터);
    if (main && s(r.배송센터) === main) continue; // 메인센터 자기 자신으로의 이고 설정은 무시(종합정보 9월 확인: 고객사 관리에 K501→K501 이고 Y가 있어도 이고 물동량에 없음)
    const k = [r.배송일, r.화주코드, r.배송센터, r.제품코드, r.재고타입].map(s).join('|');
    const e = m.get(k) ?? {
      이고일: r.배송일, 배송일: r.배송일, 화주코드: r.화주코드, 화주명: r.화주명, 출고센터: cname.get(main) ?? main, 도착센터: r.배송센터명,
      이고부서: d.이고부서, 이고구분: d.출고구분, 제품코드: r.제품코드, 제품명: r.제품명, UOM: r.UOM, 재고타입: r.재고타입,
      포장: 0, 낱개: 0, 총계: 0, 단위CBM: r.단위CBM, 배송CBM: 0, 이력: stamp,
    };
    e.포장 = n(e.포장) + n(r.포장); e.낱개 = n(e.낱개) + n(r.낱개); e.총계 = n(e.총계) + n(r.총계); e.배송CBM = n(e.배송CBM) + cbmOf(r);
    m.set(k, e);
  }
  return [...m.values()];
}

/**
 * M07 산출재고 생성 (2026-10-16 종합정보 9월 가토미작 152행과 100% 일치 확인)
 *  - 재고는 화주의 보관센터(기초재고·입고가 잡히는 센터) 단위로 굴린다.
 *  - 전일재고 = 기초재고(생성분 + 조정분) 포장·낱개 각각의 합
 *  - 입고량   = 입고 물동량 포장·낱개 각각의 합
 *  - 출고량   = 배송 물동량 포장·낱개 각각의 합. 배송센터가 어디든 화주 메인센터(원가배분 고객사 관리) 재고에서 뺀다.
 *               이고 물동량은 배송 물동량의 일부라서 따로 빼지 않는다(빼면 두 번 빠진다).
 *  - 조정량   = 산출재고 조정입력
 *  - 산출재고 = 위 네 값을 낱개로 바꿔 더한 뒤 포장(몫)·낱개(나머지)로 나눈다.
 * 일별로 굴려 일평균재고(EA)도 같이 낸다(보관비 물동량에 씀).
 */
export function computeStock(ym: string, m05: readonly Row[], m06: readonly Row[], m03: readonly Row[], _m04: readonly Row[], adj: readonly Row[], centers: readonly Row[], stamp: string, heads: readonly Row[] = []): Row[] {
  const nameOf = new Map(centers.map((c) => [s(c.배송센터), s(c.배송센터명)]));
  const mainOf = new Map(heads.filter((h) => s(h.메인센터)).map((h) => [s(h.화주코드), s(h.메인센터)]));
  // 재고 단위 = 화주 × 센터 × 제품 (재고타입은 나누지 않음). 종합정보도 한 제품에 한 행만 두고 보관·C/D 수량을 합친다(9월 43개 제품 확인).
  // 표시할 재고타입: 기초재고(생성·조정) 중 가장 나중 이력의 타입 → 없으면 출고(배송) 타입 → 없으면 입고 타입
  type Acc = { base: Row; open: number; inb: number[]; out: number[]; adj: number[]; per: number; raw: number[]; tBase?: { t: string; at: string }; tOut?: string; tIn?: string };
  const days = lastDay(ym);
  const map = new Map<string, Acc>();
  const day = (v: unknown) => Math.max(1, Math.min(days, Number(String(v ?? '').slice(8, 10)) || 1)) - 1;
  const get = (sh: unknown, center: string, prod: unknown, _type: unknown, src: Row) => {
    const k = [s(sh), center, s(prod)].join('|');
    let a = map.get(k);
    if (!a) {
      a = { base: { 화주코드: src.화주코드, 화주명: src.화주명, 보관센터: center, 보관센터명: nameOf.get(center) ?? '', 제품코드: src.제품코드, 제품명: src.제품명, UOM: src.UOM, 재고타입: src.재고타입 },
        open: 0, inb: Array(days).fill(0), out: Array(days).fill(0), adj: Array(days).fill(0), per: perBox(src.UOM), raw: Array(8).fill(0) };
      map.set(k, a);
    }
    return a;
  };
  // 수량은 행마다의 UOM이 아니라 이 재고 행(처음 잡힌 기초재고 등)의 UOM 입수로 낱개 환산한다: 포장 × 입수 + 낱개
  // (9월 대조: 3835 기초 PK/1 2,419 + 입고 PK/6 600 − 출고 1,103·31 → 종합정보 1,885 = 포장끼리·낱개끼리 더한 뒤 PK/1로 환산)
  const qty = (a: Acc, r: Row) => n(r.포장) * a.per + n(r.낱개);
  const addRaw = (a: Acc, i: number, r: Row) => { a.raw[i] += n(r.포장); a.raw[i + 1] += n(r.낱개); };
  // 기초재고도 화주 메인센터로 모은다(9월 대조: 3552 M501 기초 1,907 → 종합정보는 U501(메인)에 합산)
  for (const r of m05) { const a = get(r.화주코드, mainOf.get(s(r.화주코드)) ?? s(r.보관센터), r.제품코드, r.재고타입, r); a.open += qty(a, r); addRaw(a, 0, r);
    if (!a.tBase || s(r.이력) > a.tBase.at) a.tBase = { t: s(r.재고타입), at: s(r.이력) }; }
  // 입고도 출고처럼 화주 메인센터 재고로 잡는다(종합정보 9월 전 화주 산출재고 대조로 확인, 2026-10-19: 3972 S501 입고 → U502, 3780 S512 입고 → Y501)
  //  고객사 관리에 메인센터가 없는 화주(9월: 9006 유통2)의 입고는 종합정보 산출재고에 없다 → 뺀다
  for (const r of m06) {
    const main = mainOf.get(s(r.화주코드));
    if (mainOf.size && !main) continue;
    const a = get(r.화주코드, main ?? s(r.입고센터), r.제품코드, r.재고타입, r); a.inb[day(r.입고일자)] += qty(a, r); addRaw(a, 2, r); a.tIn ??= s(r.재고타입);
  }
  for (const r of m03) {
    const a = get(r.화주코드, mainOf.get(s(r.화주코드)) ?? s(r.배송센터), r.제품코드, r.재고타입, r);
    a.out[day(r.배송일)] += qty(a, r); addRaw(a, 4, r); a.tOut ??= s(r.재고타입);
  }
  for (const r of adj) {
    const a = get(r.화주코드, s(r.보관센터), r.제품코드, r.재고타입, r);
    a.adj[day(r.조정일자)] += qty(a, r); addRaw(a, 6, r);
  }
  const out: Row[] = [];
  for (const a of map.values()) {
    let stock = a.open, area = 0;
    for (let d = 0; d < days; d++) { stock += a.inb[d] - a.out[d] + a.adj[d]; area += stock; }
    const c = split2(stock, a.per);
    out.push({ ...a.base, 재고타입: a.tBase?.t || a.tOut || a.tIn || a.base.재고타입, '전일재고 포장': a.raw[0], '전일재고 낱개': a.raw[1], '입고량 포장': a.raw[2], '입고량 낱개': a.raw[3], '출고량 포장': a.raw[4], '출고량 낱개': a.raw[5],
      '조정량 포장': a.raw[6], '조정량 낱개': a.raw[7], '산출재고 포장': c.포장, '산출재고 낱개': c.낱개, 산출재고EA: stock, 일평균재고EA: area / days, 재고EA합: area, 이력: stamp });
  }
  return out.sort((a, b) => s(a.화주코드).localeCompare(s(b.화주코드)) || s(a.제품코드).localeCompare(s(b.제품코드)));
}

/** 제품 속성(단위CBM, 온도) — 배송/기초재고/이고 업로드에서 모은다 */
export function productInfo(...tables: readonly (readonly Row[])[]) {
  const m = new Map<string, { cbm: number; temp: string }>();
  for (const t of tables) for (const r of t) {
    const k = `${s(r.화주코드)}|${s(r.제품코드)}`;
    const e = m.get(k) ?? { cbm: 0, temp: '' };
    if (!e.cbm && n(r.단위CBM)) e.cbm = n(r.단위CBM);
    if (!e.temp && s(r.온도)) e.temp = s(r.온도);
    m.set(k, e);
  }
  return m;
}
