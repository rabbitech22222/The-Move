# 클라우드 작업 실행

기존 /workspace/The-Move 체크아웃을 사용합니다. 요청 없이 Git 작업 트리를 만들거나 사용자 변경을 초기화하지 않습니다. 설치는 `bash scripts/cloud-install.sh`이며 기존 .env와 편집 데이터를 유지합니다.

새 클라우드 작업에서 설치된 파일은 남아도 실행 중인 프로세스는 다시 시작해야 할 수 있습니다. 먼저 `/api/health`와 `.move-runtime`의 실행 기록을 확인하고 정상 앱·처리기를 재사용합니다. 이미 실행 중인 앱과 같은 포트에 새 프로세스를 만들지 않습니다.

```sh
cd /workspace/The-Move
docker compose up -d postgres redis
mkdir -p .move-runtime
nohup npm run dev < /dev/null > .move-runtime/web.log 2>&1 &
echo $! > .move-runtime/web.pid
nohup npm run worker < /dev/null > .move-runtime/worker.log 2>&1 &
echo $! > .move-runtime/worker.pid
```

health, 로그인, workspace 데이터와 대시보드·스튜디오·오피스 기능을 확인합니다. PID나 열린 포트만으로 준비 완료라고 판단하지 않습니다. 데모의 공개 계정은 실제 계정 인증이 아니며 외부 지표·게시 성공을 가장하지 않습니다.

PostgreSQL 실제 운영은 별도 저장소·Redis와 서로 다른 운영자 비밀번호를 준비하고 마이그레이션·시드 후 실행합니다. 데모 처리기와 실제 앱을 같은 대기열에 혼합하지 않습니다. 본인이 시작한 프로세스만 종료하고 broad pkill 명령은 사용하지 않습니다.

기존 프록시와 제공된 TLS CA 설정을 유지합니다. 외부 API 인증 값이나 프록시 내부 자격을 출력·추출하지 않습니다. 환경 설정 저장은 현재 프로세스에 즉시 적용되지 않습니다. 이 클라우드에는 사용자용 localhost 미리보기 연결이 없습니다. 사용자는 GitHub 패키지를 내려받아 본인 컴퓨터에서 실행합니다.
