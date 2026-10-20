/** 화면별 그리드 열 — 종합정보 캡처의 열 이름·순서를 그대로 따른다. */
import type { Col } from '../lib/types';

const P = { code: '#fbefe4', name: '#fffbe8', num: '#eef7ec', rate: '#f1ecfb', kind: '#f3e8f8', his: '#fdf7ef', key: '#eaf3fb' };
const t = (k: string, w = 90, o: Partial<Col> = {}): Col => ({ k, w, ...o });
const code = (k: string, w = 60, o: Partial<Col> = {}): Col => ({ k, w, bg: P.code, align: 'c', ...o });
const name = (k: string, w = 120, o: Partial<Col> = {}): Col => ({ k, w, bg: P.name, ...o });
const kind = (k: string, w = 64, o: Partial<Col> = {}): Col => ({ k, w, bg: P.kind, align: 'c', ...o });
const int = (k: string, w = 96, o: Partial<Col> = {}): Col => ({ k, w, type: 'int', sum: true, bg: P.num, ...o });
const dec = (k: string, w = 90, d = 4, o: Partial<Col> = {}): Col => ({ k, w, type: 'dec', dec: d, sum: true, bg: P.num, ...o });
const pct = (k: string, w = 72, d = 3, o: Partial<Col> = {}): Col => ({ k, w, type: 'pct', dec: d, bg: P.rate, ...o });
const yn = (k: string, w = 48, o: Partial<Col> = {}): Col => ({ k, w, align: 'c', bg: P.kind, opts: ['Y', 'N'], ...o });
const his = (k = '이력', w = 170): Col => ({ k, w, bg: P.his });
const ed = (c: Col): Col => ({ ...c, edit: true });

// ---------------- M01 ----------------
export const M01_HEAD: Col[] = [code('화주코드'), name('화주명', 140), t('사업영역', 120), code('메인센터'), name('관리부서', 100), kind('상태', 64), ed(yn('사용여부')), ed(yn('보관여부')), ed(yn('간선여부')), his()];
export const M01_DETAIL: Col[] = [ed(code('배송센터')), name('배송센터명', 110), ed(kind('주문타입', 70, { opts: ['일반주문', '이고'] })), ed(name('운영부서', 100)), ed(yn('배송물동량', 64)),
  ed(name('이고부서', 100)), ed(kind('출고구분', 64, { opts: ['배송', '권역간', '권역내'] })), ed(yn('이고여부')), ed(yn('입고여부')), his()];

// ---------------- M02 ----------------
export const M02_STORAGE: Col[] = [t('년월', 70), ed(code('메인센터')), name('메인센터명', 110), ed(code('배송센터')), name('배송센터명', 110), ed(kind('출고구분', 64, { opts: ['배송', '권역간', '권역내'] })),
  ed({ ...dec('C/D', 50, 1), sum: false }), ed({ ...dec('보관', 50, 1), sum: false }), ed({ ...dec('상온', 50, 1), sum: false }), ed(name('운영부서명', 100)), ed(yn('사용여부')), his()];
export const M02_TRANSPORT: Col[] = [t('년월', 70), ed(code('배송센터')), ed(name('배송센터명', 120)), ed(kind('출고구분', 64, { opts: ['배송', '권역간', '권역내'] })), ed({ ...dec('최소CBM', 70, 4), sum: false }), ed(name('운영부서명', 110)), ed(yn('사용여부')), his()];
export const M02_WORK: Col[] = [t('년월', 70), ed(code('화주코드')), name('화주명', 130), ed({ ...dec('C/D', 50, 0), sum: false }), ed({ ...dec('보관', 50, 2), sum: false }), ed(yn('사용여부')), ed(yn('이고여부(권역간)', 80)), his()];
export const M02_ADMIN: Col[] = [t('년월', 70), name('원가항목', 90), ed(name('세부항목', 140)), ed(kind('배분기준', 70, { opts: ['작업비', '보관비'] })), ed(yn('사용여부')), his()];

// ---------------- M03~M07 물동량 ----------------
export const M03: Col[] = [t('배송일', 84), code('화주코드'), name('화주명', 110), code('배송센터'), name('배송센터명', 100), code('배송처코드', 70), name('배송처명', 140), code('부서코드'),
  name('배송부서명', 100), code('제품코드', 70), name('제품명', 140), t('UOM', 80), kind('재고타입', 56), t('온도', 50), int('포장', 70), int('낱개', 70), int('총계', 80),
  { ...dec('단위CBM', 80, 6), sum: false }, dec('배송CBM', 90, 4), code('차량ID', 90), { ...int('회전', 44), sum: false }, his()];
// 조정입력: 실적과 같은 열 + 조정사유(필수). 설계서(2015) "화면 조회내용 + 조정사유(Text)"
export const M03_ADJ: Col[] = [...M03.filter((c) => c.k !== '이력').map((c) => ed(c)), ed(name('조정사유', 220)), his()];
export const M04: Col[] = [t('이고일', 84), t('배송일', 84), code('화주코드'), name('화주명', 110), name('출고센터', 100), name('도착센터', 100), name('이고부서', 100), kind('이고구분', 60),
  code('제품코드', 70), name('제품명', 140), t('UOM', 80), kind('재고타입', 56), int('포장', 70), int('낱개', 70), int('총계', 80), { ...dec('단위CBM', 80, 6), sum: false }, dec('배송CBM', 90, 4), his()];
export const M04_ADJ: Col[] = [...M04.filter((c) => c.k !== '이력').map((c) => ed(c)), ed(name('조정사유', 220)), his()];
export const M05: Col[] = [t('재고일자', 84), code('화주코드'), name('화주명', 110), code('보관센터'), name('보관센터명', 100), code('제품코드', 70), name('제품명', 140), t('UOM', 80), kind('재고타입', 56),
  t('온도', 50), { ...dec('단위CBM', 80, 6), sum: false }, int('포장', 80), int('낱개', 80), int('총계', 90), t('구분', 60), his()];
export const M06: Col[] = [t('입고일자', 84), code('화주코드'), name('화주명', 110), code('입고센터'), name('입고센터명', 100), kind('입고타입', 70), code('부서코드'), name('부서명', 100),
  code('제품코드', 70), name('제품명', 140), t('UOM', 80), kind('재고타입', 56), { ...dec('단위CBM', 80, 6), sum: false }, int('포장', 80), int('낱개', 70), int('총계', 90), name('입고처', 110), his()];
export const M07: Col[] = [code('화주코드'), name('화주명', 110), code('보관센터'), name('보관센터명', 100), code('제품코드', 70), name('제품명', 140), t('UOM', 80), kind('재고타입', 56),
  int('전일재고 포장', 70, { group: '전일재고', t: '포장' }), int('전일재고 낱개', 70, { group: '전일재고', t: '낱개' }),
  int('입고량 포장', 70, { group: '입고량', t: '포장' }), int('입고량 낱개', 70, { group: '입고량', t: '낱개' }),
  int('출고량 포장', 70, { group: '출고량', t: '포장' }), int('출고량 낱개', 70, { group: '출고량', t: '낱개' }),
  int('조정량 포장', 70, { group: '조정량', t: '포장' }), int('조정량 낱개', 70, { group: '조정량', t: '낱개' }),
  int('산출재고 포장', 70, { group: '산출재고', t: '포장' }), int('산출재고 낱개', 70, { group: '산출재고', t: '낱개' }), dec('일평균재고EA', 90, 1), his()];
export const M07_ADJ: Col[] = [t('조정일자', 84), code('화주코드'), name('화주명', 110), code('보관센터'), name('보관센터명', 100), code('제품코드', 70), name('제품명', 140), t('UOM', 80), kind('재고타입', 56),
  int('포장', 70), int('낱개', 70), int('총계', 80), kind('조정타입', 70), name('조정사유', 200), his()];

// ---------------- M08 보관비 ----------------
export const M08_ALLOC: Col[] = [code('부서코드'), name('부서명', 90), code('화주코드'), name('화주명', 130), kind('온도', 50), dec('보관CBM', 90, 4), dec('C/D CBM', 90, 4), dec('CBM계', 90, 4),
  kind('원가구분', 56), name('세부항목', 90), pct('배분율(%)', 70, 6), int('배분원가', 100), code('센터'), his()];
export const M08_VOLUME: Col[] = [code('화주코드'), name('화주명', 110), code('메인센터'), code('출고센터'), name('관리부서', 90), kind('출고구분', 56), code('제품코드', 70), name('제품명', 130), t('UOM', 70),
  kind('보관구분', 56), kind('온도', 50), { ...dec('단위CBM', 80, 6), sum: false },
  int('보관 포장', 64, { group: '보관', t: '포장' }), int('보관 EA', 64, { group: '보관', t: 'EA' }), dec('보관 계', 80, 1, { group: '보관', t: '계' }), { ...dec('보관 가중치', 56, 2, { group: '보관', t: '가중치' }), sum: false },
  { ...dec('상온', 50, 2, { group: '보관' }), sum: false }, dec('보관 CBM', 80, 4, { group: '보관', t: 'CBM' }),
  int('C/D 포장', 64, { group: 'C/D', t: '포장' }), int('C/D EA', 64, { group: 'C/D', t: 'EA' }), dec('C/D 계', 80, 1, { group: 'C/D', t: '계' }), { ...dec('C/D 가중치', 56, 2, { group: 'C/D', t: '가중치' }), sum: false },
  dec('C/D CBM', 80, 4, { group: 'C/D', t: 'CBM' }), dec('CBM계', 90, 4), his()];
export const M08_INPUT: Col[] = [ed(t('년월', 84)), ed(code('센터코드')), ed(name('센터명', 100)), ed(name('관리부서', 100)), ed(kind('원가구분', 64)), ed(name('세부항목', 100)), ed(kind('온도', 50, { opts: ['상온', '냉동', '냉장'] })), ed(int('총계', 110)), his()];
export const PNL: Col[] = [t('기준월', 84), code('부서'), code('화주'), name('부문', 70), code('사업영역'), code('중구분', 50), code('소계정'), kind('배분여부', 48), int('금액', 110), name('화주명', 130), name('세부항목', 90), name('부서명', 90), his('이력')];

// ---------------- M09 배송비 ----------------
export const M09_ALLOC: Col[] = [code('부서코드'), name('부서명', 90), code('화주코드'), name('화주명', 130), dec('배송CBM', 90, 4), dec('배분 CBM', 90, 4), kind('운송구분', 64), int('월임용차', 100), int('도로비', 80), int('유류대', 90), int('추가변동', 70), int('구간용차', 100), int('배송비계', 110), his()];
export const M09_TRANSPORT: Col[] = [t('배송일자', 84), name('차량부서', 90), code('차량ID', 90), t('차량번호', 100), { ...int('회전', 40), sum: false }, t('차종', 70), kind('차량구분', 70), kind('운송구분', 60),
  dec('거리', 60, 0), int('월임용차료', 100), int('도로비', 80), int('유류대', 80), int('외부주유', 90), int('구간료', 100), int('추가변동수당', 80), int('월임용차료(재배분)', 100, { t: '월임용차료\n(재배분)' }), int('유류대(재배분)', 100, { t: '유류대\n(재배분)' }), { ...int('화주수', 50), sum: false }, his()];
export const M09_GENERAL: Col[] = [t('배송일', 84), name('차량부서', 90), code('차량ID', 90), t('차량번호', 100), { ...int('회전', 40), sum: false }, t('차종', 70), kind('차량구분', 70), code('화주코드'), name('화주명', 120),
  code('배송처코드', 70), name('배송처명', 140), dec('배송CBM', 80, 4), { ...dec('최소CBM', 66, 4), sum: false }, dec('배분CBM', 80, 4), pct('회전별배분율', 70, 2, { t: '회전별\n배분율' }),
  int('월임용차', 90), int('도로비', 70), int('유류대', 80), int('추가변동수당', 70, { t: '추가\n변동수당' }), int('구간용차', 90), his()];

// ---------------- M10 간선비 ----------------
export const M10_SHIPPER: Col[] = [t('실적월', 84), code('화주코드'), name('화주명', 110), name('출고센터', 110), name('도착센터', 110), name('운영부서', 90), kind('이고구분', 56), dec('이고CBM', 90, 6), pct('이고비율', 70, 4),
  int('월임용차료', 100, { t: '월임\n용차료' }), int('도로비', 80), int('유류대', 90), int('추가변동수당', 70, { t: '추가\n변동수당' }), int('구간용차료', 100, { t: '구간\n용차료' }), int('합계', 110), his()];
export const M10_DEPT: Col[] = [t('실적월', 84), code('차량부서', 56, { t: '차량\n부서' }), name('차량부서명', 90, { t: '차량부서' }), code('화주코드'), name('화주명', 110), name('출고센터', 100), kind('이고구분', 56), dec('배송CBM', 90, 6), pct('배분율', 70, 3),
  int('월임용차료', 100, { t: '월임\n용차료' }), int('도로비', 80), int('유류대', 90), int('추가변동수당', 70, { t: '추가\n변동수당' }), int('구간용차료', 100, { t: '구간\n용차료' }), int('합계', 110), his()];
export const M10_INPUT: Col[] = [t('실적월', 84), ed(code('부서')), ed(name('부서명', 90)), kind('비용구분', 56), ed(kind('이고구분', 56, { opts: ['권역간', '권역내'] })),
  ed(int('월임용차료', 100)), ed(int('도로비', 90)), ed(int('유류대', 90)), ed(int('추가변동수당', 70, { t: '추가\n변동수당' })), ed(int('구간용차료', 100)), int('합계', 110), kind('생성구분', 64)];
export const M10_DEPTADJ: Col[] = [t('기준월', 84), code('부서'), code('화주'), name('부문', 70), code('사업영역'), code('중구분', 50), code('소계정'), kind('배분여부', 48), ed(int('금액', 110)), name('화주명', 90), name('세부항목', 90), name('부서명', 90), his('생성이력')];
export const M10_PNL: Col[] = PNL.map((c) => (c.k === '이력' ? { ...c, k: '생성이력' } : c));
export const M10_UPLOAD: Col[] = [t('실적월', 70), code('부서코드'), name('부서명', 90), kind('비용구분', 56), kind('이고구분', 60), int('월임용차료', 100, { t: '월임\n용차료' }), int('도로비', 80), int('유류대', 90),
  int('추가변동수당', 70, { t: '추가\n변동수당' }), int('구간용차료', 100, { t: '구간\n용차료' }), int('합계', 110), his()];
export const M10_JUDGE: Col[] = [t('배송일', 84), name('실행부서', 90), code('관리화주ID', 60, { t: '화주\n코드' }), name('관리화주명', 120, { t: '화주명' }), name('상차지명', 130), name('하차지명', 140), kind('차량구분', 70),
  int('매출액', 80), int('간선비', 100), kind('판정', 56), t('근거', 110), kind('원가배부', 56), kind('원본 배송구분', 64)];

// ---------------- M11 노무비 ----------------
export const M11_SHIPPER: Col[] = [t('년월', 84), kind('원가구분', 70), name('세부항목', 60), code('화주코드'), name('화주명', 110), name('관리부서', 90), name('출고센터', 100), kind('출고구분', 56), dec('작업량', 90, 1), pct('배분율(%)', 70, 3), int('배분액', 110), his()];
export const M11_DEPT: Col[] = [t('년월', 84), name('세부항목', 60), code('화주코드'), name('화주명', 110), name('관리부서', 90), kind('출고구분', 56), name('출고센터', 100), dec('배송CBM', 90, 4), pct('배송비율(%)', 70, 3, { t: '배송\n비율(%)' }), int('배분액', 110), his()];
export const M11_WORK: Col[] = [code('화주코드'), name('화주명', 110), name('메인센터명', 100, { t: '메인\n센터명' }), name('출고센터명', 100), name('부서명', 90), code('코드', 70), name('거래처명', 140), kind('출고구분', 56),
  int('보관 피킹건수', 70, { group: '보관', t: '피킹건수' }), { ...dec('보관 가중치', 56, 1, { group: '보관', t: '가중치' }), sum: false }, dec('보관 작업량', 80, 1, { group: '보관', t: '작업량' }),
  int('C/D 피킹건수', 70, { group: 'C/D', t: '피킹건수' }), { ...dec('C/D 가중치', 56, 1, { group: 'C/D', t: '가중치' }), sum: false }, dec('C/D 작업량', 80, 1, { group: 'C/D', t: '작업량' }), dec('계', 90, 1), his()];
export const M11_INPUT: Col[] = [ed(t('년월', 84)), ed(code('센터코드')), ed(name('센터명', 100)), ed(name('관리부서', 100)), ed(kind('원가구분', 70)), ed(name('세부항목', 70)), ed(int('총계', 120)), his()];
export const M11_PNL: Col[] = [t('기준월', 84), code('부서'), code('화주'), name('부문', 70), kind('원가구분', 70), name('세부항목', 60), kind('배분여부', 48), int('금액', 110), name('화주명', 120), name('부서명', 90), his()];

// ---------------- M12 ----------------
export const M12_SCORE: Col[] = [kind('등급', 44), ed({ ...int('점수', 44), sum: false }),
  ed({ ...int('월평균 출고 SKU', 70, { group: '과정별 점수표', t: '월평균\n출고 SKU' }), sum: false }), ed({ ...dec('월평균 냉동 출고비율', 70, 2, { group: '과정별 점수표', t: '월평균 냉동\n출고비율' }), sum: false }),
  ed({ ...int('CBM(0.1 이상 제품수)', 90, { group: '과정별 점수표', t: 'CBM\n(0.1 이상 제품수)' }), sum: false }), ed({ ...int('중량물(15Kg 이상 제품수)', 90, { group: '과정별 점수표', t: '중량물\n(15Kg 이상 제품수)' }), sum: false }),
  ed(kind('계근작업', 44, { group: '과정별 점수표' })), ed(kind('전용C/D 제품피킹', 64, { group: '과정별 점수표', t: '전용C/D\n제품피킹' })),
  ed({ ...int('점수합계', 50, { group: '점수대별 가중치', t: '점수\n합계' }), sum: false }), ed({ ...dec('합계가중치', 56, 2, { group: '점수대별 가중치', t: '합계\n가중치' }), sum: false }),
  ed({ ...dec('비율', 50, 2, { group: '낱개 작업량 구간' }), sum: false }), ed({ ...dec('가중치', 56, 2, { group: '낱개 작업량 구간' }), sum: false }), his('수정이력')];
export const M12_GRADE: Col[] = [t('기준월', 70), code('화주코드'), name('화주명', 110), code('부서코드'), name('부서명', 90),
  { ...int('SKU 계수', 50, { group: '월평균 출고SKU', t: '계수' }), sum: false }, kind('SKU 등급', 40, { group: '월평균 출고SKU', t: '등급' }), { ...int('SKU 점수', 40, { group: '월평균 출고SKU', t: '점수' }), sum: false },
  { ...int('냉동 비율', 44, { group: '월평균 출고 냉동비율', t: '비율' }), sum: false }, kind('냉동 등급', 40, { group: '월평균 출고 냉동비율', t: '등급' }), { ...int('냉동 점수', 40, { group: '월평균 출고 냉동비율', t: '점수' }), sum: false },
  { ...int('CBM 계수', 50, { group: 'CBM', t: '계수' }), sum: false }, kind('CBM 등급', 40, { group: 'CBM', t: '등급' }), { ...int('CBM 점수', 40, { group: 'CBM', t: '점수' }), sum: false },
  { ...int('중량물 계수', 50, { group: '중량물', t: '계수' }), sum: false }, kind('중량물 등급', 40, { group: '중량물', t: '등급' }), { ...int('중량물 점수', 40, { group: '중량물', t: '점수' }), sum: false },
  ed(kind('계근 Y/N', 40, { group: '계근작업', t: 'Y/N', opts: ['Y', 'N'] })), { ...int('계근 점수', 40, { group: '계근작업', t: '점수' }), sum: false },
  ed(kind('전용C/D Y/N', 40, { group: '전용C/D 피킹', t: 'Y/N', opts: ['Y', 'N'] })), { ...int('전용C/D 점수', 40, { group: '전용C/D 피킹', t: '점수' }), sum: false },
  { ...int('점수합계', 50, { group: '점수대별 가중치', t: '점수\n합계' }), sum: false }, kind('난이도등급', 50, { group: '점수대별 가중치', t: '난이도\n등급' }), { ...dec('가중치', 50, 2, { group: '점수대별 가중치' }), sum: false }, his('수정이력')];
export const M12_EXTRA: Col[] = [t('기준월', 70), code('화주코드'), name('화주명', 110), t('사업영역', 100), code('부서코드'), name('부서명', 90),
  { ...dec('보관가중치', 56, 2, { group: '구분', t: '보관\n가중치' }), sum: false }, { ...dec('C/D가중치', 56, 2, { group: '구분', t: 'C/D\n가중치' }), sum: false },
  dec('기존보관작업량', 80, 1, { group: '작업량 (낱개 작업량 가중 조정)', t: '기존보관\n작업량' }), dec('기존C/D작업량', 80, 1, { group: '작업량 (낱개 작업량 가중 조정)', t: '기존C/D\n작업량' }),
  int('낱개제품(보관)', 60, { group: '작업량 (낱개 작업량 가중 조정)', t: '낱개제품\n(보관)' }), int('낱개제품(C/D)', 60, { group: '작업량 (낱개 작업량 가중 조정)', t: '낱개제품\n(C/D)' }),
  int('낱개제품총계', 60, { group: '작업량 (낱개 작업량 가중 조정)', t: '낱개제품\n총계' }), { ...dec('낱개가중치', 56, 2, { group: '작업량 (낱개 작업량 가중 조정)', t: '낱개\n가중치' }), sum: false },
    dec('기존', 80, 1, { group: '작업량 (낱개 작업량 가중 조정)' }), dec('수정', 80, 1, { group: '작업량 (낱개 작업량 가중 조정)' }), dec('차이분', 80, 1, { group: '작업량 (낱개 작업량 가중 조정)' }),
  { ...pct('비율(기존)', 56, 2, { group: '노무비 금액', t: '비율' }) }, int('금액(기존)', 100, { group: '노무비 금액', t: '기존' }), { ...pct('비율(수정)', 56, 2, { group: '노무비 금액', t: '비율' }) },
  int('금액(수정)', 100, { group: '노무비 금액', t: '수정' }), int('금액 차이분', 90, { group: '노무비 금액', t: '차이분' }), his()];
export const M12_PIECE: Col[] = [t('기준월', 70), ed(code('부서코드')), ed(name('부서명', 100)), ...['A', 'B', 'C', 'D', 'E'].map((g) => ed({ ...dec(g, 60, 2, { group: '등급' }), sum: false }))];

// ---------------- M13 일반관리비 ----------------
export const M13_ALLOC: Col[] = [kind('원가구분', 70), name('세부항목', 110), code('화주코드'), name('화주명', 120), name('관리부서', 90), kind('배분기준', 56), pct('배분율(%)', 70, 2), int('배분액', 100), his()];
export const M13_INPUT: Col[] = [ed(t('년월', 84)), ed(code('센터코드')), ed(name('센터명', 100)), ed(name('관리부서', 100)), ed(kind('원가구분', 70)), ed(name('세부항목', 120)), ed(int('금액', 110)), his()];
export const M13_PNL: Col[] = [t('기준월', 84), code('부서'), code('화주'), name('부문', 70), kind('원가구분', 70), name('세부항목', 100), kind('배분여부', 48), int('금액', 110), name('화주명', 120), name('부서명', 90), his()];

// ---------------- 배분 제외 기준 ----------------
export const X_RULES: Col[] = [ed(yn('사용')), ed(kind('구분', 64, { opts: ['화주', '거래처', '부서', '센터'] })), ed(code('코드', 80)), ed(name('명칭', 160)),
  ed(kind('적용원가', 80, { opts: ['전체', '보관비', '배송비', '간선비', '노무비', '일반관리비'] })), ed(t('시작월', 70)), ed(t('종료월', 70)), ed(name('사유', 260)), his()];
export const X_DROP: Col[] = [kind('구분', 56), code('코드', 80), name('명칭', 150), kind('적용원가', 70), name('사유', 200), { ...int('건수', 70) }, int('금액', 110)];
