export const AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE =
  "\u670d\u52a1\u7aef\u7f3a\u5c11 AUTH_SESSION_SECRET \u914d\u7f6e\u3002";

export class MissingAuthSessionSecretError extends Error {
  constructor(message = "AUTH_SESSION_SECRET is required in production") {
    super(message);
    this.name = "MissingAuthSessionSecretError";
  }
}

export function getAuthSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV !== "production") {
    return "dev-only-change-me";
  }

  throw new MissingAuthSessionSecretError();
}
