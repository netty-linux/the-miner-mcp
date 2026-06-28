import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "logo-mcp.png");
const OUT_DIR = join(ROOT, "public");

const SIZES = [48, 128, 256] as const;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  for (const size of SIZES) {
    const out = join(OUT_DIR, `icon-${size}.png`);
    await sharp(SOURCE)
      .resize(size, size, { fit: "cover", position: "centre" })
      .png({ compressionLevel: 9, quality: 90 })
      .toFile(out);
    console.log(`wrote ${out}`);
  }

  const favicon = join(OUT_DIR, "favicon.png");
  await sharp(SOURCE)
    .resize(32, 32, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toFile(favicon);
  console.log(`wrote ${favicon}`);

  const icon128 = await sharp(join(OUT_DIR, "icon-128.png")).toBuffer();
  const dataUri = `data:image/png;base64,${icon128.toString("base64")}`;
  await writeFile(join(OUT_DIR, "icon-data-uri.txt"), dataUri, "utf8");
  console.log(`data URI length: ${dataUri.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});