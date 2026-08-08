/**
 * Local smoke: expired link UI + public path (no staff cookie).
 * Full invite→password→login needs service_role + Redirect URLs on Preview.
 */
import { chromium } from "playwright";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`${base}/auth/set-password`, { waitUntil: "networkidle" });
await page.waitForSelector("text=招待リンクの有効期限が切れています", {
  timeout: 15000,
});
const loginLink = page.getByRole("link", { name: "ログイン画面へ" });
await loginLink.click();
await page.waitForURL("**/login**");

console.log("OK expired invite UI → login link");

await page.goto(
  `${base}/auth/set-password?error=access_denied&error_code=otp_expired`,
  { waitUntil: "networkidle" }
);
await page.waitForSelector("text=招待リンクの有効期限が切れています", {
  timeout: 15000,
});
console.log("OK error query shows expired message");

await browser.close();
console.log("smoke-set-password passed");
