# Mosaic — Visual Context Studio for AI Code

**Stop pasting random files. Ship perfect prompts.**

Mosaic turns any codebase into a **visual map** — treemap + dependency graph — so you can lasso what matters, auto-include imports, and copy token-perfect context for Claude / GPT-4o / Gemini. **100% in your browser. Zero uploads. No signup.**

**→ [Open Mosaic Studio](https://qynl.github.io/RandomStuff/) ←** live, works offline

![Mosaic Studio](https://img.shields.io/badge/Studio-Live-6c5bff?style=for-the-badge) ![Privacy](https://img.shields.io/badge/Privacy-100%25_local-00c950?style=for-the-badge) ![No Signup](https://img.shields.io/badge/No_signup-Yes-232326?style=for-the-badge)

---

## Why this? Why now?

Every dev using AI wastes **~15 minutes per question** manually hunting files, guessing what to paste, hitting "too many tokens," and leaking secrets.

Existing tools are CLIs that dump *everything* into one file. No visuals. Wrong tokens. No dependency awareness. No sharing.

**Mosaic is Figma for context engineering:**
- **See your codebase** — treemap sized by tokens, dependency graph with force physics
- **Select with intent** — click, lasso, or type `“fix auth redirect”` → auto-selects 6 files + their imports
- **Ship perfect prompts** — file map first, model-specific tags (XML for Claude, fenced for GPT), cost & quality meter
- **Stay private** — GitHub fetch via public API or drag-drop a local folder. Audit Network tab: 0 uploads.

Used for: fixing bugs with AI, onboarding to a new repo, code reviews, writing docs, refactoring.

---

## 60-second demo

1. Open the Studio (preloaded with `acme/payments-api` — Next.js + Stripe + Prisma)
2. **Smart select:** type `fix webhook retry` → watches 6 files get selected + their deps
3. Switch **Map → Graph** to see coupling
4. Check **Prompt → Final prompt** and **Diagram** (auto Mermaid)
5. **Copy for Claude** / **Download** / **Share link** (compressed to URL hash)

Paste any public repo: `vercel/next.js`, `supabase/supabase`, `calcom/cal.com` — or drag a local folder (private stays private).

---

## Features that get ⭐

- **Visual canvas** — treemap + dependency graph (drag nodes, lasso, color by folder/lang/tokens)
- **Token-correct** — live counts for Claude 3.5 (200k), GPT-4o (128k), Gemini 1.5 (1M) with model-tuned heuristics + cost estimator
- **Smart select** — natural language → keyword + dependency closure (no API key needed)
- **Secrets scrubbed** — `sk_test_`, `JWT_SECRET`, `AKIA*`, `ghp_` → `***SCRUBBED***` before copy
- **Respects `.gitignore`** — ignores `node_modules`, `.next`, `dist`, locks, images
- **Export everything** — clipboard, file, shareable link, Mermaid diagram → mermaid.live
- **Command palette** — `⌘K` search, `⇧S` smart select, `⇧C` copy
- **Works offline** — one HTML file. Host it yourself.

---

## CLI & GitHub Action & VS Code

**CLI** (same engine, for terminal/CI):
```bash
npx mosaic-context pack ./my-app \
  --query "fix webhook retry" \
  --model claude --max-tokens 120k \
  --scrub --include-imports \
  --out ./context.xml
cat context.xml | claude -p "help"
```

**GitHub Action** — comment prompt-ready summary + diagram on PRs:
```yaml
- uses: mosaic/action@v1
  with:
    query: "summarize this PR for review"
    model: "gpt4o"
    comment: true
```

**VS Code** — Right-click folder → *Copy as Mosaic Prompt*. Status bar shows tokens/cost/quality.

> CLI/Action/Extension are stubs in this repo — Studio is fully functional today. Star to get notified when they ship.

---

## Run locally

No build. One file.

```bash
git clone https://github.com/Qynl/RandomStuff.git
cd RandomStuff
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `index.html`. Self-host by copying that one file to your infra.

---

## How it’s different

| | Mosaic | repomix / gitingest | ChatGPT canvas |
|---|---|---|---|
| **Visual** | Treemap + graph | File tree dump | None |
| **Deps** | Auto-include imports | No | No |
| **Tokens** | Per-model, live | Rough | None |
| **Privacy** | 100% browser | CLI local | Cloud |
| **Share** | URL hash link | File | Chat link |

---

## Roadmap (star to vote)

- [ ] Real tiktoken WASM (exact counts)
- [ ] Local Ollama reranker for smart select
- [ ] Chunk & stitch for >limit repos
- [ ] Dead code & hotspot glow
- [ ] Team presets + curated prompt packs

**If this saves you 10 minutes, star it.** It took one obsessive sitting to build — vanilla HTML/CSS/JS, no frameworks, no tracking.

---

### Easter egg

The previous version of this repo was a sentient anomaly that dreamed at 3:47 AM. It’s still here: [anomaly.html](anomaly.html) — black holes, fractals, and an oracle that knows your next commit.

— Built by [@Qynl](https://github.com/Qynl) • MIT • Not affiliated with GitHub/OpenAI/Anthropic
