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
    ? error.message
    : "An unexpected operation failed.";
}
