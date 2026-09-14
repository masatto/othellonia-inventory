#!/usr/bin/env node
/**
 * アプリ独自のPWAアイコンを生成する（攻略サイトの画像は一切使用しない）。
 * public/icons/source.svg を元に各サイズのPNGを書き出す。
 */
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "..", "public", "icons");
mkdirSync(ICONS_DIR, { recursive: true });

const svg = readFileSync(join(ICONS_DIR, "source.svg"));

const targets = [
  { name: "icon-192.png", size: 192, padding: 0 },
  { name: "icon-512.png", size: 512, padding: 0 },
  { name: "icon-512-maskable.png", size: 512, padding: 64 }, // maskableは安全マージンを持たせる
  { name: "apple-touch-icon.png", size: 180, padding: 0 },
];

for (const t of targets) {
  const inner = t.size - t.padding * 2;
  const resized = await sharp(svg).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: t.size, height: t.size, channels: 4, background: "#5b5bd6" },
  })
    .composite([{ input: resized, left: t.padding, top: t.padding }])
    .png()
    .toFile(join(ICONS_DIR, t.name));
  console.log(`wrote ${t.name}`);
}
