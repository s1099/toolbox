# Toolbox

Small, private tools that run entirely in your browser. Files never leave your
device: models are downloaded once from Hugging Face, cached, and run locally
with WebGPU (or WebAssembly as a fallback).

**[Open Toolbox →](https://s1099.github.io/toolbox/)**

## Tools

| Tool | What it does | Runs on |
| --- | --- | --- |
| **OCR** | Extract text from screenshots, photos and scans | [PP-OCRv6](https://huggingface.co/PaddlePaddle) on ONNX Runtime Web |
| **Remove background** | Cut the subject out of a photo as a transparent PNG | [RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) on Transformers.js |
| **Transcript** | Turn recordings and audio/video files into text | [Whisper](https://huggingface.co/onnx-community/whisper-tiny) on Transformers.js |

### Remove background

- Drag the before/after slider to compare with the original
- Download as a transparent PNG, or flattened onto white, black or any colour
- Output keeps the original resolution

| WebGPU (f16) | WebGPU | CPU (WASM) |
| --- | --- | --- |
| 88 MB | 176 MB | 44 MB |

### Transcript

- Upload audio/video or record from your mic
- Auto-detects the language; word-by-word playback with clickable timestamps
- Export to `.txt`, `.srt` or `.vtt`

| Model | WebGPU | CPU (WASM) |
| --- | --- | --- |
| Whisper Tiny (default) | 122 MB | 44 MB |
| Whisper Base | 209 MB | 80 MB |
| Whisper Small | 589 MB | 252 MB |

## Browser support

Any recent Chromium, Firefox or Safari works. WebGPU (Chrome/Edge 113+,
Safari 26+) is much faster for the larger models; without it everything runs
on the CPU through WebAssembly. Recording needs microphone permission.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, static export) with React 19
  and the React Compiler
- [Tailwind CSS 4](https://tailwindcss.com),
  [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com), and
  [Hugeicons](https://hugeicons.com)
- [ElevenLabs UI](https://ui.elevenlabs.io) for the waveform, mic picker,
  voice button and transcript viewer
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) and
  [Transformers.js](https://huggingface.co/docs/transformers.js) for inference
- [Bun](https://bun.sh) and [Ultracite](https://www.ultracite.ai)
  ([Biome](https://biomejs.dev)) for tooling

## Getting started

Requires [Bun](https://bun.sh) 1.3 or newer.

```bash
git clone https://github.com/s1099/toolbox.git
cd toolbox
bun install
bun dev
```

Then open <http://localhost:3000/toolbox>. The app is served under the
`/toolbox` base path so it matches GitHub Pages.

### Scripts

| Command | Description |
| --- | --- |
| `bun dev` | Start the dev server |
| `bun run build` | Build the static site into `out/` |
| `bun run check` | Lint and format-check with Ultracite |
| `bun run fix` | Auto-fix lint and formatting issues |

## Project structure

```text
src/
├── app/
│   ├── page.tsx                     # Home: every tool as a card
│   ├── image/ocr/                   # OCR tool
│   ├── image/remove-background/     # Remove background tool
│   ├── audio/transcript/            # Transcript tool
│   └── storybook/                   # Component showcase
├── components/
│   ├── app-sidebar.tsx              # Sidebar, built from lib/nav.ts
│   └── ui/                          # shadcn/ui and ElevenLabs UI components
├── hooks/
└── lib/
    ├── nav.ts                       # Tool registry (sidebar, home page, search)
    ├── ocr.ts                       # PP-OCR pipeline on ONNX Runtime Web
    ├── remove-background.ts         # RMBG-1.4 worker protocol and entry point
    ├── remove-background.worker.ts  # RMBG-1.4 inference in a Web Worker
    ├── transcribe.ts                # Whisper models, audio decoding, exports
    └── transcribe.worker.ts         # Whisper inference in a Web Worker
```

## Adding a tool

1. Create a page under `src/app/<category>/<tool>/page.tsx`.
2. Register it in `src/lib/nav.ts` with a name, icon, route and one-line
   description. The sidebar, home page and search pick it up from there.
3. Keep heavy work off the main thread (a Web Worker, or a lazily imported
   module) and load models on demand, so opening the tool stays instant.

UI conventions (tokens, depth, spacing) are documented in
[`DESIGN.md`](DESIGN.md), and there's a live component showcase at
`/storybook`.
