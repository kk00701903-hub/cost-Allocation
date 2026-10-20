/**
 * M09 배송비 배분 조회 (JTPF040090) — 2026-10-16 종합정보 9월 자료와 행 단위 대사 후 수정
 *  운송비 탭   = 화주별 운행실적을 차량·회전 단위로 모은 것
 *                운송구분 = 배송 물동량(M03)에 그 차량·회전이 있으면 배송비, 없으면 간선비
 *                월임용차료(재배분) = 같은 차량·회전번호의 월 평균 운송료
 *                유류대(재배분)     = 차량 월 (유류대+외부주유) × 거리 비율
 *  일반배송비  = 배송비 회전의 재배분 금액을 화주·배송처 배분CBM(= max(배송CBM, 최소CBM)) 비율로 나눈 것
 *                예) 회전 월임 61,500 × 22.17% = 13,635 (화면 확인)
 *  배송비배분  = 일반배송비를 부서·화주·차량구분(월임/구간/계절차량)으로 합한 것
 *  손익생성    = 배송비배분을 소계정으로 펼친 것
 */
import type { Judged, Row, Trip } from '../lib/types';
import { deptCode } from '../lib/judge';
import { BIZ_CODE } from '../lib/seed';
import { cbmOf, n, s, sum } from '../lib/util';

const D_ITEMS = ['월임용차', '도로비', '유류대', '추가변동수당', '구간용차'] as const;
const D_ACCT: Record<string, [string, string]> = {
  월임용차: ['22111', '월임운송료'], 구간용차: ['22112', '구간운송료'], 도로비: ['22113', '도로비'], 유류대: ['22114', '유류대'], 추가변동수당: ['22115', '추가변동수당'],
};
export const kindOf = (v: Judged['v']) => (v === '배송' ? '배송비' : '간선비');

/** 종합정보 반올림: 소수 1자리로 반올림한 뒤 정수로 반올림(예: 114,973.48 → 114,973.5 → 114,974) */
export const roundCS = (x: number) => Math.round(Math.round(x * 10 + 1e-7) / 10 + 1e-9);
const roundHalf = (x: number) => Math.round(x + 1e-9);

/** 배송 물동량(M03)의 차량·회전 목록. 차량ID·회전이 없으면 null */
export function m03Turns(m03: readonly Row[]): { turns: Set<string>; dates: Set<string> } | null {
  const rs = m03.filter((r) => s(r.차량ID) && n(r.회전));
  if (!rs.length) return null;
  return { turns: new Set(rs.map((r) => [s(r.배송일).slice(0, 10), s(r.차량ID), n(r.회전)].join('|'))), dates: new Set(rs.map((r) => s(r.배송일).slice(0, 10))) };
}

export interface Turn {
  key: string; t: Trip; kind: '배송비' | '간선비'; dist: number; shippers: number;
  fee: number; road: number; fuel: number; extFuel: number; section: number; extra: number;
  /** 재배분(반올림 전): 월임 = 차량·회전번호별 월 평균, 유류 = 차량 월 유류(유류대+외부주유) × 거리 비율 */
  feeR: number; fuelR: number;
}

/**
 * 운송비 탭의 차량·회전 단위 집계 + 재배분 (9월 종합정보 13,858행과 100% 일치 확인)
 *  - 운송구분: 배송 물동량(차량ID·회전)이 있으면 "그 차량·회전이 배송 물동량에 있으면 배송비, 없으면 간선비"(물동량이 없는 일요일 회전도 간선비).
 *              배송 물동량에 차량ID·회전이 하나도 없으면 운행 권역 판정(배송 → 배송비)으로 대신한다.
 *  - 거리: 회전 안 운행 거리의 합
 *  - 월임용차료(재배분): 같은 차량·같은 회전번호의 월 운송료 합 ÷ 그 회전 수 (날마다 같은 금액이 된다)
 *  - 유류대(재배분): 차량의 월 (유류대 + 외부주유) × 회전 거리 ÷ 차량 월 거리. 월 거리가 0이면 0
 */
export function transportTurns(trips: readonly Trip[], res: readonly Judged[], m03: readonly Row[] = []): Turn[] {
  const mt = m03Turns(m03);
  const m = new Map<string, Turn & { anyDeliv: boolean }>();
  trips.forEach((t, i) => {
    const key = [t.date.slice(0, 10), t.carId, t.turn].join('|');
    let e = m.get(key);
    if (!e) { e = { key, t, kind: '간선비', dist: 0, shippers: 0, fee: 0, road: 0, fuel: 0, extFuel: 0, section: 0, extra: 0, feeR: 0, fuelR: 0, anyDeliv: false }; m.set(key, e); }
    e.dist += t.dist; e.fee += t.fee; e.road += t.road; e.fuel += t.fuel; e.extFuel += t.extFuel; e.section += t.section; e.extra += t.extra; e.shippers += 1;
    if (res[i]?.v === '배송') e.anyDeliv = true;
  });
  const list = [...m.values()];
  // 재배분
  const feeBy = new Map<string, [number, number]>(); const carBy = new Map<string, [number, number]>();
  for (const e of list) {
    const k1 = `${e.t.carId}|${e.t.turn}`; const a = feeBy.get(k1) ?? [0, 0]; a[0] += e.fee; a[1] += 1; feeBy.set(k1, a);
    const b = carBy.get(e.t.carId) ?? [0, 0]; b[0] += e.fuel + e.extFuel; b[1] += e.dist; carBy.set(e.t.carId, b);
  }
  for (const e of list) {
    const [f, c] = feeBy.get(`${e.t.carId}|${e.t.turn}`)!; e.feeR = f / c;
    const [fu, d] = carBy.get(e.t.carId)!; e.fuelR = d > 0 ? (fu * e.dist) / d : 0;
    e.kind = mt ? (mt.turns.has(e.key) ? '배송비' : '간선비') : e.anyDeliv ? '배송비' : '간선비';
  }
  return list;
}

export function transportRows(trips: readonly Trip[], res: readonly Judged[], stamp: string, m03: readonly Row[] = []): Row[] {
  return transportTurns(trips, res, m03).map((e) => ({
    배송일자: e.t.date.slice(0, 10), 차량부서: e.t.dept, 차량ID: e.t.carId, 차량번호: e.t.carNo, 회전: e.t.turn, 차종: e.t.carKind, 차량구분: e.t.carType, 운송구분: e.kind,
    거리: Math.round(e.dist * 100) / 100, 월임용차료: e.fee, 도로비: e.road, 유류대: e.fuel, 외부주유: e.extFuel, 구간료: e.section, 추가변동수당: e.extra,
    '월임용차료(재배분)': roundCS(e.feeR), '유류대(재배분)': roundCS(e.fuelR), 화주수: e.shippers, 이력: stamp,
  }));
}

/**
 * 일반배송비(+홈플러스 배송비) 탭 (9월 종합정보 143,215행과 일치 확인)
 *  배송 물동량(M03)에 차량ID·회전이 있으면: 배송비 회전의 [월임(재배분), 도로비, 유류(재배분), 추가변동, 구간료] × 배분CBM ÷ 회전 배분CBM 합
 *    - 화주·배송처 CBM = 배송 물동량의 총계 × 단위CBM 합. 배분CBM = max(그 CBM, 최소CBM). 각 행 금액은 따로 반올림(소수 1자리 → 정수, 끝수 맞춤 없음)
 *  없으면: 화주별 운행실적 금액 그대로(SCE가 이미 화주별로 나눈 값)
 */
export function generalRows(trips: readonly Trip[], res: readonly Judged[], m03: readonly Row[], minCbm: Record<string, number>, stamp: string): Row[] {
  const out: Row[] = [];
  const hasCbm = m03.some((r) => s(r.차량ID) && n(r.회전));
  if (hasCbm) {
    const turn = new Map(transportTurns(trips, res, m03).filter((e) => e.kind === '배송비').map((e) => [e.key, e]));
    const g = new Map<string, Row[]>();
    for (const r of m03) {
      const k = [s(r.배송일).slice(0, 10), s(r.차량ID), n(r.회전)].join('|');
      g.set(k, [...(g.get(k) ?? []), r]);
    }
    for (const [k, rs] of g) {
      const tv = turn.get(k); if (!tv) continue;
      const by = new Map<string, Row & { cbm: number }>();
      for (const r of rs) {
        const kk = [r.화주코드, r.배송처코드].map(s).join('|');
        const e = by.get(kk) ?? { ...r, cbm: 0 };
        e.cbm += cbmOf(r); by.set(kk, e);
      }
      const list = [...by.values()];
      const min = minCbm[s(rs[0].배송센터명)] ?? minCbm[s(rs[0].배송센터)] ?? 0.045;
      const w = list.map((r) => Math.max(r.cbm, min));
      const W = sum(w);
      const amt = [tv.feeR, tv.road, tv.fuelR, tv.extra, tv.section];
      list.forEach((r, i) => {
        const raw = amt.map((x) => (x * w[i]) / W);
        const o = mk(tv.t, s(r.화주코드), s(r.화주명), s(r.배송처코드), s(r.배송처명), r.cbm, min, w[i], (w[i] / W) * 100, raw.map(roundHalf));
        D_ITEMS.forEach((k, j) => { o[`_${k}`] = raw[j]; }); // 반올림 전 금액(배송비배분 합계용, 화면에는 안 보임)
        out.push(o);
      });
    }
    return out;
  }
  // 대체: 화주별 운행실적 금액 그대로
  const turnTot = new Map<string, number>();
  trips.forEach((t, i) => {
    if (res[i].v !== '배송') return;
    const k = [t.date, t.carId, t.turn].join('|');
    turnTot.set(k, (turnTot.get(k) ?? 0) + t.fee + t.road + t.fuel + t.extFuel + t.extra + t.section);
  });
  trips.forEach((t, i) => {
    if (res[i].v !== '배송') return;
    const a = [t.fee, t.road, t.fuel + t.extFuel, t.extra, t.section];
    const tot = turnTot.get([t.date, t.carId, t.turn].join('|')) || 1;
    out.push(mk(t, t.shipperId, t.shipper, '', t.dst, null, minCbm[t.src] ?? 0.045, null, (sum(a) / tot) * 100, a));
  });
  return out;

  function mk(t: Trip, code: string, name: string, dcode: string, dname: string, cbm: number | null, min: number, w: number | null, ratio: number, a: number[]): Row {
    const o: Row = { 배송일: t.date.slice(0, 10), 차량부서: t.dept, 차량ID: t.carId, 차량번호: t.carNo, 회전: t.turn, 차종: t.carKind, 차량구분: t.carType,
      화주코드: code, 화주명: name, 배송처코드: dcode, 배송처명: dname, 배송CBM: cbm, 최소CBM: min, 배분CBM: w, 회전별배분율: ratio, 사업영역: t.biz };
    D_ITEMS.forEach((k, j) => { o[k] = a[j]; });
    o.이력 = stamp;
    return o;
  }
}

export const isHomeplus = (r: Row) => /홈플러스/.test(s(r.배송처명)) || /홈플러스/.test(s(r.화주명));

export function deliveryAlloc(general: readonly Row[], stamp: string): Row[] {
  const m = new Map<string, Row>();
  for (const r of general) {
    const k = [r.차량부서, r.화주코드, r.차량구분].map(s).join('|');
    let e = m.get(k);
    if (!e) {
      e = { 부서코드: deptCode(s(r.차량부서)) || '', 부서명: r.차량부서, 화주코드: r.화주코드, 화주명: r.화주명, 배송CBM: 0, '배분 CBM': 0,
        운송구분: r.차량구분, 월임용차: 0, 도로비: 0, 유류대: 0, 추가변동: 0, 구간용차: 0, 배송비계: 0, 사업영역: r.사업영역, 이력: stamp };
      m.set(k, e);
    }
    e.배송CBM = n(e.배송CBM) + n(r.배송CBM); e['배분 CBM'] = n(e['배분 CBM']) + n(r.배분CBM);
    const v = (k: string) => (r[`_${k}`] !== undefined ? n(r[`_${k}`]) : n(r[k]));
    e.월임용차 = n(e.월임용차) + v('월임용차'); e.도로비 = n(e.도로비) + v('도로비'); e.유류대 = n(e.유류대) + v('유류대');
    e.추가변동 = n(e.추가변동) + v('추가변동수당'); e.구간용차 = n(e.구간용차) + v('구간용차');
  }
  // 종합정보: 반올림 전 금액을 합한 뒤 항목마다 반올림, 배송비계도 반올림 전 합계를 반올림(그래서 항목 합과 1원 차이가 날 수 있음)
  for (const e of m.values()) {
    const raw = ['월임용차', '도로비', '유류대', '추가변동', '구간용차'].map((k) => n(e[k]));
    ['월임용차', '도로비', '유류대', '추가변동', '구간용차'].forEach((k, j) => { e[k] = roundHalf(raw[j]); });
    e.배송비계 = roundHalf(sum(raw));
  }
  return [...m.values()].sort((a, b) => n(a.부서코드) - n(b.부서코드) || s(a.화주코드).localeCompare(s(b.화주코드)));
}

/** bizOf: 화주코드 → 사업영역(원가배분 고객사 관리). 있으면 운행의 사업영역보다 먼저 쓴다(종합정보와 같음) */
export function deliveryPnl(alloc: readonly Row[], ym: string, stamp: string, bizOf: Record<string, string> = {}): Row[] {
  const m = new Map<string, Row>();
  const map: [string, string][] = [['월임용차', '월임용차'], ['도로비', '도로비'], ['유류대', '유류대'], ['추가변동', '추가변동수당'], ['구간용차', '구간용차']];
  for (const r of alloc) {
    for (const [col, it] of map) {
      const v = n(r[col]); if (!v) continue;
      const [acc, nm] = D_ACCT[it];
      const k = `${s(r.부서코드)}|${s(r.화주코드)}|${acc}`;
      const e = m.get(k) ?? { 기준월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 부서: r.부서코드, 화주: r.화주코드, 부문: '3PL부문', 사업영역: BIZ_CODE[bizOf[s(r.화주코드)] ?? s(r.사업영역)] ?? '12213',
        중구분: 'K21', 소계정: acc, 배분여부: 'N', 금액: 0, 화주명: r.화주명, 세부항목: nm, 부서명: r.부서명, 생성이력: stamp };
      e.금액 = n(e.금액) + v; m.set(k, e);
    }
  }
  return [...m.values()];
}
