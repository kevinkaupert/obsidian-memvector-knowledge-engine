# MemVector Knowledge Engine — User Guide

---

## 1. MemVector Graph (Main 2D Plot View)

Open the main 2D Vector Graph by clicking the **dot-network icon** in the left ribbon bar or running command `MemVector: 2D Vektor-Scatterplot öffnen`.

```
┌───────────────────────────────────────────────────────────────┐
│ [MemVector Graph View]                            [Panel ⚙]   │
│                                                               │
│          • Theorem (Green)                                    │
│                     • Concept (Yellow)                        │
│     • Definition (Blue)                                       │
│                                                               │
│ ───────────────────────────────────────────────────────────── │
│ [Hover Bar: Note Title & Summary]                             │
└───────────────────────────────────────────────────────────────┘
```

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

1. **Header:** Shows active domain (`VEKTORRAUM` or `WISSENSRAUM`) and status.
2. **Filter:** Search bar for live path/filename inclusion & exclusion.
3. **Ansicht (View Toggles):**
   - **Projektion:** Switches between 7 layout algorithms (Themen-Wolken, Abhängigkeits-Fluss, Reiner Graph, UMAP Manifold, Graph-Topology, Formel-Symbole, LLM Themen-Landkarte) - see `docs/ARCHITECTURE.md` §2.1 for what each one is actually based on.
   - **Darstellung:** Selects the visual style (Monochrom / Gedämpfte Typ-Farben / Tinte & Fokus-Glow).
   - **Kanten anzeigen (Show Edges):** Toggle relationship edge rendering between notes, plus a **Kanten-Radius** selector (1/2/3 hops, "Alle", or "Unbegrenzt") controlling how far from the current selection edges are shown.
   - **Lasso-Auswahl (Lasso Select):** Switch cursor to crosshair for freehand loop selection without holding Shift.
4. **Aktionen (Actions):**
   - **Vault scannen:** Trigger full note re-scan.
   - **BGE-M3 Vektoren berechnen:** Re-calculate dense embeddings.
   - **Beziehung erstellen (≥2 wählen):** Open Modal to create a new relation note between selected nodes.
   - **`<Model>` Synthese ($N$):** Triggers AI Knowledge Synthesis for user-selected nodes.
   - **Auswahl leeren:** Clear current node selection.

---

## 3. Sidebar Note View (`MemVector Co-Pilot`)

Open the sidebar view by clicking the **function-square icon** in the ribbon bar or running command `MemVector: Seitenleiste öffnen`.

### Features

- **Active Note Focus:** Automatically tracks whatever Markdown note is open in Obsidian.
- **Breadcrumb & Title:** Displays folder path and active file title.
- **Mini-Radar Canvas:** Interactive 2D cutout view centered at $(0,0)$ on the active note, showing polar distance rings and framing the top $X$ nearest vector neighbors.
- **Nearest Neighbors List:** Collapsible details list of top nearest notes with similarity scores (click to open note).
