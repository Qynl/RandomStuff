# Higgsfield — AI-native creative suite (full clone)

A complete, working Higgsfield-style AI video/image platform built with **React + Vite + Tailwind CSS v4 + Framer Motion**. Not a landing page — the whole product, plus extras Higgsfield doesn't have. Fan-made demo; not affiliated with Higgsfield AI. Generation is simulated client-side: a custom **MotionEngine** drives cinematic camera moves over seeded imagery, and finished videos can be exported as **real `.webm` files rendered in your browser** (Canvas + MediaRecorder).

## Real AI generations — the user pays (BYOK)

Flip the **DEMO → LIVE AI** switch (top bar) and connect your own provider keys in **Settings → AI Providers**. From then on, generations are 100% real and run *browser → provider*: **you pay your provider directly** (images from ~$0.003, video from ~$0.15), this app charges nothing, and keys never leave your browser's localStorage.

| Provider | What it powers | Get a key |
|---|---|---|
| **fal.ai** | Real video (Kling 3, Veo 3.1, Hailuo, Seedance, Wan, LTX) + image (FLUX, Nano Banana Pro, Ideogram…) | fal.ai/dashboard/keys |
| **Google Gemini** | The actual Nano Banana / Nano Banana Pro (`gemini-2.5-flash-image`, `gemini-3-pro-image-preview`) + LLM brain | aistudio.google.com/apikey |
| **OpenRouter** | Supercomputer brain, prompt enhancer, image models; shows your real $ usage | openrouter.ai/keys |
| **Custom** | Any OpenAI-compatible endpoint you pay for | — |

Safety rails included: per-generation ~$ estimate *before* you generate, a monthly **spend cap** that blocks overspend, a local spend ledger, endpoint fail-over (if a model moves, the closest real model serves), and provider errors surfaced verbatim (failed fal runs aren't billed). Replicate/OpenAI block browser CORS by design, hence the Custom slot for your own proxy/gateway. Without keys, Demo mode keeps the full simulated studio free forever.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
```

## What's inside

| Area | Features |
|---|---|
| **Explore** | Rotating launch hero (Seedance 2.5 / Genjutsu / Cinema Studio 4.0 / Soul V2), quick-create bar, model marquee, tabbed community masonry feed with hover-play, likes & one-click Remix |
| **Create Video** | 14 models (Seedance 2.5, Kling 4.0, Veo 3.1, Sora 2, Genjutsu, DoP Turbo…), Text/Image/Start+End/Genjutsu modes, 48-move DoP camera library with live previews, effects, aspect/duration/resolution, negative prompt, seed lock, live credit costing |
| **Create Image** | 9 models (Nano Banana Pro, Soul V2, FLUX.2…), 16 style presets, Soul casting, reference uploads, batch ×8, 1K–4K output |
| **Cinema Studio** | Mr. Higgs AI shot breakdown by genre, camera bodies/lenses/focal/aperture/speed ramps, editable storyboard, timeline, sequence player, **multi-shot film export to a single .webm** |
| **Speak** | 12 presenters × 12 voices, emotions, karaoke captions — preview speaks with your **real browser TTS** + animated lip-sync avatar; render queues a talking video |
| **Soul ID** | Train characters from photos (staged training), studio presets, per-Soul generation history, **Face Swap Studio** |
| **Effects** | 60 one-tap effects (Earth Zoom, Bullet Time, Money Rain…) with live hover previews, categories & search |
| **Canvas** | Infinite draggable moodboard: notes, uploads, library assets, zoom — persisted locally |
| **AI Influencer** | UGC ad factory: creator + product + hook generator + A/B variants + live 9:16 ad preview |
| **Supercomputer** | Chat agent that picks models/cameras, enhances prompts, answers pricing questions and **actually renders** into your Library |
| **Library** | Search/filter/sort, grid & list views, favorites, uploads, per-asset player with transport controls, Before/After FX compare, **Upscale 4K**, **Video Extend +5s**, share links, still JPG & real .webm downloads |
| **Pricing** | 5 plans with annual/monthly toggle, top-up packs, working credit calculator, demo checkout that really grants credits |
| **Academy** | 6 courses with lesson player and progress tracking |
| **Platform** | Credit economy with refunds, parallel render queue with staged progress, ⌘K command palette, toasts, auth, settings + API key, full localStorage persistence, mobile bottom nav |

## Architecture

```
src/
  data/catalog.js     models, cameras, effects, voices, plans, community seed data
  lib/engine.js       MotionEngine (48 camera moves), prompt enhancer, Mr. Higgs shot
                      breakdown, credit math, Canvas→WebM video exporter
  store/AppContext    credits, jobs queue, library, souls, toasts — persisted to localStorage
  components/         shell, player, studio controls (model/camera/prompt lab), UI kit
  pages/              14 routed product surfaces
```

Media is seeded from picsum.photos (deterministic per prompt-hash) with portrait avatars from randomuser.me; your own uploads work everywhere and take priority as start frames/references.
