import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/u;
const MIN_SIGNING_SECRET_LENGTH = 32;

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => canonicalize(item) ?? "null")
      .join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(
        ([, item]) =>
          item !== undefined &&
          typeof item !== "function" &&
          typeof item !== "symbol"
      )
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${canonicalize(item)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function resolveReleaseReportSigningSecret(env = process.env) {
  const secret = String(
    env?.RELEASE_REPORT_SIGNING_SECRET ??
      env?.AUTH_SESSION_SECRET ??
      ""
  );
  return secret.length >= MIN_SIGNING_SECRET_LENGTH ? secret : "";
}

export function signReleaseReport(report, secret) {
  if (!secret || secret.length < MIN_SIGNING_SECRET_LENGTH) {
    throw new Error(
      `Release report signing secret must contain at least ${MIN_SIGNING_SECRET_LENGTH} characters.`
    );
  }
  const unsigned = { ...report };
  delete unsigned.proof;
  const signature = createHmac("sha256", secret)
    .update(canonicalize(unsigned), "utf8")
    .digest("hex");
  return {
    ...unsigned,
    proof: {
      algorithm: "hmac-sha256",
      signature,
    },
  };
}

export function maybeSignReleaseReport(report, env = process.env) {
  const secret = resolveReleaseReportSigningSecret(env);
  return secret ? signReleaseReport(report, secret) : report;
}

/**
 * 报告签名防止旧文件、手写摘要或跨运行字段被误拼成正式证据。
 */
export function verifyReleaseReport(report, secret) {
  const signature = String(report?.proof?.signature ?? "")
    .trim()
    .toLowerCase();
  if (
    report?.proof?.algorithm !== "hmac-sha256" ||
    !SIGNATURE_PATTERN.test(signature) ||
    !secret ||
    secret.length < MIN_SIGNING_SECRET_LENGTH
  ) {
    return false;
  }
  const expected = signReleaseReport(report, secret).proof.signature;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}

export const releaseReportProofInternals = {
  canonicalize,
  minimumSecretLength: MIN_SIGNING_SECRET_LENGTH,
};
