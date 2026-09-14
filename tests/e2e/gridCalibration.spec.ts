import { test, expect } from "@playwright/test";
import path from "node:path";

/**
 * キャリブレーション画面の数値入力UXの検証。
 * 「先頭に0が残る」「入力しづらい」という実機での不具合報告を受けて、
 * NumberField（+/-ボタン＋ローカル文字列stateで編集する数値入力）が
 * 期待通り動作することを確認する。
 */
test.describe("グリッド切り出し枠のキャリブレーション", () => {
  test("数値入力で全選択して打ち直しても先頭に0が残らない", async ({ page }) => {
    await page.goto("/#/import");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.resolve(process.cwd(), "public", "icons", "icon-512.png"));

    await page.getByRole("button", { name: "認識開始" }).click();

    const gridTopInput = page.getByLabel("開始位置（Y座標）", { exact: true });
    await expect(gridTopInput).toBeVisible({ timeout: 10_000 });

    // フォーカス時に全選択されるため、そのまま打ち直せば置き換わるはず
    await gridTopInput.click();
    await gridTopInput.pressSequentially("700");
    await expect(gridTopInput).toHaveValue("700");

    // フォーカスを外しても正規化された値のままである
    await page.getByText("行間隔").click();
    await expect(gridTopInput).toHaveValue("700");
  });

  test("バックスペースで空にしてから入力しても先頭0が残らない", async ({ page }) => {
    await page.goto("/#/import");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.resolve(process.cwd(), "public", "icons", "icon-512.png"));
    await page.getByRole("button", { name: "認識開始" }).click();

    const rowPitchInput = page.getByLabel("行間隔", { exact: true });
    await expect(rowPitchInput).toBeVisible({ timeout: 10_000 });

    await rowPitchInput.click();
    await rowPitchInput.press("Control+A");
    await rowPitchInput.press("Backspace");
    await rowPitchInput.pressSequentially("90");
    await expect(rowPitchInput).toHaveValue("90");
    await expect(rowPitchInput).not.toHaveValue("090");
  });

  test("＋／−ボタンで刻み幅どおりに増減する", async ({ page }) => {
    await page.goto("/#/import");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.resolve(process.cwd(), "public", "icons", "icon-512.png"));
    await page.getByRole("button", { name: "認識開始" }).click();

    const cellSizeInput = page.getByLabel("切り出しサイズ（正方形の一辺）", { exact: true });
    await expect(cellSizeInput).toBeVisible({ timeout: 10_000 });
    const before = Number(await cellSizeInput.inputValue());

    await page.getByRole("button", { name: "切り出しサイズ（正方形の一辺）を増やす" }).click();
    await expect(cellSizeInput).toHaveValue(String(before + 5));

    await page.getByRole("button", { name: "切り出しサイズ（正方形の一辺）を減らす" }).click();
    await expect(cellSizeInput).toHaveValue(String(before));
  });
});
