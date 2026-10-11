# 클라우드 작업 실행

기존 `/workspace/The-Move` 체크아웃을 사용합니다. 요청 없이 작업 트리를 만들거나 사용자 변경을 초기화하지 않습니다. 설치는 `bash scripts/cloud-install.sh`입니다. 기존 `.env`와 저장한 실제·예시 작업을 보존합니다.

새 작업에서는 프로세스를 다시 시작해야 합니다. 먼저 health, `.move-runtime` 실행 기록과 정상 처리기를 확인해 중복 실행을 피합니다. 기본 실제 운영은 다음 명령을 사용합니다.

```sh
cd /workspace/The-Move
mkdir -p .move-runtime
nohup node scripts/start-local.mjs < /dev/null > .move-runtime/local.log 2>&1 &
echo $! > .move-runtime/local.pid
```

실행기는 `.env.desktop`, `.move-local`을 준비하고 앱·로컬 처리기를 함께 시작합니다. 비밀번호는 `.move-local/login.txt`에 있으며 출력·공유하지 않습니다. 기존 설정과 비밀번호는 보존합니다. 예시 모드는 `--demo`를 명시해야 하며 기본값이 아닙니다. 예시를 실제 지표로 변환하지 않습니다.

health 요청뿐 아니라 실제 로그인, workspace.demo=false, @themovemag\_ 단일 계정, 작업 완료와 RSS 수집 결과를 확인합니다. `CHROMIUM_PATH=/usr/bin/chromium node scripts/check-real-workflow.mjs`는 RSS → 화면 후보 → 조사 준비서·출처 저장 → 재조회를 검증하며 실제 공간에 검토 프로젝트 한 개를 생성합니다. 계정 인증이 없는 실제 외부 작업은 별도 미검증입니다.

기존 egress proxy와 제공된 TLS CA를 유지합니다. DNS 실패 시에는 확인된 정확한 공개 RSS 호스트만 `SOURCE_PROXY_ALLOWED_HOSTS`에 설정합니다. 기본 출처 www.yna.co.kr, rss.donga.com을 실제 요청으로 확인했습니다. 임의 네트워크 정책 대체나 TLS 검증 비활성화를 하지 않습니다.

META_ACCESS_TOKEN, CANVA_ACCESS_TOKEN은 환경 설정의 보안 입력으로 제공하며 공식 HTTPS API에만 보냅니다. GPT 플러그인의 인증이 전달됐다고 가정하지 않습니다. 토큰 존재와 실제 계정·지표·생성·게시 성공은 다릅니다. 원본과의 시각적 일치도 인증 후 확인합니다.

PostgreSQL 운영은 별도 `.env.live`와 START-LIVE 실행기 또는 마이그레이션·시드 및 BullMQ/Redis 처리기를 사용합니다. 기본 파일 운영과 자동 병합하지 않습니다. 본인이 시작한 프로세스만 종료하고 이름 기준 광범위 종료 명령은 사용하지 않습니다.

이 클라우드의 localhost는 사용자 컴퓨터의 주소가 아닙니다. 사용자용 미리보기 링크를 제공하지 않습니다. 사용자는 GitHub ZIP을 내려받아 본인 컴퓨터에서 START-WINDOWS.bat를 실행합니다. 설정 초안 저장은 실행 중인 프로세스 변경이나 새 스냅샷 발행을 뜻하지 않습니다.
