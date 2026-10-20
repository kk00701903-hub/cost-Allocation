/**
 * 배분 제외 기준
 *  - 화주·거래처 제외: 그 물동량(배분 기준)을 빼고, 원가는 나머지 화주에게 다시 나눈다.
 *  - 부서·센터 제외: 그 원가 자체를 배분에서 뺀다(원천 금액 단계에서 제외).
 * 규칙은 월 범위(시작월~종료월)와 원가 종류(전체/보관비/배송비/간선비/노무비/일반관리비)로 적용한다.
 */
import type { Row } from './types';
import { n, s } from './util';

export type Cost = '보관비' | '배송비' | '간선비' | '노무비' | '일반관리비';
export type Kind = '화주' | '거래처' | '부서' | '센터';
export const COSTS: Cost[] = ['보관비', '배송비', '간선비', '노무비', '일반관리비'];
export const KINDS: Kind[] = ['화주', '거래처', '부서', '센터'];

export interface Rule { kind: Kind; code: string; name: string; cost: string; why: string }

const ymNum = (v: unknown) => Number(s(v).replace(/[^0-9]/g, '').slice(0, 6)) || 0;

export function activeRules(rows: readonly Row[], ym: string, cost: Cost): Rule[] {
  const m = Number(ym);
  return rows
    .filter((r) => s(r.사용) !== 'N')
    .filter((r) => { const a = ymNum(r.시작월), b = ymNum(r.종료월); return (!a || a <= m) && (!b || m <= b); })
    .filter((r) => { const c = s(r.적용원가) || '전체'; return c === '전체' || c === cost; })
    .map((r) => ({ kind: s(r.구분) as Kind, code: s(r.코드).trim(), name: s(r.명칭).trim(), cost: s(r.적용원가) || '전체', why: s(r.사유) }));
}

export type Getter<T> = Partial<Record<Kind, (x: T) => [string, string]>>;

/** 행마다 제외 규칙을 맞춰 남길 것과 뺄 것으로 나눈다. 뺀 행에는 어느 규칙 때문인지 붙인다. */
export function partition<T>(items: readonly T[], rules: readonly Rule[], get: Getter<T>): { kept: T[]; dropped: { x: T; rule: Rule }[] } {
  if (!rules.length) return { kept: [...items], dropped: [] };
  const kept: T[] = []; const dropped: { x: T; rule: Rule }[] = [];
  for (const x of items) {
    let hit: Rule | undefined;
    for (const r of rules) {
      const g = get[r.kind]; if (!g) continue;
      const [code, name] = g(x);
      if ((r.code && r.code === code.trim()) || (!r.code && r.name && r.name === name.trim()) || (r.code && r.code === name.trim())) { hit = r; break; }
    }
    if (hit) dropped.push({ x, rule: hit }); else kept.push(x);
  }
  return { kept, dropped };
}

/** 제외로 빠진 행을 규칙별로 묶어 건수·금액을 보여 준다 */
export function dropSummary<T>(dropped: { x: T; rule: Rule }[], amount: (x: T) => number): Row[] {
  const m = new Map<string, Row>();
  for (const d of dropped) {
    const k = `${d.rule.kind}|${d.rule.code}|${d.rule.name}`;
    const e = m.get(k) ?? { 구분: d.rule.kind, 코드: d.rule.code, 명칭: d.rule.name, 적용원가: d.rule.cost, 사유: d.rule.why, 건수: 0, 금액: 0 };
    e.건수 = n(e.건수) + 1; e.금액 = n(e.금액) + amount(d.x);
    m.set(k, e);
  }
  return [...m.values()];
}
