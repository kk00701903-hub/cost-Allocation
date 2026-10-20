/**
 * M11 노무비 배분 조회 (JTPF040110), M12 화주별 노무비 추가배분 (JTPF040130)
 *
 * 9월 화면으로 확인한 산식
 *  - 작업량 = 피킹건수 × 가중치 (보관: M02 작업비 탭 화주별 보관 가중치, C/D: 1.0)
 *  - 화주별 배분액 = 관리부서 도급료(작업비입력) × (화주·출고센터 작업량 ÷ 관리부서 작업량 합)
 *    관리부서 = 출고센터의 운영부서. 예) 화성운영팀 작업량 1당 1,066.6원 → 미트밸리 화성 24.0 = 25,598
 *  - 부서별: 권역간(이고 피킹) 금액은 그 화주의 배송부서·배송센터 배송CBM 비율로 다시 나눈다.
 *    예) 미트밸리 부산센터 권역간 52,718 × 경산 9.46% = 4,987
 *
 * 화면 열은 있으나 산식을 확인하지 못한 부분(가정, 화면에 표시):
 *  - M12 등급 점수 기준(SKU·냉동비율 구간, CBM·중량물 제품수, 계근·전용C/D)과 수정 작업량 식
 */
import type { Row } from '../lib/types';
import { n, s, split, splitLast, sum } from '../lib/util';
import { deptCode } from '../lib/judge';
import type { DelivBasis } from './trunk';

/**
 * 작업량 탭 — 종합정보 프로시저 BCKNL_CL_PL_WORKCOST 그대로 (2026-10-16 사용자 전달)
 *  - 배송 물동량(+조정입력) 한 행 = 피킹 1건. 고객사 관리 오른쪽 표의 (화주, 배송센터) 일반주문 행이 있는 것만(INNER JOIN)
 *  - 그 센터 운영부서(일반주문 행) ≠ 화주 관리부서(고객사 관리 왼쪽 표) → C/D 피킹
 *    같으면 재고타입대로: C/D(CROSSDOCK=1) → C/D 피킹, 보관 → 보관 피킹
 *  - 관리부서 = 배송 물동량 행의 배송부서, 출고구분 = 일반주문 행의 출고구분
 *  - 이고 물동량(+조정) 권역간 한 행 = 메인센터 C/D 피킹 1건, 관리부서 = 이고부서, 거래처 = 도착센터
 *  - 기준관리 작업비에 사용여부 Y로 있는 화주만(INNER JOIN). 이고여부(권역간) N이면 출고구분 '배송' 행만 남김(HAVING)
 *  - 작업량 = 보관 피킹 × 보관 가중치 + C/D 피킹 × C/D 가중치
 */
export function workload(m03: readonly Row[], m04: readonly Row[], heads: readonly Row[], weights: readonly Row[], centers: readonly Row[], fix: Map<string, number> | null, stamp: string, details: readonly Row[] = []): Row[] {
  const normal = new Map(details.filter((d) => s(d.주문타입) === '일반주문').map((d) => [`${s(d.화주코드)}|${s(d.배송센터)}`, d]));
  const joinDetail = normal.size > 0;
  const w = new Map(weights.filter((x) => s(x.사용여부) !== 'N').map((x) => [s(x.화주코드), x]));
  const joinWork = weights.length > 0;
  const head = new Map(heads.map((h) => [s(h.화주코드), h]));
  const cname = new Map(centers.map((c) => [s(c.배송센터), s(c.배송센터명)]));
  const ccode = new Map(centers.map((c) => [s(c.배송센터명), s(c.배송센터)]));
  const cdept = new Map(centers.map((c) => [s(c.배송센터명), s(c.운영부서명)]));
  const code = (v: unknown) => ccode.get(s(v)) ?? s(v);
  const nameOf = (v: unknown) => cname.get(s(v)) ?? s(v);
  const m = new Map<string, Row>();
  const add = (r: Row, center: string, dept: string, kind: string, cust: string, custName: string, cd: boolean) => {
    const sh = s(r.화주코드);
    const wt = w.get(sh);
    if (joinWork && !wt) return;
    if (s(wt?.['이고여부(권역간)']) === 'N' && kind !== '배송') return;
    const k = [sh, center, dept, kind, cust].join('|');
    const wBo = fix?.get(sh) ?? n(wt?.보관 ?? 1.5);
    const wCd = n(wt?.['C/D'] ?? 1);
    let e = m.get(k);
    if (!e) {
      const main = s(head.get(sh)?.메인센터);
      e = { 화주코드: sh, 화주명: r.화주명, 메인센터명: nameOf(main), 출고센터명: center, 부서명: dept, 코드: cust, 거래처명: custName, 출고구분: kind,
        '보관 피킹건수': 0, '보관 가중치': wBo, '보관 작업량': 0, 'C/D 피킹건수': 0, 'C/D 가중치': wCd, 'C/D 작업량': 0, 계: 0, 이력: stamp };
      m.set(k, e);
    }
    if (cd) { e['C/D 피킹건수'] = n(e['C/D 피킹건수']) + 1; e['C/D 작업량'] = n(e['C/D 피킹건수']) * wCd; }
    else { e['보관 피킹건수'] = n(e['보관 피킹건수']) + 1; e['보관 작업량'] = n(e['보관 피킹건수']) * wBo; }
    e.계 = n(e['보관 작업량']) + n(e['C/D 작업량']);
  };
  for (const r of m03) {
    const c = s(r.배송센터) || code(r.배송센터명);
    const sh = s(r.화주코드);
    const det = normal.get(`${sh}|${c}`);
    if (joinDetail && !det) continue;
    const here = s(det?.운영부서), mine = s(head.get(sh)?.관리부서);
    const otherTeam = !!here && !!mine && here !== mine;
    const dept = s(r.배송부서명) || here || cdept.get(nameOf(c)) || '';
    const kind = s(det?.출고구분) || '배송';
    add(r, nameOf(c), dept, kind, s(r.배송처코드), s(r.배송처명), otherTeam || s(r.재고타입) === 'C/D');
  }
  for (const r of m04) {
    if (s(r.이고구분) !== '권역간') continue;
    const main = code(r.출고센터);
    add(r, nameOf(main), s(r.이고부서) || cdept.get(nameOf(main)) || '', '권역간', code(r.도착센터), nameOf(code(r.도착센터)), true);
  }
  return [...m.values()];
}

export function laborShipper(work: readonly Row[], input: readonly Row[], ym: string, stamp: string, centers: readonly Row[] = []): Row[] {
  const ccode = new Map(centers.map((c) => [s(c.배송센터명), s(c.배송센터)]));
  const cc = (v: unknown) => ccode.get(s(v)) ?? s(v);
  const pool = new Map<string, number>();
  input.forEach((r) => pool.set(s(r.관리부서), (pool.get(s(r.관리부서)) ?? 0) + n(r.총계)));
  const g = new Map<string, Row>();
  for (const r of work) {
    // 종합정보: 작업비입력(도급료)이 있는 관리부서의 작업량만 화주별로 만든다(A.DEPTCODE = B.MANAGE_CODE 조인) — 9월 원주리테일운영팀 행 없음
    if (input.length && !pool.has(s(r.부서명))) continue;
    const k = [r.화주코드, r.부서명, r.출고센터명, r.출고구분].map(s).join('|');
    const e = g.get(k) ?? { 년월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 원가구분: '인건노무비', 세부항목: '도급료', 화주코드: r.화주코드, 화주명: r.화주명, 관리부서: r.부서명, 출고센터: r.출고센터명, 출고구분: r.출고구분, 작업량: 0, '배분율(%)': 0, 배분액: 0, 이력: stamp };
    e.작업량 = n(e.작업량) + n(r.계); g.set(k, e);
  }
  const rows = [...g.values()];
  const byDept = new Map<string, Row[]>();
  rows.forEach((r) => byDept.set(s(r.관리부서), [...(byDept.get(s(r.관리부서)) ?? []), r]));
  for (const [d, rs] of byDept) {
    // 종합정보: 화주코드·출고센터코드 순으로 반올림하고 끝수는 마지막 행에 (9월 730행 100%)
    rs.sort((a, b) => s(a.화주코드).localeCompare(s(b.화주코드), undefined, { numeric: true }) || cc(a.출고센터).localeCompare(cc(b.출고센터)) || s(a.출고구분).localeCompare(s(b.출고구분)));
    const W = sum(rs.map((r) => n(r.작업량)));
    const parts = splitLast(pool.get(d) ?? 0, rs.map((r) => n(r.작업량)));
    rs.forEach((r, i) => { r['배분율(%)'] = W ? (n(r.작업량) / W) * 100 : 0; r.배분액 = parts[i]; });
  }
  return rows.sort((a, b) => s(a.화주코드).localeCompare(s(b.화주코드)));
}

export function laborDept(shipperRows: readonly Row[], basis: readonly DelivBasis[], stamp: string): Row[] {
  // 종합정보 BCKNL_CL_PL_WORKCOST STEP.3·4
  //  - 배송 행은 화주별 그대로
  //  - 권역간은 화주의 권역간 배분액 합을 그 화주 배송부서·배송센터 CBM(배송 물동량 + 조정입력) 비율로 행마다 ROUND
  //  - 권역간 전체 끝수(화주별 합 − 부서별 합)는 화주코드가 가장 큰 화주의, 화주별 행 출고센터와 같은 센터 행에만 더함(없으면 남김)
  const bySh = new Map<string, DelivBasis[]>();
  basis.forEach((b) => bySh.set(b.화주코드, [...(bySh.get(b.화주코드) ?? []), b]));
  const out: Row[] = [];
  const inter = new Map<string, Row[]>();
  for (const r of shipperRows) {
    const base = { 년월: r.년월, 세부항목: r.세부항목, 화주코드: r.화주코드, 화주명: r.화주명, 이력: stamp };
    if (s(r.출고구분) !== '권역간') { out.push({ ...base, 관리부서: r.관리부서, 출고구분: r.출고구분, 출고센터: r.출고센터, 배송CBM: null, '배송비율(%)': 100, 배분액: r.배분액 }); continue; }
    inter.set(s(r.화주코드), [...(inter.get(s(r.화주코드)) ?? []), r]);
  }
  let shTot = 0, deptTot = 0; let lastOwner = ''; const interOut: Row[] = [];
  for (const [code, rs] of inter) {
    const amt = sum(rs.map((r) => n(r.배분액))); shTot += amt;
    const r0 = rs[0];
    const base = { 년월: r0.년월, 세부항목: r0.세부항목, 화주코드: r0.화주코드, 화주명: r0.화주명, 이력: stamp };
    const bs = bySh.get(code);
    if (!bs || !bs.length) { interOut.push({ ...base, 관리부서: r0.관리부서, 출고구분: '권역간', 출고센터: r0.출고센터, 배송CBM: null, '배송비율(%)': 100, 배분액: amt }); deptTot += amt; continue; }
    const W = sum(bs.map((b) => b.cbm));
    bs.forEach((b) => {
      const v = W ? Math.round((amt * b.cbm) / W + 1e-9) : 0; deptTot += v;
      interOut.push({ ...base, 관리부서: b.차량부서, 출고구분: '권역간', 출고센터: b.출고센터, 배송CBM: b.cbm, '배송비율(%)': W ? (b.cbm / W) * 100 : 0, 배분액: v, _main: s(r0.출고센터) });
    });
    if (code.localeCompare(lastOwner, undefined, { numeric: true }) > 0) lastOwner = code;
  }
  const rest = Math.round(shTot) - deptTot;
  if (rest && lastOwner) {
    const t = interOut.find((x) => s(x.화주코드) === lastOwner && s(x.출고센터) === s(x._main));
    if (t) t.배분액 = n(t.배분액) + rest;
  }
  interOut.forEach((x) => { delete x._main; out.push(x); });
  return out;
}

export function laborPnl(deptRows: readonly Row[], ym: string, stamp: string): Row[] {
  const m = new Map<string, Row>();
  for (const r of deptRows) {
    const k = `${s(r.관리부서)}|${s(r.화주코드)}`;
    const e = m.get(k) ?? { 기준월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 부서: deptCode(s(r.관리부서)) || '', 화주: r.화주코드, 부문: '3PL부문', 원가구분: '인건노무비', 세부항목: '도급료', 배분여부: 'N', 금액: 0, 화주명: r.화주명, 부서명: r.관리부서, 이력: stamp };
    e.금액 = n(e.금액) + n(r.배분액); m.set(k, e);
  }
  return [...m.values()];
}

// ---------------- M12 ----------------
const band = (v: number, cuts: number[]) => { for (let i = 0; i < cuts.length; i++) if (v >= cuts[i]) return i; return cuts.length - 1; };
const G = ['A', 'B', 'C', 'D', 'E'];

/** 등급 구분 탭: 화주별 항목 계수 → 등급 → 점수, 점수합계 → 난이도 등급 → 가중치 */
export function gradeRows(m03: readonly Row[], score: readonly Row[], manual: Map<string, { 계근: string; 전용CD: string }>, prod: Map<string, { cbm: number; temp: string }>, ym: string, stamp: string): Row[] {
  const sc = [...score].sort((a, b) => n(b.점수) - n(a.점수));
  const cut = (k: string) => sc.map((r) => n(r[k]));
  const by = new Map<string, Row[]>();
  m03.forEach((r) => by.set(s(r.화주코드), [...(by.get(s(r.화주코드)) ?? []), r]));
  const out: Row[] = [];
  for (const [sh, rs] of by) {
    const skus = new Set(rs.map((r) => s(r.제품코드)));
    const frozen = (rs.filter((r) => /냉동/.test(prod.get(`${sh}|${s(r.제품코드)}`)?.temp ?? '') || /냉동/.test(s(r.온도))).length / (rs.length || 1)) * 100;
    const big = [...skus].filter((p) => (prod.get(`${sh}|${p}`)?.cbm ?? 0) >= 0.1).length;
    const heavy = 0;   // 중량 정보가 원천에 없음 → 0 (화면에서 수정)
    const mm = manual.get(sh) ?? { 계근: 'N', 전용CD: 'N' };
    const iS = band(skus.size, cut('월평균 출고 SKU')), iF = band(frozen, cut('월평균 냉동 출고비율').map((x) => x * 100)), iC = band(big, cut('CBM(0.1 이상 제품수)')), iH = band(heavy, cut('중량물(15Kg 이상 제품수)'));
    const pts = (i: number) => n(sc[i]?.점수);
    const yn = (v: string) => (v === 'Y' ? 2 : 1);
    const total = pts(iS) + pts(iF) + pts(iC) + pts(iH) + yn(mm.계근) + yn(mm.전용CD);
    const iT = band(total, cut('점수합계'));
    out.push({
      기준월: `${ym.slice(0, 4)}-${ym.slice(4)}`, 화주코드: sh, 화주명: rs[0].화주명, 부서코드: deptCode(s(rs[0].배송부서명)) || '', 부서명: rs[0].배송부서명,
      'SKU 계수': skus.size, 'SKU 등급': G[iS], 'SKU 점수': pts(iS), '냉동 비율': frozen, '냉동 등급': G[iF], '냉동 점수': pts(iF),
      'CBM 계수': big, 'CBM 등급': G[iC], 'CBM 점수': pts(iC), '중량물 계수': heavy, '중량물 등급': G[iH], '중량물 점수': pts(iH),
      '계근 Y/N': mm.계근, '계근 점수': yn(mm.계근), '전용C/D Y/N': mm.전용CD, '전용C/D 점수': yn(mm.전용CD),
      점수합계: total, 난이도등급: G[iT], 가중치: n(sc[iT]?.합계가중치), 수정이력: stamp,
    });
  }
  return out.sort((a, b) => s(a.화주코드).localeCompare(s(b.화주코드)));
}

/**
 * 추가 배분 탭 (9월 화면 행으로 검산한 식)
 *  수정 작업량 = (기존보관작업량 − 낱개제품(보관)) × 보관가중치 + 낱개제품(보관) × 낱개가중치 + 기존C/D작업량 × C/D가중치
 *   예) 세미기업 6110: 261 × 1.5 + 85 = 477, 지엠푸드 6110: 1,258 × 1.9 + 185 = 2,575, 가토미작 6110: 0 × 1.9 + 1,081 × 1 + 230 = 1,311
 *  노무비 금액: 부서 도급료를 기존/수정 작업량 비율로 나눈 것(부서 합계 보존), 차이분 = 수정 − 기존
 *  낱개가중치 = 낱개피킹 가중치 탭(부서 × 화주 난이도 등급), 없으면 1
 */
export function extraAlloc(work: readonly Row[], grades: readonly Row[], m03: readonly Row[], pieceW: readonly Row[], heads: readonly Row[], input: readonly Row[], ym: string, stamp: string): Row[] {
  const gr = new Map(grades.map((g) => [s(g.화주코드), g]));
  const biz = new Map(heads.map((h) => [s(h.화주코드), s(h.사업영역)]));
  const pw = new Map(pieceW.map((r) => [s(r.부서명), r]));
  // 낱개 피킹 건수(화주 × 배송부서, 재고타입별)
  const piece = new Map<string, { bo: number; cd: number }>();
  for (const r of m03) {
    if (!(n(r.낱개) > 0)) continue;
    const k = `${s(r.화주코드)}|${s(r.배송부서명)}`;
    const e = piece.get(k) ?? { bo: 0, cd: 0 };
    if (s(r.재고타입) === 'C/D') e.cd++; else e.bo++;
    piece.set(k, e);
  }
  const g = new Map<string, Row>();
  for (const r of work) {
    const k = `${s(r.화주코드)}|${s(r.부서명)}`;
    const e = g.get(k) ?? { 기준월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 화주코드: r.화주코드, 화주명: r.화주명, 사업영역: biz.get(s(r.화주코드)) ?? '', 부서코드: deptCode(s(r.부서명)) || '', 부서명: r.부서명,
      보관가중치: r['보관 가중치'], 'C/D가중치': r['C/D 가중치'], 기존보관작업량: 0, '기존C/D작업량': 0 };
    e.기존보관작업량 = n(e.기존보관작업량) + n(r['보관 작업량']); e['기존C/D작업량'] = n(e['기존C/D작업량']) + n(r['C/D 작업량']);
    g.set(k, e);
  }
  const rows: Row[] = [];
  for (const e of g.values()) {
    const p = piece.get(`${s(e.화주코드)}|${s(e.부서명)}`) ?? { bo: 0, cd: 0 };
    const grade = s(gr.get(s(e.화주코드))?.난이도등급) || 'E';
    const wPiece = n(pw.get(s(e.부서명))?.[grade] ?? 1) || 1;
    const wBo = n(gr.get(s(e.화주코드))?.가중치 ?? e.보관가중치) || n(e.보관가중치) || 1;
    const bo = n(e.기존보관작업량), cd = n(e['기존C/D작업량']);
    const pBo = Math.min(p.bo, bo);
    const before = bo + cd;
    const after = (bo - pBo) * wBo + pBo * wPiece + cd * (n(e['C/D가중치']) || 1);
    rows.push({ ...e, 보관가중치: wBo, '낱개제품(보관)': pBo, '낱개제품(C/D)': p.cd, 낱개제품총계: pBo + p.cd, 낱개가중치: wPiece, 기존: before, 수정: after, 차이분: after - before, 이력: stamp });
  }
  // 노무비 금액: 부서 도급료를 기존/수정 비율로
  const pool = new Map<string, number>();
  input.forEach((r) => pool.set(s(r.관리부서), (pool.get(s(r.관리부서)) ?? 0) + n(r.총계)));
  const byDept = new Map<string, Row[]>();
  rows.forEach((r) => byDept.set(s(r.부서명), [...(byDept.get(s(r.부서명)) ?? []), r]));
  for (const [d, rs] of byDept) {
    const P = pool.get(d) ?? 0;
    const tb = sum(rs.map((r) => n(r.기존))), ta = sum(rs.map((r) => n(r.수정)));
    const a1 = split(P, rs.map((r) => n(r.기존))), a2 = split(P, rs.map((r) => n(r.수정)));
    rs.forEach((r, i) => { r['비율(기존)'] = tb ? (n(r.기존) / tb) * 100 : 0; r['금액(기존)'] = a1[i]; r['비율(수정)'] = ta ? (n(r.수정) / ta) * 100 : 0; r['금액(수정)'] = a2[i]; r['금액 차이분'] = a2[i] - a1[i]; });
  }
  return rows.sort((a, b) => s(a.화주코드).localeCompare(s(b.화주코드)) || n(a.부서코드) - n(b.부서코드));
}
