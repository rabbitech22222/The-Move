# THE MOVE OS

THE MOVE의 정보 수집, 편집, Canva 제작과 Instagram 게시를 관리하는 작업 공간입니다. 화면 언어는 한국어이며 날짜는 한국 표준시로 표시합니다. 실제 Instagram 연동·게시 대상은 **@themovemag_**입니다. 다른 브랜드의 편집 프로젝트는 유지하되 실제 계정 연동은 현재 THE MOVE에 집중합니다.

**발견 → 조사 → 평가 → 초안 → 디자인 → 검토 → 승인 → 게시 → 분석**

Next.js 16, React 19, TypeScript, Tailwind 4, Radix 기반 shadcn 스타일 컴포넌트, Recharts, Framer Motion, PostgreSQL/Prisma, BullMQ/Redis를 사용합니다. 예시 지표에는 데모 표시가 있으며 실제 API 결과가 없는 연결·생성·게시를 성공으로 기록하지 않습니다.

## 내 컴퓨터에서 실행

Node.js 24 이상이 필요합니다. ZIP 압축을 풀고 다음 파일을 실행하세요.

| 실행 목적 | Windows | Mac |
|---|---|---|
| 외부 인증 없이 데모 보기 | START-WINDOWS.bat | START-MAC.command |
| 실제 계정 인증 및 게시 | START-LIVE-WINDOWS.bat | START-LIVE-MAC.command |

데모 실행기는 설치 진행 로그와 경과 시간을 표시하고 로그인·데이터 요청을 확인한 뒤 브라우저를 엽니다. 중단된 설치는 재시도하며 성공한 설치는 재사용합니다. 실제 운영 실행기는 Docker Desktop이 필요하며 데이터베이스·앱·예약 게시 작업 처리기를 함께 실행합니다. 실제 운영의 계정 비밀번호와 인증 정보는 별도 `.env.live`에서 관리합니다.

[처음 실행 안내](START-HERE.md) · [실제 Canva 및 Instagram 게시 안내](docs/REAL_PUBLISH_KO.md)

### 개발용 데모 직접 실행

```sh
npm ci
npm run setup:local
npm run db:generate
npm run dev
```

본인 컴퓨터에서 실행한 뒤 `http://localhost:3000`으로 접속합니다. 데모 로그인 필드는 미리 입력됩니다. `operator1@themove.local` 또는 `operator2@themove.local` / `move-demo-2026`은 DEMO_MODE=true에서만 사용되는 공개 예시 계정입니다. 실제 운영 계정 비밀번호는 별도로 생성됩니다.

데모 편집 내용은 Git에서 제외한 `.move-data/workspace.json`에 저장됩니다. 기존 파일과 `.env`는 덮어쓰지 않습니다. 기본 예시 출처는 꺼져 있으며 실제 조사 근거가 아닙니다. 오피스 작업은 실제로 실행한 작업만 표시합니다. Redis 없이 로컬 데모의 중복 정리와 주간 분석은 직접 실행할 수 있습니다.

## 실제 운영 및 개발 인프라

```sh
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev
# 별도 터미널에서
npm run worker
```

위 직접 실행은 `.env`에 DEMO_MODE=false와 서로 다른 12자 이상 운영자 비밀번호를 설정한 경우에 사용합니다. 실제 운영 실행기는 별도 `.env.live`와 Docker 프로젝트를 사용하므로 기본 데모와 혼합하지 않습니다. PostgreSQL 장애 시 데모로 자동 전환하지 않습니다. 재실행한 시드는 기존 운영자 비밀번호와 계정 데이터를 보존합니다. 공개 운영에는 HTTPS, 별도 DB·Redis 네트워크 및 외부 앱의 권한 승인이 필요합니다.

## 실제 Canva 원본

- 운영자 1 캐러셀: `DAHPXU1IGDI`
- 운영자 2 캐러셀: `DAHXJGy8do8`
- THE MOVE 릴스: **`DAHPcvVkH8k`만 사용**

원본 읽기와 실제 데이터셋 검사 후 `create_from_design`으로 새 디자인을 생성합니다. 원본을 수정하는 `update_design`은 사용하지 않습니다. 실제 필드가 없는 경우 원본 사본에 필드를 설정하고 승인된 브랜드 템플릿으로 연결하는 작업을 안내합니다. 공식 API가 지원하는 문구·이미지·영상 필드를 입력하며 계정의 Autofill 이용 자격이 필요합니다. 임의 페이지 추가나 디자인 일치 확인을 가장하지 않습니다. 실제 줄바꿈, 원본과의 시각적 일치와 브랜드 유지 여부는 사람이 확인합니다.

Canva 결과물을 페이지별 PNG 또는 릴스 MP4로 내보내고 스튜디오로 가져옵니다. 편집 승인과 최종 이미지 순서·주소·캡션에 대한 게시 승인은 별도입니다. Canva 파일 주소가 만료될 수 있어 늦은 예약에는 운영자 소유의 지속적인 HTTPS 저장소가 필요합니다.

## 검증

```sh
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
# PostgreSQL 검증은 별도의 마이그레이션·시드가 적용된 시험 DB에서 실행
npm run test:db
```

Windows CI는 공백이 있는 새 폴더에서 설치·로그인·Chrome 실제 화면을 검증합니다. 단위 테스트는 계정 일치, 승인 무효화, 토큰 변조, 출처·미디어 요청 보호, 이미지 순서, 페이지별 내보내기, 중복 요청과 불명확한 응답을 검사합니다. 외부 API 응답을 대체한 계약 테스트와 실제 외부 계정 종단 테스트는 구분합니다. **실제 Canva 및 Meta 인증이 없는 환경에서는 실제 원본 조회·생성·게시 성공을 검증하지 못합니다.** GPT 플러그인 연결은 다운로드한 앱의 인증으로 자동 전달되지 않습니다.

## 문서 및 구조

[설치](docs/SETUP.md) · [API](docs/API.md) · [연결 계약](docs/INTEGRATIONS.md) · [구현 및 미완료 항목](docs/FEATURES.md) · [검증 기록](docs/VALIDATION.md)

```text
app/                  인증된 화면 및 API
components/           재사용 가능한 한국어 화면
lib/services/         조사·제작·분석·게시 서비스
lib/integrations/     공식 API 및 외부 주소 보호
prisma/               정규화 DB 스키마·마이그레이션·시드
scripts/              실행기·작업 처리기·검증 도구
tests/                단위 및 브라우저 테스트
```

비밀 인증 정보는 환경 변수 또는 서버의 AES-256-GCM 암호화 저장소에 보관합니다. 역할 검증, 동일 출처 요청 검증과 주요 변경 감사 기록을 적용합니다. 생성이나 편집 단계 변경만으로 실제 게시되지 않습니다.
