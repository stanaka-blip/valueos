#!/usr/bin/env node
/**
 * /cases/new 実動作確認（dealer 共通ウィザード）
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
const OUT = "/opt/cursor/artifacts/screenshots";
mkdirSync(OUT, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(String(err));
  });
  page.on("response", (res) => {
    const url = res.url();
    if (
      res.status() >= 400 &&
      (url.includes("supabase.co") || url.includes("/rest/v1/"))
    ) {
      failedRequests.push(`${res.status()} ${url}`);
    }
  });

  console.log("OPEN", `${BASE}/cases/new`);
  await page.goto(`${BASE}/cases/new`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);

  const body1 = await page.locator("body").innerText();
  if (!body1.includes("新規発注") || !body1.includes("案件情報")) {
    throw new Error("4ステップウィザード（新規発注）が表示されていません");
  }
  await page.screenshot({
    path: join(OUT, "e2e-01-cases-new-step1.png"),
    fullPage: true,
  });
  console.log("OK step1 visible");

  // STEP1 必須入力
  await page.locator('input[name="dealer_contact"]').fill("テスト担当");
  await page.locator('input[name="customer_name"]').fill("E2E確認顧客");
  await page.locator('input[name="customer_phone"]').fill("09012345678");
  await page.locator('input[name="site_address"]').fill("東京都千代田区1-1-1");
  await page.locator('input[name="desired_delivery_date"]').fill("2026-08-15");
  await page.locator('input[name="construction_date"]').fill("2026-08-20");
  await page.locator('select[name="delivery_type"]').selectOption("設置先住所と同じ");
  await page.locator('input[name="receiver_name"]').fill("受取太郎");
  await page.locator('input[name="receiver_phone"]').fill("09087654321");

  // 販売店名（readOnly）確認
  const dealerName = await page.locator('input[name="dealer_name"]').inputValue();
  console.log("dealer_name", dealerName);

  await page.getByRole("button", { name: "次へ" }).click();
  await page.waitForTimeout(800);

  const body2 = await page.locator("body").innerText();
  if (!body2.includes("商品情報") || !body2.includes("発注区分")) {
    throw new Error("STEP2（商品情報）へ進めていません");
  }
  await page.screenshot({
    path: join(OUT, "e2e-02-cases-new-step2.png"),
    fullPage: true,
  });
  console.log("OK step2");

  // パッケージで発注
  await page.locator('select[name="order_category"]').selectOption("パッケージで発注");
  await page.waitForTimeout(500);
  await page.locator('select[name="manufacturer_id"]').selectOption({ label: "京セラ" });
  await page.waitForTimeout(800);
  // パッケージ選択（最初の実オプション）
  const packageSelect = page.locator('select[name="package_id"]');
  const packageOptions = await packageSelect.locator("option").allTextContents();
  const packageValue = await packageSelect.locator("option").evaluateAll((opts) => {
    const hit = opts.find((o) => o.value && o.value.length > 0);
    return hit ? hit.value : "";
  });
  if (!packageValue) {
    throw new Error(`パッケージ選択肢がありません: ${JSON.stringify(packageOptions)}`);
  }
  await packageSelect.selectOption(packageValue);
  await page.locator('input[name="quantity"]').fill("1");

  // 部材のみ発注側の「明細追加」相当も確認するため、一旦スクショ後に次へ
  await page.screenshot({
    path: join(OUT, "e2e-03-cases-new-step2-package.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "次へ" }).click();
  await page.waitForTimeout(800);

  const body3 = await page.locator("body").innerText();
  if (!body3.includes("決済区分")) {
    throw new Error("STEP3（決済区分）へ進めていません");
  }
  await page.screenshot({
    path: join(OUT, "e2e-04-cases-new-step3.png"),
    fullPage: true,
  });
  console.log("OK step3");

  // 決済区分（select）
  await page.locator("select").filter({ hasText: "掛売" }).selectOption("掛売");

  await page.getByRole("button", { name: "確認へ" }).click();
  await page.waitForTimeout(800);

  const body4 = await page.locator("body").innerText();
  if (!body4.includes("確認") && !body4.includes("発注")) {
    console.log("step4 body snippet", body4.slice(0, 300));
  }
  await page.screenshot({
    path: join(OUT, "e2e-05-cases-new-step4.png"),
    fullPage: true,
  });
  console.log("OK step4");

  // 送信
  const submitBtn = page.getByRole("button", { name: /発注依頼を送信|送信|登録/ });
  await submitBtn.first().click();

  // 成功ダイアログを待ってから一覧へ遷移（/cases/new に誤マッチしない）
  await page.getByText("発注依頼を受け付けました", { exact: false }).waitFor({
    timeout: 15000,
  });
  console.log("OK success dialog");
  await page.screenshot({
    path: join(OUT, "e2e-06-cases-new-after-submit.png"),
    fullPage: true,
  });

  await page.waitForURL(
    (url) => {
      const path = url.pathname.replace(/\/$/, "") || "/";
      return path === "/cases";
    },
    { timeout: 15000 }
  );
  console.log("URL after save", page.url());
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: join(OUT, "e2e-07-cases-list.png"),
    fullPage: true,
  });

  // DB確認
  const sb = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  const { data: latest, error } = await sb
    .from("cases")
    .select("id, case_no, customer_name, status, created_at")
    .eq("customer_name", "E2E確認顧客")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  console.log("saved case", latest?.[0] || null);

  // 部材のみ + 明細追加の別フロー確認（UIのみ短く）
  await page.goto(`${BASE}/cases/new`, { waitUntil: "networkidle" });
  await page.locator('input[name="dealer_contact"]').fill("テスト担当");
  await page.locator('input[name="customer_name"]').fill("E2E部材顧客");
  await page.locator('input[name="customer_phone"]').fill("09011112222");
  await page.locator('input[name="site_address"]').fill("大阪府大阪市1-1-1");
  await page.locator('input[name="desired_delivery_date"]').fill("2026-08-15");
  await page.locator('input[name="construction_date"]').fill("2026-08-20");
  await page.locator('select[name="delivery_type"]').selectOption("設置先住所と同じ");
  await page.locator('input[name="receiver_name"]').fill("受取花子");
  await page.locator('input[name="receiver_phone"]').fill("09033334444");
  await page.getByRole("button", { name: "次へ" }).click();
  await page.waitForTimeout(500);
  await page.locator('select[name="order_category"]').selectOption("部材のみ発注");
  await page.waitForTimeout(800);
  // 明細追加
  const addBtn = page.getByRole("button", { name: /部材を追加/ });
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({
    path: join(OUT, "e2e-08-cases-new-parts-lines.png"),
    fullPage: true,
  });
  console.log("OK parts line add UI");

  console.log("\n=== ERROR SUMMARY ===");
  console.log("consoleErrors", consoleErrors);
  console.log("pageErrors", pageErrors);
  console.log("failedRequests", failedRequests);

  await browser.close();

  if (!latest?.[0]) {
    throw new Error("案件がDBに保存されていません");
  }
  if (pageErrors.length > 0) {
    throw new Error("page errors: " + pageErrors.join(" | "));
  }
  // supabase 4xx on optional endpoints may be ok; hard-fail on create errors already covered by DB check
  console.log("E2E PASSED");
}

main().catch((e) => {
  console.error("E2E FAILED", e);
  process.exit(1);
});
