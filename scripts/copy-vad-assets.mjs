// Copies the VAD worklet/model and onnxruntime-web WASM binaries into
// public/vad so they can be self-hosted (no runtime CDN dependency).
// Runs automatically via the "postinstall" npm script.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(root, "public", "vad");
mkdirSync(destDir, { recursive: true });

const files = [
  ["@ricky0123/vad-web/dist/vad.worklet.bundle.min.js", "vad.worklet.bundle.min.js"],
  ["@ricky0123/vad-web/dist/silero_vad_legacy.onnx", "silero_vad_legacy.onnx"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.wasm"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.mjs"],
];

for (const [src, destName] of files) {
  const srcPath = join(root, "node_modules", src);
  if (!existsSync(srcPath)) {
    console.warn(`[copy-vad-assets] missing ${srcPath}, skipping`);
    continue;
  }
  copyFileSync(srcPath, join(destDir, destName));
}

console.log("[copy-vad-assets] VAD assets copied to public/vad");
