# 내 컴퓨터에서 THE MOVE OS 열기

1. [Node.js 공식 사이트](https://nodejs.org/en/download)에서 **Node.js 24 이상**을 설치하세요. 이미 설치되어 있으면 넘어가세요.
2. 받은 ZIP 파일을 **압축 해제**하세요.
3. 압축을 푼 폴더 안에서 Windows는 **START-WINDOWS.bat**, Mac은 **START-MAC.command**를 실행하세요. Mac에서 실행 권한 오류가 나면 터미널에서 `bash START-MAC.command`로 실행할 수 있습니다.
4. 처음에는 필요한 패키지를 설치하므로 잠시 기다리세요. 앱 준비가 끝나면 브라우저가 열립니다.
5. 로그인 화면에서 **Enter workspace**를 누르세요. 데모 이메일과 비밀번호는 미리 입력되어 있습니다.

브라우저가 자동으로 열리지 않으면, **내 컴퓨터에서 실행 파일을 실행한 뒤** 주소창에 `http://localhost:3000`을 입력하세요. 이 주소는 앱을 실행한 컴퓨터에서만 열립니다.

실행 창은 열어 두세요. 종료할 때는 그 창에서 **Ctrl+C**를 누르세요. 다시 같은 실행 파일을 열면 저장한 편집 내용을 유지한 채 실행됩니다.

Docker, PostgreSQL, Redis, 외부 API 키 없이 **명확히 표시된 데모 모드**로 실행합니다. 샘플 지표는 실제 Instagram 실적이 아닙니다. 실제 Canva 생성과 Instagram 게시에는 별도 계정 인증이 필요합니다.

터미널을 사용하는 경우 폴더에서 `node scripts/start-demo.mjs`를 실행해도 같습니다. 로그인 정보는 `operator1@themove.local` / `move-demo-2026`입니다.
