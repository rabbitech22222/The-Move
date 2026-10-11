# 앱 API

작업 공간 API에는 POST /api/auth가 발급하는 서명된 세션 쿠키가 필요합니다. 변경에는 application/json과 APP_URL에 일치하는 Origin이 필요합니다. 성공 응답은 `{data}`, 실패는 한국어 `{error,code}`입니다. 기술 식별자·필드 이름·저장한 상태 값은 영문 계약을 유지합니다. 값의 설명은 화면에서 한국어로 표시합니다.

| 경로 | 메서드 | 작업 |
|---|---|---|
| /api/health | GET | 앱 건강 상태·데모 여부. 외부 API 준비를 보증하지 않음 |
| /api/auth | POST / GET / DELETE | 로그인·현재 운영자·로그아웃 |
| /api/workspace | GET | 비밀 인증 값을 제외한 작업 공간 |
| /api/projects | POST | create, update, transition, approve, track-time |
| /api/assets | POST | add(projectId/kind/url/credit/선택 크기), approve/remove(assetId) |
| /api/intelligence | POST | add-source, ingest, save, dismiss, research, create-project |
| /api/canva | POST | inspect, configure, generate, refresh, register-manual, export, refresh-export |
| /api/jobs | POST | 지원하는 kind와 대상 ID. 게시 우회 요청은 받지 않음 |
| /api/analytics | POST | recommend, approve, reject, record-experiment |
| /api/settings | GET / POST | 인증 설정 상태·관리자의 채널·규칙 관리 및 @themovemag_ 확인·연결 |
| /api/publications | POST | approve, schedule, cancel |
| /api/oauth/canva 또는 meta | GET | 관리자 OAuth 시작 |
| /api/oauth/{provider}/callback | GET | 사용자 세션·state 확인 후 코드 교환·암호화 저장 |

Canva generate에는 projectId, templateId와 선택적 pageCount, fields를 전달합니다. fields의 키는 실제 검사한 데이터셋 이름입니다. 문구는 `{type:"text",text:"..."}`, 미디어는 `{type:"image" 또는 "video",asset_id:"인증된 실제 자료 ID"}`입니다. 공개 URL을 Canva 자료 ID로 간주하지 않습니다. 원본 디자인을 수정하는 요청은 사용하지 않습니다.

configure는 관리자만 실행하며 templateId, brandTemplateId, pageCount, preservedLayout=true가 필요합니다. 사람의 원본 사본 확인을 기록한 뒤 API로 필드를 검사합니다. register-manual에는 프로젝트·원본, 새 HTTPS Canva editUrl, 실제 pageCount, preservedLayout=true가 필요합니다. 원본 링크는 거절하며 MANUAL_REVIEW로 기록합니다. export/refresh-export는 designId를 받고 현재 디자인·검토 단계의 새 사본만 내보냅니다.

connect-meta-account는 channelId=the-move와 선택적 accountId를 받습니다. ID가 없으면 인증된 페이지 목록에서 @themovemag_를 찾고 실제 이름과 ID를 재조회합니다. 다른 계정은 연결하지 않습니다.

게시 approve는 projectId/mediaUrl/caption과 캐러셀인 경우 순서대로 mediaUrls 2~10개를 받습니다. mediaUrl은 첫 이미지와 같아야 합니다. schedule은 승인한 동일 내용과 미래 scheduledAt을 받습니다. cancel은 publicationId를 받습니다. 변경된 URL·이미지 순서·캡션은 재승인해야 합니다. 데모 게시·승인되지 않은 상태·중복 요청은 서버에서 차단합니다.

작업 접수는 완료가 아닙니다. 오피스의 tasks/events, 디자인 요청과 게시 상태에서 실제 결과를 확인합니다. `null` 지표는 확인되지 않은 값이며 0으로 대체하지 않습니다. 외부 API가 실제 게시물 ID를 반환해야 게시 완료가 됩니다. 불명확한 응답은 자동 재전송하지 않습니다.
