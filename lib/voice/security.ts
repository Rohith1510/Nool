import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function issueToolToken(
  sessionId: string,
  expires: number,
  secret: string,
) {
  const payload = `${sessionId}.${expires}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifyToolToken(token: string, secret: string) {
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    !/^\d+$/.test(parts[1]) ||
    Number(parts[1]) <= Math.floor(Date.now() / 1000)
  )
    throw new Error("Unauthorized or expired voice credential.");
  const expected = issueToolToken(parts[0], Number(parts[1]), secret);
  const a = Buffer.from(token),
    b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new Error("Unauthorized voice credential.");
  return { sessionId: parts[0], expires: Number(parts[1]) };
}
