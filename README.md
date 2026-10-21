# Project Size Analyzer

A web app that analyzes a GitHub repository or local folder and shows its **size, complexity, structure, language mix, quality metrics, dependencies, and commit history** at a glance.

Runs on Node.js only, with **no external dependencies** (no `npm install` needed).

## Running

```bash
npm start
```

Then open http://localhost:4580 in your browser. To change the port, set the `PORT` environment variable.

Requires Node.js 18+ and `git`, which is used for GitHub analysis and history.

## GitHub Pages (static demo)

The site published on GitHub Pages has no server, so only the **Folder picker (browser)** mode works there — files are analyzed locally in your browser and never uploaded. GitHub repository and local path analysis require running the server locally (`npm start`).

Deployment is handled by `.github/workflows/pages.yml`, which bundles `public/` and `shared/` into a static site on every push to `main`. In the repo settings, set **Pages → Source** to **GitHub Actions**.

## Analysis targets

| Mode | Description |
| --- | --- |
| **GitHub repository** | Accepts `owner/repo`, `https://github.com/owner/repo`, `.../tree/<branch>`, or any https git URL. Clones into a temp folder, analyzes, then deletes it. |
| **Local path** | Analyzes a folder on the PC where the server runs. For Git repos it applies `.gitignore` rules (`git ls-files`) and analyzes history too. |
| **Folder picker (browser)** | Drag & drop or pick a folder. Files are not uploaded; they are analyzed in a Web Worker inside the browser (no history). |

You can also run an analysis directly from a URL: `http://localhost:4580/?repo=vuejs/core`, `?repo=owner/repo&branch=dev`, `?path=C:\my\project`

## Features (12 tabs)

- **Overview**: code/comment/blank lines, files, size, size grade (XS–XXL), complexity index, **code health (A–F)**, project summary, language bar, category breakdown, top-level folders, COCOMO and Halstead estimates
- **Insights**: auto-generated findings (Risk / Warning / Info / Good) with **recommended actions**, a written project profile, health scores by area (maintainability, function complexity, duplication, tests, documentation, hygiene, activity)
- **Languages**: share of ~90 languages by code lines, bytes, or file count; comment ratio and branch count per language; distribution by extension
- **Structure**: drill-down treemap, **per-module (top-level folder) comparison** (complexity, MI, tests, duplication), file length and folder depth distributions, crowded folders, directory tree
- **Complexity**: approximate cyclomatic complexity, branch density, nesting depth, distribution, most complex and most deeply nested files
- **Functions**: per-function complexity, length and parameter count; McCabe risk levels; length/parameter distributions; most complex, longest, and most-parameter functions (source code only)
- **Maintainability · duplication**: Halstead metrics (volume, difficulty, effort, estimated defects), **Maintainability Index** distribution and lowest-scoring files, **copy-paste blocks** (6+ identical consecutive lines) and duplication rate
- **Quality**: comment ratio, test code ratio, TODO/FIXME list, identical files, lines over 120 characters, longest and largest files, generated/minified files
- **Tech stack · dependencies**: detects about 150 frameworks, build tools, test tools, linters, CI/CD, infrastructure and game engines (with evidence), a 15-item **project hygiene checklist**, and dependencies parsed from 13 manifest formats
- **History**: commits, contributors, **bus factor** (by commits and by file ownership), recent activity, longest gap, commit habits (weekends/nights, Conventional Commits), **commit type classification**, yearly trend and new contributors, heatmap, contributor timeline, **hotspots**, **code ownership by folder**, **knowledge silos**, **temporal coupling** (files that change together)
- **Files**: searchable, filterable, sortable table of all files (including MI and duplicate lines)
- **Metric reference**: how every metric is calculated, how to interpret it, and its limitations. Each card also has a `?` tooltip with a short explanation.
- **Export**: Markdown report (including health, findings, functions, maintainability, and tech stack), raw JSON
- Dark/light theme, recent analysis list

## Options

- **Exclude rules**: `node_modules`, `dist`, `build`, Unity's `Library`/`Temp`, etc. are excluded by default. Supports folder/file names and globs (`*.min.js`, `docs/**`).
- **Follow .gitignore**: for Git repos, only analyzes files Git tracks (or would track).
- **Commit history**: GitHub repos are cloned with `--filter=blob:none` when enabled and `--depth 1` when disabled, which is faster.
- **Max file size**: files larger than this are counted only by size, not line count. Default 2MB.
- For private repos or to avoid the GitHub API rate limit, set the `GITHUB_TOKEN` environment variable. The clone itself uses git's credential settings.

## Structure

```
server.js            HTTP server (static files + /api/analyze NDJSON streaming)
lib/scan.js          Folder walking and file reading
lib/git.js           Clone, ls-files, commit history analysis
shared/analyzer.js   Analysis engine (shared by the server and the browser Worker)
shared/stack.js      Tech stack detection and hygiene checks
shared/insights.js   Health score, findings, and summary text
shared/languages.js  Language definitions (extensions, comment syntax, complexity rules)
shared/ignore.js     Exclude rules
public/js/help.js    Metric explanations (tooltips, metric reference tab)
public/              Frontend (vanilla JS, SVG charts)
```

## Notes

- Complexity, function counts, and nesting are **heuristic estimates** based on keywords and braces/indentation, not a real parser.
- The server listens only on `127.0.0.1` and rejects requests whose Host header isn't localhost.
