# 공동물류 원가배분 (cost-alloc)

손익관리 › 공동물류 원가배분 **13개 메뉴**를 Next.js로 재구현한 앱입니다.  
UI는 Salesforce Lightning Design System에 맞춘 글로벌 헤더·좌측 내비·페이지 크롬을 사용합니다.

저장소: [github.com/kk00701903-hub/cost-Allocation](https://github.com/kk00701903-hub/cost-Allocation)  
**호스팅:** Cloudflare Pages · `https://cost-alloc.core4i.com` (권장) · `https://cost.core4i.com`  
**PWA:** 브라우저에서 「앱 설치」로 홈 화면/데스크톱에 설치할 수 있습니다 (HTTPS 필요).

정적 배포에서는 데이터가 브라우저 `localStorage`에 저장됩니다. Claude API 챗봇은 로컬 `npm run start` + API 키에서 동작하고, Pages에서는 로컬 안내 모드로 답합니다.

## 특징

1. **흐름·설명·검증이 화면에 보임**: 월 마감 흐름(기준 → 물동량 → 원가 입력 → 배분 → 손익), 화면마다 설명·검증 패널, 앞 단계 변경 시 "다시 생성 필요".
2. **배분 제외 기준**: 화주·거래처·부서·센터를 원가 종류·기간·사유와 함께 관리.
3. **AI 도우미**: 현재 화면 검증·합계를 바탕으로 산식·다음 할 일·경고를 안내 (API 키 필요).

## 실행

Node.js 18.18 이상.

```bash
git clone https://github.com/kk00701903-hub/cost-Allocation.git
cd cost-Allocation
npm install
copy env-example.txt .env.local   # Windows
# cp env-example.txt .env.local  # macOS / Linux
# .env.local 에 ANTHROPIC_API_KEY 입력 (챗봇 사용 시)
npm run build
npm run start                     # http://localhost:3100
```

개발: `npm run dev` (포트 3100).

| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` / `npm run start` | 운영 빌드 / 실행 |
| `npm run build:pages` | Cloudflare Pages용 정적 export (+ PWA 아이콘) |
| `npm run deploy:cf` | 정적 빌드 후 Wrangler로 Pages 배포 |
| `npm test` | 회귀 테스트 |
| `npm run lint` | 타입 검사 |

### Cloudflare Pages 시크릿 (GitHub Actions)

- `CLOUDFLARE_API_TOKEN` — Pages Edit 권한
- `CLOUDFLARE_ACCOUNT_ID` — 계정 ID  
도메인: `cost-alloc.core4i.com` / `cost.core4i.com` → Pages 프로젝트 `cost-alloc`

## 환경 변수 (`.env.local`)

`env-example.txt`를 복사해 사용합니다. **`.env.local`은 Git에 올리지 마세요.**

| 키 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | 챗봇용 Claude API 키 (서버 전용) |
| `ANTHROPIC_MODEL` | 기본 `claude-sonnet-5-5` |
| `COST_ALLOC_STORAGE` | 데이터 저장 폴더 (기본: 프로젝트 `storage/`) |

## 데이터 저장

서버의 저장 폴더에 표마다 JSON 파일 하나. 저장 직전 `.bak` 백업.  
9월 기준 시드 값은 처음 열 때 자동 적재됩니다.

## 메뉴

| 메뉴 | 화면ID | 하는 일 |
|---|---|---|
| 월 마감 흐름 | CA-N00 | 단계별 상태·다음 할 일·대사 |
| 원가배분 고객사 관리 | JTPF040010 | 화주·출고구분 |
| 원가배분 기준관리 | JTPF040020 | 보관·운송·작업·일반관리비 기준 |
| 배송/이고/기초/입고/산출 물동량 | JTPF040030~070 | 물동량·재고 |
| 보관비·배송비·간선비·노무비·일반관리비 배분 | JTPF040080~120 | 원가 배분 |
| 화주별 노무비 추가배분 | JTPF040130 | 등급·낱개 가중치 |
| 배분 제외 기준 | CA-X01 | 제외·미리보기 |
| 작업 이력 | CA-LOG | 생성·저장·업로드 기록 |

원천 연동이 없는 데이터는 **Excel Upload**(열 이름 매칭)로 올립니다. `양식 받기`로 열 이름을 받을 수 있습니다.

## 라이선스 / 주의

- 샘플·시드 JSON은 개발·검증용입니다. 운영 데이터·API 키는 커밋하지 마세요.
- 산식·알려진 차이는 저장소 이슈 또는 내부 문서로 관리합니다.
