import { koreanError } from "../korean";
export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? koreanError(
        "code" in error ? String(error.code) : "INTERNAL_ERROR",
        error.message,
      )
    : "예상하지 못한 오류가 발생했습니다.";
}
