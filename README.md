# TimeMark

Mark In/Out ranges on a video and export each range as a clip, individually or as a single ZIP. All cutting runs in the browser with FFmpeg.wasm, so the video is never uploaded.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

`predev`/`prebuild` copy the FFmpeg runtime from `node_modules` into `public/ffmpeg/` (git-ignored). The first export downloads the ~32 MB wasm core once, and the browser caches it after that.

## Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `I` / `O` | Set In / Out at the playhead |
| `Enter` or `A` | Add the pending range as a segment |
| `←` / `→` | Seek 1 s (`Shift`: 0.1 s) |
| `Esc` | Clear pending In/Out, then deselect |
| `Delete` | Remove the selected segment |
| `M` | Mute |

In timecode fields, `↑`/`↓` nudge by 0.1 s (`Shift`: 1 s, `Alt`: 1 ms). Fields accept `HH:MM:SS.mmm`, `MM:SS.mmm`, or plain seconds. On the timeline, click a segment to select it, then drag its edges to trim.

## Cut modes

- **Lossless** (default): stream copy. It is fast and keeps the original quality, but cuts snap to the previous keyframe, so a clip can start up to one GOP early.
- **Frame-accurate**: re-encodes to H.264/AAC MP4 for exact cut points. Much slower in the browser.

## Structure

```
src/
  app/                      layout, page, theme tokens (globals.css)
  components/               editor shell, player, timeline, transport, segment panel, export dialog
  hooks/use-keyboard-shortcuts.ts
  lib/types.ts              Segment, ExportJob, ...
  lib/time.ts               timecode format/parse
  lib/ffmpeg/cutter.ts      FFmpeg load, WORKERFS mount, cut args
  lib/export-runner.ts      export orchestration, ZIP, downloads
  store/editor-store.ts     Zustand store (playback mirror, markers, segments, job)
scripts/copy-ffmpeg-core.mjs
```

### FFmpeg loading

`@ffmpeg/ffmpeg` creates its worker with `new Worker(new URL(variable, import.meta.url))`. Turbopack can't resolve that statically and fails the build. The class is therefore served from `/ffmpeg/classes.js` and loaded with `import(/* webpackIgnore: true */ ...)`. Only its types are bundled. The single-threaded core is used, so no COOP/COEP headers are needed.

The source file is mounted with WORKERFS rather than copied into wasm memory, so large sources work. Each output clip still has to fit in memory: the practical limit is about 2 GB per clip.
