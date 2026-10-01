# MemVector Knowledge Engine — User Guide

---

## 1. MemVector Graph (Main 2D Plot View)

Open the main 2D Vector Graph by clicking the **dot-network icon** in the left ribbon bar or running command `MemVector: 2D Vektor-Scatterplot öffnen`.

```
┌───────────────────────────────────────────────────────────────┐
│ [MemVector Graph View]                              [Panel]   │
│                                                               │
│          • Theorem (Green)                                    │
│                     • Concept (Yellow)                        │
│     • Definition (Blue)                                       │
│                                                               │
│ ───────────────────────────────────────────────────────────── │
│ [Hover Bar: Note Title & Summary]                             │
└───────────────────────────────────────────────────────────────┘
```

> The note-type labels/colors above (Theorem, Definition, Concept, ...)
> come from a folder/filename convention (`/theorems/`, `/definitions/`, ...)
> baked in as a STEM-flavored example (`activeNoteScoring.ts`). Notes that
> don't match any of those patterns default to "Concept" - so nothing
> breaks for a non-math vault, it just doesn't get the extra color coding
> unless you adopt similar folder names for your own domain's types.

### When the layout changes

Note positions are kept across edits and restarts; the map only changes where something that affects the layout changed:

| What happened | Effect on the map |
|---|---|
| Reopening the view or restarting Obsidian | Stored positions are shown unchanged. |
| Editing a note without changing its first 800 characters of words, its links, its formulas (math domain), its folder or its vector | Nothing moves. |
| Editing a title, a type or a relation's description | Labels update, nothing moves. |
| A new note, a changed note or a new/changed relation | Only that note, its relation neighbors and its most similar notes move, and only slightly; the rest of the map stays where it is. |
| Vectors recalculated for most notes, the knowledge domain or "WikiLinks as relations" changed, or a spacing slider moved | The whole layout is recalculated from the current positions. |
| **Layout neu anordnen** | A fresh layout from scratch. |

Note and settings changes are collected while the view is in a background tab and applied once when it is shown again. Positions are saved only when they actually moved; a failed save is retried with the next one.

### Canvas Interaction Controls

| Action | Control / Gesture |
|---|---|
| **Pan Camera** | Click & drag on empty background |
| **Zoom Camera** | Mouse wheel or 2-finger trackpad pinch |
| **Hover Tooltip** | Move cursor over node dot (updates hover bar at bottom) |
| **Single Select Node** | Single click on node dot |
| **Multi-Select Toggle** | `Cmd` + Click (`⌘` on macOS) or `Ctrl` + Click |
| **Lasso Selection** | Hold `Shift` + drag a freehand polygon around nodes (gesture only - the toolbar toggle was removed in 0.1.7) |
| **Deselect All** | Click on empty background area |
| **Open Note File** | Double click on node dot |

---

## 2. Right-Aligned Glassmorphic Control Panel

The floating control panel is anchored to the top-right of the graph canvas and can be toggled using the **sliders icon** in the Obsidian view header.

### Panel Sections

1. **Header:** Shows active domain (`VEKTORRAUM` or `WISSENSRAUM`) and note count.
2. **Filter:** Search bar for live path/filename inclusion & exclusion.
3. **Darstellung (Visual & Layout Controls):**
   - **Layout-Abstände (Punkt- & Wolken-Abstand):** Sliders for dynamic node spacing and semantic cluster spacing that adjust the organic force-directed 2D manifold simulation (blending dense BGE-M3 vector similarity and graph topology; see `docs/ARCHITECTURE.md` §2.1). Moving a slider re-runs the layout for all notes.
   - **Layout neu anordnen (Rearrange layout):** Computes a fresh layout for all notes from scratch and fits the camera to it. Also available as the command `MemVector: 2D-Layout neu anordnen`. See "When the layout changes" below.
   - **Kanten-Radius:** Relationship edges are always rendered; this dropdown sets the hop radius (1/2/3 hops, "Alle", or "∞" for the whole path).
   - Visual style, relation-note visibility, and agent guidelines moved to the plugin **Settings** (see `docs/CONFIGURATION.md`).
4. **Synthese (AI Co-Pilot & GraphRAG):**
   - **Frage / Anweisung:** Custom synthesis prompt field.
   - **Kontext-Anreicherung:** Toggle hybrid GraphRAG context enrichment from vector similarity and graph hops.
   - **`<Model>` Synthese ($N$):** Triggers AI Knowledge Synthesis for selected notes.
5. **Aktionen (Actions):**
   - **Vault scannen:** Trigger full note re-scan.
   - **BGE-M3 Vektoren berechnen:** Compute and persist dense BGE-M3 embeddings in SQLite.
   - **Beziehung erstellen (≥2 wählen):** Open Modal to create a new typed relation note between selected nodes.
   - **Auswahl leeren:** Clear current node selection.

---

## 3. Sidebar Note View (`MemVector Co-Pilot`)

Open the sidebar view by clicking the **function-square icon** in the ribbon bar or running command `MemVector: Seitenleiste öffnen`.

### Features

- **Active Note Focus:** Automatically tracks whatever Markdown note is open in Obsidian.
- **Breadcrumb & Title:** Displays folder path and active file title.
- **Mini-Radar Canvas:** Interactive 2D cutout view centered at $(0,0)$ on the active note, showing polar distance rings and framing the top $X$ nearest vector neighbors. Uses the active note's real embedding for these neighbors once it's been synced (run "BGE-M3 Vektoren berechnen" first); falls back to a text-overlap heuristic otherwise, so it still works before you've synced anything.
- **Nearest Neighbors List:** Collapsible details list of top 5 nearest notes with similarity scores (click to open note).
