import type { ErrorCode } from "@scriptecho/contracts";

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  file_too_large: 413,
  unsupported_media_type: 415,
  undecodable_image: 422,
  image_too_large: 422,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  model_output_invalid: 502,
  provider_unavailable: 503,
  analysis_timeout: 504,
  analysis_cancelled: 499,
  internal_error: 500,
};
const RETRYABLE = new Set<ErrorCode>(["rate_limited", "provider_unavailable", "analysis_timeout", "model_output_invalid"]);

export class AppError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(readonly code: ErrorCode, message: string, readonly retryAfterSeconds?: number, retryable?: boolean) {
    super(message);
    this.status = STATUS[code];
    this.retryable = retryable ?? RETRYABLE.has(code);
  }
}
