# 설치 및 운영

내 컴퓨터 실행은 [처음 실행 안내](../START-HERE.md), 실제 인증·게시 설정은 [실제 운영 안내](REAL_PUBLISH_KO.md)를 참조하세요.

## 환경과 설치

Node.js 24, npm을 사용합니다. 기본 실제 로컬 운영은 Docker 없이 실행됩니다. PostgreSQL 운영에는 Docker Desktop 또는 Docker Compose가 필요합니다. 기존 격리 체크아웃을 사용하며 요청 없이 별도 Git 작업 트리를 만들지 않습니다.

```sh
npm ci
npm run setup:local
npm run db:generate
npm run dev
```

setup:local은 기존 `.env`를 보존하고 새 파일에 임의 세션·암호화 키를 생성합니다. `.env*`, `.move-data`, `.move-runtime`은 버전 관리에서 제외됩니다. 모든 변경 요청에는 로그인과 APP_URL과 일치하는 Origin이 필요합니다. 세션은 12시간 후 만료되며 HTTPS 환경에서는 보안 쿠키를 사용합니다.

Windows 기본 실행기는 npm-cli.js를 Node로 직접 실행해 shell=true 경고를 피합니다. 패키지 설치는 진행 로그와 10초마다 경과 시간을 표시합니다. 설치 중단 시 완료 기록을 남기지 않아 재시도하며, 성공한 동일 잠금 파일의 설치는 재사용합니다. 의존성 라이프사이클 스크립트 대신 Prisma JavaScript 클라이언트를 명시적으로 생성합니다. TLS 및 패키지 무결성 확인은 유지합니다.

## 기본 실제 파일 운영

START-WINDOWS.bat 또는 START-MAC.command는 node scripts/start-local.mjs를 실행합니다. 별도 `.env.desktop`를 만들고 LOCAL_MODE=true, DEMO_MODE=false를 지정합니다. `.move-local`에 실제 작업·해시된 운영자 암호·암호화된 토큰을 보관합니다. 로그인 정보는 `.move-local/login.txt`에 있습니다. 기본 작업 처리기는 파일 기반 점유와 재시도로 실제 작업·예약을 실행합니다. 뉴스는 시작 시와 2시간마다, 작업 실행 속도는 분당 최대 12건입니다. 뉴스 출처 한 곳이 실패해도 다른 출처는 계속 수집합니다. 실패 내용과 부분 결과는 출처와 작업 기록에 표시합니다.

기본 실행 창을 닫으면 처리기도 종료됩니다. 다음 시작은 저장된 예약과 작업을 읽습니다. 게시 전 계정·승인·최종 미디어를 다시 확인하며 불명확한 외부 쓰기 요청은 자동 반복하지 않습니다. LOCAL_MODE가 명시되지 않은 운영은 PostgreSQL을 사용하며 DB 장애에 따라 파일 모드로 전환하지 않습니다.

## PostgreSQL 실제 운영

START-LIVE-WINDOWS.bat 또는 START-LIVE-MAC.command는 `.env.live`를 만들고 `the-move-live` 프로젝트로 전체 서비스를 실행합니다. 다른 임의 운영자 비밀번호와 데이터베이스 비밀번호를 생성합니다. 기존 파일·데이터·계정 비밀번호는 덮어쓰지 않습니다. 로그인 후 실제 계정은 설정에서 별도로 인증합니다. GPT 플러그인의 인증은 앱에 자동 전달되지 않습니다.

직접 개발 실행 시 `.env`에 DEMO_MODE=false, 서로 다른 12자 이상 운영자 비밀번호를 설정한 뒤 다음 명령을 사용합니다.

```sh
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev
# 별도 터미널
npm run worker
```

실제 공간에는 예시 지표나 게시 결과가 생성되지 않습니다. 같은 Redis 대기열에 데모 앱과 실제 작업 처리기를 혼합하지 않습니다. 데이터베이스 모드가 다르면 별도 Redis와 저장소를 사용합니다.

## 마이그레이션

npm run db:migrate는 PostgreSQL에서 체크인된 SQL을 트랜잭션으로 적용하고 `_prisma_migrations`에 체크섬을 기록합니다. 실패는 롤백합니다. 적용한 과거 SQL은 수정하지 않고 새 마이그레이션을 추가합니다. db push로 기록을 우회하지 않습니다. 소스 스키마는 prisma/schema.prisma입니다. 시드는 기존 운영자 비밀번호와 계정 데이터를 유지합니다.

## 작업 처리기와 복구

BullMQ 처리기 동시 실행 수는 2이며 작업 요청 속도를 제한하고 재시도·지수 지연·멱등 키를 사용합니다. 정기 일정의 시간대는 Asia/Seoul입니다. 데모 정기 작업은 실제 중복 정리와 저장된 예시의 주간 분석만 실행합니다. 실제 게시는 승인된 예약이 있어야 합니다. 결과가 불명확한 외부 쓰기 요청은 중복을 막기 위해 재시도하지 않습니다.

변경 전 PostgreSQL, Redis 및 암호화된 OAuth 저장소를 백업하세요. TOKEN_ENCRYPTION_KEY를 잃거나 단순 교체하면 저장한 토큰을 복호화할 수 없습니다. 만료 인증은 설정에서 다시 연결합니다. 예약 취소는 스튜디오에서 수행하며 실행 중인 외부 게시를 UI 상태 변경으로 취소했다고 표시하지 않습니다. 소유한 프로세스·컨테이너만 종료합니다.

## 점검과 클라우드 실행

```sh
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

준비 상태는 health 요청뿐 아니라 로그인·workspace 데이터·주요 화면·실제 프로젝트 변경으로 확인합니다. npm run test:db는 별도 시험 데이터베이스에서, npm run test:docker는 만든 이미지와 기존 로컬 PostgreSQL을 이용한 별도 임시 DB·Redis·컨테이너에서 확인합니다.

클라우드 설치는 bash scripts/cloud-install.sh를 사용합니다. 환경 저장 후 새 작업에서는 앱·처리기를 다시 실행해야 합니다. 로그를 `.move-runtime`에 남기고 기존 정상 실행 상태를 먼저 확인해 중복 프로세스를 만들지 않습니다. 이 클라우드의 localhost는 사용자 컴퓨터의 주소가 아니며 미리보기 링크를 제공하지 않습니다.

클라우드 Docker 빌드는 npm run docker:build:cloud로 기존 프록시 경로와 제공된 CA를 BuildKit 임시 비밀로 전달합니다. CA를 이미지에 복사하거나 TLS 검증을 끄지 않습니다. 사용자 컴퓨터에서는 일반 docker compose build를 사용합니다. 컨테이너의 외부 API 요청도 배포 환경의 지원되는 프록시·CA 설정이 별도로 필요할 수 있습니다.
