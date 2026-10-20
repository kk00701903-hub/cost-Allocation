/**
 * 생성(배분) 실행 이력 — 2026-10-16 사용자 요청
 * "돌릴 때마다 사유 등 이력관리"
 *  - 생성 표를 바꾸는 실행은 사유를 받아야 저장된다(취소하면 아무것도 바뀌지 않음).
 *  - 실행마다: 언제·누가·어느 메뉴·무슨 작업·사유, 쓴 입력 표의 시각·작업자·행수, 바뀐 표의 이전/이번 행수·금액, 화주별 금액 변화를 남긴다.
 *  - 나중에 입력 표가 다시 생성되면(예: 보관비를 다시 돌린 뒤 일반관리비는 그대로) 이력 화면에서 "이후 입력 변경"으로 보인다.
 */
import type { Row } from './types';
import { NODES, type Meta } from './flow';
import { n, s } from './util';

export interface RunOutput { name: string; label: string; prevRows: number; rows: number; prevTotal: number; total: number; amountCol: string; prevBy: Record<string, number>; by: Record<string, number> }
export interface RunInput { name: string; label: string; at: string; t: number; who: string; rows: number }
export interface RunEntry { id: string; at: string; t: number; who: string; month: string; menu: string; action: string; reason: string; outputs: RunOutput[]; inputs: RunInput[]; notes?: { at: string; who: string; text: string }[] }

/** 실행 사유를 받아야 하는 생성 표 (흐름의 gen 표 + 화면 안의 생성 표) */
const EXTRA_GEN = ['M09.transport', 'M09.general', 'M08.volume', 'M11.work', 'M11.dept', 'M12.grade', 'M12.extra', 'M10.upload'];
export const isGenTable = (name: string) => EXTRA_GEN.includes(name) || NODES.some((nd) => nd.name === name && nd.how === 'gen');

const LABEL: Record<string, string> = {
  'M09.transport': '배송비 운송비', 'M09.general': '배송비 일반배송비', 'M08.volume': '보관비 물동량', 'M11.work': '노무비 작업량', 'M11.dept': '노무비 부서별',
  'M12.grade': '추가배분 등급', 'M12.extra': '노무비 추가배분', 'M10.upload': '간선비 업로드',
};
export const tableLabel = (name: string) => NODES.find((nd) => nd.name === name)?.label ?? LABEL[name] ?? name;

const AMOUNT_COLS = ['금액', '배분원가', '배분액', '배송비계', '합계', '계', '총계', '작업량', '산출재고EA', '배송CBM'];
export function amountCol(rows: readonly Row[]): string {
  const r0 = rows[0]; if (!r0) return '';
  return AMOUNT_COLS.find((k) => k in r0) ?? '';
}
/** 화주별 금액 합 (화주코드가 없으면 부서·센터 등으로) */
export function byShipper(rows: readonly Row[], col: string): Record<string, number> {
  const m: Record<string, number> = {};
  if (!col) return m;
  for (const r of rows) {
    const code = s(r.화주코드 ?? r.화주) || s(r.부서코드 ?? r.부서) || s(r.센터코드) || '(없음)';
    const name = s(r.화주명) || s(r.부서명) || '';
    const k = name ? `${code} ${name}` : code;
    m[k] = (m[k] ?? 0) + n(r[col]);
  }
  return m;
}
export function summarize(name: string, prev: readonly Row[], next: readonly Row[]): RunOutput {
  const col = amountCol(next.length ? next : prev);
  const tot = (rs: readonly Row[]) => (col ? rs.reduce((a, r) => a + n(r[col]), 0) : 0);
  return { name, label: tableLabel(name), prevRows: prev.length, rows: next.length, prevTotal: tot(prev), total: tot(next), amountCol: col, prevBy: byShipper(prev, col), by: byShipper(next, col) };
}
export function inputsOf(names: readonly string[], meta: Record<string, Meta>, count: (name: string) => number = () => 0): RunInput[] {
  const ins = new Set<string>();
  for (const nm of names) NODES.find((nd) => nd.name === nm)?.inputs.forEach((i) => { if (!names.includes(i)) ins.add(i); });
  return [...ins].map((i) => ({ name: i, label: tableLabel(i), at: meta[i]?.at ?? '(기록 없음: 기본값·이전 버전)', t: meta[i]?.t ?? 0, who: meta[i]?.who ?? '', rows: meta[i]?.n ?? count(i) }));
}
