# 0007 — Note Identity: Frontmatter `id` with Path Fallback

Status: Proposed (spike for #249; implementation in a follow-up issue)

## Context

Every MemVector table keys a note by `pathToId(file.path)` (`src/noteSlug.ts`): `notes.id`, `vectors.id`,
`node_positions.id` and the `src`/`tgt` columns of `edges`. The id is derived from the path, so it changes with every
rename or move.

Since #250 the vault index pipeline moves vectors, positions and graph nodes when Obsidian reports a `rename` event
(`moveVector`, `moveNodePosition`, `moveNote` in `src/sync/vaultIndexPipeline.ts`). That covers renames MemVector
observes while it runs. It does not cover:

- renames while Obsidian is closed, while background indexing is off, or made by another device and synced in;
- moves done outside Obsidian (file manager, git, scripts);
- joins with other knowOS components, which identify notes by the shared frontmatter `id`.

In these cases the note is re-embedded under a new id, its stored 2D position is lost, and edges stored under the old id
point to a note that no longer exists until the next full rescan.

knowOS [ADR-0002](https://github.com/kevinkaupert/knowOS/blob/main/docs/adr/0002-stable-note-id-adoption.md) defines the
shared `id`: a ULID in frontmatter, written by tools on new notes and added to existing notes only through a
user-confirmed write or an explicit, opt-in backfill. It asks MemVector to use the `id` when present, fall back to a path
key otherwise, and migrate rows in place when a note gains an `id`.

## Decision

### 1. Effective id

```
effectiveId(note) = frontmatter.id   if it is a valid ULID and unique in the vault
                  = pathToId(path)   otherwise
```

- A valid ULID is 26 characters of Crockford Base32. ULIDs are case-insensitive (knowOS ADR-0002 section 1), so
  MemVector uses the uppercased value as the key; the frontmatter value is never rewritten. Any other value (empty,
  wrong length, a slug someone typed) is ignored and the note falls back to its path key.
- **The fallback stays `pathToId` unchanged, without the `path:` prefix shown in knowOS ADR-0002.** Every existing row in
  every user database is keyed this way; adding a prefix would rewrite every row on upgrade for no gain. Collisions are
  impossible without the prefix: `pathToId` lowercases every segment, a ULID is uppercase, so the two key spaces never
  overlap, because the ULID key is always uppercased. No other knowOS component reads MemVector keys: Thought Map and
  Jovian identify notes by frontmatter `id` or path, and MemVector's database is private plugin state (knowOS
  `docs/synergies.md`). knowOS ADR-0002 is to be aligned with this (see Consequences).
- **Duplicate ids** (a note copied with its frontmatter): the note whose path sorts first keeps the `id` as its key, every
  other note with the same `id` falls back to its path key, and the conflict is reported once per scan (console warning
  plus the existing index status). MemVector does not fix the duplicate; that needs a user decision.

### 2. Where the effective id is resolved

One resolver, `noteKey(file, frontmatter)`, built next to `pathToId` and used by every path that today calls `pathToId`
on a note: vault scan, vector pipeline, vault index pipeline, graph sync, asserted edges, relation edge resolution,
context enrichment, node positions. The frontmatter comes from `metadataCache`, which these paths already read.

Relation notes keep their wikilinks (`source_note`, `target_note`). Resolution changes only at the end: wikilink ->
file -> `noteKey(file)` instead of `pathToId(file.path)`. Frontmatter typed links (#243) resolve the same way.

### 3. Row migration

When the effective id of a known note changes, MemVector moves its rows instead of re-creating them:

| Event | Old key | New key |
|---|---|---|
| Note gains a valid `id` | `pathToId(path)` | `id` |
| Note's `id` is removed or becomes invalid/duplicate | `id` | `pathToId(path)` |
| Rename of a note without `id` | `pathToId(old)` | `pathToId(new)` (as today) |
| Rename of a note with `id` | `id` | `id` (only `path` and `title` columns change) |

A move updates `notes.id`, `vectors.id`, `node_positions.id` and every `edges.src`/`edges.tgt` that holds the old key,
in one transaction. Vector, content hash, fingerprint and coordinates are kept, so no re-embedding and no re-layout is
needed. The vector's `content_hash` stays valid because the embedding text excludes frontmatter unless #251's setting
lists `id`, which it should not.

A full rescan detects key changes that happened while MemVector was not running: for each note it computes the
effective id; a row stored under `pathToId(path)` for a note whose effective id is now its ULID is moved, and a row
stored under a ULID that now belongs to a note at a different path is updated in place (path and title only).

### 4. MemVector writes `id` only where ADR-0002 allows it

- New notes MemVector creates (synthesis notes, relation notes) get a fresh ULID (#248).
- Editing a relation note in the Relation Builder keeps an existing `id` and adds one if missing; that edit is a
  user-confirmed write.
- MemVector never adds an `id` to a note during indexing or scanning. Reading never mutates a vault file.
- Bulk backfill is not MemVector's job (knowOS ADR-0002 section 6).

### 5. Interaction with other open work

- **#234 (vector row model):** independent of the key choice. If rows become `(id, fingerprint)`, the migration moves
  all rows of a note together.
- **#241 (chunk rows):** chunk rows reference their parent by the effective id, so a rename or a newly added `id` moves
  the parent key once and the chunks follow through the same migration.
- **knowOS query contract (`docs/contracts/memvector-query.md`):** hits report the effective id plus the path, as the
  contract already allows.

## Alternatives considered

- **Keep path keys and rely on rename events (#250).** Misses offline, external and synced renames, and gives other
  components nothing to join on.
- **Key by `id` only and require a backfill first.** Breaks every existing vault until a migration runs; ADR-0002
  forbids forced migrations.
- **Prefix the fallback (`path:<slug>`) as written in knowOS ADR-0002.** Rewrites every existing row on upgrade and
  changes ids other code may already hold, for a collision the case rule already prevents.

## Consequences

- Notes with an `id` keep their vector, position and edges across any rename or move, also offline and across devices.
- Notes without an `id` behave exactly as today. Upgrading migrates nothing until a note gains an `id`.
- A database row key is no longer always derivable from the path alone; code that needs a key must go through
  `noteKey`, and tests have to cover both key kinds.
- Rollback: an older MemVector build sees ULID-keyed rows it cannot map to a path; it treats them as stale and
  re-embeds those notes under path keys. No vault file is affected, only re-embedding cost.
- knowOS ADR-0002 section 5 should state the fallback as "the component's existing path key" instead of the literal
  `path:` prefix. That change belongs in knowOS and is proposed there separately.
