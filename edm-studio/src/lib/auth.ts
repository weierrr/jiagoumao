import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { DEMO } from "./db";
const localSecret = randomBytes(32).toString("hex");
const sessionSecret = () => process.env.SESSION_SECRET || localSecret;
const digest = (s: string) =>
  createHmac("sha256", sessionSecret()).update(s).digest("hex");
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function demoLocal(request: Request) {
  if (!DEMO || process.env.ADMIN_PASSWORD) return false;
  const host = request.headers.get("host") || new URL(request.url).host;
  return (
    /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) &&
    (!request.headers.has("x-forwarded-host") ||
      request.headers.get("x-forwarded-host") === host)
  );
}
export function sessionToken() {
  const payload = `${Date.now() + 8 * 3600000}:${randomBytes(12).toString("hex")}`;
  return `${payload}.${digest(payload)}`;
}
export function authenticated(request: Request) {
  if (demoLocal(request)) return true;
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) return false;
  const cookie = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)edm_session=([^;]+)/)?.[1];
  if (!cookie) return false;
  const [payload, signature] = cookie.split(".");
  return Boolean(
    signature &&
    safeEqual(digest(payload), signature) &&
    Number(payload.split(":")[0]) > Date.now(),
  );
}
export function assertOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL || "http://127.0.0.1:3100";
  if (origin && origin !== new URL(expected).origin)
    throw new HttpError(403, "请求来源不受信任");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "不允许跨站请求");
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
