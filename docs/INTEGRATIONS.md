# 서비스 연결 계약

실행 및 실제 계정 인증 순서는 [실제 제작·게시 안내](REAL_PUBLISH_KO.md)를 따르세요. 외부 앱 인증 값은 환경 변수로 설정하며 토큰은 서버에 AES-256-GCM으로 암호화해 저장합니다. 브라우저에는 값 대신 설정 상태만 반환합니다. 설정 정보가 있다는 사실과 실제 API 성공은 별도입니다.

## Canva

정확한 원본은 DAHPXU1IGDI, DAHXJGy8do8, DAHPcvVkH8k입니다. THE MOVE 릴스는 마지막 원본만 사용합니다. 원본을 수정하거나 다른 임의 릴스 템플릿으로 대체하지 않습니다.

실제 메타데이터와 `GET /rest/v1/designs/{id}/dataset`을 조회합니다. 필드가 있으면 `POST /rest/v1/autofills`에 `type=create_from_design`과 원본 design_id를 전달합니다. API는 **새 디자인**을 생성합니다. `update_design`은 사용하지 않습니다. 지원되는 데이터는 text, image, video입니다. 이미지 유형 필드에는 공식 API가 지원하는 video 자료도 사용할 수 있습니다. 실제 자료 ID가 없으면 생성하지 않습니다. 원본 프레임의 위치·크기는 API에 변경 요청하지 않습니다.

기존 원본에 필드가 없는 경우 사본을 만들어 설정하고 승인된 브랜드 템플릿으로 연결합니다. 관리자 설정은 원본과의 시각적 일치에 대한 사람의 확인이며 API가 이를 증명하지 않습니다. 연결은 UI 또는 CANVA_BRAND_TEMPLATE_MAP으로 지정할 수 있습니다.

```json
{
  "DAHPXU1IGDI": {"brandTemplateId": "사용자가_승인한_실제_ID", "pageCount": 5},
  "DAHXJGy8do8": {"brandTemplateId": "사용자가_승인한_실제_ID", "pageCount": 5}
}
```

HEADLINE/TITLE/제목/헤드라인은 제목, BODY/COPY/CAPTION/본문/캡션은 초안, SOURCE_CREDIT/SOURCES/CREDIT/출처는 출처 링크로 추론합니다. 다른 필드는 화면에 실제 이름 그대로 입력합니다. 문구 길이 검사는 보수적인 사전 검사이며 실제 글꼴과 줄바꿈을 보증하지 않습니다. 입력 페이지 수가 실제 원본·승인된 템플릿과 다르면 설정 오류를 반환합니다.

결과는 `GET /rest/v1/autofills/{jobId}`에서 확인합니다. 원본과 다른 새 디자인 ID 및 HTTPS Canva 편집 링크를 받은 경우에만 READY로 기록합니다. 작업 접수만으로 생성 성공을 표시하지 않습니다. 수동 제출한 사본은 MANUAL_REVIEW이며 API 생성으로 표시하지 않습니다.

검토 단계에서 `POST /rest/v1/exports`를 호출합니다. 캐러셀은 1080 × 1350 PNG를 페이지별로 요청해 ZIP 대신 이미지 주소를 가져오며 릴스는 vertical_1080p MP4로 내보냅니다. 모든 작업이 성공해야 순서대로 파일을 제공합니다. 내보낸 파일을 받은 프로젝트의 기존 승인은 무효화하고 다시 검토합니다. 내보내기 요청 결과가 불명확하면 자동으로 반복하지 않습니다. 다운로드 주소가 만료되므로 장기 예약에는 별도 소유 저장소가 필요합니다.

공식 자료: [원본 필드 조회](https://www.canva.dev/docs/connect/api-reference/designs/get-design-dataset/), [자동 채우기 생성](https://www.canva.dev/docs/connect/api-reference/autofills/create-design-autofill-job/), [내보내기](https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/). 최신 문서의 Autofill 자격에는 Canva Pro·Teams·Enterprise 등이 포함됩니다. 실제 계정 자격과 이용 한도는 인증 후 확인해야 합니다.

## Meta Instagram

현재 실제 연동은 @themovemag_만 허용합니다. 인증된 `/me/accounts` 목록에서 발견하거나 직접 입력한 프로페셔널 계정 ID를 조회합니다. API의 username과 id가 정확히 일치해야 연결합니다. 토큰이 접근할 수 있는 다른 계정을 THE MOVE로 오인하지 않습니다.

기본 공식 Graph 버전은 v23.0이며 META_GRAPH_VERSION으로 유효한 버전을 지정합니다. OAuth 권한은 instagram_basic, instagram_manage_insights, instagram_content_publish, pages_show_list, pages_read_engagement입니다. 프로페셔널 계정의 Facebook 페이지 연결, 앱 역할·검토와 권한 승인이 필요합니다.

지표는 API가 제공한 값만 기록합니다. 조회 불가와 관찰된 0은 구분합니다. 최근 게시물은 최대 100개 목록과 최신 20개 게시물 지표를 제한적으로 조회하며 당일 목록이 완전하지 않으면 게시 수를 비워 둡니다. 저장 시점의 누적 게시물 지표를 여러 날 합산하지 않습니다. 팔로워 변화는 이전 관찰 기록이 있어야 계산합니다. 지표 날짜는 관찰한 UTC 일자를 저장하고 화면 시각은 한국 표준시로 표시합니다.

게시 직전에도 계정 이름과 ID를 재조회합니다. 현재 저장된 버전의 편집 승인과 최종 `{mediaUrl, caption, mediaUrls?}`의 SHA-256 값에 대한 사람 게시 승인이 필요합니다. 캐러셀은 순서가 정해진 이미지 2~10개를 사용하고 이미지 자식 컨테이너가 처리된 뒤 부모 컨테이너를 만듭니다. 릴스는 영상 컨테이너를 만듭니다. 알려진 컨테이너는 다시 확인하며 반복 생성하지 않습니다. 컨테이너 완료 확인 후 media_publish를 호출하고 실제 ID를 받은 경우에만 PUBLISHED로 기록합니다.

응답이 불명확한 요청은 자동 재전송하지 않습니다. 컨테이너·게시 요청 이력을 대조하고 관리자가 결과를 확인해야 합니다. 데모의 실제 게시는 차단됩니다. Canva 생성 자체가 게시를 실행하지 않습니다.

## OpenAI 및 정보 수집

AI는 선택 기능입니다. OPENAI_API_KEY를 서버에 설정합니다. 저장된 출처와 채널 지침을 Responses API에 전달하고 엄격한 구조의 한국어 초안·편집 제안을 요청합니다. 제공하지 않은 출처나 누락된 근거, 임의 URL은 거절합니다. 초안은 사실 검증이나 승인 완료를 주장하지 않습니다. 규칙은 자동 변경하지 않습니다.

RSS·직접 제출 출처는 URL 정규화, 중복 제거, 발행·수집 날짜와 이용 권한을 저장합니다. 관련도는 이름·지침의 키워드 일치와 최신성 규칙입니다. 바이럴 확률로 표현하지 않습니다. 피드 제목 일치와 복수 도메인이 기사 내용의 사실을 증명하지 않습니다.

## 작업 및 보안

Redis/BullMQ 작업 처리기는 대기·실행·실패·완료와 실제 결과를 기록합니다. 재시도, 지수 지연, 요청 속도 제한과 멱등 키를 사용합니다. 외부 쓰기 요청의 불명확한 결과는 재시도 대상에서 제외합니다. API 토큰은 고정 공식 호스트에만 전송합니다. 외부 출처와 미디어는 공개 주소 확인 및 제한된 요청 보호를 적용합니다. 프록시 환경의 TLS 신뢰와 패키지 무결성 검증은 유지합니다.

현재 실제 Canva·Meta·OpenAI 계정의 외부 종단 검증은 인증 미제공으로 미완료입니다. API 대체 응답 테스트를 실제 게시 성공으로 간주하지 않습니다.
