import { isVerifyJobReasonKey, type VerifyJobResult } from "@/lib/queue";

/**
 * Normalize a BullMQ verify-job return value into a well-typed
 * {@link VerifyJobResult}.
 *
 * The verify worker emits failures with a machine-readable
 * `reasonKey` (see {@link VerifyJobReasonKey}) which the API layer
 * translates into the caller's locale. Older payloads may only carry
 * a plain `reason` string, so this helper preserves both for
 * backwards compatibility:
 *
 * - If `raw` is not a non-null object, the result falls back to
 *   `{ success: false, reason: invalidReason }`.
 * - Otherwise `success` reflects `payload.success === true`.
 * - `reasonKey` is copied only when the raw value is a recognized
 *   {@link VerifyJobReasonKey} string.
 * - `reason` is copied only when it is a string. Both fields are
 *   independent: a payload carrying both will surface both, and the
 *   caller decides which takes precedence during translation.
 */
export function parseVerifyJobResult(raw: unknown, invalidReason: string): VerifyJobResult {
  if (typeof raw !== "object" || raw === null) {
    return { success: false, reason: invalidReason };
  }

  const payload = raw as Record<string, unknown>;
  const result: VerifyJobResult = {
    success: payload.success === true,
  };

  if (isVerifyJobReasonKey(payload.reasonKey)) {
    result.reasonKey = payload.reasonKey;
  }

  if (typeof payload.reason === "string") {
    result.reason = payload.reason;
  }

  return result;
}
