# 0004 — Relation Notes Are Identified by Frontmatter Type, Folder as Fallback

Status: Accepted

## Context

Typed relations are stored as markdown notes (one note per edge). Which notes
count as relation notes decides what becomes an edge in the 2D view, what the
SQLite graph index stores, what GraphRAG traverses, which notes are drawn as
relation nodes, how the vault watcher reacts to an edit, and how the radar
labels a note.

Four callers answered that question with four different path rules:

| Caller | Rule |
|---|---|
| Edge loading (`relationEdges.ts`), feeding the graph index and GraphRAG | path contains `wiki/relation` or `/relations/` |
| Scatter nodes (`isRelationNode`) | frontmatter `type: relation`, or path contains `/relations/` |
| Vault watcher | path contains `wiki/relations/` or `/relations/` |
| Radar (`classifyNoteType`) | path contains `/relations/` |

Consequences:

- Moving relation notes or renaming their folder dropped them from edges, the
  graph index and GraphRAG context, although the relation builder writes
  `type: relation` into every note it creates.
- A top-level `relations/` folder was not recognized by three of the rules
  (`relations/a.md` does not contain `/relations/`).
- Any folder named `relations` anywhere (e.g. `Customers/relations/`) was
  treated as relation notes, and `wiki/relation` also matched
  `wiki/relationships/`.

Options weighed:

1. Folder only, made configurable.
2. Frontmatter only.
3. Frontmatter first, folder as fallback.

A folder-only rule breaks as soon as notes are moved, which is exactly the
failure users hit. A frontmatter-only rule would drop hand-written relation
notes that sit in the relations folder without the type.

## Decision

A note is a relation note if its frontmatter has `type: relation`
(case-insensitive), or if it lies inside the relations folder. The folder test
is a path-prefix match (`wiki/relations` matches `wiki/relations/a.md`, not
`Customers/relations/a.md` or `wiki/relationships/a.md`).

The rule lives in one function, `isRelationNote` (`src/relationNotes.ts`), and
every caller uses it. Callers without metadata-cache access read the type from
the note's leading frontmatter (`frontmatterTypeOf`).

The vault watcher only uses the rule to choose between an edge-only reload
(modify of an existing relation note, whose frontmatter is already cached) and a
full rescan. Create, delete and rename always rescan, so a new relation note is
picked up even before its frontmatter has been parsed.

## Consequences

- Relation notes keep working after being moved or after their folder is
  renamed, as long as they carry `type: relation`.
- Notes in an unrelated folder called `relations` without the type are no
  longer treated as edges. A vault that relied on that must add
  `type: relation` or move them into the relations folder.
- The relations folder itself becomes a single setting later (plan 0002,
  Block 2) without touching any caller again.
