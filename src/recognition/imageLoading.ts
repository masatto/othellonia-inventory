/** iPhone Safariのメモリ制限を考慮し、長辺をこの値までに縮小してから処理する */
export const MAX_IMAGE_DIMENSION = 1600;

/**
 * 画像を読み込み、長辺がMAX_IMAGE_DIMENSIONを超える場合は縮小する。
 * 認識処理（pipeline.ts）とキャリブレーション画面（GridOverlayCalibrator）の両方で
 * 必ず同じ関数を使うこと。片方だけ縮小すると、キャリブレーションした座標と
 * 実際の認識時の座標がズレてしまう。
 */
export async function loadDownscaledBitmap(file: File): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1) return bitmap;
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: "medium",
  });
  bitmap.close();
  return resized;
}
