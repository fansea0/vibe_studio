---
name: project-showcase-page
description: Reads a local source project the user points at (e.g. `/Users/.../pingdou`), infers product metadata from the README/code (type, icon, status, completion%), creates a product record in Vibe Studio's SQLite via `POST /api/products`, and writes a real (not placeholder) showcase HTML page rendered into a sandboxed iframe. Use when the user says "为这个项目写个 showcase 页面", "帮我建一个作品集页 for X", "把 pingdou 加到 Vibe Studio", or asks to turn an existing repo into a portfolio entry. Do NOT use this for docs/docstrings/screenshots-only requests, or for projects the user wants described in writing only — those don't need a product row or HTML page.
---

# project-showcase-page

## What this does

Given a path to a local source project (e.g. `/Users/Shared/lab_project/pingdou`), this skill:

1. Reads the project source (README, package.json, src/) to understand what it is
2. Infers product metadata (name, description, icon, type, status, completion percent) from real evidence — **never invents features**
3. Creates a product record in Vibe Studio's SQLite database using the local API
4. Writes `data/products/<product-id>/showcase.html` — a 500-700 line self-contained HTML page with the project's real features, not Lorem-Ipsum placeholders
5. Configures `showcasePagePath` and `isPublic=true` so the page is reachable at `/showcase/<id>` and shows up in `/showcase`
6. Adds a showcase quick-jump button to the workbench product detail header (already shipped in the current build)

**Constraints baked into the workflow:**
- Never touches `data/vibe-studio.sqlite` directly via shell `rm` — always goes through the HTTP API
- Never deletes a previous showcase HTML unless the user asks
- Handles duplicate product names by **stopping and asking** the user
- The `showcasePagePath` must equal `data/products/<product-id>/showcase.html` — the route rejects paths outside this prefix

## When to use

Trigger when the user says:
- "为这个项目写个 showcase 页面"
- "帮我建一个作品集页 for X" (where X is a local repo path)
- "把 pingdou（或其他项目名）加到 Vibe Studio"
- "这个项目能加到作品集吗"
- Any phrasing that names a local directory and asks for a portfolio/showcase entry

Do **NOT** trigger for:
- Requests to write documentation or READMEs only
- Requests to describe a project verbally in conversation
- Requests about a project the user hasn't pointed at (no path)

## Workflow

### Step 1 — Locate and read the project

The user provides a path (e.g. `/Users/Shared/lab_project/pingdou`). Verify the path exists. Then read:
- `README.md` (most important — usually has features, tech stack, motivation)
- `package.json` (name, version, scripts, dependencies tell you type and stack)
- Source layout (`src/`, `index.html`, top-level files) for one more confirmation

If `README.md` is missing or empty, look at `package.json` description field and the main entry file.

### Step 2 — Infer product metadata

Build a metadata object from real evidence. **No invented features.** Use this table:

| Field            | Source                                                              | Example (pingdou)                                       |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| `name`           | `package.json` `name` field; fall back to directory basename        | `拼豆图生成器` (from `name: "pingdou"` + README title)  |
| `description`    | First paragraph of README (trim to ~1-2 sentences)                  | "将任意图片转为 MARD 拼豆图的高清色块图..."               |
| `productType`    | Infer from runtime: web-app / mobile-app / desktop-app / game / cli / library | `web-app` (has `vite`, browser-target)                  |
| `icon`           | Pick an emoji that visually fits; never invent if obvious           | `🧩` (beads/jigsaw fits "拼豆")                         |
| `status`         | `beta` if there's a published version but UI is rough; `released` if project ships a stable public version; `developing` otherwise. Default to `developing` if unclear. | `beta`                                  |
| `completionPercent` | Estimate from README signals (e.g. mentions TODOs = low, calls itself MVP = mid, "stable release" = high). **Always round to a multiple of 5**. Default `50` if no signal. | `90` (mentions Playwright E2E, WebGL2 path ready) |
| `repositoryPath` | The absolute path the user provided                                 | `/Users/Shared/lab_project/pingdou`                     |
| `userCount`      | **0 unless the user provides a number.** Do not invent.             | `0`                                                       |
| `appUrl`         | Empty unless the user explicitly gives a URL.                        | `""`                                                      |
| `isPublic`       | `true` (the whole point of this skill)                              | `true`                                                    |
| `showcasePagePath` | `data/products/<new-id>/showcase.html` (filled in after Step 4)  | set after step 4                                          |

### Step 3 — Create the product via API

**Check first:** does a product with this `name` already exist? If yes, **stop and ask** the user — they may want to update or skip.

**Then**, with the dev server already running (Vibe Studio's Vite plugin serves on port 5173 — use `--port 5180 --strictPort` if 5173 is taken by pingdou itself):

```bash
curl -fsS -X POST http://localhost:5180/api/products \
  -H "content-type: application/json" \
  -d '{ ...all fields from above, with: name, description, productType, icon, status, completionPercent, userCount (0), userCountSource "", appUrl "", repositoryPath, isPublic false, showcasePagePath "" }'
```

Capture the returned `id`. Save it.

> **Note:** `isPublic` and `showcasePagePath` are initially empty / false so that if something goes wrong later, the incomplete entry doesn't show up in `/showcase`. We PATCH them at the end.

### Step 4 — Write the showcase HTML page

Create `data/products/<id>/showcase.html` (create the directory first).

Size target: **500–700 lines**. The page is **fully self-contained** (no external images, fonts, or CDN refs — works offline in any iframe sandbox). Only data sources:
- HTML/CSS/JS inline
- `postMessage` from the parent page (`type: 'vibe-studio:showcase-data'`, carries product data)
- (optional) Google Fonts / CDN — **avoid unless absolutely needed**, since the iframe may be cross-origin loaded

**Required sections** (any order, all mandatory):

1. **Hero** — emoji icon (or CSS-illustrated), product name, 1-2 sentence tagline that names 2-3 REAL features from README, status pill (driven by `product.status`), version chip (driven by `product.currentVersion`), CTA button
2. **How it works** — 3-5 numbered steps describing the actual user flow. **Every step must reference a real feature** (don't write generic "upload your file" — write "上传一张照片" + what happens next that the codebase actually does)
3. **Feature grid** (5-8 cards) — each card has one concrete feature with one sentence describing what it does and why it matters
4. **Privacy / architecture / honesty section** — this is where indie-hacker trust lives. Examples depending on project:
   - If it runs locally: "你的数据不出本机" + tech detail
   - If it's offline-first: explain why and how
   - If it has heavy server costs: explain why that matters
   - Skip this section if the project genuinely is server-dependent
5. **Tech stack pills** — every dependency mentioned in `package.json` that matters; with a colored dot per tech
6. **CTA banner** at bottom repeating the primary action

**Code structure for showcase HTML:**
- Inline `<style>` with CSS custom properties (`--bg`, `--accent`, etc.) and one color scheme
- Hero illustration is **pure CSS** (CSS gradients / shapes / box-shadows) — do NOT reference external image URLs
- Pure JavaScript at bottom that listens for `vibe-studio:showcase-data` and updates DOM
- An `escapeHtml(s)` helper for any user-controlled string used in innerHTML
- "Open app" CTA uses `parent.postMessage({ type: 'vibe-studio:open-url', url: product.appUrl }, '*')` — only when `product.appUrl` is truthy; otherwise hide the button
- Tailwind, React, or any framework inside the iframe — **absolutely not.** Plain HTML+CSS+JS only. The iframe sandbox (`allow-scripts` only, no `allow-same-origin`) means loading external modules/CDNs may be blocked.

**Pattern for escaping user-controlled data:**
```js
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

### Step 5 — Wire it up

PATCH the just-created product:
```bash
curl -fsS -X PATCH http://localhost:5180/api/products/<id> \
  -H "content-type: application/json" \
  -d '{"expectedUpdatedAt":"<from step 3 response>","isPublic":true,"showcasePagePath":"data/products/<id>/showcase.html"}'
```

### Step 6 — Verify

```bash
curl -fsS http://localhost:5180/api/showcase/products/<id> | head -c 400  # confirm public
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:5180/api/showcase/pages/<id>  # confirm HTML serves
```

Both must return 200. If the pages endpoint returns 404, the path is wrong — re-check `data/products/<id>/showcase.html` exists on disk and the product's `showcasePagePath` exactly matches.

### Step 7 — Report to user

Tell the user: "Done. Visit `http://localhost:5180/showcase/<id>` to see it. The '查看作品集页' button appears on the workbench product page too."

## What NOT to do

- Don't `rm -f data/vibe-studio.sqlite` for any reason — user data is in there
- Don't write `runCommand` instructions that destroy DB state
- Don't fill in features you can't verify from README / package.json / src — write a generic placeholder, not a fabrication
- Don't include a play/app-store rating, user count, or testimonials — invent nothing
- Don't load any external resource (images, fonts, scripts) in the showcase HTML — iframe sandbox will block
- Don't add a "TODO" or "fixme" placeholder to the showcase page; it ships as-is
- Don't change the seed block in `src/server/sqlite.ts` unless the user asks

## Appendix: where things live in this project

| What                  | Where                                              |
| --------------------- | -------------------------------------------------- |
| Vibe Studio dev port  | 5173 (or `--port 5180 --strictPort` if taken)     |
| Product API base      | `http://localhost:<port>/api/products`             |
| Showcase page route   | `http://localhost:<port>/api/showcase/pages/<id>`  |
| Public list route     | `http://localhost:<port>/api/showcase/products`    |
| Showcase files path   | `data/products/<id>/showcase.html` (in repo, git)  |
| Profile JSON path     | `data/showcase-profile.json` (in repo, git)        |
| User data path        | `data/vibe-studio.sqlite` (gitignored — DO NOT TOUCH) |
| Workbench app URL     | `http://localhost:<port>/products/<id>`            |
| Public showcase URL   | `http://localhost:<port>/showcase/<id>`           |
| API client types      | `src/client/api.ts` (PublicProduct, ShowcaseProfile, etc.) |
| Server types          | `src/domain/models.ts`                              |
