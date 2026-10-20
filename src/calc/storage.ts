/**
 * M08 보관비 배분 조회 (JTPF040080) — 2026-10-16 종합정보 9월 자료와 대사 후 수정
 *  물동량 탭: 화주 × 출고센터 × 제품 한 줄. 가중치는 원가배분 기준관리 보관비 탭의 (메인센터, 출고센터, 출고구분 '배송') 행.
 *    - 보관: 메인센터 재고. 보관 계 = 그 달 날마다의 마감재고(EA) 합 (산출재고 계산과 같은 일별 재고)
 *            보관 CBM = 보관 계 × 단위CBM × 보관가중치 × (상온 제품이면 상온가중치)
 *    - C/D : 배송 물동량 중 메인센터가 아닌 센터에서 나간 것(+ 메인센터의 C/D 재고타입). 단, 고객사 관리에서 그 센터가 입고여부 Y면 제외. C/D 계 = 배송 EA 합
 *            C/D CBM = C/D 계 × 단위CBM × C/D가중치 × (상온 제품이면 상온가중치)
 *    - 관리부서 = 가중치 행의 운영부서 (예: 화성 메인 화주의 강릉·천안1 C/D는 화성운영팀)
 *    (9월 가토미작 136행 같음)
 *  보관비배분: 보관비입력(부서 × 세부항목 × 온도 금액)을 같은 부서·온도 화주 CBM계 비율로 나눈다.
 *    행마다 반올림하고 끝수는 화주코드가 가장 큰 화주에 더한다. (9월 7,160행 100% 같음)
 *  손익생성: 세부항목 → 소계정 (22116 드라이아이스, 22411 창고임차료, 22412 전력비, 22423 창고관리비, 22511 감가상각비)
 */
import type { Row } from '../lib/types';
import { BIZ_CODE } from '../lib/seed';
import { deptCode } from '../lib/judge';
import { n, s, splitLast, sum } from '../lib/util';
import { eaOf, perBox } from './volume';

export const STORAGE_ACCT: Record<string, string> = { 드라이아이스: '22116', 창고임차료: '22411', 전력비: '22412', 창고관리비: '22423', 감가상각비: '22511' };

export function storageVolume(stock: readonly Row[], weights: readonly Row[], heads: readonly Row[], prod: Map<string, { cbm: number; temp: string }>, centers: readonly Row[], stamp: string, m03: readonly Row[] = [], details: readonly Row[] = []): Row[] {
  // 고객사 관리 오른쪽 표에서 일반주문 입고여부 Y인 배송센터는 재고를 두는 센터 → 그 센터 배송은 C/D가 아니다 (9월 가토미작 S507·S512 확인)
  const stockCenter = new Set(details.filter((d) => s(d.주문타입) === '일반주문' && s(d.입고여부) === 'Y').map((d) => `${s(d.화주코드)}|${s(d.배송센터)}`));
  const w = new Map(weights.filter((x) => s(x.사용여부) !== 'N').map((x) => [`${s(x.메인센터)}|${s(x.배송센터)}|${s(x.출고구분)}`, x]));
  const head = new Map(heads.map((h) => [s(h.화주코드), h]));
  const cdept = new Map(centers.map((c) => [s(c.배송센터), s(c.운영부서명)]));
  const cname = new Map(centers.map((c) => [s(c.배송센터), s(c.배송센터명)]));
  type Acc = { r: Row; main: string; center: string; boEa: number; boP: number; boE: number; cdEa: number; cdP: number; cdE: number };
  const acc = new Map<string, Acc>();
  const get = (r: Row, main: string, center: string) => {
    const k = [s(r.화주코드), center, s(r.제품코드)].join('|');
    let a = acc.get(k);
    if (!a) { a = { r, main, center, boEa: 0, boP: 0, boE: 0, cdEa: 0, cdP: 0, cdE: 0 }; acc.set(k, a); }
    return a;
  };
  const hasW = (main: string, center: string) => !weights.length || w.has(`${main}|${center}|배송`);
  for (const r of stock) {
    const center = s(r.보관센터);
    if (!hasW(center, center)) continue; // 기준관리 보관비 탭에 (메인센터, 배송센터) 행이 없으면 종합정보는 배분하지 않는다(9월 3972 U502)
    if (s(r.재고타입) === 'C/D') continue; // C/D 재고는 보관하지 않으므로 재고 일수에 넣지 않는다(C/D는 아래 배송 물동량으로만)
    const a = get(r, center, center);
    const area = r.재고EA합 !== undefined && r.재고EA합 !== null ? n(r.재고EA합) : n(r.일평균재고EA) * 30;
    a.boEa += area;
    const per = perBox(r.UOM);
    a.boP += Math.trunc(area / per); a.boE += area - Math.trunc(area / per) * per;
  }
  for (const r of m03) {
    const main = s(head.get(s(r.화주코드))?.메인센터) || s(r.배송센터);
    const center = s(r.배송센터);
    if (center === main && s(r.재고타입) !== 'C/D') continue; // 메인센터 보관 출고는 재고로 잡힌다
    if (center !== main && stockCenter.has(`${s(r.화주코드)}|${center}`)) continue; // 입고여부 Y 센터는 그 센터 재고로 잡힌다
    if (!hasW(main, center)) continue;
    const a = get(r, main, center);
    a.cdEa += eaOf(r); a.cdP += n(r.포장); a.cdE += n(r.낱개);
  }
  const out: Row[] = [];
  for (const a of acc.values()) {
    if (!a.boEa && !a.cdEa) continue; // 재고·C/D가 없는 제품은 종합정보처럼 행을 만들지 않는다
    const r = a.r;
    const p = prod.get(`${s(r.화주코드)}|${s(r.제품코드)}`) ?? { cbm: n(r.단위CBM), temp: s(r.온도) };
    const u = p.cbm || n(r.단위CBM);
    const temp = p.temp || s(r.온도) || '상온';
    const wr = w.get(`${a.main}|${a.center}|배송`);
    const bo = n(wr?.보관 ?? 1), cd = n(wr?.['C/D'] ?? 1);
    const room = temp === '상온' ? n(wr?.상온 ?? 1) || 1 : 1;
    const boCbm = a.boEa * u * bo * room, cdCbm = a.cdEa * u * cd * room;
    out.push({
      화주코드: r.화주코드, 화주명: r.화주명, 메인센터: a.main, 메인센터명: cname.get(a.main) ?? '', 출고센터: a.center, 출고센터명: cname.get(a.center) ?? '',
      관리부서: s(wr?.운영부서명) || cdept.get(a.center) || s(head.get(s(r.화주코드))?.관리부서) || '',
      출고구분: '배송', 제품코드: r.제품코드, 제품명: r.제품명, UOM: r.UOM, 보관구분: '보관', 온도: temp, 단위CBM: u,
      '보관 포장': a.boP, '보관 EA': a.boE, '보관 계': a.boEa, '보관 가중치': bo, 상온: room, '보관 CBM': boCbm,
      'C/D 포장': a.cdP, 'C/D EA': a.cdE, 'C/D 계': a.cdEa, 'C/D 가중치': cd, 'C/D CBM': cdCbm,
      CBM계: boCbm + cdCbm, 이력: stamp,
    });
  }
  return out.sort((x, y) => s(x.화주코드).localeCompare(s(y.화주코드), undefined, { numeric: true }) || s(x.출고센터).localeCompare(s(y.출고센터)) || s(x.제품코드).localeCompare(s(y.제품코드)));
}

export function storageAlloc(volume: readonly Row[], input: readonly Row[], centers: readonly Row[], stamp: string): Row[] {
  const cdept = new Map(centers.map((c) => [s(c.배송센터), s(c.운영부서명)]));
  const cdeptByName = new Map(centers.map((c) => [s(c.배송센터명), s(c.운영부서명)]));
  // 부서·온도·화주별 CBM
  const by = new Map<string, Map<string, { r: Row; bo: number; cd: number }>>();
  for (const v of volume) {
    const k = `${s(v.관리부서)}|${s(v.온도)}`;
    const m = by.get(k) ?? new Map();
    const e = m.get(s(v.화주코드)) ?? { r: v, bo: 0, cd: 0 };
    e.bo += n(v['보관 CBM']); e.cd += n(v['C/D CBM']);
    m.set(s(v.화주코드), e); by.set(k, m);
  }
  // 보관비입력을 부서 × 세부항목 × 온도로 모은다
  const pools = new Map<string, { dept: string; item: string; temp: string; amt: number; centers: string[] }>();
  for (const inp of input) {
    const dept = s(inp.관리부서) || s(inp.부서명) || cdept.get(s(inp.센터코드)) || cdeptByName.get(s(inp.센터명)) || '';
    const temp = s(inp.온도) || '상온';
    const k = [dept, s(inp.세부항목), temp].join('|');
    const e = pools.get(k) ?? { dept, item: s(inp.세부항목), temp, amt: 0, centers: [] };
    e.amt += n(inp.총계 ?? inp.금액); e.centers.push(s(inp.센터코드) || s(inp.센터));
    pools.set(k, e);
  }
  const out: Row[] = [];
  for (const p of pools.values()) {
    const m = by.get(`${p.dept}|${p.temp}`);
    const list = m ? [...m.values()].filter((e) => e.bo + e.cd !== 0) /* 음수(마이너스 재고)도 종합정보처럼 넣는다 */.sort((a, b) => s(a.r.화주코드).localeCompare(s(b.r.화주코드), undefined, { numeric: true })) : [];
    if (!list.length) {
      out.push({ 부서코드: deptCode(p.dept) || '', 부서명: p.dept, 화주코드: '', 화주명: '', 온도: p.temp, 보관CBM: null, 'C/D CBM': null, CBM계: null, 원가구분: '보관비', 세부항목: p.item, '배분율(%)': null, 배분원가: p.amt, 센터: p.centers.join(','), 이력: stamp });
      continue;
    }
    const ws = list.map((e) => e.bo + e.cd);
    const W = sum(ws);
    const parts = splitLast(p.amt, ws);
    list.forEach((e, i) => out.push({
      부서코드: deptCode(p.dept) || '', 부서명: p.dept, 화주코드: e.r.화주코드, 화주명: e.r.화주명, 온도: p.temp,
      보관CBM: e.bo, 'C/D CBM': e.cd, CBM계: ws[i], 원가구분: '보관비', 세부항목: p.item, '배분율(%)': (ws[i] / W) * 100, 배분원가: parts[i], 센터: p.centers.join(','), 이력: stamp,
    }));
  }
  return out.sort((a, b) => n(a.부서코드) - n(b.부서코드) || s(a.화주코드).localeCompare(s(b.화주코드), undefined, { numeric: true }) || s(a.온도).localeCompare(s(b.온도)));
}

export function storagePnl(alloc: readonly Row[], shipperBiz: Map<string, string>, ym: string, stamp: string): Row[] {
  return alloc.filter((r) => s(r.화주코드)).map((r) => ({
    기준월: `${ym.slice(0, 4)}-${ym.slice(4)}-01`, 부서: r.부서코드, 화주: r.화주코드, 부문: '3PL부문', 사업영역: BIZ_CODE[shipperBiz.get(s(r.화주코드)) ?? ''] ?? '14111',
    중구분: 'K21', 소계정: STORAGE_ACCT[s(r.세부항목)] ?? '', 배분여부: 'N', 금액: r.배분원가, 화주명: r.화주명, 세부항목: r.세부항목, 부서명: r.부서명, 이력: stamp,
  }));
}
