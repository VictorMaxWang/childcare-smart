import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);
const HASH_PREFIX = "scrypt";
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${HASH_PREFIX}:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [prefix, salt, expectedHash] = encoded.split(":");
  if (prefix !== HASH_PREFIX || !salt || !expectedHash) {
    return false;
  }

  const actual = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(expectedHash, "hex");
  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
}
