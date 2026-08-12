# Obsidian LLM Math Wiki Co-Pilot & 2D Vector Space

A powerful, local-first **2D Vector Space Visualizer & Mathematical AI Co-Pilot** for Obsidian. 

Built specifically for mathematics, science, and research vaults, this plugin combines local vector embeddings (`bge-m3`), 2D dimensional reduction (PCA/UMAP), interactive 2D HTML5 canvas visualization, and local reasoning LLMs (**DeepSeek-R1** via Ollama).

![Obsidian LLM Math Wiki Co-Pilot Overview](assets/plugin_overview.png)

---

## Key Features

### 1. 2D Vector Space Scatterplot
- **Local Embeddings:** Integrates with local Ollama (`bge-m3`) to vectorize Markdown notes, LaTeX equations ($\forall, \exists, \sum$), and frontmatter metadata.
- **2D PCA/UMAP Clustering:** Projects 1024-dimensional dense vectors onto an interactive 2D HTML5 Canvas.
- **Additive 2D Density Field (Heatmap Glow):** Renders vibrant glowing density fields underneath note clusters.
- **Semantic Note Clouds:** Notes automatically organize into natural semantic clusters (e.g., *Definitions*, *Theorems*, *Proofs*, *Set Theory*, *Quantifiers*).

### 2. Lasso Selection & DeepSeek-R1 Synthesis
- **Freehand Lasso Tool:** Hold `Shift` + drag to draw a freehand polygon loop around any subset of notes.
- **Cmd-Click Multi-Select:** Hold `Cmd` (`⌘`) to toggle individual notes in and out of selection.
- **DeepSeek-R1 Integration:** Connects directly to local Ollama (`deepseek-r1:7b` / `14b` / `32b`).
- **1-Click Synthesis Note Creation:** Generates a structured Markdown synthesis note with formal LaTeX proofs and Obsidian `[[WikiLinks]]`, saved directly into `wiki/synthesis/`.

### 3. Active Note Mini-Radar Cutout View (Sidebar)
- **Active Note Focus:** Automatically updates when opening or switching notes in Obsidian.
- **Mini-Radar Canvas:** Renders a 2D cutout view centered around the active note, preserving **exact relative 2D distances and directional vectors**.
- **Scientific Layout:** Concentric polar distance rings, coordinate crosshairs, and 1:1 color scheme matching the main 2D plot.
- **Native macOS Trackpad Gestures:** Supports 2-finger pan, cursor-centered pinch zoom, 0ms instant tooltips, and double-click reset.
- **Auto-Scale Framing:** Automatically scales to frame the top $X$ nearest vector neighbors (configurable in settings).

### 4. Full Graph Search Query Syntax
- **Positive Inclusion Rules:** Filter candidates by path or filename (e.g. `path:wiki`, `file:theorem`).
- **Negative Exclusion Rules:** Exclude specific files/directories (e.g. `-path: schema -file:index -file:log -file:README`).
- **Live Debounced Filtering:** Toolbar search bar updates the 2D Scatterplot in real time.

---

## Quick Start & Installation

### Prerequisites
Make sure [Ollama](https://ollama.ai) is installed and running locally on your Mac/PC:

```bash
# Pull the embedding model (recommended for math & multi-lingual coverage)
ollama pull bge-m3

# Pull the reasoning LLM (7B, 14B or 32B)
ollama pull deepseek-r1:7b
```

### Installation

1. Create a folder in your Obsidian plugins directory:
   ```text
   <your-vault>/.obsidian/plugins/obsidian-llm-math-wiki/
   ```
2. Copy `main.js` and `manifest.json` into that folder.
3. Open **Obsidian Settings** -> **Community Plugins** -> Enable **LLM Wiki Math Co-Pilot**.

---

## Settings

- **Ollama API Base URL:** `http://localhost:11434/v1` (Default)
- **Model Name:** `deepseek-r1:7b` (or `deepseek-r1:14b` / `32b`)
- **Path & File Exclusions:** `-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas-`
- **Mini-Radar Note Count (X):** Number of top nearest neighbors framed in the active note sidebar cutout (Default: `10`).

---

## License

Distributed under the [MIT License](LICENSE).
Created for mathematical research and local-first Obsidian workflows.
