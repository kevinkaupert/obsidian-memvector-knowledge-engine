# Release 0.2.6 — Frontmatter Typed Links, Background Indexing & Resilient Graph Edges

> **Release Version:** `0.2.6`  
> **Release Date:** `2026-10-15`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.2.6` introduces native support for reading typed relations directly from note frontmatter (including dashed unconfirmed suggestions), keeps the vector index and graph store automatically synchronized in the background on vault changes, ensures relation edits preserve custom properties and foreign frontmatter, and declutters the 2D thinking canvas.

---

## Highlights

### 1. Frontmatter Typed Links & Suggested Edges
- Every lowercase label from your relation vocabulary is now recognized as a typed link key in note frontmatter (`requires`, `equivalent_to`, etc.).
- `<label>_suggested` (e.g. `requires_suggested: "[[Note]]"`) defines unconfirmed suggestions, rendered as **dashed, muted lines** in the 2D scatter view.
- Relation notes take precedence over frontmatter links for the same relation pair. Confirmed frontmatter links take precedence over suggested ones.
- Suggested links remain visual-only: they stay out of layout forces, graph indexing, and synthesis contexts.
- Clicking a frontmatter-defined edge directly opens the source note.

### 2. Continuous Background Vault Indexing
- The graph store and local vector index now automatically track file changes (create, modify, delete, rename) in the background.
- Vault changes stay synchronized even when the 2D scatter view is not active or open.

### 3. Preserved Foreign Frontmatter & Safe Serialization
- Editing an existing relation note preserves all custom frontmatter fields (e.g. custom IDs, tags, aliases) and manual markdown notes outside the generated section.
- Relation and synthesis notes now use Obsidian's native YAML serialization (`stringifyYaml`), eliminating formatting errors from titles or descriptions containing quotes, colons, hashtags, or line breaks.

### 4. Resilient Graph Edge Reconciliation
- Deleting or editing a relation note no longer removes the edge from the graph index if another relation note or confirmed frontmatter link still asserts it.
- If a relation note cannot be read or is temporarily locked during an edit, existing edges are safely preserved until the next full re-index.

### 5. Clean Canvas Decluttering
- Redundant uppercase topic cluster headers (`CLUSTER (count)`) have been removed from the 2D view.
- Note labels are freed from avoiding cluster header bounding boxes, resulting in a cleaner, conflict-free visual thinking space.
