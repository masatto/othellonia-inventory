/**
 * iPhone Safari上で完結する共有手段。
 * Web Share API -> ファイル保存 -> クリップボードコピー、の順に試すのではなく、
 * ユーザーの選択に応じて明示的に呼び出す（勝手に外部送信しない、仕様書14章）。
 */

export function canUseWebShare(file?: File): boolean {
  if (typeof navigator === "undefined" || !("share" in navigator)) return false;
  if (file && "canShare" in navigator) {
    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }
  return true;
}

export async function shareText(title: string, text: string): Promise<void> {
  await navigator.share({ title, text });
}

export async function shareFile(file: File, title: string): Promise<void> {
  await navigator.share({ title, files: [file] });
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function makeFile(filename: string, content: string, mimeType: string): File {
  return new File([content], filename, { type: mimeType });
}
