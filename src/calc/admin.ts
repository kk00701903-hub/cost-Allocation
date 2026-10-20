/**
 * M13 일반관리비 배분 조회 (JTPF040120) — 2026-10-16 종합정보 9월 5,356행과 대사
 *  일반관리비입력(관리부서 × 세부항목 금액)을 세부항목의 배분기준(M02 일반관리비 탭)에 따라 같은 관리부서 화주에게 나눈다.
 *   - 작업비: 노무비 화주별 배분액 비율 (9월 4,789행 배분율 100% 같음)
 *   - 보관비: 보관비 배분의 화주 CBM계(온도 합) 비율 (예: 화재보험료). 9월은 보관비를 10-16에 다시 만들어 일부 배분율이 다름
 *  행마다 반올림, 끝수는 화주코드가 가장 큰 화주에 (70개 묶음 중 65개 같음, 나머지 ±1원)
 */
import type { Row } from '../lib/types';
import { n, s, splitLast, sum } from '../lib/util';
import { deptCode } from '../lib/judge';

export function adminAlloc(input: readonly Row[], rules: readonly Row[], labor: readonly Row[], storage: readonly Row[], stamp: string): Row[] {
  const rule = new Map(rules.map((r) => [s(r.세부항목), r]));
  const basis = (kind: string, dept: string) => {
    const m = new Map<string, { name: string; v: number }>();
    if (kind === '보관비') {
      const seen = new Set<string>();
      storage.filter((r) => s(r.부서명) === dept && s(r.화주코드)).forEach((r) => {
        const k = `${s(r.화주코드)}|${s(r.온도)}`;
        if (seen.has(k)) return; seen.add(k); // 같은 화주·온도의 CBM은 세부항목마다 반복되므로 한 번만
        const e = m.get(s(r.화주코드)) ?? { name: s(r.화주명), v: 0 }; e.v += n(r.CBM계); m.set(s(r.화주코드), e);
      });
    } else labor.filter((r) => s(r.관리부서) === dept).forEach((r) => {
      // 작업비 기준 = 노무비 화주별 작업량(반올림 전 비율). 배분액(반올림 후)을 쓰면 .5 근처 행이 1원씩 어긋남
      // (2026-10-16 종합정보 9월 4,789행: 작업량 100%, 배분액 4,779행)
      const e = m.get(s(r.화주코드)) ?? { name: s(r.화주명), v: 0 }; e.v += r.작업량 !== undefined && r.작업량 !== null ? n(r.작업량) : n(r.배분액); m.set(s(r.화주코드), e);
    });
    return [...m].filter(([, e]) => e.v !== 0).sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true }));
  };
  // 관리부서 × 세부항목으로 모은다
  const pools = new Map<string, { dept: string; item: string; amt: number }>();
  for (const inp of input) {
    const k = `${s(inp.관리부서)}|${s(inp.세부항목)}`;
    const e = pools.get(k) ?? { dept: s(inp.관리부서), item: s(inp.세부항목), amt: 0 };
    e.amt += n(inp.금액); pools.set(k, e);
  }
  const out: Row[] = [];
  for (const p of pools.values()) {
    const rr = rule.get(p.item);
    if (rr && s(rr.사용여부) === 'N') continue;
    const kind = s(rr?.배분기준) || '작업비';
    const list = basis(kind, p.dept);
    if (!list.length) {
      out.push({ 원가구분: '일반관리비', 세부항목: p.item, 화주코드: '', 화주명: '(배분 기준 없음)', 관리부서: p.dept, 배분기준: kind, '배분율(%)': null, 배분액: p.amt, 이력: stamp });
      continue;
    }
    const W = sum(list.map(([, e]) => e.v));
    const parts = splitLast(p.amt, list.map(([, e]) => e.v));
    list.forEach(([code, e], i) => out.push({ 원가구분: '일반관리비', 세부항목: p.item, 화주코드: code, 화주명: e.name, 관리부서: p.dept, 배분기준: kind, '배분율(%)': (e.v / W) * 100, 배분액: parts[i], 이력: stamp }));
  }
  return out;
}

export function adminPnl(alloc: readonly Row[], ym: string, stamp: string): Row[] {
  return alloc.filter((r) => s(r.화주코드)).map((r) => ({
    기준월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 부서: deptCode(s(r.관리부서)) || '', 화주: r.화주코드, 부문: '3PL부문', 원가구분: '일반관리비', 세부항목: r.세부항목,
    배분여부: 'N', 금액: r.배분액, 화주명: r.화주명, 부서명: r.관리부서, 이력: stamp,
  }));
}
