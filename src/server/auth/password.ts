import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations).
const options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string) {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** A real hash to verify against when the user doesn't exist, so timing doesn't reveal accounts. */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash() {
  dummyHash ??= hash("not-a-real-password", options);
  return dummyHash;
}
