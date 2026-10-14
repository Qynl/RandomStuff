# RandomStuff

A scratch repository for small, self-contained projects. Each one lives in its own folder, builds from its own `package.json`, and is documented in its own README.

## Projects

| Folder | What it is |
|---|---|
| [`games/last-brain-standing`](games/last-brain-standing) | A top-down arena combat game (React + TypeScript + Canvas) where three opponent profiles make genuinely different decisions, every hostile shot is telegraphed, and runs are reproducible from a seed. |

## Running a project

```bash
cd games/last-brain-standing
npm install
npm run dev      # open the printed URL
npm test         # regression tests
npm run build    # production bundle
```

Each project keeps its toolchain local to its folder; nothing here needs a shared root install or a backend service.
