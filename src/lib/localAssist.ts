/** GitHub Pages 등 API 없는 환경용 — 현재 상태 텍스트 + 키워드로 답변 */
export function localAssist(question: string, context: string): string {
  const q = question.toLowerCase();
  const lines = context.split('\n');
  const checks = lines.filter((l) => l.startsWith('- [')).slice(0, 20);
  const sums = lines.filter((l) => l.includes('보관비') || l.includes('배송비') || l.includes('간선비') || l.includes('노무비') || l.includes('일반관리'));

  if (/검증|경고|이상|문제/.test(q)) {
    if (!checks.length) return '이 화면 검증 항목이 아직 없습니다. 조회·생성 후 다시 물어보세요.\n\n' + tip();
    return '지금 화면 검증 요약:\n' + checks.join('\n') + '\n\nblock(✕)은 손익 반영 전 반드시 고치고, warn(!)은 대사·사유 확인이 필요합니다.\n\n' + tip();
  }
  if (/다음|할\s*일|순서|흐름|마감/.test(q)) {
    const stale = lines.filter((l) => l.includes('다시 생성'));
    const none = lines.filter((l) => l.includes(': 없음'));
    let a = '월 마감 순서: ①기준 → ②물동량 → ③원가 입력 → ④배분 → ⑤손익.\n';
    if (stale.length) a += '\n다시 생성 필요:\n' + stale.slice(0, 8).join('\n');
    if (none.length) a += '\n아직 없는 단계:\n' + none.slice(0, 8).join('\n');
    if (!stale.length && !none.length) a += '\n흐름상 큰 막힘은 보이지 않습니다. 상단 단계 칩 또는 「월 마감 흐름」에서 확인하세요.';
    return a + '\n\n' + tip();
  }
  if (/간선|권역|이고/.test(q)) {
    return [
      '간선비 핵심 산식:',
      '· 권역간 풀 = 간선비입력(권역간 SYSTEM+EXCEL) 합 → 화주별 = 풀 × 화주 이고CBM ÷ 전체 권역간 이고CBM',
      '· 부서별 = 화주 권역간 금액 × 차량부서·출고센터 배송CBM 비율',
      '· 부서간조정(9005) = 부서별 합 − 입력 권역간 부서합 (합계 0)',
      '· 권역조정 = 운행 판정에서 권역내로 나온 간선 금액을 팀별 −권역간/+권역내 쌍으로',
      '',
      '현재 합계:',
      ...(sums.filter((l) => l.includes('간선')).length ? sums.filter((l) => l.includes('간선')) : ['(간선 합계 없음 — M10에서 생성·조회)']),
      '',
      tip(),
    ].join('\n');
  }
  if (/배송비|운송|회전|cbm/.test(q)) {
    return [
      '배송비: 차량·회전 금액 × max(배송CBM, 최소CBM 0.045) 비율로 화주에 배분합니다.',
      '원천은 화주별 운행실적(SCE)과 배송 물동량(M03)입니다.',
      '',
      ...(sums.filter((l) => l.includes('배송')).length ? sums.filter((l) => l.includes('배송')) : ['(배송비 합계 없음 — M09에서 조회)']),
      '',
      tip(),
    ].join('\n');
  }
  if (/보관/.test(q)) {
    return [
      '보관비: 산출재고 일평균 × 단위CBM × 가중치(M02) → 센터·온도 금액을 화주 CBM 비율로 배분합니다.',
      '',
      ...(sums.filter((l) => l.includes('보관')).length ? ['현재: ' + sums.filter((l) => l.includes('보관')).join(' / ')] : []),
      '',
      tip(),
    ].join('\n');
  }
  if (/노무|작업비|도급|피킹/.test(q)) {
    return [
      '노무비: 관리부서 도급료 × 작업량 비율. 작업량 = 피킹건수 × 가중치(보관/C·D).',
      '추가배분(M12)은 등급·낱개 가중치로 재배분합니다.',
      '',
      tip(),
    ].join('\n');
  }
  if (/제외|배분\s*제외/.test(q)) {
    return [
      '배분 제외 기준(X01):',
      '· 화주·거래처 제외 → 물동량에서 빼고 남은 화주에게 원가 재배분',
      '· 부서·센터 제외 → 원가 입력에서 빼서 배분하지 않음',
      '· 원가 종류·시작월~종료월·사유 필수',
      '',
      lines.find((l) => l.includes('배분 제외 기준')) || '',
      '',
      tip(),
    ].join('\n');
  }
  if (/합계|얼마|금액|현황/.test(q)) {
    return '현재 상태 합계:\n' + (sums.length ? sums.join('\n') : context.split('\n').slice(0, 12).join('\n')) + '\n\n' + tip();
  }

  const screen = lines.find((l) => l.startsWith('지금 보는 화면:')) || '';
  return [
    screen || '현재 화면 기준으로 안내합니다.',
    '',
    checks.length ? '검증:\n' + checks.slice(0, 6).join('\n') : '검증 항목이 아직 없습니다.',
    '',
    '더 구체적으로 「검증」「다음 할 일」「간선비 산식」「배분 제외」처럼 물어보시면 맞춰 답합니다.',
    '',
    tip(),
  ].join('\n');
}

function tip() {
  return '※ Pages 정적 배포에서는 로컬 안내 모드입니다. Claude API 답변은 로컬 `npm run start` + ANTHROPIC_API_KEY 에서 사용할 수 있습니다.';
}
