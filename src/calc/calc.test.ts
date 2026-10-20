import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { unpackTrips, type PackedTrips } from '../lib/data';
import { defaultJudgeSettings, judgeAll, DEPTS } from '../lib/judge';
import type { JudgeSettings, Row } from '../lib/types';
import { SEED_M10_INPUT, SEED_M10_UPLOAD, SEED_M10_DEPTADJ, SEED_M11_INPUT } from '../lib/seed';
import { adjustRows, deptAdjust, deptAlloc, delivBasisFromTrips, routesFromTrips, shipperAlloc, trunkPnl, T_ITEMS, type Route } from './trunk';
import { deliveryAlloc, deliveryPnl, generalRows, roundCS, transportRows } from './delivery';
import { computeStock } from './volume';
import { laborShipper, workload } from './labor';
import { activeRules, partition } from '../lib/exclude';
import { n, sum, sumCol } from '../lib/util';

const D = path.join(__dirname, '../../public/data');
const trips = unpackTrips(JSON.parse(readFileSync(path.join(D, '202609/trips.json'), 'utf8')) as PackedTrips);
const master = JSON.parse(readFileSync(path.join(D, 'master.json'), 'utf8')) as Record<string, string>;
const centers = JSON.parse(readFileSync(path.join(D, 'centers.json'), 'utf8')) as JudgeSettings['centers'];
const st = defaultJudgeSettings(centers);
const res = judgeAll(trips, st, master);
const tot = (r: Row) => sum(T_ITEMS.map((k) => n(r[k])));

describe('9월 운행실적·권역 판정 (간선비 권역조정 앱과 같은 결과)', () => {
  it('운행 91,756건, 배송 91,045 / 권역내 551 / 권역간 160', () => {
    expect(trips.length).toBe(91756);
    const c = { 배송: 0, 권역내: 0, 권역간: 0, 확인필요: 0 } as Record<string, number>;
    res.forEach((x) => c[x.v]++);
    expect(c).toEqual({ 배송: 91045, 권역내: 551, 권역간: 160, 확인필요: 0 });
  });
  it('권역조정 기본(4개 팀 제외) 10행 161,504,800원', () => {
    const rows = adjustRows(trips, res, st.alloc, '202609', 't');
    expect(rows.length).toBe(10);
    expect(sum(rows.filter((r) => r.이고구분 === '권역내').map(tot))).toBe(161504800);
    expect(sum(rows.map(tot))).toBe(0);
  });
  it('전 팀 대상이면 4450·6510 행이 종합정보에 실제 올라간 값과 원 단위까지 같다', () => {
    const all = Object.fromEntries(DEPTS.map((d) => [d.name, true]));
    const rows = adjustRows(trips, res, all, '202609', 't');
    expect(sum(rows.filter((r) => r.이고구분 === '권역내').map(tot))).toBe(301777586);
    for (const up of SEED_M10_UPLOAD) {
      const mine = rows.find((r) => r.부서코드 === up.부서코드 && r.이고구분 === up.이고구분)!;
      T_ITEMS.forEach((k) => expect(n(mine[k])).toBe(n(up[k])));
    }
  });
});

describe('간선비 배분 산식', () => {
  it('화주별: 권역간 풀 × 이고CBM 비율 (9월 미트밸리 21.22CBM → 206,141)', () => {
    // 권역간 월임 풀 31,508,267 = SEED 간선비입력 권역간 합
    const rest = 3243.4 - 53.3;
    const routes: Route[] = [
      { 화주코드: '1762', 화주명: '미트밸리', 출고센터: '부산센터(3PL)', 도착센터: '호남(광산센터)', 운영부서: '김해운영1팀', 이고구분: '권역간', cbm: 21.22 },
      { 화주코드: '1762', 화주명: '미트밸리', 출고센터: '부산센터(3PL)', 도착센터: '화성(3PL)', 운영부서: '김해운영1팀', 이고구분: '권역간', cbm: 28.51 },
      { 화주코드: '1762', 화주명: '미트밸리', 출고센터: '부산센터(3PL)', 도착센터: '강릉(3PL)', 운영부서: '김해운영1팀', 이고구분: '권역간', cbm: 2.508 },
      { 화주코드: '1762', 화주명: '미트밸리', 출고센터: '부산센터(3PL)', 도착센터: '천안1(3PL)', 운영부서: '김해운영1팀', 이고구분: '권역간', cbm: 1.062 },
      { 화주코드: '9999', 화주명: '나머지', 출고센터: 'A', 도착센터: 'B', 운영부서: '화성운영팀', 이고구분: '권역간', cbm: rest },
      { 화주코드: '8888', 화주명: '경산권역내', 출고센터: 'Y', 도착센터: 'Y', 운영부서: '경산운영팀', 이고구분: '권역내', cbm: 10 },
      { 화주코드: '7777', 화주명: '오산권역내', 출고센터: 'S', 도착센터: 'S', 운영부서: '오산운영1팀', 이고구분: '권역내', cbm: 5 },
    ];
    const out = shipperAlloc(SEED_M10_INPUT, routes, '202609', 't');
    const r = out.find((x) => x.도착센터 === '호남(광산센터)')!;
    expect(Math.abs(n(r.월임용차료) - 206141)).toBeLessThanOrEqual(2);
    expect(n(r.이고비율)).toBeCloseTo(1.643, 2);
    expect(sum(out.map((x) => n(x.합계)))).toBe(213219334);   // 풀 전부가 배분됨
  });
  it('부서별·부서간조정·손익: 합계 보존, 부서간조정 합 0', () => {
    const routes = routesFromTrips(trips, res, st.alloc);
    const sh = shipperAlloc(SEED_M10_INPUT, routes, '202609', 't');
    const dept = deptAlloc(sh, delivBasisFromTrips(trips, res), 't');
    expect(Math.round(sumCol(dept, '합계'))).toBe(Math.round(sumCol(sh, '합계')));
    const adj = deptAdjust(dept, SEED_M10_INPUT, '202609', 't');
    expect(Math.round(sumCol(adj, '금액'))).toBe(0);
    expect(Math.round(sumCol(trunkPnl(dept, '202609', 't'), '금액'))).toBe(Math.round(sumCol(dept, '합계')));
  });
  it('캡처한 9월 부서간조정 24행도 합계 0, 6500은 권역간 전액(55,216,867)을 내보냄', () => {
    expect(sumCol(SEED_M10_DEPTADJ, '금액')).toBe(0);
    expect(sumCol(SEED_M10_DEPTADJ.filter((r) => r.부서 === 6500), '금액')).toBe(-55216867);
  });
});

describe('배송비', () => {
  it('운송비 탭 합계 = 운행 합계, 일반배송비·배분·손익 합계 = 배송 운행 합계', () => {
    const tr = transportRows(trips, res, 't');
    const all = sum(trips.map((t) => t.fee + t.road + t.fuel + t.extFuel + t.extra + t.section));
    expect(sum(tr.map((r) => n(r.월임용차료) + n(r.도로비) + n(r.유류대) + n(r.외부주유) + n(r.구간료) + n(r.추가변동수당)))).toBe(all);
    const g = generalRows(trips, res, [], {}, 't');
    const deliv = sum(trips.filter((_, i) => res[i].v === '배송').map((t) => t.fee + t.road + t.fuel + t.extFuel + t.extra + t.section));
    expect(sum(g.map((r) => n(r.월임용차) + n(r.도로비) + n(r.유류대) + n(r.추가변동수당) + n(r.구간용차)))).toBe(deliv);
    const a = deliveryAlloc(g, 't');
    expect(sumCol(a, '배송비계')).toBe(deliv);
    expect(sumCol(deliveryPnl(a, '202609', 't'), '금액')).toBe(deliv);
  });
  it('배송 물동량이 있으면 회전 금액을 max(CBM, 최소CBM) 비율로 나눈다', () => {
    const t0 = { ...trips.find((_, i) => res[i].v === '배송')! };
    const t = { ...t0, date: '2026-09-01', carId: 'C1', turn: 1, fee: 61500, road: 0, fuel: 0, extFuel: 0, extra: 0, section: 0 };
    const m03: Row[] = [
      { 배송일: '2026-09-01', 차량ID: 'C1', 회전: 1, 화주코드: 'A', 배송처코드: 'x', 배송CBM: 0.2217, 배송센터: 'S' },
      { 배송일: '2026-09-01', 차량ID: 'C1', 회전: 1, 화주코드: 'B', 배송처코드: 'y', 배송CBM: 0.7783, 배송센터: 'S' },
      { 배송일: '2026-09-01', 차량ID: 'C1', 회전: 1, 화주코드: 'C', 배송처코드: 'z', 배송CBM: 0, 배송센터: 'S' },
    ];
    const g = generalRows([t], [{ v: '배송', why: '' }], m03, { S: 0.045 }, 't');
    expect(g.find((r) => r.화주코드 === 'C')!.배분CBM).toBe(0.045);
    // 종합정보처럼 행마다 반올림하고 끝수를 맞추지 않는다 → 합계는 행 수 이내로 차이
    expect(Math.abs(sum(g.map((r) => n(r.월임용차))) - 61500)).toBeLessThanOrEqual(g.length);
  });
  it('운송비 재배분: 월임 = 차량·회전번호 월평균, 유류 = 차량 월 유류 × 거리비율, 운송구분 = 배송 물동량 유무', () => {
    const t0 = { ...trips[0], carId: 'R1', fee: 0, road: 0, fuel: 0, extFuel: 0, extra: 0, section: 0, dist: 0 };
    const tt = [
      { ...t0, date: '2026-09-01', turn: 1, fee: 62000, dist: 43 },
      { ...t0, date: '2026-09-01', turn: 2, fee: 55098, dist: 186 },
      { ...t0, date: '2026-09-02', turn: 1, fee: 62000, dist: 43 },
      { ...t0, date: '2026-09-02', turn: 2, fee: 67902, dist: 225, extFuel: 497000 },
    ];
    const rr = tt.map(() => ({ v: '배송' as const, why: '' }));
    const m03: Row[] = [{ 배송일: '2026-09-01', 차량ID: 'R1', 회전: 2, 화주코드: 'A', 배송처코드: 'x', 배송CBM: 1 }];
    const tr = transportRows(tt, rr, 't', m03);
    expect(tr.map((r) => r.운송구분)).toEqual(['간선비', '배송비', '간선비', '간선비']); // 배송 물동량에 없는 회전은 간선비
    expect(transportRows(tt, rr, 't').map((r) => r.운송구분)).toEqual(['배송비', '배송비', '배송비', '배송비']); // 물동량이 없으면 권역 판정
    expect(tr.map((r) => r['월임용차료(재배분)'])).toEqual([62000, 61500, 62000, 61500]);
    expect(tr.map((r) => r['유류대(재배분)'])).toEqual([43 * 1000, 186 * 1000, 43 * 1000, 225 * 1000]);
    expect(roundCS(114973.478)).toBe(114974);
  });
});

describe('재고·노무비·제외', () => {
  it('산출재고: PK/24 4포장17낱개 − 23낱개 = 3포장18낱개', () => {
    const base = { 화주코드: '1763', 보관센터: 'S501', 제품코드: '1121', UOM: 'PK / 24', 재고타입: '보관' };
    const out = computeStock('202609', [{ ...base, 포장: 4, 낱개: 17 }], [], [{ ...base, 배송센터: 'S501', 배송일: '2026-09-10', 포장: 0, 낱개: 23 }], [], [], [], 't');
    expect(out[0]['산출재고 포장']).toBe(3);
    expect(out[0]['산출재고 낱개']).toBe(18);
  });
  it('산출재고(9월 전 화주 대조 규칙): 입고·기초도 메인센터로, 보관·C/D 한 행, 재고 행 UOM으로 환산, 메인센터 없는 화주 입고 제외', () => {
    const heads = [{ 화주코드: '3835', 메인센터: 'U501' }, { 화주코드: '9006', 메인센터: '' }];
    const b = { 화주코드: '3835', 제품코드: 'P', 재고일자: '2026-09-01', 이력: '2026-10-15 09:10' };
    const out = computeStock('202609',
      [{ ...b, 보관센터: 'U501', UOM: 'PK / 1', 재고타입: 'C/D', 포장: 2419, 낱개: 0 }],
      [{ ...b, 입고센터: 'M501', 입고일자: '2026-09-05', UOM: 'PK / 6', 재고타입: '보관', 포장: 600, 낱개: 0 }, { 화주코드: '9006', 제품코드: 'Q', 입고센터: 'E501', 입고일자: '2026-09-05', UOM: 'EA / 1', 재고타입: '보관', 포장: 7, 낱개: 0 }],
      [{ ...b, 배송센터: 'M501', 배송일: '2026-09-10', UOM: 'PK / 6', 재고타입: '보관', 포장: 1103, 낱개: 31 }], [], [], [], 't', heads);
    expect(out.length).toBe(1);
    expect(out[0].보관센터).toBe('U501');
    expect(out[0].재고타입).toBe('C/D');
    expect(out[0]['산출재고 포장']).toBe(1885);
  });
  it('노무비: 관리부서 도급료 × 작업량 비율, 합계 보존', () => {
    const work: Row[] = [{ 화주코드: 'A', 부서명: '화성운영팀', 출고센터명: '화성(3PL)', 출고구분: '배송', 계: 24 }, { 화주코드: 'B', 부서명: '화성운영팀', 출고센터명: '화성(3PL)', 출고구분: '배송', 계: 238053 }];
    const sh = laborShipper(work, SEED_M11_INPUT.filter((r) => r.관리부서 === '화성운영팀'), '202609', 't');
    expect(Math.abs(n(sh.find((r) => r.화주코드 === 'A')!.배분액) - 25598)).toBeLessThanOrEqual(1);
    expect(sumCol(sh, '배분액')).toBe(253935391);
  });
  it('간선비 화주별: 권역간은 부서 풀마다 반올림·끝수는 마지막 행, 구간 없는 부서의 권역내 풀은 권역내 마지막 행으로', () => {
    const input = [
      { 부서명: '화성운영팀', 이고구분: '권역간', 구간용차료: 100 }, { 부서명: '김해운영1팀', 이고구분: '권역간', 구간용차료: 101 },
      { 부서명: '오산운영1팀', 이고구분: '권역내', 구간용차료: 50 },
    ];
    const routes: Route[] = [
      { 화주코드: '2', 화주명: 'B', 출고센터: '화성', 도착센터: '부산', 운영부서: '화성운영팀', 이고구분: '권역간', cbm: 1 },
      { 화주코드: '1', 화주명: 'A', 출고센터: '화성', 도착센터: '호남', 운영부서: '화성운영팀', 이고구분: '권역간', cbm: 2 },
      { 화주코드: '3', 화주명: 'C', 출고센터: '화성', 도착센터: '천안1', 운영부서: '화성운영팀', 이고구분: '권역내', cbm: 1 },
    ];
    const out = shipperAlloc(input, routes, '202609', 't');
    const g = (c: string, k: string) => n(out.find((r) => r.화주코드 === c && r.이고구분 === k)!.구간용차료);
    expect(g('1', '권역간')).toBe(134); // 66.67→67 + 67.33→67
    expect(g('2', '권역간')).toBe(67);  // 33+34 = 67, 끝수 0
    expect(g('1', '권역간') + g('2', '권역간')).toBe(201);
    expect(g('3', '권역내')).toBe(50);
  });
  it('노무비 작업량: 작업비 이고여부(권역간) N 화주는 메인센터 권역간 C/D를 세지 않는다', () => {
    const heads = [{ 화주코드: 'A', 메인센터: 'S501' }, { 화주코드: 'B', 메인센터: 'S501' }];
    const centers = [{ 배송센터: 'S501', 배송센터명: '화성', 운영부서명: '화성운영팀' }, { 배송센터: 'N504', 배송센터명: '호남', 운영부서명: '호남운영팀' }];
    const weights = [{ 화주코드: 'A', 'C/D': 1, 보관: 1.5, 사용여부: 'Y', '이고여부(권역간)': 'Y' }, { 화주코드: 'B', 'C/D': 1, 보관: 1.5, 사용여부: 'Y', '이고여부(권역간)': 'N' }];
    const m04 = ['A', 'B'].map((c) => ({ 화주코드: c, 출고센터: '화성', 도착센터: '호남', 이고구분: '권역간' }));
    const w = workload([], m04, heads, weights, centers, null, 't');
    expect(w.map((r) => r.화주코드)).toEqual(['A']);
    expect(w[0]['C/D 작업량']).toBe(1);
  });
  it('제외 기준: 월 범위·원가 종류로 고르고 코드나 명칭으로 맞춘다', () => {
    const rules = activeRules([
      { 사용: 'Y', 구분: '화주', 코드: '1762', 명칭: '미트밸리', 적용원가: '간선비', 시작월: '2026-09', 종료월: '', 사유: 't' },
      { 사용: 'Y', 구분: '부서', 코드: '', 명칭: '밀양센터', 적용원가: '전체', 시작월: '2026-10', 종료월: '', 사유: 't' },
      { 사용: 'N', 구분: '화주', 코드: '1763', 명칭: '', 적용원가: '전체', 시작월: '', 종료월: '', 사유: 't' },
    ], '202609', '간선비');
    expect(rules.length).toBe(1);
    const p = partition(trips, rules, { 화주: (t) => [t.shipperId, t.shipper] });
    expect(p.dropped.length).toBe(trips.filter((t) => t.shipperId === '1762').length);
  });
});

import { extraAlloc as extra2, gradeRows as grade2 } from './labor';
import { SEED_M12_SCORE } from '../lib/seed';
describe('화주별 노무비 추가배분 (9월 화면 행 검산)', () => {
  it('수정 작업량 = (보관 − 낱개보관) × 보관가중치 + 낱개보관 × 낱개가중치 + C/D', () => {
    const work: Row[] = [
      { 화주코드: '2123', 화주명: '세미기업', 부서명: '화성운영팀', '보관 가중치': 1.5, 'C/D 가중치': 1, '보관 작업량': 261, 'C/D 작업량': 85 },
      { 화주코드: '1763', 화주명: '가토미작', 부서명: '화성운영팀', '보관 가중치': 1.9, 'C/D 가중치': 1, '보관 작업량': 1081, 'C/D 작업량': 230 },
      { 화주코드: '2501', 화주명: '지엠푸드', 부서명: '화성운영팀', '보관 가중치': 1.9, 'C/D 가중치': 1, '보관 작업량': 1258, 'C/D 작업량': 185 },
    ];
    const m03: Row[] = Array.from({ length: 1081 }, () => ({ 화주코드: '1763', 배송부서명: '화성운영팀', 낱개: 1, 재고타입: '보관' }));
    const out = extra2(work, [], m03, [], [], [{ 관리부서: '화성운영팀', 총계: 1000000 }], '202609', 't');
    const get = (c: string) => out.find((r) => r.화주코드 === c)!;
    expect(Math.round(n(get('2123').수정))).toBe(477);
    expect(Math.round(n(get('1763').수정))).toBe(1311);
    expect(Math.round(n(get('2501').수정))).toBe(2575);
    expect(sumCol(out, '금액(기존)')).toBe(1000000);
    expect(sumCol(out, '금액(수정)')).toBe(1000000);
  });
  it('등급: SKU 267·냉동 48%·CBM 0·중량 5 → D2+C3+E1+A5+N1+N1 = 13 → B 2.10 (9월 서가앤쿡)', () => {
    const rows: Row[] = [];
    for (let i = 0; i < 267; i++) rows.push({ 화주코드: '3552', 화주명: '서가앤쿡', 배송부서명: '밀양센터', 제품코드: `p${i}`, 온도: i < 128 ? '냉동' : '상온' });
    const prod = new Map<string, { cbm: number; temp: string }>();
    const g = grade2(rows, SEED_M12_SCORE, new Map(), prod, '202609', 't')[0];
    expect(g['SKU 등급']).toBe('D'); expect(g['냉동 등급']).toBe('C');
    // 중량물은 원천에 없어 0 → E(1) 이므로 점수합계는 9월 화면(13)보다 4 낮다
    expect(g.점수합계).toBe(9);
  });
});

describe('종합정보 9월 화면과 숫자 대조 (운행실적만으로 맞출 수 있는 것)', () => {
  it('배송비: 미트밸리(1762) 화성운영팀 구간용차 1,214,924 = 종합정보 배송비배분', () => {
    const g = generalRows(trips, res, [], {}, 't');
    const v = sum(g.filter((r) => r.화주코드 === '1762' && r.차량부서 === '화성운영팀').map((r) => n(r.구간용차)));
    expect(v).toBe(1214924);
  });
  it('간선비입력 SYSTEM+EXCEL 합계 213,219,334 = 종합정보 화주별·손익생성 합계', () => {
    expect(sum(SEED_M10_INPUT.map(tot))).toBe(213219334);
  });
});
