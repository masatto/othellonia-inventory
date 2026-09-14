import { toGrayscale, pHash } from "./imageHash";

/** 画像全体の概略ハッシュ。同一画像の重複取り込み検知に使う（仕様書「同じ画像の再登録警告」）。 */
export async function computeFullImageHash(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { resizeWidth: 64, resizeHeight: 64, resizeQuality: "low" });
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, 64, 64);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, 64, 64);
  return pHash(toGrayscale(imageData));
}
