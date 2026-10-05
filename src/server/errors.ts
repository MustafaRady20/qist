/**
 * Domain errors thrown by services. Route handlers map them to HTTP responses,
 * server actions to form state. Messages are user-facing Arabic.
 */
export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "locked"
  | "invalid_state";

const httpStatus: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  locked: 423,
  invalid_state: 409,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    /** Extra machine-readable context (field errors, existing record, …). */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  get status() {
    return httpStatus[this.code];
  }
}

export const notFound = (what: string) => new AppError("not_found", `${what} غير موجود`);
