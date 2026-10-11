# 실제 원본으로 제작하고 @themovemag_에 게시하기

데모 실행과 실제 운영 실행은 별도입니다. 실제 운영 실행기는 `.env.live`와 `the-move-live` Docker 프로젝트를 사용합니다. 작업 처리기가 켜져 있어야 예약 게시가 실행됩니다. 초기 데이터에는 예시 성과나 실제로 게시했다고 표시한 콘텐츠가 없습니다.

## 계정 인증 준비

GPT에 연결한 플러그인 토큰은 다운로드한 앱에 전달되지 않습니다. 이 코딩 대화에서도 Canva·Instagram 도구가 제공되지 않아 해당 인증을 재사용하지 못했습니다. 외부 토큰을 추출하거나 채팅으로 보내지 마세요.

Canva Connect 개발자 앱의 `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`과 Meta 앱의 `META_APP_ID`, `META_APP_SECRET`을 내 컴퓨터의 `.env.live`에 설정합니다. 접근 토큰을 사용하는 관리자는 `CANVA_ACCESS_TOKEN`, `META_ACCESS_TOKEN`을 서버 환경에만 저장할 수 있습니다. 외부 앱 설정에는 다음 콜백 주소를 정확히 등록합니다. 실제 사용하는 APP_URL과 포트가 다르면 함께 바꿔야 합니다.

- Canva: `http://localhost:3000/api/oauth/canva/callback`
- Meta: `http://localhost:3000/api/oauth/meta/callback`

플랫폼이 허용하는 개발용 리다이렉트 주소 규칙을 따르세요. localhost 허용 여부와 계정·앱 권한은 각 개발자 콘솔에서 확인합니다. 정식 외부 운영은 HTTPS 주소가 필요합니다. 비밀 키는 Git에 넣지 않습니다. `.env.live`, 로컬 데이터와 실행 로그는 패키지에 포함되지 않습니다.

설정을 변경한 뒤 실제 운영 실행기를 다시 실행하거나 다음 명령으로 컨테이너를 갱신합니다.

```sh
MOVE_ENV_FILE=.env.live docker compose --project-name the-move-live --env-file .env.live up --build --detach --wait
```

Windows에서는 실행기가 환경 파일을 선택하므로 `START-LIVE-WINDOWS.bat`를 다시 실행하면 됩니다. 이미 실행 중인 앱 때문에 포트 사용 메시지가 나오면 먼저 종료합니다:

```sh
docker compose --project-name the-move-live --env-file .env.live down
```

`.env.live`의 OPERATOR_1_PASSWORD와 OPERATOR_2_PASSWORD는 서로 다른 임의 비밀번호로 초기화합니다. 이메일은 `operator1@themove.local`, `operator2@themove.local`입니다. 기존 데이터베이스 계정 비밀번호는 재실행 시 덮어쓰지 않습니다. 파일의 비밀번호를 바꾸는 것만으로 기존 계정 비밀번호가 변경되지는 않습니다.

## THE MOVE 계정 확인

1. 설정 → Meta 계정 인증을 실행합니다. @themovemag_ 프로페셔널 계정과 연결된 Facebook 페이지 관리 권한이 있어야 합니다.
2. **THE MOVE 계정 자동 확인·연결**을 누릅니다. API가 허용한 페이지 목록에서 정확한 계정을 찾고 ID와 이름을 다시 대조합니다.
3. 자동 발견 권한이 없으면 승인된 프로페셔널 계정 ID를 입력합니다. 다른 계정은 연결되지 않습니다.
4. 지표 동기화를 실행하고 오피스에서 작업 결과를 확인합니다. 지표가 없는 항목은 빈 값으로 남깁니다.

필요 권한: `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`. 앱 검토, 개발 모드의 앱 역할과 프로페셔널 계정 설정은 Meta 콘솔에서 확인합니다. 게시 직전에도 @themovemag_ 이름과 계정 ID를 다시 조회합니다. 다른 채널의 실제 연동·게시 요청은 현재 차단합니다.

## 실제 Canva 디자인 기준

- 운영자 1 캐러셀: `DAHPXU1IGDI`
- 운영자 2 캐러셀: `DAHXJGy8do8`
- THE MOVE 릴스: **`DAHPcvVkH8k`만 사용**

원본을 수정하지 않습니다. Canva 연결 후 원본 검사로 실제 미리보기를 조회합니다. 인증 전에는 실제 디자인과 동일하다고 표시하지 않습니다. API 필드 검사는 글꼴·여백·줄바꿈의 시각적 일치를 증명하지 않으며 운영자가 직접 확인해야 합니다.

먼저 실제 원본의 자동 채우기 필드를 검사합니다. 필드가 있으면 원본에서 새 디자인을 자동 생성합니다. 필드가 없으면 원본 사본을 1080 × 1350 규격의 브랜드 템플릿으로 등록하고 필드를 설정합니다. 계정에 Canva Autofill 이용 권한이 필요합니다. 최신 공식 문서는 Pro·Teams·Enterprise 등의 자격을 안내합니다. 캔바 제작소에서 사본의 브랜드 템플릿 ID, 페이지 수와 디자인 유지 확인을 저장하면 API가 실제 필드를 검사합니다. 확인된 이름 그대로 문구나 인증된 Canva 이미지 자료 ID를 입력합니다. 제목·본문·출처에 해당하는 표준 필드는 저장된 초안에서 채웁니다. 지원되지 않는 필드를 임의 생성하지 않습니다. 페이지 수 변경은 해당 페이지 수의 승인된 사본을 준비합니다.

릴스도 실제 원본 `DAHPcvVkH8k`의 필드를 검사합니다. 영상 자료 필드가 있으면 인증된 Canva 영상 자료 ID로 새 디자인을 자동 생성합니다. 원본의 가로 영상 프레임 위치와 비율은 변경 요청하지 않습니다. 필드가 없으면 원본을 수정하지 않고 사본에 필드를 설정해 브랜드 템플릿으로 연결하거나, Canva에서 **사본 만들기**로 제목·영상·출처를 교체하고 새 편집 링크를 수동 검토로 등록합니다. 수동 사본을 API 생성으로 표시하지 않습니다. 실제 원본 필드와 프레임 적합성은 인증 후 확인해야 합니다.

## 파일 내보내기 → 사람 승인 → Instagram 게시

1. 출처와 초안이 있는 디자인·검토 단계 프로젝트에서 새 디자인을 생성하거나 사본을 등록합니다.
2. **게시용 파일 내보내기**를 누릅니다. 캐러셀은 페이지마다 PNG 내보내기를 요청해 순서를 유지하고 릴스는 MP4로 내보냅니다. 결과 확인을 눌러 실제 파일 주소를 받습니다.
3. 파일을 열어 페이지 순서, 오버플로, 영상 비율, 출처와 브랜드를 검토합니다. 모든 내보내기가 성공해야 파일 목록을 제공합니다. 원본 내보내기는 차단합니다.
4. 스튜디오에서 편집 검토를 승인합니다. 게시 입력란에는 확인된 Canva 파일 주소를 가져오거나 내 소유의 공개 HTTPS 저장소 주소를 입력합니다. 캐러셀은 서로 다른 이미지 2~10개를 한 줄에 하나씩, 게시 순서대로 입력합니다.
5. 최종 미디어와 캡션을 다시 검토하고 **게시 승인**을 누릅니다. 주소, 이미지 순서 또는 캡션을 바꾸면 다시 승인해야 합니다.
6. 게시 시간을 정하고 **게시 예약**을 누릅니다. 작업 처리기가 이미지 자식 컨테이너와 캐러셀 부모 컨테이너 또는 릴스 컨테이너를 만든 뒤 처리 상태를 확인하고 게시합니다.
7. Meta가 실제 게시물 ID를 반환해야 게시 완료로 기록됩니다. 실패나 불명확한 응답은 성공으로 표시하지 않습니다. 불명확한 게시 요청은 자동 반복하지 않습니다.

Canva 다운로드 주소는 만료될 수 있습니다. 늦은 예약에는 운영자가 소유한 저장소에 검토한 파일을 올려 지속적인 공개 HTTPS 주소를 사용하세요. 임의의 서버에 미디어를 업로드하지 않습니다. Canva 편집 링크나 ZIP 파일은 Instagram 미디어 주소로 사용할 수 없습니다.

## 검증 상태

로컬 앱·한국어 화면·권한 검증과 API 응답을 대체한 계약 테스트는 별도로 기록합니다. 현재 실제 Canva 및 Meta 계정 인증이 제공되지 않아 원본 디자인 확인, 실제 생성·내보내기와 실제 @themovemag_ 게시의 외부 서비스 종단 검증은 미완료입니다. 계정 연결을 했다는 사실만으로 생성·게시 성공을 주장하지 않습니다.

공식 참고: [Canva 내보내기 API](https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/), [Canva Autofill](https://www.canva.dev/docs/connect/api-reference/autofills/), [Meta Instagram 게시](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing/).
