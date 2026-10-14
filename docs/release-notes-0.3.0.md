# Release 0.3.0 — One Vector Pipeline & Safer Relation Saves

> **Release Version:** `0.3.0`  
> **Release Date:** `2026-10-14`  
> **Target Obsidian Version:** `>= 1.11.4` (Desktop)  
> **Assets:** `main.js`, `manifest.json`, `styles.css`

---

## Overview

Release `0.3.0` runs both vector indexing entry points on one pipeline with the same failure handling, makes saving a relation atomic with its graph edge, and improves label and edge rendering in the 2D view.

---

## Highlights

### 1. One Vector Pipeline
- "Index vault locally now" (settings) and "Calculate vectors" (2D view toolbar) share `src/sync/vectorPipeline.ts`.
- A failed note is skipped and reported. A run aborts on a failing first request or after 3 consecutive errors and still writes what it calculated.
- Reconcile runs after every non-aborted run. The toolbar reports partial runs as `[WARN]` instead of stopping at the first error.

### 2. Relation Save Atomicity
- A relation note and its graph edge are saved as one unit. If the edge fails, a new note is trashed and an edited note gets its previous content back.
- In a batch, the other relations stay saved and the notice names the ones that failed.

### 3. Rendering
- Selected and hovered labels always draw; connected neighbor labels yield to them.
- Edges are culled by their whole curve and nodes by their label reach, so nothing pops out at the screen edge.

### 4. Relation Weight Cap Notice
- A relation weight above the layout's attraction cap is kept, with a notice that the attraction saturates there.

### 5. Documentation
- New `docs/runbook.md` for build, vault linking, mock server and release steps.
- README, CONFIGURATION and earlier audit and release notes corrected where they deviated from the code.
