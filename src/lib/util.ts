import type { Cell, Row } from './types';

export const n = (v: Cell | unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === '') return 0;
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : 0;
};
export const s = (v: Cell | unknown): string => (v === null || v === undefined ? '' : String(v));
export const r0 = (x: number) => Math.round(x);
export const sum = (a: readonly number[]) => a.reduce((t, x) => t + x, 0);

export function fmt(v: Cell, type?: string, dec = 0): string {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'int') return Math.round(n(v)).toLocaleString('ko-KR');
  if (type === 'dec' || type === 'pct') return n(v).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return String(v);
}

export function now(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 202609 → 2026-09 */
export const ymDash = (ym: string) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
/** 202609 → 2026-09-01 (종합정보 실적월 표기) */
export const ymFirst = (ym: string) => `${ymDash(ym)}-01`;
export const ymOf = (v: Cell | unknown) => s(v).replace(/[^0-9]/g, '').slice(0, 6);
export function prevYm(ym: string) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(4));
  return m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, '0')}`;
}
export function lastDay(ym: string) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(4));
  return new Date(y, m, 0).getDate();
}

export function groupBy<T>(a: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of a) { const k = key(x); const g = m.get(k); if (g) g.push(x); else m.set(k, [x]); }
  return m;
}

/** 금액을 비율대로 나누고 반올림 차이는 가장 큰 몫에 몰아 합계를 정확히 맞춘다. */
export function split(total: number, weights: readonly number[]): number[] {
  const W = sum(weights);
  if (!W || !total) return weights.map(() => 0);
  const out = weights.map((w) => Math.round((total * w) / W));
  const diff = Math.round(total) - sum(out);
  if (diff) {
    let iMax = 0;
    weights.forEach((w, i) => { if (w > weights[iMax]) iMax = i; });
    out[iMax] += diff;
  }
  return out;
}

export const stamp = (user: string) => `${now()} ${user}`;
export const sumCol = (rows: readonly Row[], k: string) => sum(rows.map((r) => n(r[k])));

/**
 * 물동량 행의 CBM = 총계 × 단위CBM (총계·단위CBM이 있을 때).
 * 종합정보 배송 물동량 화면의 배송CBM 열은 0.15% 행이 총계와 맞지 않는데(예: 총계 2, 배송CBM은 1개분),
 * 일반배송비·이고 물동량은 총계 × 단위CBM으로 계산되어 있다(9/1 대사 100%).
 */
export const cbmOf = (r: Row): number => {
  const q = n(r.총계), u = n(r.단위CBM);
  return q && u ? q * u : n(r.배송CBM);
};

/** 금액을 비율대로 나누고 행마다 반올림, 끝수는 마지막 행에 더한다(종합정보 보관비·노무비 배분과 같음). 행 순서는 호출하는 쪽에서 화주코드 순으로 맞춘다. */
export function splitLast(total: number, weights: readonly number[]): number[] {
  const W = sum(weights);
  if (!W || !weights.length) return weights.map(() => 0);
  const out = weights.map((w) => Math.round((total * w) / W + 1e-9));
  out[out.length - 1] += Math.round(total) - sum(out);
  return out;
}
