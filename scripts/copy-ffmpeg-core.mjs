/**
 * Copies the FFmpeg WebAssembly runtime from node_modules into `public/ffmpeg`
 * so it is served from our own origin, with versions locked by
 * package-lock.json and no runtime dependency on a third-party CDN.
 *
 * Two pieces are copied:
 * - `@ffmpeg/core` (single-threaded ESM build): ffmpeg-core.js + .wasm.
 *   Single-threaded means no SharedArrayBuffer, so no COOP/COEP headers.
 * - The `@ffmpeg/ffmpeg` browser runtime (FFmpeg class, its worker, and
 *   shared modules). The app imports it at runtime with `webpackIgnore`,
 *   because bundlers can't statically resolve its
 *   `new Worker(new URL(variable, import.meta.url))` call. Served as plain
 *   static modules, the worker resolves next to classes.js on its own.
 *
 * Runs automatically via the `predev` and `prebuild` npm scripts.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nodeModules = path.join(process.cwd(), "node_modules");
const outDir = path.join(process.cwd(), "public", "ffmpeg");

// `@ffmpeg/core` only exports its entry files, so resolve the ESM entry and
// use its directory.
const coreDir = path.dirname(fileURLToPath(import.meta.resolve("@ffmpeg/core")));
// `@ffmpeg/ffmpeg` resolves to a server stub under Node conditions, so point
// at its browser ESM folder directly.
const classDir = path.join(nodeModules, "@ffmpeg", "ffmpeg", "dist", "esm");

const copies = [
  [coreDir, "ffmpeg-core.js"],
  [coreDir, "ffmpeg-core.wasm"],
  // FFmpeg class (entry), its worker, and their shared modules.
  [classDir, "classes.js"],
  [classDir, "worker.js"],
  [classDir, "utils.js"],
  [classDir, "const.js"],
  [classDir, "errors.js"],
];

await mkdir(outDir, { recursive: true });

for (const [dir, file] of copies) {
  const src = path.join(dir, file);
  const dest = path.join(outDir, file);

  // Skip when the destination is already up to date.
  const [srcStat, destStat] = await Promise.all([stat(src), stat(dest).catch(() => null)]);
  if (destStat && destStat.size === srcStat.size && destStat.mtimeMs >= srcStat.mtimeMs) {
    continue;
  }

  await copyFile(src, dest);
  console.log(`[ffmpeg] copied ${file} -> public/ffmpeg/`);
}
