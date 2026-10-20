/**
 * 월 마감 흐름: 표(산출물)마다 어느 단계·메뉴에서 만들어지고 무엇을 입력으로 쓰는지.
 * 입력 표가 산출물보다 나중에 바뀌면 "다시 생성 필요"로 본다.
 */
export interface Node { name: string; label: string; menu: string; step: number; inputs: string[]; how: 'upload' | 'gen' | 'master' | 'seed'; optional?: boolean }

export const STEPS = ['기준', '물동량', '원가 입력', '배분', '손익'];

export const NODES: Node[] = [
  { name: 'X.rules', label: '배분 제외 기준(선택)', menu: 'X01', step: 0, inputs: [], how: 'master', optional: true },
  { name: 'M01.head', label: '고객사(화주)', menu: 'M01', step: 0, inputs: [], how: 'master' },
  { name: 'M01.detail', label: '화주×배송센터 출고구분', menu: 'M01', step: 0, inputs: [], how: 'master' },
  { name: 'M02.storage', label: '보관비 가중치', menu: 'M02', step: 0, inputs: [], how: 'master' },
  { name: 'M02.transport', label: '배송센터·최소CBM', menu: 'M02', step: 0, inputs: [], how: 'master' },
  { name: 'M02.work', label: '작업비 가중치', menu: 'M02', step: 0, inputs: ['M12.extra'], how: 'master' },
  { name: 'M02.admin', label: '일반관리비 배분기준', menu: 'M02', step: 0, inputs: [], how: 'master' },

  { name: 'trips', label: '화주별 운행실적(SCE)', menu: 'M09', step: 1, inputs: [], how: 'upload' },
  { name: 'M03.actual', label: '배송 물동량', menu: 'M03', step: 1, inputs: [], how: 'upload' },
  { name: 'M04.actual', label: '이고 물동량', menu: 'M04', step: 1, inputs: ['M03.actual', 'M01.detail'], how: 'gen' },
  { name: 'M05.actual', label: '기초재고', menu: 'M05', step: 1, inputs: [], how: 'upload' },
  { name: 'M06.actual', label: '입고 물동량', menu: 'M06', step: 1, inputs: [], how: 'upload' },
  { name: 'M07.actual', label: '산출재고', menu: 'M07', step: 1, inputs: ['M05.actual', 'M05.adj', 'M06.actual', 'M03.actual', 'M04.actual', 'M07.adj'], how: 'gen' },

  { name: 'M08.input', label: '보관비 원가', menu: 'M08', step: 2, inputs: [], how: 'upload' },
  { name: 'M10.input', label: '간선비 (SYSTEM+조정)', menu: 'M10', step: 2, inputs: ['M10.upload'], how: 'seed' },
  { name: 'M11.input', label: '도급료', menu: 'M11', step: 2, inputs: [], how: 'upload' },
  { name: 'M13.input', label: '일반관리비 원가', menu: 'M13', step: 2, inputs: [], how: 'upload' },

  { name: 'M08.alloc', label: '보관비 배분', menu: 'M08', step: 3, inputs: ['M07.actual', 'M02.storage', 'M08.input', 'X.rules'], how: 'gen' },
  { name: 'M09.alloc', label: '배송비 배분', menu: 'M09', step: 3, inputs: ['trips', 'M03.actual', 'M02.transport', 'X.rules', 'judge'], how: 'gen' },
  { name: 'M10.shipper', label: '간선비 화주별', menu: 'M10', step: 3, inputs: ['M10.input', 'M04.actual', 'trips', 'X.rules', 'judge'], how: 'gen' },
  { name: 'M10.dept', label: '간선비 부서별', menu: 'M10', step: 3, inputs: ['M10.shipper', 'M03.actual'], how: 'gen' },
  { name: 'M10.deptadj', label: '간선비 부서간조정', menu: 'M10', step: 3, inputs: ['M10.dept', 'M10.input'], how: 'gen' },
  { name: 'M11.shipper', label: '노무비 배분', menu: 'M11', step: 3, inputs: ['M03.actual', 'M04.actual', 'M02.work', 'M11.input', 'X.rules'], how: 'gen' },
  { name: 'M13.alloc', label: '일반관리비 배분', menu: 'M13', step: 3, inputs: ['M13.input', 'M02.admin', 'M11.shipper', 'M08.alloc', 'X.rules'], how: 'gen' },

  { name: 'M08.pnl', label: '보관비 손익', menu: 'M08', step: 4, inputs: ['M08.alloc'], how: 'gen' },
  { name: 'M09.pnl', label: '배송비 손익', menu: 'M09', step: 4, inputs: ['M09.alloc'], how: 'gen' },
  { name: 'M10.pnl', label: '간선비 손익', menu: 'M10', step: 4, inputs: ['M10.dept'], how: 'gen' },
  { name: 'M11.pnl', label: '노무비 손익', menu: 'M11', step: 4, inputs: ['M11.dept'], how: 'gen' },
  { name: 'M13.pnl', label: '일반관리비 손익', menu: 'M13', step: 4, inputs: ['M13.alloc'], how: 'gen' },
];

export interface Meta { t: number; at: string; who: string; n: number }
export type NodeState = '없음' | '완료' | '다시 생성 필요';

export function nodeState(node: Node, meta: Record<string, Meta>, count: (name: string) => number): NodeState {
  const me = meta[node.name];
  const has = count(node.name) > 0;
  if (!has) return node.optional ? '완료' : '없음';
  if (node.how !== 'gen' || !me) return '완료';
  const newer = node.inputs.some((i) => (meta[i]?.t ?? 0) > me.t);
  return newer ? '다시 생성 필요' : '완료';
}
