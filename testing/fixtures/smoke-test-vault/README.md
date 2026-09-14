# Smoke-Test Fixture Vault

Minimal disposable vault for `docs/TESTING.md`'s local SQLite manual smoke
test. Two notes (`A.md` -> `B.md` via WikiLink) and an `AGENTS.md` with a
recognizable marker string, so GraphRAG enrichment and the AGENTS.md
guidelines feature can both be checked directly in a captured synthesis
prompt (see `testing/mock-echo-server.js`).

## Before opening in Obsidian

This fixture intentionally does **not** include the plugin build output
(`main.js`, `manifest.json`, `styles.css`, `sql-wasm.wasm`) - those are
build artifacts, not vault content, and change with every release. Copy the
current build into `.obsidian/plugins/memvector-knowledge-engine/` before
opening this vault, e.g. from the repo root:

```sh
npm run build
mkdir -p testing/fixtures/smoke-test-vault/.obsidian/plugins/memvector-knowledge-engine
cp main.js manifest.json styles.css sql-wasm.wasm \
  testing/fixtures/smoke-test-vault/.obsidian/plugins/memvector-knowledge-engine/
```

Then open this folder as an Obsidian vault, enable the plugin (Settings ->
Community plugins -> turn off Restricted mode -> enable MemVector), and
follow `docs/TESTING.md`'s "Local (SQLite)" section.

**Never commit the copied plugin build files** - `.gitignore` in this repo
excludes them from this fixture, same as any other disposable test vault.
