import type { JudgeSettings, Trip } from './types';

export interface PackedTrips { month: string; cols: string[]; num: string[]; dict: string[]; rows: (number | string)[][] }

export function unpackTrips(p: PackedTrips): Trip[] {
  const ix = Object.fromEntries(p.cols.map((c, i) => [c, i]));
  const isNum = new Set(p.num);
  const get = (r: (number | string)[], c: string): string | number => {
    const v = r[ix[c]];
    if (c === '배송일' || isNum.has(c)) return v;
    return p.dict[v as number] ?? '';
  };
  const S = (r: (number | string)[], c: string) => String(get(r, c) ?? '');
  const N = (r: (number | string)[], c: string) => Number(get(r, c)) || 0;
  return p.rows.map((r, id) => ({
    id, date: S(r, '배송일'), bizDept: S(r, '부서'), dept: S(r, '실행부서'),
    shipperId: S(r, '관리화주ID'), shipper: S(r, '관리화주명'), turn: N(r, '회전'),
    carId: S(r, '차량ID'), carNo: S(r, '차량번호'), carKind: S(r, '차종구분'), carType: S(r, '차량구분'),
    carrier: S(r, '운송사'), item: S(r, '품목'),
    src: S(r, '상차지명'), srcAddr: S(r, '상차지주소'), dst: S(r, '하차지명'), dstAddr: S(r, '하차지주소'),
    dist: N(r, '거리'), biz: S(r, '사업영역'),
    sales: N(r, '매출액'), fee: N(r, '운송료'), road: N(r, '도로비'), fuel: N(r, '유류대'), extFuel: N(r, '외부주유'),
    section: N(r, '구간료'), extra: N(r, '추가변동수당'),
    srcZone: S(r, '상차지권역'), dstZone: S(r, '하차지권역'), zone: S(r, '권역구분'), xlsKind: S(r, '배송구분'),
  }));
}

const base = () => `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`;
export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}data/${path}`);
  if (!res.ok) throw new Error(`${path} 를 읽지 못했습니다 (${res.status})`);
  return res.json() as Promise<T>;
}

export async function loadBundledTrips(month: string): Promise<Trip[] | null> {
  try {
    const idx = await getJson<{ months: string[] }>('index.json');
    if (!idx.months.includes(month)) return null; return unpackTrips(await getJson<PackedTrips>(`${month}/trips.json`)); } catch { return null; }
}
export const loadMaster = () => getJson<Record<string, string>>('master.json');
export const loadCenters = () => getJson<JudgeSettings['centers']>('centers.json');
