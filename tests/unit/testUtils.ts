/** テスト用の最小限 ImageData 相当オブジェクトを生成する（ブラウザのImageData実装に依存しない） */
export function makeImageData(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as unknown as ImageData;
}

export function solidColorImage(width: number, height: number, r: number, g: number, b: number): ImageData {
  return makeImageData(width, height, () => [r, g, b, 255]);
}
