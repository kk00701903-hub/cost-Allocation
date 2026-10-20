/**
 * 운행 권역 판정 — 간선비 권역조정 앱(trunk-adjust)의 규칙을 그대로 옮겼다.
 *   R1 상차지 = 배송센터(별칭 포함)     → 배송
 *   R2 판정 마스터(화주+상차지+하차지)  → 마스터 값
 *   R3 상차지 = 하차지                  → 권역내
 *   R4 매출액 > 0                       → 권역간
 *   R5 3PL공통 + 허브 출발              → 권역간
 *   그 외                               → 확인필요
 */
import type { JudgeSettings, Judged, Trip } from './types';

export interface Dept { name: string; code: number }
export const DEPTS: Dept[] = [
  { name: '밀양센터', code: 3212 }, { name: '오산운영1팀', code: 4450 }, { name: '오산운영2팀', code: 4470 },
  { name: '이천운영팀', code: 4700 }, { name: '화성운영팀', code: 6110 }, { name: '호남운영팀', code: 6410 },
  { name: '김해운영2팀', code: 6500 }, { name: '경산운영팀', code: 6510 }, { name: '김해운영1팀', code: 6520 },
];
export const deptCode = (name: string) => DEPTS.find((d) => d.name === name)?.code ?? 0;
export const deptName = (code: number | string) => DEPTS.find((d) => d.code === Number(code))?.name ?? '';

/** 5개 금액 항목: 월임용차료(운송료), 도로비, 유류대(+외부주유), 추가변동수당, 구간용차료(구간료) */
export const ITEMS = ['월임용차료', '도로비', '유류대', '추가변동수당', '구간용차료'] as const;
export const amountsOf = (t: Trip): number[] => [t.fee, t.road, t.fuel + t.extFuel, t.extra, t.section];
export const masterKey = (t: Pick<Trip, 'shipper' | 'src' | 'dst'>) => `${t.shipper}|${t.src}|${t.dst}`;

export function defaultJudgeSettings(centers: JudgeSettings['centers']): JudgeSettings {
  return {
    centers,
    alias: {},
    hubs: ['오산센터(유통1)', '아라리(집하)'],
    masterOverrides: { '3PL공통|부산센터(김해)|부산센터(김해)': '권역내' },
    alloc: {
      밀양센터: false, 오산운영1팀: false, 오산운영2팀: false, 이천운영팀: false,
      화성운영팀: true, 호남운영팀: true, 김해운영2팀: true, 경산운영팀: true, 김해운영1팀: true,
    },
  };
}

export function judgeAll(trips: readonly Trip[], st: JudgeSettings, baseMaster: Record<string, string>): Judged[] {
  const centerSet = new Set(st.centers.filter((c) => c.use === 'Y' && c.type === '배송').map((c) => c.name));
  const master = { ...baseMaster, ...st.masterOverrides };
  const hubs = new Set(st.hubs);
  return trips.map((t) => {
    const al = st.alias[t.src];
    if (centerSet.has(al ?? t.src)) return { v: '배송', why: al ? 'R1 배송센터(별칭)' : 'R1 배송센터' };
    const m = master[masterKey(t)];
    if (m === '권역내' || m === '권역간') return { v: m, why: 'R2 마스터' };
    if (t.src === t.dst) return { v: '권역내', why: 'R3 상차지=하차지' };
    if (t.sales > 0) return { v: '권역간', why: 'R4 매출>0' };
    if (t.shipper === '3PL공통' && hubs.has(t.src)) return { v: '권역간', why: 'R5 허브' };
    return { v: '확인필요', why: '-' };
  });
}

/** 권역내로 판정된 간선 운행 금액을 실행부서별로 모은다 (= 권역간→권역내로 옮길 금액) */
export function intraByDept(trips: readonly Trip[], res: readonly Judged[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  trips.forEach((t, i) => {
    if (res[i].v !== '권역내') return;
    const a = out.get(t.dept) ?? [0, 0, 0, 0, 0];
    amountsOf(t).forEach((x, j) => { a[j] += x; });
    out.set(t.dept, a);
  });
  return out;
}
