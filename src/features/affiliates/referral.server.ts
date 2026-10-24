import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequestUrl,
  setResponseHeader,
} from "@tanstack/react-start/server";
const COOKIE = "astros_referral";
// Public referral code is an attribution hint, never an authorization or percentage.
export function remember(code: string) {
  setResponseHeader("Cache-Control", "private, no-store");
  if (!/^[a-f0-9]{32}$/.test(code)) return { success: false };
  if (!getCookie(COOKIE))
    setCookie(COOKIE, code, {
      httpOnly: true,
      secure:
        process.env["ASTROS_SECURE_COOKIES"] === "true" || getRequestUrl().protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 86400,
    });
  return { success: true };
}
export function referral() {
  const value = getCookie(COOKIE) || "";
  return /^[a-f0-9]{32}$/.test(value) ? value : undefined;
}
export function clearReferral() {
  deleteCookie(COOKIE, { path: "/" });
}
