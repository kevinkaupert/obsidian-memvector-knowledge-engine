# Release 0.3.7 — A Stable 2D Map, One Weight per Force & Stable Note Identity

> **Release Version:** `0.3.7` (changes since `0.3.0`: 0.3.1 - 0.3.7)  
> **Release Date:** `2026-10-19`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Since 0.3.0 the work has gone into reliability rather than new features: the 2D map now opens exactly the way you
left it and no longer jumps on routine actions, every force that places notes is a setting you control, renamed notes
keep their data, and a handful of data-integrity bugs are fixed. MemVector stays a standalone plugin; everything below
works without any other tool, and the one optional integration (writes through Jovian) is off by default.

---

## Highlights

### 1. The 2D map stays the way you know it (0.3.6, #284)
- **Closing, reopening or toggling the plugin shows exactly the previous map.** Stored positions are the reference;
  nothing is recomputed when no layout input changed.
- **Deleting a relation** in the Relation Builder adjusts only the area around its two notes instead of rearranging the
  whole map. Every relation change from the builder is a local adjustment, also in very small vaults.
- **Neighbors move only a little:** a note that moves only because a nearby note changed moves at most 0.15 x node
  spacing per adjustment.
- **Point spacing (Punkt-Abstand)** scales the existing map: same shape, larger or smaller, nothing recalculated, and
  the scaled positions are saved.
- **Cloud spacing (Wolken-Abstand)** only stores the value; it takes effect at the next **Layout neu anordnen** (#283).
- **The filter only hides notes.** Filtered notes keep their place and keep shaping the layout, so changing the filter
  never moves the map and no longer rescans the vault. Note counts and **Calculate vectors** follow the visible notes.
- **Layout neu anordnen** settles a layout built from scratch with up to 6 further passes, so related notes end up
  together without touching a slider (0.3.4).

### 2. One weight per force (0.3.6, ADR-0008)
Notes are placed by three signals, each with one source and one weight in **Settings > MemVector**:

| Setting | Signal | Default |
|---|---|---|
| **Layout: Bedeutungsnähe** | similarity of the embeddings | 1 |
| **Layout: WikiLinks** | `[[WikiLinks]]` in the note text, resolved by Obsidian | 0.3 |
| **Layout: Typisierte Relationen** | typed relations (relation notes and frontmatter typed links), on top of the weight per relation type | 1 |

- Range 0-2; **0 switches a signal off everywhere** in the layout: in the forces, in the placement of new notes, in
  which notes move along, and in the clusters.
- The signals **add up** instead of the strongest one winning, so a relation between two similar notes now pulls them
  closer. Conflict relations always push apart.
- **WikiLinks can now be switched off completely.** Before, they always pulled through the similarity, even with
  "WikiLinks as graph relations" off.
- Folder, word and formula overlap and the pull of notes two to four hops apart **no longer place notes**.

### 3. Edge line style shows where an edge comes from (0.3.6)
- **Solid:** a relation note.
- **Dashed:** a typed link written only in a note's frontmatter (e.g. `equivalent_to: "[[Feld]]"`), so it no longer
  looks like a stored relation.
- **Dotted** and muted: an unconfirmed `<label>_suggested` link. It does not pull notes together.

### 4. Stable note identity (0.3.2, ADR-0007)
- A note with a valid ULID `id` in its frontmatter is stored under that id. **Renaming or moving it keeps its vector,
  2D position and edges**, also when the rename happened while Obsidian was closed, on another device or outside
  Obsidian; the next full re-index finds it by its id without re-embedding.
- Notes without `id` keep exactly their previous behavior. MemVector never adds or changes `id` in your notes.
- If two notes share an id, a rename that hands it to the other note no longer loses the previous owner's vector,
  position or graph node (0.3.5, #279).

### 5. Optional: writes through Jovian (0.3.1)
- **Write through Jovian** (default off) saves synthesis and relation notes through Jovian's write gate (per-file
  lock, stale check, conflict copy, journal). If the gate does not answer, the note is saved directly with a notice.
  With the setting off nothing changes, and no Python is needed.

---

## Fixes

- **Synthesis file names** are one flat file in the synthesis folder named from the note titles
  (e.g. `synthese-roche-limit-skizze.md`), instead of nested folders with `%20` from path-based ids (0.3.5, #277).
- **No orphaned vectors after a model switch:** a full re-index removes the vectors of deleted or excluded notes for
  every model, including rows from before model tracking existed (0.3.3, #234).
- **Layout neu anordnen** no longer leaves related notes far apart when node spacing is small (0.3.4).

---

## Upgrade Notes

- **No action required.** Settings, the local index, stored positions and your notes carry over unchanged; no vault
  file is changed by the update.
- **Your map is not rearranged on update.** Stored positions are kept. The new signal model applies to later local
  adjustments and to the next **Layout neu anordnen**, which can look different from before, because folders, words
  and hop distances no longer place notes and relations now add to similarity.
- **"WikiLinks as graph relations"** now only controls whether WikiLinks are indexed as `LINKS_TO` edges for synthesis
  (GraphRAG). For the map use **Layout: WikiLinks**. The **knowledge domain** now only affects synthesis.
- The three new layout weights start at their defaults (1 / 0.3 / 1); an explicit 0 is kept across restarts.
- Going back to a version before 0.3.2 re-embeds notes that have an `id` once.
- **Windows is not supported** for the Jovian integration.

---

## Details

- Full list of changes: `CHANGELOG.md`, sections 0.3.1 - 0.3.7.
- Layout analysis, measurements and decisions: `docs/plans/0005-layout-forces-and-stability.md`,
  `docs/adr/0006-bounded-layout-adjustment.md`, `docs/adr/0008-layout-signal-model.md`.
- Note identity: `docs/adr/0007-note-identity-frontmatter-id.md`.
