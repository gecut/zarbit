import type { WorkerFailure } from "./worker-types";

export function classifyWorkerFailure(error: unknown): WorkerFailure {
  let cause = error;
  for (let depth = 0; depth < 4 && cause instanceof Error; depth++) {
    const code = Reflect.get(cause, "code");
    if (
      cause.name === "TimeoutError" ||
      cause.name === "AbortError" ||
      [
        "ETIMEDOUT",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_HEADERS_TIMEOUT",
        "UND_ERR_BODY_TIMEOUT",
      ].includes(code)
    )
      return "timeout";
    if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "dns";
    if (code === "ECONNREFUSED") return "connection_refused";
    if (
      typeof code === "string" &&
      /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE)/.test(
        code,
      )
    )
      return "tls";
    cause = Reflect.get(cause, "cause");
  }
  return "network";
}
