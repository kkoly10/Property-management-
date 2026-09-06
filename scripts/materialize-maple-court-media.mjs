import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const mediaDir = join(root, "public", "media", "maple-court");
const names = ["exterior", "lobby", "courtyard", "model-home"];

await mkdir(mediaDir, { recursive: true });

for (const name of names) {
  const source = join(mediaDir, `${name}.webp`);
  const target = join(mediaDir, `${name}.jpg`);

  await sharp(source)
    .resize(1440, 810, {
      fit: "cover",
      position: "centre",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .jpeg({
      quality: 84,
      progressive: false,
      chromaSubsampling: "4:2:0",
      mozjpeg: true,
    })
    .toFile(target);
}

console.log("Maple Court JPEG compatibility media materialized.");
