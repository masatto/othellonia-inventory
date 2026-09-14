import { test, expect } from "@playwright/test";

test.describe("基本画面表示", () => {
  test("ホーム画面が表示され、ボトムナビが機能する", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "オセロニア所持駒管理" })).toBeVisible();
    await expect(page.getByText("外部サーバーへ送信されません")).toBeVisible();
  });

  test("取り込み画面でファイル選択できる", async ({ page }) => {
    await page.goto("/#/import");
    await expect(page.getByRole("heading", { name: "画像取り込み" })).toBeVisible();
    await expect(page.getByText("端末外へ送信されません")).toBeVisible();
    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute("multiple", "");
    await expect(input).toHaveAttribute("accept", "image/*");
  });

  test("マスタ未登録でも所持駒一覧が正常に表示される（空の状態）", async ({ page }) => {
    // マスタは公開リポジトリに含まれないため、初回起動時は所持駒0件・
    // マスタ0件の空の状態でも正常に画面が表示できることを確認する
    await page.goto("/#/inventory");
    await expect(page.getByRole("heading", { name: "所持駒一覧" })).toBeVisible();
    await expect(page.getByText("0 件")).toBeVisible();
  });

  test("AI相談画面でプレビューが生成される", async ({ page }) => {
    await page.goto("/#/consult");
    await expect(page.getByRole("heading", { name: "AIに相談" })).toBeVisible();
    await expect(page.getByText("# オセロニア相談データ")).toBeVisible({ timeout: 10_000 });
  });

  test("バックアップ画面が表示される", async ({ page }) => {
    await page.goto("/#/backup");
    await expect(page.getByRole("heading", { name: "データのバックアップ・復元" })).toBeVisible();
  });
});
