/** Korean display labels. Provider identifiers and persisted enum values stay stable. */
const labels: Record<string, string> = {
  Culture: "문화",
  Design: "디자인",
  Lifestyle: "라이프스타일",
  Editorial: "편집",
  Korea: "한국",
  "Culture & design": "문화·디자인",
  Technology: "기술",
  Business: "경제",
  General: "일반",
  Uncategorized: "미분류",
  IDEA: "아이디어",
  RESEARCH: "조사",
  DRAFT: "초안",
  DESIGN: "디자인",
  REVIEW: "검토",
  APPROVED: "승인 완료",
  SCHEDULED: "게시 예약",
  PUBLISHED: "게시 완료",
  QUEUED: "대기 중",
  RUNNING: "실행 중",
  SUCCEEDED: "완료",
  FAILED: "실패",
  CANCELLED: "취소됨",
  READY: "준비 완료",
  UNINSPECTED: "검사 전",
  SETUP_REQUIRED: "설정 필요",
  MANUAL_REVIEW: "수동 검토",
  CAROUSEL: "캐러셀",
  REEL: "릴스",
  IMAGE: "이미지",
  VIDEO: "영상",
  INBOX: "수신함",
  SAVED: "저장됨",
  DISMISSED: "제외됨",
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
  PROPOSED: "제안됨",
  REJECTED: "반려됨",
  ADMIN: "관리자",
  OPERATOR: "운영자",
  VIEWER: "조회 전용",
  DEMO: "예시",
  META: "Meta API",
  MANUAL: "직접 입력",
  Scout: "발견 담당",
  Researcher: "조사 담당",
  Editor: "편집 담당",
  Designer: "디자인 담당",
  Publisher: "게시 담당",
  Analyst: "분석 담당",
  NEWS_INGEST: "출처 수집",
  TOPIC_DEDUP: "중복 주제 정리",
  METRICS_SYNC: "지표 동기화",
  AI_DRAFT: "AI 초안 작성",
  INGEST_SOURCES: "출처 수집",
  DEDUPLICATE_TOPICS: "중복 주제 정리",
  SYNC_METRICS: "지표 동기화",
  PERFORMANCE_SNAPSHOT: "성과 기록",
  RESEARCH_TOPIC: "주제 조사",
  CANVA_GENERATE: "Canva 생성",
  WEEKLY_REPORT: "주간 보고서",
  PUBLICATION: "Instagram 게시",
  AI_RECOMMENDATIONS: "AI 주제 제안",
};
export const koreanLabel = (value: string) => labels[value] ?? value;
export const koreanDateTime = (value: string | Date) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

const errors: Record<string, string> = {
  UNAUTHENTICATED: "로그인 후 다시 시도하세요.",
  FORBIDDEN: "이 작업에 필요한 관리자·운영자 권한이 없습니다.",
  ORIGIN_MISMATCH:
    "실행한 앱 주소에서 요청하세요. APP_URL 설정과 브라우저 주소가 일치해야 합니다.",
  INVALID_LOGIN: "이메일 또는 비밀번호가 올바르지 않습니다.",
  RATE_LIMIT: "로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.",
  DISCONNECTED: "서비스 인증이 필요합니다. 설정에서 해당 계정을 연결하세요.",
  META_DISCONNECTED: "설정에서 Meta를 인증하고 @themovemag_ 계정을 확인하세요.",
  ACCOUNT_REQUIRED:
    "설정에서 @themovemag_ 프로페셔널 계정을 인증하고 연결하세요.",
  AUTHORIZATION_REQUIRED:
    "계정 인증 권한이 부족하거나 만료됐습니다. 필요한 권한을 확인하고 설정에서 다시 연결하세요.",
  RATE_LIMITED:
    "외부 서비스 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.",
  API_UNAVAILABLE:
    "외부 API에 접근하지 못했습니다. 네트워크와 서비스 상태를 확인하세요.",
  API_REJECTED:
    "외부 API가 요청을 거절했습니다. 계정 권한, 미디어 규격과 요청 설정을 확인하세요.",
  INVALID_API_RESPONSE:
    "외부 API 응답이 올바르지 않습니다. 성공으로 기록하지 않았습니다.",
  API_OUTCOME_UNKNOWN:
    "요청이 전달됐을 수 있지만 결과를 확인하지 못했습니다. 외부 서비스 결과를 확인하기 전에는 반복 요청하지 마세요.",
  RECONCILIATION_REQUIRED:
    "중복 생성·게시를 막기 위해 재시도가 중단됐습니다. 외부 서비스에서 기존 요청 결과를 확인하세요.",
  APPROVAL_REQUIRED:
    "현재 저장된 버전에 대한 편집 승인과 별도의 게시 승인이 필요합니다.",
  STALE_APPROVAL:
    "승인 이후 콘텐츠가 바뀌었습니다. 현재 버전을 다시 검토하세요.",
  EDITORIAL_APPROVAL_REQUIRED: "편집 검토와 승인을 먼저 완료하세요.",
  PAYLOAD_CHANGED:
    "이미지 순서, 미디어 주소 또는 캡션이 바뀌었습니다. 최종 게시 내용을 다시 승인하세요.",
  RESEARCH_REQUIRED: "초안과 검증 가능한 출처 링크를 먼저 추가하세요.",
  SETUP_REQUIRED:
    "Canva 원본 사본에 자동 채우기 필드를 설정하고 브랜드 템플릿을 연결해야 합니다. 릴스의 영상 교체는 DAHPcvVkH8k 사본에서 진행하세요.",
  UNSUPPORTED_FIELD:
    "이 필드 유형은 자동 교체를 지원하지 않습니다. Canva에서 원본 사본을 편집해 수동 검토로 등록하세요.",
  MISSING_CANVA_FIELD:
    "확인된 자동 채우기 필드를 모두 입력하세요. 이미지에는 인증된 Canva 자료 ID가 필요합니다.",
  UNKNOWN_CANVA_FIELD:
    "실제 데이터셋에 없는 필드입니다. 검사된 필드 이름을 사용하세요.",
  COPY_OVERFLOW:
    "문구가 길거나 줄 수가 많습니다. 줄인 뒤 Canva에서 실제 줄바꿈과 글자 넘침을 확인하세요.",
  EMPTY_FIELD: "자동 채우기 문구를 비워 둘 수 없습니다.",
  TEMPLATE_NOT_APPROVED: "채널과 형식에 맞는 승인된 원본을 선택하세요.",
  WRONG_OPERATOR_TEMPLATE:
    "프로젝트 담당 운영자에 맞는 실제 Canva 원본을 선택하세요.",
  INVALID_REEL_TEMPLATE:
    "THE MOVE 릴스는 DAHPcvVkH8k와 1080 × 1920 규격만 사용할 수 있습니다.",
  INVALID_CAROUSEL_SIZE: "캐러셀은 1080 × 1350 규격을 유지해야 합니다.",
  SOURCE_DESIGN_PROTECTED:
    "원본을 결과물로 사용할 수 없습니다. Canva에서 새 사본을 만들어 등록하세요.",
  INVALID_CANVA_LINK: "새 사본의 HTTPS Canva 편집 링크를 입력하세요.",
  DUPLICATE_DESIGN: "이미 등록된 사본입니다. 기존 디자인 요청을 확인하세요.",
  MANUAL_REVIEW_REQUIRED:
    "새 사본의 페이지 수와 디자인 유지 여부를 확인하세요.",
  PROJECT_LOCKED:
    "예약·게시된 프로젝트는 수정할 수 없습니다. 예약 중이면 먼저 취소하세요.",
  INVALID_STAGE:
    "허용되지 않는 제작 단계 이동입니다. 현재 단계에서 제공되는 작업을 사용하세요.",
  REDIS_REQUIRED:
    "Redis와 작업 처리기를 실행하고 REDIS_URL을 설정하세요. 실제 예약 게시에는 실행 중인 작업 처리기가 필요합니다.",
  QUEUE_UNAVAILABLE:
    "작업 대기열에 요청을 넣지 못했습니다. Redis와 작업 처리기 상태를 확인하세요.",
  DEMO_PUBLISHING_DISABLED:
    "데모에서는 실제 게시를 할 수 없습니다. 실제 운영 공간을 실행하고 계정을 인증하세요.",
  DEMO_PUBLICATION_DISABLED:
    "데모에서는 실제 게시를 할 수 없습니다. 실제 운영 공간을 실행하고 계정을 인증하세요.",
  NOT_DUE: "아직 예약한 게시 시각이 되지 않았습니다.",
  CONTAINER_PROCESSING:
    "Meta에서 미디어를 처리하고 있습니다. 기존 요청을 다시 확인하며 아직 게시 성공은 아닙니다.",
  CONTAINER_FAILED:
    "Meta 미디어 처리에 실패했습니다. 파일 규격과 주소를 확인하고 다시 검토하세요.",
  ALREADY_SCHEDULED: "진행 중이거나 완료된 게시 요청이 이미 있습니다.",
  CANNOT_CANCEL: "대기 중인 게시 예약만 취소할 수 있습니다.",
  PUBLICATION_CANCELLED: "게시 상태가 변경되어 요청을 중단했습니다.",
  OPENAI_REQUIRED: "AI 기능을 사용하려면 서버에 OPENAI_API_KEY를 설정하세요.",
  UNVERIFIED_RESEARCH: "출처를 검증한 뒤 다음 단계로 진행하세요.",
  SOURCE_REQUIRED: "접근 권한이 있는 출처를 추가하세요.",
  UNSAFE_URL: "내부·비공개 주소는 외부 미디어나 출처로 사용할 수 없습니다.",
  SOURCE_NETWORK_UNAVAILABLE:
    "출처 주소를 확인할 수 없습니다. 네트워크 및 허용한 출처 호스트를 확인하세요.",
  HTTPS_REQUIRED: "게시 파일에는 공개 HTTPS 주소가 필요합니다.",
  NOT_FOUND: "요청한 항목을 찾을 수 없습니다.",
  INVALID_CONFIGURATION: "서버 환경 변수와 연결 설정을 확인하세요.",
  INTERNAL_ERROR:
    "작업을 완료하지 못했습니다. 서버 로그와 연결 설정을 확인하세요.",
};
export function koreanError(code: string, message: string): string {
  return /[가-힣]/.test(message)
    ? message
    : (errors[code] ??
        `작업을 완료하지 못했습니다 (${code}). 입력 값과 설정을 확인하세요.`);
}

export function koreanRevision(note: string) {
  const time = note.match(/^Recorded (\d+) production minutes$/);
  if (time) return `제작 시간 ${time[1]}분 기록`;
  const stage = note.match(/^Moved to ([A-Z]+)$/);
  if (stage) return `${koreanLabel(stage[1])} 단계로 이동`;
  return (
    (
      {
        "Created project": "프로젝트 생성",
        update: "프로젝트 내용 수정",
        approve: "사람이 편집 승인",
      } as Record<string, string>
    )[note] ?? note
  );
}
