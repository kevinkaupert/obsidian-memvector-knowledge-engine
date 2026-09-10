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

### Canvas Interaction Controls

| Action | Control / Gesture |
|---|---|
| **Pan Camera** | Click & drag on empty background |
| **Zoom Camera** | Mouse wheel or 2-finger trackpad pinch |
| **Hover Tooltip** | Move cursor over node dot (updates hover bar at bottom) |
| **Single Select Node** | Single click on node dot |
| **Multi-Select Toggle** | `Cmd` + Click (`⌘` on macOS) or `Ctrl` + Click |
| **Lasso Selection** | Hold `Shift` + drag freehand polygon around nodes |
| **Deselect All** | Click on empty background area |
| **Open Note File** | Double click on node dot |

---

## 2. Right-Aligned Glassmorphic Control Panel

The floating control panel is anchored to the top-right of the graph canvas and can be toggled using the **sliders icon** in the Obsidian view header.

### Panel Sections

1. **Header:** Shows active domain (`VEKTORRAUM` or `WISSENSRAUM`) and note count.
2. **Filter:** Search bar for live path/filename inclusion & exclusion.
3. **Darstellung (Visual & Layout Controls):**
   - **Projektion:** Switches between 7 layout algorithms (Themen-Wolken, Abhängigkeits-Fluss, Reiner Graph, UMAP Manifold, Graph-Topology, Formel-Symbole, LLM Themen-Landkarte) - see `docs/ARCHITECTURE.md` §2.1 for what each one is actually based on.
   - **Farbmodus / Stil:** Selects the visual style (Monochrom / Gedämpfte Typ-Farben / Tinte & Fokus-Glow).
   - **Kanten & Radius:** Toggle relationship edge rendering, set **Kanten-Radius** (1/2/3 hops, "Alle", or "Unbegrenzt"), and filter by edge types.
   - **Layout-Abstände:** Sliders for dynamic **Knoten-Abstand** (node spacing) and **Wolken-Abstand** (cluster spacing).
   - **Lasso-Auswahl (Lasso Select):** Switch cursor to crosshair for freehand loop selection without holding Shift.
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
- **Nearest Neighbors List:** Collapsible details list of top nearest notes with similarity scores (click to open note).
