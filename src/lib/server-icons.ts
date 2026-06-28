import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../config/env.js";

export function buildServerIcons(): NonNullable<Implementation["icons"]> {
  const base = env.publicBaseUrl;
  const icons: NonNullable<Implementation["icons"]> = [
    {
      src: `${base}/icon-48.png`,
      mimeType: "image/png",
      sizes: ["48x48"],
    },
    {
      src: `${base}/icon-128.png`,
      mimeType: "image/png",
      sizes: ["128x128"],
    },
    {
      src: `${base}/icon-256.png`,
      mimeType: "image/png",
      sizes: ["256x256"],
    },
    {
      src: `${base}/favicon.png`,
      mimeType: "image/png",
      sizes: ["32x32"],
    },
  ];

  const dataUriPath = join(process.cwd(), "public", "icon-data-uri.txt");
  if (existsSync(dataUriPath)) {
    const dataUri = readFileSync(dataUriPath, "utf8").trim();
    if (dataUri.startsWith("data:image/")) {
      icons.unshift({
        src: dataUri,
        mimeType: "image/png",
        sizes: ["128x128"],
      });
    }
  }

  return icons;
}