/** 화면 그리드 한 행. 열 키는 종합정보 화면의 열 이름을 그대로 쓴다(엑셀 업로드·내려받기와 1:1). */
export type Cell = string | number | null | undefined;
export type Row = Record<string, Cell>;

export interface Col {
  k: string;                 // 행 키 = 화면 열 이름
  t?: string;                // 머리글 표시(줄바꿈 \n). 없으면 k
  w?: number;                // 너비(px)
  type?: 'text' | 'int' | 'dec' | 'pct';
  dec?: number;              // 소수 자리 (dec, pct)
  sum?: boolean;             // 합계행에 합계 표시
  bg?: string;               // 열 배경색 (종합정보처럼 열마다 연한 색)
  edit?: boolean;            // 셀 편집 가능
  group?: string;            // 2단 머리글 그룹
  align?: 'l' | 'c' | 'r';
  opts?: string[];           // 편집 시 고를 값
  list?: string;             // 편집 시 자동완성 datalist id
}

/** 화주별 운행실적(SCE) 1행 */
export interface Trip {
  id: number;
  date: string;        // YYYY-MM-DD 배송일
  bizDept: string;     // 부서(사업부)
  dept: string;        // 실행부서
  shipperId: string;   // 관리화주ID
  shipper: string;     // 관리화주명
  turn: number;        // 회전
  carId: string;       // 차량ID
  carNo: string;       // 차량번호
  carKind: string;     // 차종구분
  carType: string;     // 차량구분 (월임차량/구간차량)
  carrier: string;     // 운송사
  item: string;        // 품목
  src: string; srcAddr: string;
  dst: string; dstAddr: string;
  dist: number;        // 거리
  biz: string;         // 사업영역
  sales: number; fee: number; road: number; fuel: number; extFuel: number; section: number; extra: number;
  srcZone: string; dstZone: string; zone: string;   // 상차지권역, 하차지권역, 권역구분
  xlsKind: string;     // 원본 엑셀의 배송구분(간선/배송)
}

export type Verdict = '배송' | '권역간' | '권역내' | '확인필요';
export interface Judged { v: Verdict; why: string }

export interface JudgeSettings {
  centers: { code: string; name: string; type: string; dept: string; use: 'Y' | 'N'; from: string }[];
  alias: Record<string, string>;
  hubs: string[];
  masterOverrides: Record<string, '권역내' | '권역간'>;
  alloc: Record<string, boolean>;      // 실행부서 → 원가배부(권역조정) 여부
}

export interface LogEntry { at: string; who: string; menu: string; what: string }
