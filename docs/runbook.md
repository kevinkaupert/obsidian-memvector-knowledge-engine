# Runbook

How to build, test and run the plugin from a `git clone`. For the manual smoke test steps inside Obsidian, see
[`TESTING.md`](TESTING.md).

## Requirements

- Node.js 20 (the version CI uses).
- Obsidian desktop `>= 1.11.4` (`manifest.json`: `minAppVersion`, `isDesktopOnly`).
- Optional: [Ollama](https://ollama.com) with an embedding model such as `bge-m3` for real embeddings. Not needed
  with the mock server below.
- Optional: the `sqlite3` CLI to inspect the local index.

## Setup and commands

```sh
git clone https://github.com/kevinkaupert/obsidian-memvector-knowledge-engine.git
cd obsidian-memvector-knowledge-engine
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Bundles `src/main.ts` into `main.js` and rebuilds on every change (watch mode, not minified). |
| `npm run build` | Typechecks, then writes the minified production bundle `main.js`. |
| `npm run typecheck` | `tsc --noEmit` only. |
| `npm run lint` | ESLint over the repo. Remaining warnings are `ui/sentence-case` on model names and URLs. |
| `npm test` | Runs the Vitest suite once. |
| `npm run test:watch` | Vitest in watch mode. |

`main.js` is committed: it is the shipped artifact. CI runs typecheck, lint, tests and the build, then fails if the
rebuilt `main.js` differs from the committed one. Run `npm run build` and commit `main.js` with every source change.

## Linking the clone into a vault

The plugin folder must be named after the manifest id, `memvector-knowledge-engine`:

```
<vault>/.obsidian/plugins/memvector-knowledge-engine/
```

Link the build files individually instead of the whole folder. The plugin writes `data.json` (settings) and
`memvector-local.sqlite` (the local index) into that folder, and those must stay in the vault, not in the repo:

```sh
REPO="$PWD"
PLUGIN=<vault>/.obsidian/plugins/memvector-knowledge-engine
mkdir -p "$PLUGIN"
for f in main.js manifest.json styles.css sql-wasm.wasm; do ln -sf "$REPO/$f" "$PLUGIN/$f"; done
```

`sql-wasm.wasm` is optional: `main.js` embeds a fallback copy and uses it when the file is missing.

After each `npm run build` (or automatically with `npm run dev`), reload the plugin in Obsidian: Settings ->
Community plugins -> turn MemVector off and on again. The vault always runs the build of the branch that is checked
out in the clone, so rebuild after switching branches.

For a disposable vault, use `testing/fixtures/smoke-test-vault/` (see its `README.md`).

## Local mock server

`testing/mock-echo-server.js` is a dependency-free OpenAI-compatible endpoint for indexing and synthesis without
Ollama or a cloud API key:

```sh
node testing/mock-echo-server.js 8092
node testing/mock-echo-server.js 8092 /tmp/mock.log      # also log every request to a file
node testing/mock-echo-server.js 8092 --delay 300        # hold embedding and chat responses for 300 ms
```

- `GET .../models` returns one fake model (`mock-model`), so connection tests succeed.
- `POST .../embeddings` returns a short deterministic fake vector per input text.
- `POST .../chat/completions` echoes the received user prompt back, so the synthesis result shows exactly what the
  plugin sent.
- Every request is logged to stdout with timestamp, method, path and body.

Check that it runs: `curl -s localhost:8092/v1/models`.

Plugin settings (Settings -> MemVector) for the mock server:

| Setting | Value |
|---|---|
| Embedding provider | Custom |
| Embedding API base URL | `http://localhost:8092/v1` |
| Embedding model name | `mock-model` |
| LLM provider / API base URL / model (for synthesis) | Custom, `http://localhost:8092/v1`, `mock-model` |

Switching the provider dropdown resets base URL and model to that provider's defaults (Custom:
`http://localhost:8000/v1`, `custom-embed`; Ollama: `http://localhost:11434/v1`, `bge-m3`). Re-enter the values above
after switching back to Custom.

Fake vectors are deterministic but carry no meaning, so the 2D layout looks arbitrary. Use Ollama with `bge-m3` to
check layout quality.

## Inspecting the local index

```sh
DB=<vault>/.obsidian/plugins/memvector-knowledge-engine/memvector-local.sqlite
sqlite3 "$DB" "select embedding_fingerprint, count(*) from vectors group by 1"
sqlite3 "$DB" "select path, embedding_fingerprint from vectors where path like 'wiki/%'"
```

The fingerprint is `<model>@<base URL>` of the embedding target that wrote the row. The table holds one row per note;
re-indexing with another model overwrites that note's row.

## Release

1. On a `chore/release-x.y.z` branch: bump `version` in `package.json`, `package-lock.json` and `manifest.json`,
   update the version and test badges in `README.md`, add a `CHANGELOG.md` section and `docs/release-notes-x.y.z.md`.
2. Open a PR, wait for green CI, merge.
3. Tag the merge commit with the bare version (no `v` prefix) and publish the GitHub release with the release notes
   and the assets `main.js`, `manifest.json` and `styles.css`:

```sh
git checkout main && git pull --ff-only
git tag x.y.z && git push origin x.y.z
gh release create x.y.z main.js manifest.json styles.css --title x.y.z --notes-file docs/release-notes-x.y.z.md --verify-tag
```
