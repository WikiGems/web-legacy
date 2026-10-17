const encoder = new TextEncoder();

export interface OnboardingClaims {
  sub: string;
  name: string;
  email: string;
  iat: number;
  exp: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createOnboardingToken(
  secret: string,
  input: Pick<OnboardingClaims, "sub" | "name" | "email">,
  ttlSeconds = 600,
): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const claims: OnboardingClaims = {
    ...input,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    iat: now,
    exp: now + ttlSeconds,
  };
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return {
    token: `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`,
    expiresIn: ttlSeconds,
  };
}

export async function verifyOnboardingToken(
  secret: string,
  token: string | null | undefined,
): Promise<OnboardingClaims> {
  if (!token) throw new Error("Missing onboarding context.");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new Error("Malformed onboarding context.");

  const signatureBytes = base64UrlToBytes(signature);
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signatureBytes.buffer.slice(
      signatureBytes.byteOffset,
      signatureBytes.byteOffset + signatureBytes.byteLength,
    ) as ArrayBuffer,
    encoder.encode(payload),
  );
  if (!valid) throw new Error("Invalid onboarding context.");

  let claims: OnboardingClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as OnboardingClaims;
  } catch {
    throw new Error("Malformed onboarding context.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    typeof claims.sub !== "string" ||
    typeof claims.name !== "string" ||
    typeof claims.email !== "string" ||
    typeof claims.exp !== "number" ||
    claims.exp < now
  ) {
    throw new Error("Onboarding context has expired.");
  }

  return claims;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normaliseEmail(email));
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2 && name.trim().length <= 80;
}
