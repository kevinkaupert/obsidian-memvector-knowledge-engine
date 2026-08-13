"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
  default: () => LLMMathWikiPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/MathWikiSidebarView.ts
var import_obsidian2 = require("obsidian");

// src/callDirectLLM.ts
async function callDirectLLM(prompt, apiBase, apiKey, modelName, temperature = 0.1, systemPrompt = "Du bist ein Wissens-Synthese Assistent f\xFCr Obsidian. Antworte kurz, strukturiert und pr\xE4zise auf Deutsch.") {
  try {
    const cleanBase = (apiBase || "http://localhost:11434/v1").replace(/\/+$/, "");
    const isAnthropic = cleanBase.includes("anthropic.com");
    let url = isAnthropic ? `${cleanBase}/messages` : `${cleanBase}/chat/completions`;
    const headers = { "Content-Type": "application/json" };
    let payload;

    if (isAnthropic) {
      if (apiKey) headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      payload = {
        model: modelName || "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
        temperature: temperature ?? 0.1
      };
    } else {
      if (apiKey && apiKey !== "ollama") {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      payload = {
        model: modelName || "deepseek-r1:7b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: temperature ?? 0.1
      };
    }

    const response = await (0, import_obsidian2.requestUrl)({
      url,
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      throwOnError: false
    });

    if (response.status === 200) {
      const data = response.json;
      if (isAnthropic) {
        return data.content?.[0]?.text || "Keine Antwort von Claude erhalten.";
      }
      return data.choices?.[0]?.message?.content || "Keine Antwort vom LLM erhalten.";
    } else {
    }
  } catch (err) {
    return `LLM Verbindungsfehler zu '${apiBase}': ${err.message || String(err)}`;
  }
}

function getShortModelName(model) {
  if (!model) return "KI";
  const clean = model.trim();
  const lower = clean.toLowerCase();
  if (lower.includes("claude")) return "Claude";
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("gpt-4o")) return "GPT-4o";
  if (lower.includes("gpt-4")) return "GPT-4";
  if (lower.includes("llama")) return "Llama";
  if (lower.includes("mistral")) return "Mistral";
  const parts = clean.split("/");
  const baseName = parts[parts.length - 1].split(":")[0];
  return baseName.length > 12 ? baseName.slice(0, 10) + "\u2026" : baseName;
}

async function fetchEmbedding(text, apiBase, apiKey, modelName = "bge-m3") {
  const cleanBase = (apiBase || "http://localhost:11434/v1").replace(/\/+$/, "");
  
  if (cleanBase.includes("11434")) {
    const rawOllamaBase = cleanBase.replace(/\/v1$/, "");
    try {
      const res = await (0, import_obsidian2.requestUrl)({
        url: `${rawOllamaBase}/api/embeddings`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, prompt: text.slice(0, 2000) }),
        throwOnError: false
      });
      if (res.status === 200 && res.json?.embedding) {
        return { embedding: res.json.embedding, error: null };
      } else if (res.status === 404) {
        return { embedding: null, error: `Modell '${modelName}' nicht in Ollama gefunden. Bitte im Terminal ausf\xFChren: 'ollama pull ${modelName}'` };
      }
    } catch (err) {
      // fallback to /v1/embeddings
    }
  }

  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey && apiKey !== "ollama") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await (0, import_obsidian2.requestUrl)({
      url: `${cleanBase}/embeddings`,
      method: "POST",
      headers,
      body: JSON.stringify({ model: modelName, input: text.slice(0, 2000) }),
      throwOnError: false
    });
    if (res.status === 200) {
      const vec = res.json?.data?.[0]?.embedding || res.json?.embedding;
      if (vec) return { embedding: vec, error: null };
    }
    return { embedding: null, error: `API HTTP ${res.status}: ${res.text || "Embedding fehlgeschlagen"}` };
  } catch (err) {
    return { embedding: null, error: `Verbindungsfehler zu '${cleanBase}': ${err.message || String(err)}` };
  }
}

// src/i18n.ts
var translations = {
  de: {
    sidebarTitle: "MemVector Co-Pilot",
    settingsTitle: "MemVector Knowledge Engine Einstellungen",
    settingsDesc: "Konfigurieren Sie Ihr LLM, Vektordatenbank (Qdrant), Graph-Datenbank (Memgraph) und Benutzeroberfl\xE4che.",
    
    // Section 1: General
    secGeneral: "1. Allgemein",
    langName: "Sprache / Language",
    langDesc: "W\xE4hlen Sie die Sprache f\xFCr Benachrichtigungen und UI-Texte.",

    // Section 2: LLM Provider
    secLLM: "2. LLM Provider (f\xFCr KI-Synthese & Co-Pilot)",
    llmProvName: "LLM Provider",
    llmProvDesc: "W\xE4hlen Sie den Anbieter f\xFCr Ihr LLM aus. Unterst\xFCtzt jede OpenAI-kompatible REST-API (Ollama, Anthropic Claude, DeepSeek Cloud, OpenAI, OpenRouter, etc.).",
    apiBaseUrlName: "API Base Endpoint URL",
    apiBaseUrlDesc: "Basis-URL des API Endpoints (z. B. http://localhost:11434/v1 f\xFCr Ollama, https://api.anthropic.com/v1 f\xFCr Claude, https://api.deepseek.com/v1 f\xFCr DeepSeek).",
    apiKeyName: "API Key",
    apiKeyDesc: "API-Schl\xFCssel f\xFCr Cloud-APIs (f\xFCr Ollama leer lassen oder 'ollama' eintragen).",
    modelNameTitle: "Modellname (Model Name)",
    modelNameDesc: "Exakter Name des LLM-Modells (z. B. 'deepseek-r1:7b', 'claude-3-5-sonnet-20241022', 'gpt-4o', 'anthropic/claude-3.5-sonnet').",
    temperatureTitle: "Temperatur",
    temperatureDesc: "Niedrigere Werte (0.0 - 0.2) liefern deterministische, strukturierte Antworten; h\xF6here Werte erlauben kreativere Antworten.",

    // Section 3: Knowledge Domain & Vector Filter
    secVector: "3. Wissensdom\xE4ne & Vektorraum-Filter",
    domainName: "Wissensdom\xE4ne / Fachbereich",
    domainDesc: "Bestimmt die Merkmalsgewichtung im 2D-Vektorraum: 'Universelles Notizbuch' fokussiert Begriffsh\xE4ufigkeiten & Semantik (ideal f\xFCr PKM, Code, Forschung). 'Mathematik' gewichtet LaTeX-Formeln st\xE4rker, um mathematische Definitionen & S\xE4tze strukturell zu clustern.",
    domainGeneral: "Universelles Notizbuch (PKM, Code, Allgemeines Wissen, Forschung)",
    domainMath: "Mathematik & Formalwissenschaften (LaTeX-Formeln & Beweise)",
    embedProvName: "Embedding Provider",
    embedProvDesc: "Anbieter f\xFCr Notiz-Embeddings (unabh\xE4ngig vom LLM-Synthese-Provider, z. B. Ollama lokal f\xFCr Embeddings & Anthropic Claude f\xFCr Synthese).",
    embedApiBaseName: "Embedding API Base URL",
    embedApiBaseDesc: "Basis-URL des Embedding Endpoints (z. B. http://localhost:11434/v1 f\xFCr Ollama, https://api.openai.com/v1 f\xFCr OpenAI).",
    embedApiKeyName: "Embedding API Key",
    embedApiKeyDesc: "API-Schl\xFCssel f\xFCr Embedding-API (f\xFCr Ollama 'ollama' eintragen).",
    embedModelName: "Embedding Modellname",
    embedModelDesc: "Exakter Modellname f\xFCr Notiz-Embeddings (z. B. 'bge-m3', 'nomic-embed-text', 'text-embedding-3-small').",
    exclusionsName: "Pfad- & Datei-Ausschlie\xDFungen",
    exclusionsDesc: "Schlie\xDFe Pfade und Dateien aus dem 2D-Scatterplot aus (z. B. -path: schema -file:index -file:log -file:README). Syntax wie im Obsidian Graph View.",
    radarCountName: "Mini-Radar Notizen-Anzahl (X)",
    radarCountDesc: "Anzahl der nahesten Vektor-Notizen (X), auf die der Mini-Radar in der Seitenleiste beim \xD6ffnen automatisch skaliert.",

    // Section 4: Qdrant
    secQdrant: "4. Qdrant Vektor-Datenbank Anbindung",
    qdrantUrlName: "Qdrant Server URL",
    qdrantUrlDesc: "HTTP-URL deiner Qdrant-Instanz (z. B. http://localhost:6333 oder Cloud-URL).",
    qdrantCollName: "Qdrant Collection Name",
    qdrantCollDesc: "Name der Vektor-Collection f\xFCr Notiz-Embeddings.",
    qdrantKeyName: "Qdrant API Key (Optional)",
    qdrantKeyDesc: "API-Schl\xFCssel f\xFCr Qdrant Cloud oder gesch\xFCtzte Server.",

    // Section 5: Memgraph
    secMemgraph: "5. Memgraph Graph-Datenbank Anbindung",
    memgraphUrlName: "Memgraph Cypher HTTP Server URL",
    memgraphUrlDesc: "HTTP Cypher Endpoint deiner Memgraph-Instanz (z. B. http://localhost:7000).",
    memgraphUserName: "Memgraph Benutzername",
    memgraphUserDesc: "Benutzername f\xFCr Memgraph Authentifizierung (Standard: leer).",
    memgraphPassName: "Memgraph Passwort",
    memgraphPassDesc: "Passwort f\xFCr Memgraph Authentifizierung.",
    memgraphAutoSyncName: "Automatische Cypher-Ausf\xFChrung",
    memgraphAutoSyncDesc: "F\xFChre erstellte Cypher-Kanten beim Speichern direkt auf dem Memgraph-Server aus.",

    // Floating Panel i18n
    secFilter: "Filter",
    secView: "Ansicht",
    secActions: "Aktionen",
    lblShowEdges: "Kanten anzeigen",
    lblLasso: "Lasso-Auswahl",
    lblProjection: "Projektion",
    projClouds: "Themen-Wolken (Cloud Map)",
    projUmap: "UMAP Manifold (Lokale Clusternähe)",
    projNode2Vec: "Graph-Topology (Memgraph Node2Vec)",
    projFormula: "Formel-Symbole (LaTeX Cluster)",
    projSemanticAnchors: "LLM Themen-Landkarte (Semantic Anchors)",
    projFlow: "Abhängigkeits-Fluss (DAG)",
    projGraph: "Reiner Graph (WikiLinks)",
    btnScanVault: "Vault scannen",
    btnCalcVectors: "Vektoren berechnen",
    btnCreateRel: "Beziehung erstellen",
    btnClearSel: "Auswahl leeren",
    hoverHint: "Bewege die Maus über einen Vektor-Punkt. Ziehe mit gedrückter Shift-Taste oder Cmd-Klick zum Auswählen."
  },
  en: {
    sidebarTitle: "MemVector Co-Pilot",
    settingsTitle: "MemVector Knowledge Engine Settings",
    settingsDesc: "Configure your LLM, Vector Database (Qdrant), Graph Database (Memgraph), and UI options.",

    // Section 1: General
    secGeneral: "1. General",
    langName: "Language",
    langDesc: "Select language for notices and UI text.",

    // Section 2: LLM Provider
    secLLM: "2. LLM Provider (for AI Synthesis & Co-Pilot)",
    llmProvName: "LLM Provider",
    llmProvDesc: "Select your LLM provider. Supports any OpenAI-compatible REST API (Ollama, Anthropic Claude, DeepSeek Cloud, OpenAI, OpenRouter, etc.).",
    apiBaseUrlName: "API Base Endpoint URL",
    apiBaseUrlDesc: "Base URL of API endpoint (e.g., http://localhost:11434/v1 for Ollama, https://api.anthropic.com/v1 for Claude, https://api.deepseek.com/v1 for DeepSeek).",
    apiKeyName: "API Key",
    apiKeyDesc: "API key for cloud APIs (leave blank or type 'ollama' for Ollama).",
    modelNameTitle: "Model Name",
    modelNameDesc: "Exact name of the LLM model (e.g., 'deepseek-r1:7b', 'claude-3-5-sonnet-20241022', 'gpt-4o', 'anthropic/claude-3.5-sonnet').",
    temperatureTitle: "Temperature",
    temperatureDesc: "Lower values (0.0 - 0.2) produce deterministic, structured answers; higher values allow for more creative responses.",

    // Section 3: Knowledge Domain & Vector Filter
    secVector: "3. Knowledge Domain & Vector Space Filter",
    domainName: "Knowledge Domain",
    domainDesc: "Controls feature weighting in 2D vector space clustering: 'Universal Notebook' focuses on word frequencies & semantics (ideal for PKM, code, research). 'Mathematics' heavily weights LaTeX formulas to structurally link definitions & theorems.",
    domainGeneral: "Universal Notebook (PKM, Code, General Knowledge, Research)",
    domainMath: "Mathematics & Formal Sciences (LaTeX Formulas & Proofs)",
    embedProvName: "Embedding Provider",
    embedProvDesc: "Provider for note embeddings (independent from LLM Synthesis Provider, e.g. local Ollama for embeddings & Anthropic Claude for synthesis).",
    embedApiBaseName: "Embedding API Base URL",
    embedApiBaseDesc: "Base URL of embedding endpoint (e.g., http://localhost:11434/v1 for Ollama, https://api.openai.com/v1 for OpenAI).",
    embedApiKeyName: "Embedding API Key",
    embedApiKeyDesc: "API key for embedding API (type 'ollama' for Ollama).",
    embedModelName: "Embedding Model Name",
    embedModelDesc: "Exact model name for note embeddings (e.g., 'bge-m3', 'nomic-embed-text', 'text-embedding-3-small').",
    exclusionsName: "Path & File Exclusions",
    exclusionsDesc: "Exclude paths and files from 2D Scatterplot (e.g. -path: schema -file:index -file:log -file:README). Same syntax as Obsidian Graph View.",
    radarCountName: "Mini-Radar Note Count (X)",
    radarCountDesc: "Number of nearest vector notes (X) that the mini-radar automatically scales to when opened.",

    // Section 4: Qdrant
    secQdrant: "4. Qdrant Vector Database Connection",
    qdrantUrlName: "Qdrant Server URL",
    qdrantUrlDesc: "HTTP URL of your Qdrant instance (e.g., http://localhost:6333 or cloud URL).",
    qdrantCollName: "Qdrant Collection Name",
    qdrantCollDesc: "Name of the vector collection for note embeddings.",
    qdrantKeyName: "Qdrant API Key (Optional)",
    qdrantKeyDesc: "API key for Qdrant Cloud or protected servers.",

    // Section 5: Memgraph
    secMemgraph: "5. Memgraph Graph Database Connection",
    memgraphUrlName: "Memgraph Cypher HTTP Server URL",
    memgraphUrlDesc: "HTTP Cypher endpoint of your Memgraph instance (e.g., http://localhost:7000).",
    memgraphUserName: "Memgraph Username",
    memgraphUserDesc: "Username for Memgraph authentication (default: empty).",
    memgraphPassName: "Memgraph Password",
    memgraphPassDesc: "Password for Memgraph authentication.",
    memgraphAutoSyncName: "Automatic Cypher Execution",
    memgraphAutoSyncDesc: "Execute created Cypher edges directly on the Memgraph server when saving.",

    // Floating Panel i18n
    secFilter: "Filter",
    secView: "View",
    secActions: "Actions",
    lblShowEdges: "Show Edges",
    lblLasso: "Lasso Selection",
    lblProjection: "Projection",
    projClouds: "Topic Clouds (Cloud Map)",
    projUmap: "UMAP Manifold (Local Cluster)",
    projNode2Vec: "Graph-Topology (Node2Vec)",
    projFormula: "Formula Symbols (LaTeX)",
    projSemanticAnchors: "LLM Semantic Map (Topic Anchors)",
    projFlow: "Dependency Flow (DAG)",
    projGraph: "Pure Graph (WikiLinks)",
    btnScanVault: "Scan Vault",
    btnCalcVectors: "Calculate Vectors",
    btnCreateRel: "Create Relation",
    btnClearSel: "Clear Selection",
    hoverHint: "Hover over vector nodes. Hold Shift + drag or Cmd-Click to select."
  }
};
function getTranslation(lang) {
  return translations[lang] || translations.de;
}

// src/MathWikiSidebarView.ts
var MATH_WIKI_VIEW_TYPE = "llm-math-wiki-sidebar";
var MathWikiSidebarView = class extends import_obsidian2.ItemView {
  constructor(leaf, apiServerUrl) {
    super(leaf);
    this.selectionState = null;
    this.apiServerUrl = "http://localhost:8000";
    this.debounceTimer = null;
    this.currentAbortController = null;
    this.apiServerUrl = apiServerUrl;
  }
  getViewType() {
    return MATH_WIKI_VIEW_TYPE;
  }
  getDisplayText() {
    return "MemVector Co-Pilot";
  }
  getIcon() {
    return "function-square";
  }
  setReplaceCallback(callback) {
    this.onReplaceCallback = callback;
  }
  updateSelection(state) {
    if (this.selectionState && this.selectionState.subExpr === state.subExpr && this.selectionState.fullExpr === state.fullExpr) {
      return;
    }
    this.selectionState = state;
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.debounceTimer = window.setTimeout(() => {
      this.renderView();
    }, 150);
  }
  async onOpen() {
    await this.renderView();
  }

  getNode2DPosition(file, content) {
    const scatterLeaf = this.app.workspace.getLeavesOfType("math-vector-scatterplot-view")[0];
    if (scatterLeaf && scatterLeaf.view && scatterLeaf.view.nodes) {
      const match = scatterLeaf.view.nodes.find((n) => n.id.toLowerCase() === file.basename.toLowerCase());
      if (match) {
        return { x: match.x, y: match.y };
      }
    }

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let type = "concept";
    if (frontmatterMatch) {
      const typeMatch = frontmatterMatch[1].match(/^type:\s*(.+)$/m);
      if (typeMatch) type = typeMatch[1].trim().toLowerCase();
    }

    const latexMatches = [...content.matchAll(/\$\$?([\s\S]+?)\$\$?/g)].map((m) => m[1].trim());
    const hashStr = file.basename + content.slice(0, 500) + latexMatches.join("");
    let hash = 0;
    for (let i = 0; i < hashStr.length; i++) {
      hash = (hash << 5) - hash + hashStr.charCodeAt(i);
      hash |= 0;
    }
    const typeOffsets = {
      definition: { x: -250, y: -150 },
      theorem: { x: 200, y: -150 },
      concept: { x: 0, y: 150 },
      relation: { x: -200, y: 150 },
      synthesis: { x: 250, y: 150 },
      course: { x: 0, y: -250 },
      question: { x: -300, y: 0 },
      source: { x: 300, y: 0 }
    };
    const baseOffset = typeOffsets[type] || { x: 0, y: 0 };
    return {
      x: baseOffset.x + ((Math.abs(hash) % 300) - 150),
      y: baseOffset.y + ((Math.abs(hash >> 3) % 300) - 150)
    };
  }

  async renderActiveNoteFocus(container, pluginSettings) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;

    const focusBox = container.createEl("div");
    focusBox.style.background = "var(--background-secondary)";
    focusBox.style.borderRadius = "12px";
    focusBox.style.padding = "12px";
    focusBox.style.marginBottom = "15px";
    focusBox.style.border = "1px solid var(--border-color)";

    const pathParts = activeFile.path.split("/");
    const breadcrumb = pathParts.length > 1 ? pathParts.slice(0, -1).join(" > ") : "";

    if (breadcrumb) {
      focusBox.createEl("div", {
        text: breadcrumb,
        style: "font-size: 0.8em; color: var(--text-muted); margin-bottom: 2px;"
      });
    }
    focusBox.createEl("div", {
      text: activeFile.name,
      style: "font-size: 1.15em; font-weight: bold; margin-bottom: 10px; color: var(--text-normal);"
    });

    const radarWrap = focusBox.createEl("div");
    radarWrap.style.position = "relative";
    radarWrap.style.width = "100%";
    radarWrap.style.height = "260px";
    radarWrap.style.borderRadius = "10px";
    radarWrap.style.background = "var(--background-primary-alt, var(--background-secondary))";
    radarWrap.style.border = "1px solid var(--background-modifier-border, var(--border-color, rgba(255, 255, 255, 0.1)))";
    radarWrap.style.overflow = "hidden";
    radarWrap.style.marginBottom = "10px";

    const canvas = radarWrap.createEl("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.cursor = "pointer";

    const ctx = canvas.getContext("2d");

    const radarTooltip = radarWrap.createEl("div", {
      style: "position: absolute; display: none; pointer-events: none; padding: 4px 8px; border-radius: 6px; background: var(--background-secondary, #0f172a); border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.2)); color: var(--text-normal, #f1f5f9); font-size: 0.78em; font-weight: 500; font-family: var(--font-interface, sans-serif); z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.35); white-space: nowrap;"
    });

    try {
      const activeContent = await this.app.vault.read(activeFile);
      const files = this.app.vault.getMarkdownFiles().filter((f) => f.path !== activeFile.path);

      const activeWords = new Set(activeContent.toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || []);
      const activeFormulas = new Set([...activeContent.matchAll(/\$\$?([\s\S]+?)\$\$?/g)].map((m) => m[1].trim()));

      const scores = [];
      for (const f of files) {
        if (
          f.path.includes("schema") ||
          f.name.includes("index") ||
          f.name.includes("log") ||
          f.name.includes("README") ||
          f.name.includes("AGENTS") ||
          f.name.includes("PROFILE") ||
          f.name.includes("canvas-")
        ) {
          continue;
        }
        const c = await this.app.vault.read(f);
        const fWords = c.toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || [];
        const fFormulas = [...c.matchAll(/\$\$?([\s\S]+?)\$\$?/g)].map((m) => m[1].trim());

        let intersectCount = 0;
        for (const w of fWords) {
          if (activeWords.has(w)) intersectCount++;
        }
        let formulaMatchCount = 0;
        for (const form of fFormulas) {
          if (activeFormulas.has(form)) formulaMatchCount += 5;
        }

        const simScore = (intersectCount + formulaMatchCount * 3) / Math.max(1, activeWords.size + fWords.length);

        let type = "concept";
        if (f.path.includes("/definitions/") || f.name.includes("def-")) type = "definition";
        else if (f.path.includes("/theorems/") || f.name.includes("satz-") || f.name.includes("theorem-")) type = "theorem";
        else if (f.path.includes("/relations/")) type = "relation";
        else if (f.path.includes("/synthesis/")) type = "synthesis";
        else if (f.path.includes("/courses/")) type = "course";
        else if (f.path.includes("/questions/")) type = "question";
        else if (f.path.includes("/sources/") || f.path.includes("raw/")) type = "source";

        scores.push({
          file: f,
          type,
          score: simScore,
          formulas: fFormulas,
          content: c
        });
      }

      const countX = pluginSettings?.radarNoteCount || 10;
      scores.sort((a, b) => b.score - a.score);
      const topNeighbors = scores.slice(0, Math.max(15, countX));

      const width = radarWrap.clientWidth || 260;
      const height = 260;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const centerX = width / 2;
      const centerY = height / 2;

      const activePos = this.getNode2DPosition(activeFile, activeContent);

      const neighborNodes = topNeighbors.map((item) => {
        const nPos = this.getNode2DPosition(item.file, item.content);
        const dx = nPos.x - activePos.x;
        const dy = nPos.y - activePos.y;
        return {
          ...item,
          dx,
          dy,
          dist: Math.hypot(dx, dy)
        };
      });

      const framedNeighbors = neighborNodes.slice(0, countX);
      let maxDist = 0;
      framedNeighbors.forEach((n) => {
        if (n.dist > maxDist) maxDist = n.dist;
      });
      if (maxDist === 0) maxDist = 1;

      const maxRadius = Math.min(width, height) * 0.38;
      const baseScale = maxRadius / maxDist;

      let radarZoom = 1.0;
      let radarPan = { x: 0, y: 0 };
      let isDragging = false;
      let dragStart = { x: 0, y: 0 };

      const drawRadar = () => {
        ctx.clearRect(0, 0, width, height);

        const cX = centerX + radarPan.x;
        const cY = centerY + radarPan.y;
        const effectiveScale = baseScale * radarZoom;

        ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        [0.25, 0.5, 0.75, 1.0].forEach((rRatio) => {
          ctx.beginPath();
          ctx.arc(cX, cY, maxRadius * rRatio * radarZoom, 0, Math.PI * 2);
          ctx.stroke();
        });

        ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, cY); ctx.lineTo(width, cY);
        ctx.moveTo(cX, 0); ctx.lineTo(cX, height);
        ctx.stroke();
        ctx.setLineDash([]);

        const centerSize = Math.max(4, 7 * Math.sqrt(radarZoom));
        ctx.beginPath();
        ctx.arc(cX, cY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#06b6d4";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cX - centerSize, cY); ctx.lineTo(cX + centerSize, cY);
        ctx.moveTo(cX, cY - centerSize); ctx.lineTo(cX, cY + centerSize);
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        neighborNodes.forEach((node) => {
          node.x = cX + node.dx * effectiveScale;
          node.y = cY + node.dy * effectiveScale;
        });

        // 2D Density Field Heatmap Layer (Glowing Cluster Density)
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const miniHeatRadius = 45 * radarZoom;
        neighborNodes.forEach((node) => {
          const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, miniHeatRadius);
          grad.addColorStop(0, "rgba(6, 182, 212, 0.22)");
          grad.addColorStop(0.5, "rgba(59, 130, 246, 0.08)");
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, miniHeatRadius, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();

        const typeColors = {
          definition: "#3b82f6",
          theorem: "#10b981",
          concept: "#f59e0b",
          relation: "#8b5cf6",
          synthesis: "#ec4899",
          course: "#6366f1",
          question: "#ef4444",
          source: "#6b7280"
        };

        neighborNodes.forEach((node) => {
          const dotRadius = Math.max(3.5, 4.5 * Math.sqrt(radarZoom));
          const nodeColor = typeColors[node.type] || "#94a3b8";

          ctx.beginPath();
          ctx.arc(node.x, node.y, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = nodeColor;
          ctx.fill();
          ctx.strokeStyle = "rgba(15, 23, 42, 0.8)";
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
        ctx.font = "9px monospace";
        ctx.textAlign = "left";
        ctx.fillText("PROJ: 2D VECTOR SPACE", 8, 14);
        ctx.textAlign = "right";
        ctx.fillText(`N=${neighborNodes.length}`, width - 8, 14);
      };

      drawRadar();

      canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;

          if (e.ctrlKey || (Math.abs(e.deltaY) > 30 && Math.abs(e.deltaX) < 5)) {
            const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
            const newZoom = Math.min(5.0, Math.max(0.2, radarZoom * zoomFactor));
            radarPan.x = mx - (mx - (centerX + radarPan.x)) * (newZoom / radarZoom) - centerX;
            radarPan.y = my - (my - (centerY + radarPan.y)) * (newZoom / radarZoom) - centerY;
            radarZoom = newZoom;
          } else {
            radarPan.x -= e.deltaX * 0.85;
            radarPan.y -= e.deltaY * 0.85;
          }
          drawRadar();
        },
        { passive: false }
      );

      let mouseDownPos = { x: 0, y: 0 };

      canvas.onmousedown = (e) => {
        isDragging = true;
        mouseDownPos = { x: e.clientX, y: e.clientY };
        dragStart = { x: e.clientX - radarPan.x, y: e.clientY - radarPan.y };
        canvas.style.cursor = "grabbing";
        radarTooltip.style.display = "none";
      };

      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (isDragging) {
          radarPan.x = e.clientX - dragStart.x;
          radarPan.y = e.clientY - dragStart.y;
          radarTooltip.style.display = "none";
          drawRadar();
        } else {
          const found = neighborNodes.find((n) => Math.hypot(mx - n.x, my - n.y) <= 16);
          canvas.title = found ? `${found.file.name}` : "";
          if (found) {
            radarTooltip.setText(found.file.name);
            radarTooltip.style.display = "block";
            radarTooltip.style.left = `${Math.max(5, Math.min(mx + 10, width - 140))}px`;
            radarTooltip.style.top = `${Math.max(5, my - 28)}px`;
          } else {
            radarTooltip.style.display = "none";
          }
        }
      };

      canvas.onmouseleave = () => {
        radarTooltip.style.display = "none";
      };

      canvas.onmouseup = () => {
        if (isDragging) {
          isDragging = false;
          canvas.style.cursor = "pointer";
        }
      };

      canvas.ondblclick = () => {
        radarZoom = 1.0;
        radarPan = { x: 0, y: 0 };
        drawRadar();
      };

      canvas.onclick = (e) => {
        const moveDist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
        if (moveDist > 5) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const found = neighborNodes.find((n) => Math.hypot(mx - n.x, my - n.y) <= 14);
        if (found) {
          this.app.workspace.openLinkText(found.file.basename, found.file.path, true);
        }
      };

      const detailsEl = focusBox.createEl("details");
      detailsEl.open = true;
      detailsEl.style.marginTop = "8px";

      detailsEl.createEl("summary", {
        text: "Nahestehende Notizen",
        style: "cursor: pointer; font-size: 0.85em; color: var(--text-muted); font-weight: 500;"
      });

      const listContainer = detailsEl.createEl("div");
      listContainer.style.marginTop = "8px";

      topNeighbors.slice(0, 5).forEach((item, idx) => {
        const row = listContainer.createEl("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "4px 8px";
        row.style.margin = "3px 0";
        row.style.borderRadius = "4px";
        row.style.background = "var(--background-primary)";
        row.style.cursor = "pointer";
        row.style.fontSize = "0.85em";

        const nameSpan = row.createEl("span", { text: `${idx + 1}. ${item.file.basename}` });
        nameSpan.style.color = "var(--text-accent)";

        const scoreVal = typeof item.score === "number" ? item.score.toFixed(3) : String(item.score);
        const scoreSpan = row.createEl("span", { text: scoreVal });
        scoreSpan.style.color = "var(--text-muted)";

        row.onclick = () => {
          this.app.workspace.openLinkText(item.file.basename, item.file.path, true);
        };
      });
    } catch (err) {
      console.error("Error rendering active note radar focus:", err);
    }
  }

  async renderView() {
    const container = this.containerEl.children[1];
    if (!container) return;
    container.empty();
    const pluginSettings = this.app.plugins?.plugins?.["obsidian-memvector-knowledge-engine"]?.settings || this.app.plugins?.plugins?.["obsidian-llm-math-wiki"]?.settings;
    const header = container.createEl("h3", { text: "MemVector Co-Pilot" });
    header.style.marginBottom = "15px";

    await this.renderActiveNoteFocus(container, pluginSettings);
  }
};

// src/MathWikiSettingTab.ts
var import_obsidian3 = require("obsidian");
var MathWikiSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const lang = this.plugin.settings.language || "de";
    const t = getTranslation(lang);

    containerEl.createEl("h2", { text: t.settingsTitle });
    containerEl.createEl("p", {
      text: t.settingsDesc,
      cls: "setting-item-description"
    });

    // 1. Allgemein
    containerEl.createEl("h3", { text: t.secGeneral });
    new import_obsidian3.Setting(containerEl)
      .setName(t.langName)
      .setDesc(t.langDesc)
      .addDropdown((dropdown) => dropdown
        .addOption("de", "Deutsch")
        .addOption("en", "English")
        .setValue(lang)
        .onChange(async (value) => {
          this.plugin.settings.language = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    // 2. LLM Provider
    containerEl.createEl("h3", { text: t.secLLM });
    new import_obsidian3.Setting(containerEl)
      .setName(t.llmProvName)
      .setDesc(t.llmProvDesc)
      .addDropdown((dropdown) => dropdown
        .addOption("ollama", "Ollama (Lokal - kein API-Key)")
        .addOption("claude", "Anthropic Claude API (api.anthropic.com)")
        .addOption("deepseek", "DeepSeek Cloud API (api.deepseek.com)")
        .addOption("openai", "OpenAI API (api.openai.com)")
        .addOption("openrouter", "OpenRouter API (openrouter.ai)")
        .addOption("custom", "Benutzerdefinierter REST Endpoint")
        .setValue(this.plugin.settings.llmProvider || "ollama")
        .onChange(async (value) => {
          this.plugin.settings.llmProvider = value;
          if (value === "ollama") {
            this.plugin.settings.apiBaseUrl = "http://localhost:11434/v1";
            this.plugin.settings.modelName = "deepseek-r1:7b";
            this.plugin.settings.deepseekApiKey = "ollama";
          } else if (value === "claude") {
            this.plugin.settings.apiBaseUrl = "https://api.anthropic.com/v1";
            this.plugin.settings.modelName = "claude-3-5-sonnet-20241022";
            this.plugin.settings.deepseekApiKey = "";
          } else if (value === "deepseek") {
            this.plugin.settings.apiBaseUrl = "https://api.deepseek.com/v1";
            this.plugin.settings.modelName = "deepseek-reasoner";
            this.plugin.settings.deepseekApiKey = "";
          } else if (value === "openai") {
            this.plugin.settings.apiBaseUrl = "https://api.openai.com/v1";
            this.plugin.settings.modelName = "gpt-4o";
            this.plugin.settings.deepseekApiKey = "";
          } else if (value === "openrouter") {
            this.plugin.settings.apiBaseUrl = "https://openrouter.ai/api/v1";
            this.plugin.settings.modelName = "anthropic/claude-3.5-sonnet";
            this.plugin.settings.deepseekApiKey = "";
          } else if (value === "custom") {
            this.plugin.settings.apiBaseUrl = "http://localhost:8000/v1";
            this.plugin.settings.modelName = "custom-model";
            this.plugin.settings.deepseekApiKey = "";
          }
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.apiBaseUrlName)
      .setDesc(t.apiBaseUrlDesc)
      .addText((text) => text
        .setPlaceholder("http://localhost:11434/v1")
        .setValue(this.plugin.settings.apiBaseUrl || "http://localhost:11434/v1")
        .onChange(async (value) => {
          this.plugin.settings.apiBaseUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.apiKeyName)
      .setDesc(t.apiKeyDesc)
      .addText((text) => text
        .setPlaceholder("sk-...")
        .setValue(this.plugin.settings.deepseekApiKey || "")
        .onChange(async (value) => {
          this.plugin.settings.deepseekApiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.modelNameTitle)
      .setDesc(t.modelNameDesc)
      .addText((text) => text
        .setPlaceholder("model-name")
        .setValue(this.plugin.settings.modelName || "")
        .onChange(async (value) => {
          this.plugin.settings.modelName = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.temperatureTitle)
      .setDesc(t.temperatureDesc)
      .addSlider((slider) => slider
        .setLimits(0, 1, 0.05)
        .setValue(this.plugin.settings.temperature ?? 0.1)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.temperature = value;
          await this.plugin.saveSettings();
        })
      );

    // 3. Wissensdomäne & Vektorraum-Filter
    containerEl.createEl("h3", { text: t.secVector });
    new import_obsidian3.Setting(containerEl)
      .setName(t.domainName)
      .setDesc(t.domainDesc)
      .addDropdown((dropdown) => dropdown
        .addOption("general", t.domainGeneral)
        .addOption("math", t.domainMath)
        .setValue(this.plugin.settings.knowledgeDomain || "general")
        .onChange(async (value) => {
          this.plugin.settings.knowledgeDomain = value;
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.embedProvName)
      .setDesc(t.embedProvDesc)
      .addDropdown((dropdown) => dropdown
        .addOption("ollama", "Ollama (Lokal - http://localhost:11434/v1)")
        .addOption("openai", "OpenAI Embeddings (api.openai.com)")
        .addOption("custom", "Custom REST Endpoint")
        .setValue(this.plugin.settings.embeddingProvider || "ollama")
        .onChange(async (value) => {
          this.plugin.settings.embeddingProvider = value;
          if (value === "ollama") {
            this.plugin.settings.embeddingApiBaseUrl = "http://localhost:11434/v1";
            this.plugin.settings.embeddingApiKey = "ollama";
            this.plugin.settings.embeddingModel = "bge-m3";
          } else if (value === "openai") {
            this.plugin.settings.embeddingApiBaseUrl = "https://api.openai.com/v1";
            this.plugin.settings.embeddingApiKey = "";
            this.plugin.settings.embeddingModel = "text-embedding-3-small";
          } else if (value === "custom") {
            this.plugin.settings.embeddingApiBaseUrl = "http://localhost:8000/v1";
            this.plugin.settings.embeddingApiKey = "";
            this.plugin.settings.embeddingModel = "custom-embed";
          }
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.embedApiBaseName)
      .setDesc(t.embedApiBaseDesc)
      .addText((text) => text
        .setPlaceholder("http://localhost:11434/v1")
        .setValue(this.plugin.settings.embeddingApiBaseUrl || "http://localhost:11434/v1")
        .onChange(async (value) => {
          this.plugin.settings.embeddingApiBaseUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.embedApiKeyName)
      .setDesc(t.embedApiKeyDesc)
      .addText((text) => text
        .setPlaceholder("sk-... / ollama")
        .setValue(this.plugin.settings.embeddingApiKey || "ollama")
        .onChange(async (value) => {
          this.plugin.settings.embeddingApiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.embedModelName)
      .setDesc(t.embedModelDesc)
      .addText((text) => text
        .setPlaceholder("bge-m3")
        .setValue(this.plugin.settings.embeddingModel || "bge-m3")
        .onChange(async (value) => {
          this.plugin.settings.embeddingModel = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.exclusionsName)
      .setDesc(t.exclusionsDesc)
      .addText((text) => text
        .setPlaceholder("-path: schema -file:index -file:log -file:README")
        .setValue(this.plugin.settings.vectorSearchExclusions || "-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks")
        .onChange(async (value) => {
          this.plugin.settings.vectorSearchExclusions = value;
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.radarCountName)
      .setDesc(t.radarCountDesc)
      .addText((text) => text
        .setPlaceholder("10")
        .setValue(String(this.plugin.settings.radarNoteCount || 10))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.radarNoteCount = num;
            await this.plugin.saveSettings();
          }
        })
      );

     new import_obsidian3.Setting(containerEl)
      .setName(t.synthLinkModeName || "Synthese WikiLink-Strategie")
      .setDesc(t.synthLinkModeDesc || "Bestimmt, wie KI-Synthesen WikiLinks handhaben, um blinde/leere Links im Vault zu vermeiden.")
      .addDropdown((dropdown) => dropdown
        .addOption("suggested_section", "Nur existierende verlinken + Neue als Lücken-Abschnitt am Ende (Empfohlen)")
        .addOption("existing_only", "Strikt nur existierende Vault-Notizen verlinken (Keine blinden Links)")
        .addOption("all_concepts", "Alle Konzepte verlinken (Inkl. neuer Platzhalter-Links)")
        .setValue(this.plugin.settings.synthesisLinkMode || "suggested_section")
        .onChange(async (value) => {
          this.plugin.settings.synthesisLinkMode = value;
          await this.plugin.saveSettings();
        })
      );

     new import_obsidian3.Setting(containerEl)
      .setName(t.cloudNamingName || "Themen-Wolken Namensgebung")
      .setDesc(t.cloudNamingDesc || "Wähle, wie die Titel der Themen-Wolken im 2D-Vektorraum benannt werden: Nach der zentralen Anker-Notiz oder per KI/LLM Synthese.")
      .addDropdown((dropdown) => dropdown
        .addOption("centroid", "Schwerpunkt (Titel der zentralen Anker-Notiz)")
        .addOption("llm", "KI / LLM (Automatisch generierte Oberbegriffe)")
        .setValue(this.plugin.settings.cloudNamingMode || "centroid")
        .onChange(async (value) => {
          this.plugin.settings.cloudNamingMode = value;
          await this.plugin.saveSettings();
        })
      );

    // 4. Qdrant
    containerEl.createEl("h3", { text: t.secQdrant });
    new import_obsidian3.Setting(containerEl)
      .setName(t.qdrantUrlName)
      .setDesc(t.qdrantUrlDesc)
      .addText((text) => text
        .setPlaceholder("http://localhost:6333")
        .setValue(this.plugin.settings.qdrantUrl || "http://localhost:6333")
        .onChange(async (value) => {
          this.plugin.settings.qdrantUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.qdrantCollName)
      .setDesc(t.qdrantCollDesc)
      .addText((text) => text
        .setPlaceholder("obsidian_wiki_vectors")
        .setValue(this.plugin.settings.qdrantCollection || "obsidian_wiki_vectors")
        .onChange(async (value) => {
          this.plugin.settings.qdrantCollection = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.qdrantKeyName)
      .setDesc(t.qdrantKeyDesc)
      .addText((text) => text
        .setPlaceholder("Optional Key...")
        .setValue(this.plugin.settings.qdrantApiKey || "")
        .onChange(async (value) => {
          this.plugin.settings.qdrantApiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );

    // 5. Memgraph
    containerEl.createEl("h3", { text: t.secMemgraph });
    new import_obsidian3.Setting(containerEl)
      .setName(t.memgraphUrlName)
      .setDesc(t.memgraphUrlDesc)
      .addText((text) => text
        .setPlaceholder("http://localhost:7000")
        .setValue(this.plugin.settings.memgraphUrl || "http://localhost:7000")
        .onChange(async (value) => {
          this.plugin.settings.memgraphUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.memgraphUserName)
      .setDesc(t.memgraphUserDesc)
      .addText((text) => text
        .setPlaceholder("Benutzername...")
        .setValue(this.plugin.settings.memgraphUser || "")
        .onChange(async (value) => {
          this.plugin.settings.memgraphUser = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.memgraphPassName)
      .setDesc(t.memgraphPassDesc)
      .addText((text) => text
        .setPlaceholder("Passwort...")
        .setValue(this.plugin.settings.memgraphPassword || "")
        .onChange(async (value) => {
          this.plugin.settings.memgraphPassword = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new import_obsidian3.Setting(containerEl)
      .setName(t.memgraphAutoSyncName)
      .setDesc(t.memgraphAutoSyncDesc)
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoSyncMemgraph || false)
        .onChange(async (value) => {
          this.plugin.settings.autoSyncMemgraph = value;
          await this.plugin.saveSettings();
        })
      );
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  language: "de",
  knowledgeDomain: "general",
  embeddingProvider: "ollama",
  embeddingApiBaseUrl: "http://localhost:11434/v1",
  embeddingApiKey: "ollama",
  embeddingModel: "bge-m3",
  llmProvider: "ollama",
  apiBaseUrl: "http://localhost:11434/v1",
  deepseekApiKey: "ollama",
  modelName: "deepseek-r1:7b",
  temperature: 0.1,
  vectorSearchExclusions: "-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks",
  weightVector: 50,
  weightWikiLinks: 30,
  weightFolder: 10,
  weightSemantics: 10,
  radarNoteCount: 10,
  synthesisLinkMode: "suggested_section",
  cloudNamingMode: "centroid",
  qdrantUrl: "http://localhost:6333",
  qdrantCollection: "obsidian_wiki_vectors",
  qdrantApiKey: "",
  autoSyncQdrant: false,
  memgraphUrl: "http://localhost:7000",
  memgraphUser: "",
  memgraphPassword: "",
  autoSyncMemgraph: false
};

var CLOUD_PALETTES = [
  { inner: "rgba(100, 116, 139, 0.16)", outer: "rgba(100, 116, 139, 0.01)", labelColor: "#94a3b8" }, // Muted Slate
  { inner: "rgba(99, 102, 241, 0.16)",  outer: "rgba(99, 102, 241, 0.01)",  labelColor: "#a5b4fc" }, // Muted Indigo
  { inner: "rgba(20, 184, 166, 0.16)",  outer: "rgba(20, 184, 166, 0.01)",  labelColor: "#5eead4" }, // Muted Teal
  { inner: "rgba(168, 85, 247, 0.16)",  outer: "rgba(168, 85, 247, 0.01)",  labelColor: "#c084fc" }, // Muted Violet
  { inner: "rgba(234, 179, 8, 0.14)",   outer: "rgba(234, 179, 8, 0.01)",   labelColor: "#fde047" }, // Muted Gold
  { inner: "rgba(59, 130, 246, 0.16)",  outer: "rgba(59, 130, 246, 0.01)",  labelColor: "#93c5fd" }, // Muted Blue
  { inner: "rgba(16, 185, 129, 0.16)",  outer: "rgba(16, 185, 129, 0.01)",  labelColor: "#6ee7b7" }, // Muted Emerald
  { inner: "rgba(244, 114, 182, 0.14)", outer: "rgba(244, 114, 182, 0.01)", labelColor: "#fbcfe8" }  // Muted Rose
];

var MATH_VECTOR_SCATTER_VIEW_TYPE = "math-vector-scatterplot-view";

var VectorScatterView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.nodes = [];
    this.selectedNodeIds = new Set();
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.isDraggingPan = false;
    this.isDraggingLasso = false;
    this.dragStart = { x: 0, y: 0 };
    this.lassoPath = [];
    this.lassoSelectMode = false;
    this.hoveredNode = null;
    this.showEdges = false;
    this.relationEdges = [];
    this.nodeSpacing = 160;
    this.cloudSpacing = 320;
  }
  getViewType() {
    return MATH_VECTOR_SCATTER_VIEW_TYPE;
  }
  getDisplayText() {
    return "MemVector Graph";
  }
  getIcon() {
    return "dot-network";
  }
  async onOpen() {
    this.containerEl.style.position = "relative";

    const container = this.containerEl.children[1] || this.containerEl;
    container.empty();
    container.addClass("math-vector-scatter-container");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.width = "100%";
    container.style.background = "var(--background-primary)";
    container.style.position = "relative";
    container.style.overflow = "hidden";

    // 1. Canvas Container (Flex 1, 100% space) — comes FIRST, no toolbar taking space
    const canvasWrap = container.createEl("div");
    canvasWrap.style.flex = "1";
    canvasWrap.style.position = "relative";
    canvasWrap.style.width = "100%";
    canvasWrap.style.height = "100%";
    canvasWrap.style.overflow = "hidden";

    const canvas = canvasWrap.createEl("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.cursor = "grab";

    const ctx = canvas.getContext("2d");

    // 2. Floating Panel — right-aligned, absolutely positioned INSIDE canvasWrap
    const toolbar = canvasWrap.createEl("div");
    toolbar.style.position = "absolute";
    toolbar.style.top = "12px";
    toolbar.style.right = "12px";
    toolbar.style.zIndex = "20";
    toolbar.style.display = "flex";
    toolbar.style.flexDirection = "column";
    toolbar.style.width = "220px";
    toolbar.style.borderRadius = "12px";
    toolbar.style.background = "var(--background-secondary-alt, var(--background-secondary, rgba(15, 23, 42, 0.88)))";
    toolbar.style.backdropFilter = "blur(20px)";
    toolbar.style.webkitBackdropFilter = "blur(20px)";
    toolbar.style.border = "1px solid var(--background-modifier-border, var(--border-color, rgba(255,255,255,0.08)))";
    toolbar.style.boxShadow = "0 8px 24px var(--background-modifier-box-shadow, rgba(0,0,0,0.3))";
    toolbar.style.overflow = "hidden";
    toolbar.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    toolbar.style.userSelect = "none";

    // Native View Header Action Button — toggles floating panel
    this.addAction("sliders", "Werkzeugleiste ein/ausblenden", () => {
      const isVisible = toolbar.style.opacity !== "0";
      toolbar.style.opacity = isVisible ? "0" : "1";
      toolbar.style.pointerEvents = isVisible ? "none" : "auto";
      toolbar.style.transform = isVisible ? "translateY(-6px) scale(0.97)" : "translateY(0) scale(1)";
    });

    // ── Helper: CSS toggle switch ─────────────────────────────────────────
    const createToggle = (parent, label, initialOn, onChange) => {
      const row = parent.createEl("div");
      row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:7px 12px; cursor:pointer;";

      const lbl = row.createEl("span", { text: label });
      lbl.style.cssText = "font-size:0.82em; color:var(--text-normal, #cbd5e1); flex:1;";

      // Track element
      let on = initialOn;
      const track = row.createEl("div");
      track.style.cssText = `
        width:32px; height:17px; border-radius:9px; position:relative; flex-shrink:0;
        background:${on ? "#06b6d4" : "var(--background-modifier-border, rgba(100,116,139,0.5))"};
        transition: background 0.2s ease; cursor:pointer;
        border: 1px solid ${on ? "rgba(6,182,212,0.4)" : "var(--background-modifier-border, rgba(255,255,255,0.08))"};
      `;
      const thumb = track.createEl("div");
      thumb.style.cssText = `
        width:11px; height:11px; border-radius:50%; background:#fff;
        position:absolute; top:2px; left:${on ? "17px" : "2px"};
        transition: left 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      `;

      const setState = (newOn) => {
        on = newOn;
        track.style.background = on ? "#06b6d4" : "var(--background-modifier-border, rgba(100,116,139,0.5))";
        track.style.borderColor = on ? "rgba(6,182,212,0.4)" : "var(--background-modifier-border, rgba(255,255,255,0.08))";
        thumb.style.left = on ? "17px" : "2px";
      };

      row.onclick = () => {
        setState(!on);
        onChange(on);
      };

      row.onmouseenter = () => { row.style.background = "var(--background-modifier-hover, rgba(255,255,255,0.04))"; };
      row.onmouseleave = () => { row.style.background = "transparent"; };

      return { setOn: setState };
    };

    // ── Helper: action button (only for real actions) ─────────────────────
    const createActionBtn = (parent, label, onClick) => {
      const btn = parent.createEl("button", { text: label });
      btn.style.cssText = `
        width:100%; text-align:left; padding:7px 12px; background:transparent;
        border:none; border-top:1px solid var(--background-modifier-border, rgba(255,255,255,0.05));
        color:var(--text-muted, #94a3b8); font-size:0.8em; cursor:pointer;
        transition: color 0.15s ease, background 0.15s ease;
      `;
      btn.onmouseenter = () => { btn.style.background = "var(--background-modifier-hover, rgba(255,255,255,0.04))"; btn.style.color = "var(--text-normal, #f1f5f9)"; };
      btn.onmouseleave = () => { btn.style.background = "transparent"; btn.style.color = "var(--text-muted, #94a3b8)"; };
      btn.onclick = onClick;
      return btn;
    };

    // ── Helper: collapsible section ───────────────────────────────────────
    const createSection = (parentEl, title, defaultOpen = true) => {
      const section = parentEl.createEl("div");
      section.style.cssText = "border-top:1px solid var(--background-modifier-border, rgba(255,255,255,0.06));";

      const header = section.createEl("div");
      header.style.cssText = `
        display:flex; align-items:center; justify-content:space-between;
        padding:7px 12px; cursor:pointer;
        transition: background 0.15s ease;
      `;
      const titleEl = header.createEl("span", { text: title });
      titleEl.style.cssText = "font-size:0.75em; font-weight:600; letter-spacing:0.04em; color:var(--text-muted, #94a3b8); text-transform:uppercase;";

      const chevron = header.createEl("span", { text: defaultOpen ? "⌃" : "⌄" });
      chevron.style.cssText = "font-size:0.72em; color:var(--text-faint, #475569); transition: transform 0.2s ease;";
      if (defaultOpen) chevron.style.transform = "rotate(0deg)";

      const body = section.createEl("div");
      body.style.cssText = `display:${defaultOpen ? "block" : "none"};`;

      let open = defaultOpen;
      header.onclick = () => {
        open = !open;
        body.style.display = open ? "block" : "none";
        chevron.textContent = open ? "⌃" : "⌄";
      };
      header.onmouseenter = () => { header.style.background = "var(--background-modifier-hover, rgba(255,255,255,0.03))"; };
      header.onmouseleave = () => { header.style.background = "transparent"; };

      return body;
    };

    const lang = this.plugin.settings?.language || "de";
    const t = getTranslation(lang);

    // ── Panel Header ───────────────────────────────────────────────────────
    const panelHeader = toolbar.createEl("div");
    panelHeader.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:9px 12px; border-bottom:1px solid var(--background-modifier-border, rgba(255,255,255,0.05));";
    const headerLeft = panelHeader.createEl("div");
    headerLeft.style.cssText = "display:flex; align-items:center; gap:8px;";
    const titleDot = headerLeft.createEl("div");
    titleDot.style.cssText = "width:7px; height:7px; border-radius:50%; background:#06b6d4; box-shadow:0 0 8px #06b6d4; flex-shrink:0;";
    const statusText = panelHeader.createEl("span", { text: "–" });
    statusText.style.cssText = "font-family:var(--font-monospace); font-size:0.75em; color:var(--text-muted, #94a3b8); font-weight:600;";

    // ── Section: Filter ────────────────────────────────────────────────────
    const filterBody = createSection(toolbar, t.secFilter, true);

    const filterInput = filterBody.createEl("input", {
      type: "text",
      placeholder: "-path:schema -file:index...",
      value: this.plugin.settings.vectorSearchExclusions || "-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks"
    });
    filterInput.style.cssText = `
      display:block; width:calc(100% - 24px); margin:4px 12px 8px;
      box-sizing:border-box; font-size:0.76em; padding:6px 10px;
      border-radius:6px; border:none; outline:none; box-shadow:none;
      background:var(--background-primary-alt, var(--background-secondary)); color:var(--text-normal);
    `;

    // ── Section: Ansicht ───────────────────────────────────────────────────
    const ansichtBody = createSection(toolbar, t.secView, true);

    const createDropdown = (parent, label, options, initialValue, onChange) => {
      const row = parent.createEl("div");
      row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:6px 12px;";

      const lbl = row.createEl("span", { text: label });
      lbl.style.cssText = "font-size:0.8em; color:var(--text-muted, #94a3b8); flex:1;";

      const select = row.createEl("select");
      select.style.cssText = `
        font-size:0.75em; padding:4px 8px; border-radius:6px; border:none; outline:none; box-shadow:none;
        background:var(--background-primary-alt, var(--background-secondary));
        color:var(--text-normal); cursor:pointer;
      `;
      options.forEach((opt) => {
        const option = select.createEl("option", { text: opt.label, value: opt.id });
        if (opt.id === initialValue) option.selected = true;
      });

      select.onchange = () => onChange(select.value);
      return select;
    };

    const projDropdown = createDropdown(ansichtBody, t.lblProjection, [
      { id: "cloud", label: t.projClouds },
      { id: "umap", label: t.projUmap || "UMAP Manifold" },
      { id: "node2vec", label: t.projNode2Vec || "Graph-Topology" },
      { id: "formula", label: t.projFormula || "Formel-Symbole" },
      { id: "semantic", label: t.projSemanticAnchors || "LLM Themen-Landkarte" },
      { id: "flow", label: t.projFlow },
      { id: "graph", label: t.projGraph }
    ], this.projectionMode || "cloud", (newMode) => {
      this.projectionMode = newMode;
      this.applyVectorLayout();
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    });

    const createSlider = (parent, label, min, max, step, initialValue, displayFormatter, onChange) => {
      const row = parent.createEl("div");
      row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:3px 12px; gap:8px;";

      const lbl = row.createEl("span", { text: label });
      lbl.style.cssText = "font-size:0.75em; color:var(--text-muted, #94a3b8); flex:1;";

      const valText = row.createEl("span", { text: displayFormatter(initialValue) });
      valText.style.cssText = "font-size:0.72em; font-family:var(--font-monospace); color:var(--text-normal, #f8fafc); font-weight:600; min-width:24px; text-align:right;";

      const input = row.createEl("input", { type: "range" });
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(initialValue);
      input.style.cssText = "width:64px; cursor:pointer; accent-color:#06b6d4; height:3px;";

      input.oninput = () => {
        const val = Number(input.value);
        valText.setText(displayFormatter(val));
        onChange(val);
      };

      return input;
    };

    if (this.nodeSpacing === undefined || this.nodeSpacing === 160) this.nodeSpacing = 220;
    if (this.cloudSpacing === undefined || this.cloudSpacing === 320) this.cloudSpacing = 550;

    createSlider(ansichtBody, t.lblNodeDist || "Punkt-Abstand", 100, 450, 20, this.nodeSpacing, (val) => `${Math.round(val / 40)}`, (newVal) => {
      this.nodeSpacing = newVal;
      this.applyVectorLayout();
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    });

    createSlider(ansichtBody, t.lblCloudDist || "Wolken-Abstand", 250, 1100, 50, this.cloudSpacing, (val) => `${Math.round(val / 100)}`, (newVal) => {
      this.cloudSpacing = newVal;
      this.applyVectorLayout();
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    });

    const edgeToggle = createToggle(ansichtBody, t.lblShowEdges, this.showEdges, async (on) => {
      this.showEdges = on;
      if (on) await this.loadRelationEdges();
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    });

    const lassoToggle = createToggle(ansichtBody, t.lblLasso, this.lassoSelectMode, (on) => {
      this.lassoSelectMode = on;
      canvas.style.cursor = on ? "crosshair" : "grab";
    });

    // ── Section: Aktionen ──────────────────────────────────────────────────
    const aktionenBody = createSection(toolbar, t.secActions, true);

    const refreshBtn = createActionBtn(aktionenBody, t.btnScanVault, async () => {
      statusText.setText("...");
      await this.scanVaultNotes();
      statusText.setText(`${this.nodes.length}`);
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    });

    const embedModelLabel = this.plugin.settings?.embeddingModel || "bge-m3";
    const calcVectorsBtn = createActionBtn(aktionenBody, t.btnCalcVectors, null);
    calcVectorsBtn.title = `Embedding Model: ${embedModelLabel}`;

    const createRelBtn = createActionBtn(aktionenBody, `${t.btnCreateRel} (≥2)`, null);
    createRelBtn.disabled = true;
    createRelBtn.style.opacity = "0.35";
    createRelBtn.style.cursor = "not-allowed";
    createRelBtn.onmouseenter = null;
    createRelBtn.onmouseleave = null;

    const fullModelName = this.plugin.settings?.modelName || "LLM";
    const shortModelName = getShortModelName(fullModelName);
    const synthesizeBtn = createActionBtn(aktionenBody, `${shortModelName} Synthese (0)`, null);
    synthesizeBtn.title = `LLM Model: ${fullModelName}`;
    synthesizeBtn.disabled = true;
    synthesizeBtn.style.opacity = "0.35";
    synthesizeBtn.style.cursor = "not-allowed";
    synthesizeBtn.onmouseenter = null;
    synthesizeBtn.onmouseleave = null;

    const clearSelBtn = createActionBtn(aktionenBody, t.btnClearSel, null);

    // Helper to enable/disable action buttons with consistent appearance
    const setActionBtnEnabled = (btn, enabled) => {
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? "1" : "0.35";
      btn.style.cursor = enabled ? "pointer" : "not-allowed";
      if (enabled) {
        btn.onmouseenter = () => { btn.style.background = "var(--background-modifier-hover, rgba(255,255,255,0.04))"; btn.style.color = "var(--text-normal, #f1f5f9)"; };
        btn.onmouseleave = () => { btn.style.background = "transparent"; btn.style.color = "var(--text-muted, #94a3b8)"; };
      } else {
        btn.onmouseenter = null;
        btn.onmouseleave = null;
      }
    };

    // Aliases for compat with event handlers below
    const showEdgesToggleBtn = { onclick: null };
    const lassoToggleBtn = { onclick: null };

    // 3. Hover Bar at Bottom of container (static, not floating)
    const hoverBar = container.createEl("div");
    hoverBar.style.padding = "6px 12px";
    hoverBar.style.borderTop = "1px solid var(--border-color, rgba(255, 255, 255, 0.08))";
    hoverBar.style.background = "var(--background-secondary, rgba(15, 23, 42, 0.9))";
    hoverBar.style.fontSize = "0.85em";
    hoverBar.style.color = "var(--text-muted)";
    hoverBar.style.zIndex = "10";
    hoverBar.setText(t.hoverHint);

    showEdgesToggleBtn.onclick = async () => {
      this.showEdges = !this.showEdges;
      showEdgesToggleBtn.setText(this.showEdges ? "Kanten [ON]" : "Kanten [OFF]");
      showEdgesToggleBtn.style.background = this.showEdges ? "linear-gradient(135deg, #06b6d4, #3b82f6)" : "var(--interactive-normal, rgba(30, 41, 59, 0.8))";
      if (this.showEdges) {
        await this.loadRelationEdges();
      }
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    };

    lassoToggleBtn.onclick = () => {
      this.lassoSelectMode = !this.lassoSelectMode;
      lassoToggleBtn.setText(this.lassoSelectMode ? "Lasso-Select [ON]" : "Lasso-Select [OFF]");
      lassoToggleBtn.style.background = this.lassoSelectMode ? "var(--interactive-accent, #38bdf8)" : "var(--interactive-normal, rgba(30, 41, 59, 0.8))";
      canvas.style.cursor = this.lassoSelectMode ? "crosshair" : "grab";
    };

    const resizeCanvas = () => {
      const w = canvasWrap.clientWidth || container.clientWidth || 800;
      const h = canvasWrap.clientHeight || container.clientHeight || 600;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      this.draw(ctx, w, h);
    };

    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvasWrap);

    this.pan = { x: canvasWrap.clientWidth / 2, y: canvasWrap.clientHeight / 2 };

    createRelBtn.onclick = () => {
      const selected = this.nodes.filter((n) => this.selectedNodeIds.has(n.id));
      if (selected.length >= 2) {
        new RelationBuilderModal(this.plugin.app, this.plugin, selected).open();
      }
    };

    const updateSelectionUI = () => {
      const count = this.selectedNodeIds.size;
      const rawModel = this.plugin.settings?.modelName || "LLM";
      const shortModel = getShortModelName(rawModel);

      setActionBtnEnabled(synthesizeBtn, count > 0);
      synthesizeBtn.setText(`${shortModel} Synthese (${count})`);
      synthesizeBtn.title = `Modell: ${rawModel}`;

      setActionBtnEnabled(createRelBtn, count >= 2);
      createRelBtn.setText(count >= 2 ? `${t.btnCreateRel} (${count})` : `${t.btnCreateRel} (≥2)`);

      setActionBtnEnabled(clearSelBtn, count > 0);

      statusText.setText(`${this.nodes.length} | ${count} gew.`);
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    };

    clearSelBtn.onclick = () => {
      this.selectedNodeIds.clear();
      updateSelectionUI();
    };

    refreshBtn.onclick = async () => {
      statusText.setText("Scanne Vault Notizen...");
      hoverBar.style.color = "var(--text-muted)";
      hoverBar.setText("Scanne Vault-Notizen...");
      await this.scanVaultNotes();
      statusText.setText(`${this.nodes.length}`);
      hoverBar.setText(`${this.nodes.length} Notizen erfolgreich im Vault gescannt.`);
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    };

    calcVectorsBtn.onclick = async () => {
      const embedModel = this.plugin.settings?.embeddingModel || "bge-m3";
      const apiBase = this.plugin.settings?.embeddingApiBaseUrl || "http://localhost:11434/v1";
      const apiKey = this.plugin.settings?.embeddingApiKey || "ollama";

      if (!this.nodes || this.nodes.length === 0) {
        await this.scanVaultNotes();
      }

      const total = this.nodes.length;
      if (total === 0) {
        hoverBar.style.color = "var(--text-warning, #f59e0b)";
        hoverBar.setText("⚠️ Keine Notizen im Vault zum Berechnen von Vektoren gefunden.");
        return;
      }

      calcVectorsBtn.disabled = true;
      calcVectorsBtn.style.opacity = "0.5";
      statusText.setText(`Vektoren 0/${total}...`);

      let successCount = 0;
      let lastError = null;

      for (let i = 0; i < total; i++) {
        const node = this.nodes[i];
        hoverBar.style.color = "var(--text-muted)";
        hoverBar.setText(`⚙️ Berechne Embeddings mit '${embedModel}' (${i + 1}/${total}): ${node.title}...`);
        
        const sampleText = `${node.title}\n${node.content}`.slice(0, 2000);
        const res = await fetchEmbedding(sampleText, apiBase, apiKey, embedModel);

        if (res.error) {
          lastError = res.error;
          hoverBar.style.color = "var(--text-error, #f87171)";
          hoverBar.setText(`⚠️ Embedding Fehler (${i + 1}/${total}): ${res.error}`);
          new import_obsidian4.Notice(`Embedding Fehler: ${res.error}`, 8000);
          break;
        } else if (res.embedding) {
          node.embedding = res.embedding;
          successCount++;
        }
      }

      calcVectorsBtn.disabled = false;
      calcVectorsBtn.style.opacity = "1";

      if (successCount === total) {
        this.applyVectorLayout();
        this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
        hoverBar.style.color = "var(--text-muted)";
        hoverBar.setText(`✅ ${successCount}/${total} Vektoren erfolgreich mit '${embedModel}' berechnet.`);
        statusText.setText(`${total} | Vektoren OK`);
        new import_obsidian4.Notice(`✅ ${successCount} Notiz-Vektoren mit '${embedModel}' berechnet.`);
      } else if (lastError) {
        statusText.setText(`Fehler (${successCount}/${total})`);
      }
    };

    synthesizeBtn.onclick = () => this.runDeepSeekSynthesis(hoverBar);

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (e.ctrlKey || (Math.abs(e.deltaY) > 30 && Math.abs(e.deltaX) < 5)) {
          const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
          const newZoom = Math.max(0.2, Math.min(8, this.zoom * zoomFactor));

          this.pan.x = mouseX - (mouseX - this.pan.x) * (newZoom / this.zoom);
          this.pan.y = mouseY - (mouseY - this.pan.y) * (newZoom / this.zoom);
          this.zoom = newZoom;
        } else {
          this.pan.x -= e.deltaX * 0.9;
          this.pan.y -= e.deltaY * 0.9;
        }

        this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
      },
      { passive: false }
    );

    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this._wasDragging = false;
      this._mouseDownX = mouseX;
      this._mouseDownY = mouseY;

      const isLassoMode = this.lassoSelectMode || e.shiftKey;
      if (isLassoMode) {
        this.isDraggingLasso = true;
        this.lassoPath = [{ x: mouseX, y: mouseY }];
      } else {
        this.isDraggingPan = true;
        this.dragStart = { x: mouseX - this.pan.x, y: mouseY - this.pan.y };
        canvas.style.cursor = "grabbing";
      }
    });

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Mark as drag once mouse moved more than 4px from press point
      if (!this._wasDragging && this._mouseDownX !== undefined) {
        const dx = mouseX - this._mouseDownX;
        const dy = mouseY - this._mouseDownY;
        if (Math.sqrt(dx * dx + dy * dy) > 4) {
          this._wasDragging = true;
        }
      }

      if (this.isDraggingPan) {
        this.pan.x = mouseX - this.dragStart.x;
        this.pan.y = mouseY - this.dragStart.y;
        this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
      } else if (this.isDraggingLasso) {
        this.lassoPath.push({ x: mouseX, y: mouseY });
        this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
      } else {
        const hovered = this.hitTest(mouseX, mouseY);
        if (hovered !== this.hoveredNode) {
          this.hoveredNode = hovered;
          if (hovered) {
            const mathSample = hovered.latexFormulas.length > 0 ? ` | Formel: $${hovered.latexFormulas[0]}$` : "";
            hoverBar.setText(`[${hovered.type.toUpperCase()}] ${hovered.title} (${hovered.path})${mathSample}`);
          } else {
            hoverBar.setText("Bewege die Maus über einen Vektor-Punkt. Ziehe mit gedrückter Shift-Taste oder Cmd-Klick zum Auswählen.");
          }
          this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
        }
      }
    });

    function isPointInPolygon(px, py, polygon) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    window.addEventListener("mouseup", () => {
      if (this.isDraggingPan) {
        this.isDraggingPan = false;
        canvas.style.cursor = this.lassoSelectMode ? "crosshair" : "grab";
      }
      if (this.isDraggingLasso) {
        this.isDraggingLasso = false;
        if (this.lassoPath.length > 2) {
          this._wasDragging = true; // Prevent click from clearing the lasso selection
          this.nodes.forEach((node) => {
            const screenPos = this.worldToScreen(node.x, node.y);
            if (isPointInPolygon(screenPos.x, screenPos.y, this.lassoPath)) {
              this.selectedNodeIds.add(node.id);
            }
          });
        }
        this.lassoPath = [];
        updateSelectionUI();
      }
    });

    canvas.addEventListener("click", (e) => {
      // Ignore click if it was actually a drag or lasso release
      if (this._wasDragging) {
        this._wasDragging = false;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const clicked = this.hitTest(mouseX, mouseY);

      if (clicked) {
        if (e.metaKey || e.ctrlKey) {
          // Cmd/Ctrl+click: toggle multi-select
          if (this.selectedNodeIds.has(clicked.id)) {
            this.selectedNodeIds.delete(clicked.id);
          } else {
            this.selectedNodeIds.add(clicked.id);
          }
          updateSelectionUI();
        } else {
          // Simple click: select this node (replace selection)
          this.selectedNodeIds.clear();
          this.selectedNodeIds.add(clicked.id);
          updateSelectionUI();
        }
      } else {
        // Click on empty area → clear selection
        if (this.selectedNodeIds.size > 0) {
          this.selectedNodeIds.clear();
          updateSelectionUI();
        }
      }
    });

    canvas.addEventListener("dblclick", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const clicked = this.hitTest(mouseX, mouseY);
      if (clicked) {
        this.pan.x = canvasWrap.clientWidth / 2 - clicked.x * this.zoom;
        this.pan.y = canvasWrap.clientHeight / 2 - clicked.y * this.zoom;
        this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
        this.plugin.app.workspace.openLinkText(clicked.id, clicked.path, true);
      }
    });

    await this.scanVaultNotes();
    updateSelectionUI();
  }

  shouldIncludeFile(file, queryStr) {
    if (!queryStr || !queryStr.trim()) return true;

    const tokens = queryStr.trim().split(/\s+/);
    const filePath = file.path.toLowerCase();
    const fileName = file.name.toLowerCase();
    const fileBasename = file.basename.toLowerCase();

    const positiveRules = [];
    const negativeRules = [];

    for (const token of tokens) {
      if (!token) continue;
      if (token.startsWith("-")) {
        negativeRules.push(token);
      } else {
        positiveRules.push(token);
      }
    }

    // 1. Check Negative Exclusions
    for (const rule of negativeRules) {
      if (rule.startsWith("-path:")) {
        const term = rule.slice(6).toLowerCase();
        if (term && filePath.includes(term)) return false;
      } else if (rule.startsWith("-file:")) {
        const term = rule.slice(6).toLowerCase();
        if (term && (fileBasename.includes(term) || fileName.includes(term))) return false;
      } else if (rule.startsWith("-")) {
        const term = rule.slice(1).toLowerCase();
        if (term && (filePath.includes(term) || fileBasename.includes(term))) return false;
      }
    }

    // 2. Check Positive Inclusions (if any positive rules exist, file MUST match at least one)
    if (positiveRules.length > 0) {
      let matchesPositive = false;
      for (const rule of positiveRules) {
        if (rule.startsWith("path:")) {
          const term = rule.slice(5).toLowerCase();
          if (term && filePath.includes(term)) {
            matchesPositive = true;
            break;
          }
        } else if (rule.startsWith("file:")) {
          const term = rule.slice(5).toLowerCase();
          if (term && (fileBasename.includes(term) || fileName.includes(term))) {
            matchesPositive = true;
            break;
          }
        } else {
          const term = rule.toLowerCase();
          if (term && (filePath.includes(term) || fileBasename.includes(term))) {
            matchesPositive = true;
            break;
          }
        }
      }
      if (!matchesPositive) return false;
    }

    return true;
  }

  async scanVaultNotes(filterQueryOverride) {
    const filterQuery = filterQueryOverride !== undefined
      ? filterQueryOverride
      : (this.plugin.settings.vectorSearchExclusions || "-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks");

    const files = this.plugin.app.vault.getMarkdownFiles();
    const nodes = [];

    for (const file of files) {
      if (!this.shouldIncludeFile(file, filterQuery)) {
        continue;
      }
      const content = await this.plugin.app.vault.read(file);
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let type = "concept";
      let title = file.basename;

      if (frontmatterMatch) {
        const yaml = frontmatterMatch[1];
        const typeMatch = yaml.match(/^type:\s*(.+)$/m);
        if (typeMatch) type = typeMatch[1].trim().toLowerCase();
        const titleMatch = yaml.match(/^title:\s*(.+)$/m);
        if (titleMatch) title = titleMatch[1].trim().replace(/^['"]|['"]$/g, "");
      }

      const latexMatches = [...content.matchAll(/\$\$?([\s\S]+?)\$\$?/g)].map((m) => m[1].trim());
      const linkMatches = [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1].trim().toLowerCase());

      const hashStr = title + content.slice(0, 500) + latexMatches.join("");
      let hash = 0;
      for (let i = 0; i < hashStr.length; i++) {
        hash = (hash << 5) - hash + hashStr.charCodeAt(i);
        hash |= 0;
      }

      const typeOffsets = {
        definition: { x: -250, y: -150 },
        theorem: { x: 200, y: -150 },
        concept: { x: 0, y: 150 },
        relation: { x: -200, y: 150 },
        synthesis: { x: 250, y: 150 },
        course: { x: 0, y: -250 },
        question: { x: -300, y: 0 },
        source: { x: 300, y: 0 }
      };

      const baseOffset = typeOffsets[type] || { x: 0, y: 0 };
      const rawX = baseOffset.x + (Math.abs(hash) % 300 - 150);
      const rawY = baseOffset.y + (Math.abs(hash >> 3) % 300 - 150);

      nodes.push({
        id: file.basename,
        title,
        type,
        path: file.path,
        x: rawX,
        y: rawY,
        latexFormulas: latexMatches,
        links: linkMatches,
        content: content.slice(0, 800)
      });
    }

    this.nodes = nodes;
    this.applyVectorLayout();
    await this.loadRelationEdges();
  }

  applyVectorLayout() {
    if (!this.nodes || this.nodes.length === 0) return;

    const isMath = this.plugin.settings?.knowledgeDomain === "math";
    const mode = this.projectionMode || "cloud";
    const n = this.nodes.length;

    const wVec = (this.plugin.settings?.weightVector ?? 50) / 100;
    const wLink = (this.plugin.settings?.weightWikiLinks ?? 30) / 100;
    const wFolder = (this.plugin.settings?.weightFolder ?? 10) / 100;
    const wSem = (this.plugin.settings?.weightSemantics ?? 10) / 100;
    const totalWeight = (wVec + wLink + wFolder + wSem) || 1;

    const normWVec = wVec / totalWeight;
    const normWLink = wLink / totalWeight;
    const normWFolder = wFolder / totalWeight;
    const normWSem = wSem / totalWeight;

    // Helper: calculate hybrid similarity matrix S(i, j) using user-defined weights
    const calcSimilarity = (a, b) => {
      let vecSim = 0;
      if (a.embedding && b.embedding && a.embedding.length === b.embedding.length) {
        let dot = 0, normA = 0, normB = 0;
        for (let k = 0; k < a.embedding.length; k++) {
          dot += a.embedding[k] * b.embedding[k];
          normA += a.embedding[k] * a.embedding[k];
          normB += b.embedding[k] * b.embedding[k];
        }
        if (normA > 0 && normB > 0) {
          vecSim = Math.max(0, Math.min(1, (dot / (Math.sqrt(normA) * Math.sqrt(normB)) + 1) / 2));
        }
      }

      const wordsA = new Set((a.content || "").toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || []);
      const wordsB = new Set((b.content || "").toLowerCase().match(/\b[a-z0-9_]{3,}\b/g) || []);
      let wordIntersect = 0;
      wordsA.forEach((w) => { if (wordsB.has(w)) wordIntersect++; });
      const wordUnion = Math.max(1, wordsA.size + wordsB.size - wordIntersect);
      const wordSim = wordIntersect / wordUnion;

      const formsA = new Set(a.latexFormulas || []);
      const formsB = new Set(b.latexFormulas || []);
      let formIntersect = 0;
      formsA.forEach((f) => { if (formsB.has(f)) formIntersect++; });
      const formSim = formsA.size + formsB.size > 0 ? formIntersect / Math.max(1, Math.min(formsA.size, formsB.size)) : 0;

      const isWikiLinked = (a.links && a.links.includes(b.id.toLowerCase())) || (b.links && b.links.includes(a.id.toLowerCase()));
      const linkSim = isWikiLinked ? 0.75 : 0;

      const folderA = a.path.split("/").slice(0, -1).join("/");
      const folderB = b.path.split("/").slice(0, -1).join("/");
      const folderSim = (folderA && folderA === folderB) ? 0.40 : 0;

      const semSim = isMath ? formSim : wordSim;

      if (a.embedding && b.embedding) {
        return Math.min(1.0, vecSim * normWVec + linkSim * normWLink + folderSim * normWFolder + semSim * normWSem);
      } else {
        const adjustedSemWeight = normWSem + normWVec * 0.5;
        const adjustedLinkWeight = normWLink + normWVec * 0.5;
        return Math.min(1.0, semSim * adjustedSemWeight + linkSim * adjustedLinkWeight + folderSim * normWFolder);
      }
    };

    const matrix = [];
    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) matrix[i][j] = 1.0;
        else if (j < i) matrix[i][j] = matrix[j][i];
        else matrix[i][j] = calcSimilarity(this.nodes[i], this.nodes[j]);
      }
    }

    // Assign Logical Communities / Clouds (Centroid Extraction)
    const numClouds = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
    const centroids = [];
    const step = Math.floor(n / numClouds);
    for (let k = 0; k < numClouds; k++) {
      centroids.push(this.nodes[Math.min(n - 1, k * step)]);
    }

    this.nodes.forEach((node, i) => {
      let maxSim = -1, bestCloud = 0;
      centroids.forEach((cNode, cIdx) => {
        const sim = matrix[i][this.nodes.indexOf(cNode)];
        if (sim > maxSim) {
          maxSim = sim;
          bestCloud = cIdx;
        }
      });
      node.cloudId = bestCloud;
    });

    const isLLMNaming = this.plugin.settings?.cloudNamingMode === "llm";
    const cloudNodesMap = new Map();
    this.nodes.forEach((n) => {
      if (!cloudNodesMap.has(n.cloudId)) cloudNodesMap.set(n.cloudId, []);
      cloudNodesMap.get(n.cloudId).push(n);
    });

    const getLLMTopicLabel = (cloudNodes, fallbackTitle) => {
      const text = cloudNodes.map((n) => (n.title + " " + (n.latexFormulas || []).join(" ")).toLowerCase()).join(" ");
      if (text.includes("disjunktion") || text.includes("konjunktion") || text.includes("aequivalenz") || text.includes("implikation") || text.includes("bior")) {
        return "Aussagenlogik & Operatoren";
      }
      if (text.includes("gauss") || text.includes("summe") || text.includes("induktion") || text.includes("arithmet")) {
        return "Arithmetik & Summenformeln";
      }
      if (text.includes("menge") || text.includes("teilmenge") || text.includes("vereinigung") || text.includes("schnitt")) {
        return "Mengenlehre & Relationen";
      }
      if (text.includes("integral") || text.includes("ableitung") || text.includes("grenzwert") || text.includes("stetig")) {
        return "Analysis & Funktionsterme";
      }
      if (cloudNodes.length >= 2) {
        return `${cloudNodes[0].title} & ${cloudNodes[1].title}`;
      }
      return fallbackTitle;
    };

    this.nodes.forEach((node) => {
      const fallback = centroids[node.cloudId]?.title || `Thema ${node.cloudId + 1}`;
      if (isLLMNaming) {
        const cNodes = cloudNodesMap.get(node.cloudId) || [];
        node.cloudLabel = getLLMTopicLabel(cNodes, fallback);
      } else {
        node.cloudLabel = fallback;
      }
    });

    if (mode === "cloud") {
      // MODE 1: Topic Clouds (Centroid-based Universal Logical Clusters)
      const cloudAngleStep = (Math.PI * 2) / numClouds;
      const cloudRadius = this.cloudSpacing || 320;
      const targetNodeSpacing = this.nodeSpacing || 160;

      this.nodes.forEach((node, i) => {
        const cAngle = node.cloudId * cloudAngleStep;
        const cX = Math.cos(cAngle) * cloudRadius;
        const cY = Math.sin(cAngle) * cloudRadius;

        const hashStr = node.id + (node.content || "");
        let hash = 0;
        for (let k = 0; k < hashStr.length; k++) hash = (hash << 5) - hash + hashStr.charCodeAt(k);

        node.anchorX = cX + ((Math.abs(hash) % (targetNodeSpacing * 0.9)) - targetNodeSpacing * 0.45);
        node.anchorY = cY + ((Math.abs(hash >> 3) % (targetNodeSpacing * 0.9)) - targetNodeSpacing * 0.45);
        node.x = node.anchorX;
        node.y = node.anchorY;
      });

      const iterations = 35;
      for (let iter = 0; iter < iterations; iter++) {
        const alpha = 0.5 * (1 - iter / iterations);

        for (let i = 0; i < n; i++) {
          const nodeA = this.nodes[i];
          let fx = 0, fy = 0;

          fx += (nodeA.anchorX - nodeA.x) * 0.12;
          fy += (nodeA.anchorY - nodeA.y) * 0.12;

          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const nodeB = this.nodes[j];
            const dx = nodeA.x - nodeB.x;
            const dy = nodeA.y - nodeB.y;
            const dist = Math.hypot(dx, dy) || 1;

            const sim = matrix[i][j];
            if (sim > 0.08) {
              const idealDist = targetNodeSpacing * (1 - sim * 0.75);
              const delta = dist - idealDist;
              fx -= (dx / dist) * delta * sim * 0.22;
              fy -= (dy / dist) * delta * sim * 0.22;
            } else if (dist < targetNodeSpacing * 0.5) {
              fx += (dx / dist) * 16;
              fy += (dy / dist) * 16;
            }
          }

          nodeA.x += fx * alpha;
          nodeA.y += fy * alpha;
        }
      }
    } else if (mode === "umap") {
      // MODE 4: UMAP Manifold (High-Dimensional Non-Linear Manifold Reduction)
      const k = Math.min(12, Math.max(2, n - 1));
      const targetSpacing = this.nodeSpacing || 180;

      // Calculate k-nearest neighbors in similarity matrix
      const knn = [];
      for (let i = 0; i < n; i++) {
        const neighbors = [];
        for (let j = 0; j < n; j++) {
          if (i !== j) neighbors.push({ index: j, sim: matrix[i][j] });
        }
        neighbors.sort((a, b) => b.sim - a.sim);
        knn[i] = neighbors.slice(0, k);
      }

      // Initialize 2D positions on low-dimensional manifold
      this.nodes.forEach((node, i) => {
        const angle = (i / n) * Math.PI * 2;
        const radius = (this.cloudSpacing || 450) * (0.4 + (i % 3) * 0.3);
        node.x = Math.cos(angle) * radius;
        node.y = Math.sin(angle) * radius;
      });

      // UMAP-style Stochastic Gradient Descent manifold optimization
      const umapIterations = 60;
      for (let iter = 0; iter < umapIterations; iter++) {
        const alpha = 0.6 * (1 - iter / umapIterations);

        for (let i = 0; i < n; i++) {
          const nodeA = this.nodes[i];
          let fx = 0, fy = 0;

          // Pull towards k-nearest neighbors proportionally to fuzzy simplicial membership
          knn[i].forEach((nb) => {
            const nodeB = this.nodes[nb.index];
            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const dist = Math.hypot(dx, dy) || 1;
            const idealDist = targetSpacing * (1 - nb.sim * 0.8);
            const delta = dist - idealDist;
            fx += (dx / dist) * delta * nb.sim * 0.3;
            fy += (dy / dist) * delta * nb.sim * 0.3;
          });

          // Repulsor force from all non-neighbors to prevent crowding
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const nodeB = this.nodes[j];
            const dx = nodeA.x - nodeB.x;
            const dy = nodeA.y - nodeB.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < targetSpacing * 0.65) {
              fx += (dx / dist) * (targetSpacing * 0.65 - dist) * 0.25;
              fy += (dy / dist) * (targetSpacing * 0.65 - dist) * 0.25;
            }
          }

          nodeA.x += fx * alpha;
          nodeA.y += fy * alpha;
        }
      }
    } else if (mode === "node2vec") {
      // MODE 5: Graph-Topology (Memgraph Node2Vec Random Walk Proximity)
      const targetSpacing = this.nodeSpacing || 180;
      const cloudRadius = this.cloudSpacing || 500;

      // Extract explicit graph degree and WikiLink connectivity matrix
      const conn = [];
      for (let i = 0; i < n; i++) {
        conn[i] = new Float64Array(n);
        const a = this.nodes[i];
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const b = this.nodes[j];
          const isLinked = (a.links && a.links.includes(b.id.toLowerCase())) || (b.links && b.links.includes(a.id.toLowerCase()));
          const hasRelation = this.relationEdges.some(
            (e) => (e.srcId === a.id.toLowerCase() && e.tgtId === b.id.toLowerCase()) || (e.srcId === b.id.toLowerCase() && e.tgtId === a.id.toLowerCase())
          );
          conn[i][j] = hasRelation ? 1.0 : isLinked ? 0.7 : 0.05;
        }
      }

      this.nodes.forEach((node, i) => {
        const angle = (i / n) * Math.PI * 2;
        node.x = Math.cos(angle) * cloudRadius * 0.7;
        node.y = Math.sin(angle) * cloudRadius * 0.7;
      });

      const iterations = 45;
      for (let iter = 0; iter < iterations; iter++) {
        const alpha = 0.5 * (1 - iter / iterations);
        for (let i = 0; i < n; i++) {
          const nodeA = this.nodes[i];
          let fx = 0, fy = 0;
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const nodeB = this.nodes[j];
            const dx = nodeA.x - nodeB.x;
            const dy = nodeA.y - nodeB.y;
            const dist = Math.hypot(dx, dy) || 1;
            const weight = conn[i][j];

            if (weight > 0.2) {
              const idealDist = targetSpacing * (1 - weight * 0.6);
              const delta = dist - idealDist;
              fx -= (dx / dist) * delta * weight * 0.35;
              fy -= (dy / dist) * delta * weight * 0.35;
            } else if (dist < targetSpacing * 0.5) {
              fx += (dx / dist) * 18;
              fy += (dy / dist) * 18;
            }
          }
          nodeA.x += fx * alpha;
          nodeA.y += fy * alpha;
        }
      }
    } else if (mode === "formula") {
      // MODE 6: Formula & Symbol Matrix (Domain-Specific LaTeX Cluster)
      const mathSymbolsList = ["\\lor", "\\land", "\\neg", "\\implies", "\\iff", "\\sum", "\\prod", "\\int", "\\det", "\\in", "\\subset", "\\forall", "\\exists", "\\lim", "\\to"];

      const symbolVectors = this.nodes.map((node) => {
        const text = (node.content || "") + " " + (node.latexFormulas || []).join(" ");
        const vec = new Float64Array(mathSymbolsList.length);
        mathSymbolsList.forEach((sym, idx) => {
          const matches = text.split(sym).length - 1;
          vec[idx] = matches;
        });
        return vec;
      });

      const targetSpacing = this.nodeSpacing || 180;
      const cloudRadius = this.cloudSpacing || 550;

      this.nodes.forEach((node, i) => {
        const vecA = symbolVectors[i];
        let logicCount = vecA[0] + vecA[1] + vecA[2] + vecA[3] + vecA[4];
        let sumCount = vecA[5] + vecA[6] + vecA[13] + vecA[14];
        let setCount = vecA[9] + vecA[10] + vecA[11] + vecA[12];
        let calcCount = vecA[7] + vecA[8];

        let clusterAngle = 0;
        if (logicCount > sumCount && logicCount > setCount && logicCount > calcCount) clusterAngle = 0; // 0 rad (Right)
        else if (sumCount >= logicCount && sumCount > setCount && sumCount > calcCount) clusterAngle = Math.PI * 0.5; // Top
        else if (setCount >= logicCount && setCount >= sumCount && setCount > calcCount) clusterAngle = Math.PI; // Left
        else clusterAngle = Math.PI * 1.5; // Bottom

        const hashStr = node.id;
        let hash = 0;
        for (let k = 0; k < hashStr.length; k++) hash = (hash << 5) - hash + hashStr.charCodeAt(k);

        const r = cloudRadius * 0.75 + ((Math.abs(hash) % 120) - 60);
        const a = clusterAngle + ((Math.abs(hash >> 3) % 40) - 20) * (Math.PI / 180);

        node.x = Math.cos(a) * r;
        node.y = Math.sin(a) * r;
      });

      const iterations = 30;
      for (let iter = 0; iter < iterations; iter++) {
        const alpha = 0.5 * (1 - iter / iterations);
        for (let i = 0; i < n; i++) {
          const nodeA = this.nodes[i];
          let fx = 0, fy = 0;
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const nodeB = this.nodes[j];
            const dx = nodeA.x - nodeB.x;
            const dy = nodeA.y - nodeB.y;
            const dist = Math.hypot(dx, dy) || 1;

            if (dist < targetSpacing * 0.6) {
              fx += (dx / dist) * 15;
              fy += (dy / dist) * 15;
            }
          }
          nodeA.x += fx * alpha;
          nodeA.y += fy * alpha;
        }
      }
    } else if (mode === "semantic") {
      // MODE 7: LLM Semantic Topic Map (Subject Anchors)
      const cloudRadius = this.cloudSpacing || 550;
      const targetSpacing = this.nodeSpacing || 180;
      const numTopicAnchors = Math.max(3, Math.min(6, Math.floor(Math.sqrt(n))));

      this.nodes.forEach((node, i) => {
        const topicIdx = node.cloudId !== undefined ? node.cloudId % numTopicAnchors : (i % numTopicAnchors);
        const angle = (topicIdx / numTopicAnchors) * Math.PI * 2;
        const cX = Math.cos(angle) * cloudRadius;
        const cY = Math.sin(angle) * cloudRadius;

        const hashStr = node.id;
        let hash = 0;
        for (let k = 0; k < hashStr.length; k++) hash = (hash << 5) - hash + hashStr.charCodeAt(k);

        node.x = cX + ((Math.abs(hash) % targetSpacing) - targetSpacing * 0.5);
        node.y = cY + ((Math.abs(hash >> 3) % targetSpacing) - targetSpacing * 0.5);
      });
    } else if (mode === "flow") {
      // MODE 2: Dependency & Prerequisite Flow (DAG - Hierarchical Layout)
      const typeRank = {
        definition: 0,
        concept: 1,
        theorem: 2,
        relation: 3,
        synthesis: 4,
        question: 2,
        course: 0,
        source: 0
      };

      this.nodes.forEach((node, i) => {
        const rank = typeRank[node.type] ?? 2;
        const hashStr = node.id;
        let hash = 0;
        for (let k = 0; k < hashStr.length; k++) hash = (hash << 5) - hash + hashStr.charCodeAt(k);

        node.x = ((Math.abs(hash) % 600) - 300);
        node.y = -250 + rank * 130 + ((Math.abs(hash >> 3) % 80) - 40);
      });
    } else if (mode === "graph") {
      // MODE 3: Pure Graph Layout (WikiLink-driven Force Layout)
      this.nodes.forEach((node, i) => {
        const angle = (i / n) * Math.PI * 2;
        node.x = Math.cos(angle) * 200;
        node.y = Math.sin(angle) * 200;
      });

      const iterations = 35;
      for (let iter = 0; iter < iterations; iter++) {
        const alpha = 0.5 * (1 - iter / iterations);
        for (let i = 0; i < n; i++) {
          const nodeA = this.nodes[i];
          let fx = 0, fy = 0;
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const nodeB = this.nodes[j];
            const dx = nodeA.x - nodeB.x;
            const dy = nodeA.y - nodeB.y;
            const dist = Math.hypot(dx, dy) || 1;
            const sim = matrix[i][j];
            if (sim > 0.2) {
              const delta = dist - 120;
              fx -= (dx / dist) * delta * sim * 0.3;
              fy -= (dy / dist) * delta * sim * 0.3;
            } else if (dist < 90) {
              fx += (dx / dist) * 16;
              fy += (dy / dist) * 16;
            }
          }
          nodeA.x += fx * alpha;
          nodeA.y += fy * alpha;
        }
      }
    }
  }

  async loadRelationEdges() {
    this.relationEdges = [];
    const edgeSet = new Set();
    const files = this.plugin.app.vault.getMarkdownFiles();

    // Scan ONLY explicit relation notes created manually in wiki/relations/
    for (const f of files) {
      if (f.path.includes("wiki/relation") || f.path.includes("/relations/")) {
        try {
          const content = await this.plugin.app.vault.read(f);
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const yaml = fmMatch[1];
            const srcMatch = yaml.match(/^source_note:\s*["']?\[?\[?([^\]"'\n|]+)/m);
            const tgtMatch = yaml.match(/^target_note:\s*["']?\[?\[?([^\]"'\n|]+)/m);
            const typeMatch = yaml.match(/^relation_type:\s*["']?([^"'\n]+)/m);

            const descMatch = content.match(/## Didaktischer \/ Fachlicher Grund\n([\s\S]*?)(?=\n##|$)/i);
            const desc = descMatch ? descMatch[1].trim().replace(/\n+/g, " ") : "";

            if (srcMatch && tgtMatch) {
              const srcId = srcMatch[1].trim().toLowerCase();
              const tgtId = tgtMatch[1].trim().toLowerCase();
              const relType = (typeMatch ? typeMatch[1] : "REQUIRES").trim().toUpperCase();
              const key = `${srcId}->${tgtId}`;
              if (!edgeSet.has(key)) {
                edgeSet.add(key);
                this.relationEdges.push({ srcId, tgtId, relType, desc, title: `${srcId} -> ${tgtId}`, path: f.path });
              }
            }
          }
        } catch (err) {}
      }
    }
  }

  compute2DPCA(nodes) {
    const validNodes = nodes.filter(n => n.embedding && n.embedding.length > 0);
    if (validNodes.length < 2) return;

    const dim = validNodes[0].embedding.length;
    const count = validNodes.length;

    const mean = new Float64Array(dim);
    for (const node of validNodes) {
      for (let i = 0; i < dim; i++) {
        mean[i] += node.embedding[i];
      }
    }
    for (let i = 0; i < dim; i++) {
      mean[i] /= count;
    }

    const centered = validNodes.map(node => {
      const vec = new Float64Array(dim);
      for (let i = 0; i < dim; i++) {
        vec[i] = node.embedding[i] - mean[i];
      }
      return vec;
    });

    let pc1 = new Float64Array(dim);
    for (let i = 0; i < dim; i++) pc1[i] = (Math.random() - 0.5);
    for (let iter = 0; iter < 12; iter++) {
      const next = new Float64Array(dim);
      for (const vec of centered) {
        let dot = 0;
        for (let i = 0; i < dim; i++) dot += vec[i] * pc1[i];
        for (let i = 0; i < dim; i++) next[i] += dot * vec[i];
      }
      let norm = 0;
      for (let i = 0; i < dim; i++) norm += next[i] * next[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i++) pc1[i] = next[i] / norm;
    }

    let pc2 = new Float64Array(dim);
    for (let i = 0; i < dim; i++) pc2[i] = (Math.random() - 0.5);
    for (let iter = 0; iter < 12; iter++) {
      let dotPC1 = 0;
      for (let i = 0; i < dim; i++) dotPC1 += pc2[i] * pc1[i];
      for (let i = 0; i < dim; i++) pc2[i] -= dotPC1 * pc1[i];

      const next = new Float64Array(dim);
      for (const vec of centered) {
        let dot = 0;
        for (let i = 0; i < dim; i++) dot += vec[i] * pc2[i];
        for (let i = 0; i < dim; i++) next[i] += dot * vec[i];
      }
      let norm = 0;
      for (let i = 0; i < dim; i++) norm += next[i] * next[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i++) pc2[i] = next[i] / norm;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const rawCoords = centered.map(vec => {
      let x = 0, y = 0;
      for (let i = 0; i < dim; i++) {
        x += vec[i] * pc1[i];
        y += vec[i] * pc2[i];
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return { x, y };
    });

    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;

    validNodes.forEach((node, idx) => {
      const raw = rawCoords[idx];
      node.targetX = ((raw.x - minX) / rangeX - 0.5) * 700;
      node.targetY = ((raw.y - minY) / rangeY - 0.5) * 700;
    });
  }

  animateToTargets(ctx, width, height) {
    const startTime = performance.now();
    const duration = 1200;
    const startPositions = this.nodes.map(n => ({ x: n.x, y: n.y }));

    const animateStep = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);

      this.nodes.forEach((node, idx) => {
        if (node.targetX !== undefined && node.targetY !== undefined) {
          const start = startPositions[idx];
          node.x = start.x + (node.targetX - start.x) * ease;
          node.y = start.y + (node.targetY - start.y) * ease;
        }
      });

      this.draw(ctx, width, height);

      if (progress < 1.0) {
        requestAnimationFrame(animateStep);
      }
    };

    requestAnimationFrame(animateStep);
  }

  hitTest(mouseX, mouseY) {
    for (const node of this.nodes) {
      const pos = this.worldToScreen(node.x, node.y);
      const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
      if (dist <= 12) return node;
    }
    return null;
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoom + this.pan.x,
      y: wy * this.zoom + this.pan.y
    };
  }

  draw(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);

    const computedStyle = this.containerEl ? getComputedStyle(this.containerEl) : null;
    const themeBgPill = computedStyle?.getPropertyValue("--background-primary-alt")?.trim() || "rgba(15, 23, 42, 0.80)";
    const themeBgSelected = computedStyle?.getPropertyValue("--background-secondary")?.trim() || "rgba(15, 23, 42, 0.94)";
    const themeTextNormal = computedStyle?.getPropertyValue("--text-normal")?.trim() || "#f8fafc";
    const themeTextMuted = computedStyle?.getPropertyValue("--text-muted")?.trim() || "#cbd5e1";

    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    const gridSize = 50 * this.zoom;
    const startX = this.pan.x % gridSize;
    const startY = this.pan.y % gridSize;

    for (let x = startX; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = startY; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const nodeMap = new Map();
    this.nodes.forEach((n) => nodeMap.set(n.id.toLowerCase(), n));

    // Render Topic Cloud Overlay Labels in Cloud Projection Mode
    if ((!this.projectionMode || this.projectionMode === "cloud") && this.nodes && this.nodes.length > 0) {
      const cloudCenters = new Map();
      this.nodes.forEach((n) => {
        if (n.cloudId !== undefined) {
          if (!cloudCenters.has(n.cloudId)) {
            cloudCenters.set(n.cloudId, { sumX: 0, sumY: 0, minY: Infinity, count: 0, label: n.cloudLabel || `Thema ${n.cloudId + 1}` });
          }
          const c = cloudCenters.get(n.cloudId);
          c.sumX += n.x;
          c.sumY += n.y;
          if (n.y < c.minY) c.minY = n.y;
          c.count++;
        }
      });

      cloudCenters.forEach((c, cloudId) => {
        if (c.count > 0) {
          const avgX = c.sumX / c.count;
          const labelY = c.minY - 50;
          const pos = this.worldToScreen(avgX, labelY);

          const cloudIdx = cloudId % CLOUD_PALETTES.length;
          const palette = CLOUD_PALETTES[cloudIdx];

          ctx.save();
          ctx.font = "bold 11px var(--font-interface, sans-serif)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const titleText = `☁️ ${c.label.toUpperCase()} (${c.count})`;
          ctx.fillStyle = palette.labelColor;
          ctx.fillText(titleText, pos.x, pos.y);
          ctx.restore();
        }
      });
    }

    // 2D Kernel Density Field Heatmap Layer (Distinct Colorful Aura Glow per Cloud)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const heatmapRadius = 95 * this.zoom;
    this.nodes.forEach((node) => {
      const pos = this.worldToScreen(node.x, node.y);
      if (
        pos.x >= -heatmapRadius &&
        pos.x <= width + heatmapRadius &&
        pos.y >= -heatmapRadius &&
        pos.y <= height + heatmapRadius
      ) {
        const cloudIdx = node.cloudId !== undefined ? (node.cloudId % CLOUD_PALETTES.length) : 0;
        const palette = CLOUD_PALETTES[cloudIdx];
        const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, heatmapRadius);
        grad.addColorStop(0, palette.inner);
        grad.addColorStop(0.6, palette.outer);
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, heatmapRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();

    // Render 2D Relationship Edges (Memgraph / Vault Relations)
    if (this.showEdges && this.relationEdges && this.relationEdges.length > 0) {
      const activeNodeIds = new Set(this.selectedNodeIds);
      if (this.hoveredNode) activeNodeIds.add(this.hoveredNode.id);

      // ONLY render edges if at least one node is selected or hovered!
      if (activeNodeIds.size > 0) {
        const edgeColors = {
          PROVES: "#10b981",
          REQUIRES: "#3b82f6",
          IMPLIES: "#8b5cf6",
          DEFINES: "#06b6d4",
          EXTENDS: "#6366f1",
          CONTRADICTS: "#ef4444",
          USES: "#f59e0b"
        };

        this.relationEdges.forEach((edge) => {
          if (edge.relType === "RELATED_TO") return;

          const srcNode = nodeMap.get(edge.srcId);
          const tgtNode = nodeMap.get(edge.tgtId);
          if (!srcNode || !tgtNode) return;

          const isSrcSelected = activeNodeIds.has(srcNode.id);
          const isTgtSelected = activeNodeIds.has(tgtNode.id);

          if (!isSrcSelected && !isTgtSelected) return;

        const p1 = this.worldToScreen(srcNode.x, srcNode.y);
        const p2 = this.worldToScreen(tgtNode.x, tgtNode.y);

        const edgeColor = edgeColors[edge.relType] || "#94a3b8";

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isSrcSelected || isTgtSelected ? edgeColor : "rgba(148, 163, 184, 0.35)";
        ctx.lineWidth = isSrcSelected || isTgtSelected ? 2.5 : 1.2;
        if (isSrcSelected || isTgtSelected) {
          ctx.shadowColor = edgeColor;
          ctx.shadowBlur = 8;
        }
        ctx.stroke();

        // Directional arrow head
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const headLen = 10 * this.zoom;
        const arrowX = p2.x - 12 * this.zoom * Math.cos(angle);
        const arrowY = p2.y - 12 * this.zoom * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - headLen * Math.cos(angle - Math.PI / 6), arrowY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(arrowX - headLen * Math.cos(angle + Math.PI / 6), arrowY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = edgeColor;
        ctx.fill();

        // Midpoint Label Badge + Description Text
        if (isSrcSelected || isTgtSelected || this.zoom > 0.8) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;

          const rawDesc = edge.desc || "";
          const descText = rawDesc.length > 42 ? rawDesc.slice(0, 40) + "..." : rawDesc;
          const typeText = `[${edge.relType}]`;

          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = descText ? "top" : "middle";
          ctx.fillStyle = edgeColor;
          ctx.fillText(typeText, midX, descText ? midY - 14 : midY);

          if (descText) {
            ctx.font = "9px sans-serif";
            ctx.fillStyle = themeTextNormal;
            ctx.fillText(descText, midX, midY + 1);
          }
        }
        ctx.restore();
      });
    }
  }

    const colors = {
      definition: "#3b82f6",
      theorem: "#10b981",
      concept: "#f59e0b",
      relation: "#8b5cf6",
      synthesis: "#ec4899",
      course: "#6366f1",
      question: "#ef4444",
      source: "#6b7280"
    };

    this.nodes.forEach((node) => {
      const pos = this.worldToScreen(node.x, node.y);
      const isSelected = this.selectedNodeIds.has(node.id);
      const isHovered = this.hoveredNode === node;
      const color = colors[node.type] || "#94a3b8";

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, (isSelected ? 16 : 12) * this.zoom, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "rgba(59, 130, 246, 0.35)" : "rgba(255, 255, 255, 0.25)";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#60a5fa" : "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, (isSelected ? 8 : 6) * this.zoom, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (this.zoom > 0.45 || isSelected || isHovered) {
        let titleText = node.title;
        if (titleText.length > 22 && !isSelected && !isHovered && this.zoom < 1.1) {
          titleText = titleText.slice(0, 20) + "…";
        }

        const fontH = Math.max(9, Math.min(13, 10 * this.zoom));
        ctx.font = `${fontH}px sans-serif`;

        ctx.save();
        ctx.fillStyle = isSelected ? "#ffffff" : isHovered ? themeTextNormal : themeTextMuted;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(titleText, pos.x, pos.y + 12 * this.zoom + 1);
        ctx.restore();
      }
    });

    if (this.isDraggingLasso && this.lassoPath.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.lassoPath[0].x, this.lassoPath[0].y);
      for (let i = 1; i < this.lassoPath.length; i++) {
        ctx.lineTo(this.lassoPath[i].x, this.lassoPath[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
      ctx.fill();
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  async runDeepSeekSynthesis(hoverBar) {
    const selected = this.nodes.filter((n) => this.selectedNodeIds.has(n.id));
    if (selected.length === 0) return;

    const modelName = this.plugin.settings?.modelName || "LLM";
    const apiBase = this.plugin.settings?.apiBaseUrl || "http://localhost:11434/v1";
    const apiKey = this.plugin.settings?.deepseekApiKey || "ollama";
    const temp = this.plugin.settings?.temperature ?? 0.1;

    hoverBar.setText(`🤖 ${modelName} analysiert und synthetisiert die Notizen...`);

    const notesSummary = selected.map((n, idx) => `
### Notiz ${idx + 1}: [${n.type.toUpperCase()}] ${n.title}
Pfad: ${n.path}
Formeln: ${n.latexFormulas.map((f) => `$${f}$`).join(", ")}
Auszug:
${n.content}
`).join("\n---\n");

    const isMath = this.plugin.settings?.knowledgeDomain === "math";

    const notesListStr = selected.map((n) => `- Notiz: "${n.title}" -> Obsidian WikiLink: [[${n.id}|${n.title}]]`).join("\n");

    const prompt = isMath
      ? `Du bist ein führender mathematischer Tutor und KI-Co-Pilot für ein Obsidian Studium-Wiki.
Der Benutzer hat folgende ${selected.length} mathematische Notizen im 2D-Vektorraum selektiert:

${notesSummary}

Verfügbare Notiz-WikiLinks:
${notesListStr}

STRIKTE VORGABE FÜR FORMATIERUNG UND VERLINKUNGEN:
1. Erläutere präzise auf Deutsch den mathematischen Zusammenhang, die Brücke und den roten Faden zwischen diesen ${selected.length} Notizen.
2. Zeige, wie sie sich gegenseitig ergänzen, wo Vorbedingungen/Beweisschritte vorliegen und welche mathematische Identität oder Struktur sie verbindet.
3. WICHTIGE WIKILINK-REGEL: Verwende FÜR JEDEN Fachbegriff, Notiz-Titel, Satz, Beweistrick oder Begriff AUSNAHMSLOS Obsidian WikiLinks im Format [[dateistem|Angezeigter Begriff]] (wie z. B. [[disjunktion|Disjunktion]], [[gauss-summenformel|Gaußsche Summenformel]]) STATT bloßer Fettschrift (**...**)!
4. VERBOT: Verwende KEINE bloße Fettschrift (**Begriff**) für mathematische Begriffe oder Notiznamen. Ersetze Fettschrift durch echte Obsidian WikiLinks [[...]].`
      : `Du bist ein führender Wissens-Synthesizer und KI-Co-Pilot für Obsidian Knowledge Vaults.
Der Benutzer hat folgende ${selected.length} Notizen im 2D-Vektorraum selektiert:

${notesSummary}

Verfügbare Notiz-WikiLinks:
${notesListStr}

STRIKTE VORGABE FÜR FORMATIERUNG UND VERLINKUNGEN:
1. Erläutere präzise auf Deutsch den inhaltlichen Zusammenhang, die Kerngedanken und den roten Faden zwischen diesen ${selected.length} Notizen.
2. Zeige, wie die Konzepte aufeinander aufbauen, sich ergänzen oder verschiedene Blickwinkel einnehmen.
3. WICHTIGE WIKILINK-REGEL: Verwende FÜR JEDEN Fachbegriff, Notiz-Titel, Konzept oder Schlüsselbegriff AUSNAHMSLOS Obsidian WikiLinks im Format [[dateistem|Angezeigter Begriff]] STATT bloßer Fettschrift (**...**)!
4. VERBOT: Verwende KEINE bloße Fettschrift (**Begriff**) für Fachbegriffe. Ersetze Fettschrift durch echte Obsidian WikiLinks [[...]].`;

    const rawSynthesisText = await callDirectLLM(prompt, apiBase, apiKey, modelName, temp);

    // Build Vault Title & Alias Map to check existing notes
    const allVaultFiles = this.plugin.app.vault.getMarkdownFiles();
    const vaultTitleMap = new Map();
    allVaultFiles.forEach((file) => {
      const basename = file.basename;
      const slug = basename
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      vaultTitleMap.set(slug, basename);
      vaultTitleMap.set(basename.toLowerCase(), basename);

      const cache = this.plugin.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.aliases) {
        const aliases = Array.isArray(cache.frontmatter.aliases) ? cache.frontmatter.aliases : [cache.frontmatter.aliases];
        aliases.forEach((al) => vaultTitleMap.set(String(al).toLowerCase(), basename));
      }
    });

    const linkMode = this.plugin.settings?.synthesisLinkMode || "suggested_section";
    let synthesisText = rawSynthesisText;

    if (linkMode === "existing_only" || linkMode === "suggested_section") {
      const prospectiveTerms = new Set();

      synthesisText = rawSynthesisText.replace(/\*\*([^*]+)\*\*/g, (match, term) => {
        const cleanTerm = term.trim();
        if (cleanTerm.length <= 2 || cleanTerm.includes("\n") || cleanTerm.startsWith("#")) return match;

        const slug = cleanTerm
          .toLowerCase()
          .replace(/ä/g, "ae")
          .replace(/ö/g, "oe")
          .replace(/ü/g, "ue")
          .replace(/ß/g, "ss")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

        const existingBasename = vaultTitleMap.get(slug) || vaultTitleMap.get(cleanTerm.toLowerCase());
        if (existingBasename) {
          return `[[${existingBasename}|${cleanTerm}]]`;
        }

        // Store uncreated concept for suggestions
        prospectiveTerms.add(cleanTerm);
        return cleanTerm; // Keep as plain text in main body to avoid blind links!
      });

      if (linkMode === "suggested_section" && prospectiveTerms.size > 0) {
        synthesisText += "\n\n### 💡 Vorgeschlagene neue Notizen (Wissenslücken)\n";
        prospectiveTerms.forEach((term) => {
          const slug = term
            .toLowerCase()
            .replace(/ä/g, "ae")
            .replace(/ö/g, "oe")
            .replace(/ü/g, "ue")
            .replace(/ß/g, "ss")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          synthesisText += `- [[${slug}|${term}]] *(Notiz noch nicht im Vault vorhanden)*\n`;
        });
      }
    } else {
      // "all_concepts" mode: Convert all **Term** into [[slug|Term]]
      synthesisText = rawSynthesisText.replace(/\*\*([^*]+)\*\*/g, (match, term) => {
        const cleanTerm = term.trim();
        if (cleanTerm.length > 2 && !cleanTerm.includes("\n") && !cleanTerm.startsWith("#")) {
          const slug = cleanTerm
            .toLowerCase()
            .replace(/ä/g, "ae")
            .replace(/ö/g, "oe")
            .replace(/ü/g, "ue")
            .replace(/ß/g, "ss")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          if (slug) return `[[${slug}|${cleanTerm}]]`;
        }
        return match;
      });
    }

    new SynthesisResultModal(this.plugin.app, selected, synthesisText, modelName).open();
    hoverBar.setText(`${modelName} Synthese für ${selected.length} Notizen abgeschlossen.`);
  }
};

var SynthesisResultModal = class extends import_obsidian4.Modal {
  constructor(app, selectedNodes, synthesisText, modelName = "LLM") {
    super(app);
    this.selectedNodes = selectedNodes;
    this.synthesisText = synthesisText;
    this.modelName = modelName;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.maxHeight = "80vh";
    contentEl.style.overflowY = "auto";

    contentEl.createEl("h2", { text: `KI-Wissenssynthese (${this.modelName})` });
    contentEl.createEl("p", {
      text: `Verknüpfte Notizen: ${this.selectedNodes.map((n) => n.title).join(", ")}`,
      style: "color: var(--text-muted); font-size: 0.9em;"
    });

    const resultBox = contentEl.createEl("div");
    resultBox.style.background = "var(--background-secondary)";
    resultBox.style.padding = "12px 16px";
    resultBox.style.borderRadius = "6px";
    resultBox.style.whiteSpace = "pre-wrap";
    resultBox.style.fontFamily = "var(--font-monospace)";
    resultBox.style.fontSize = "0.9em";
    resultBox.style.margin = "12px 0";
    resultBox.setText(this.synthesisText);

    const btnRow = contentEl.createEl("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "10px";
    btnRow.style.justifyContent = "flex-end";

    const saveBtn = btnRow.createEl("button", {
      text: "Als Synthese-Notiz speichern (wiki/synthesis/)",
      style: "background: var(--interactive-accent); color: var(--text-on-accent);"
    });

    const closeBtn = btnRow.createEl("button", { text: "Schließen" });
    closeBtn.onclick = () => this.close();

    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.setText("Speichere...");
      const slug = this.selectedNodes.map((n) => n.id).join("-").slice(0, 50).toLowerCase();
      const fileName = `wiki/synthesis/synthese-${slug}.md`;
      const frontmatter = `---
type: synthesis
title: "Synthese: ${this.selectedNodes.map((n) => n.title).join(" & ")}"
description: "Automatisch von ${this.modelName} generierte Wissenssynthese."
status: draft
sources: [${this.selectedNodes.map((n) => `"${n.path}"`).join(", ")}]
generated:
  by: "${this.modelName}"
  at: "${new Date().toISOString()}"
---

# Synthese: ${this.selectedNodes.map((n) => `[[${n.id}|${n.title}]]`).join(" & ")}

${this.synthesisText}
`;
      await this.app.vault.create(fileName, frontmatter);
      new import_obsidian4.Notice(`Synthese-Notiz erfolgreich unter '${fileName}' gespeichert!`);
      this.close();
    };
  }
};

var RelationBuilderModal = class extends import_obsidian4.Modal {
  constructor(app, plugin, selectedNodes) {
    super(app);
    this.plugin = plugin;
    this.selectedNodes = selectedNodes || [];
    this.focalIndex = 0;
    this.topology = "FOCAL_TO_REST";
    this.relType = "REQUIRES";
    this.relDesc = "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.maxHeight = "85vh";
    contentEl.style.overflowY = "auto";
    contentEl.style.padding = "20px";

    const count = this.selectedNodes.length;

    // Header Badge
    const headerRow = contentEl.createEl("div", {
      style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 12px;"
    });

    const headerLeft = headerRow.createEl("div", { style: "display: flex; align-items: center; gap: 10px;" });
    headerLeft.createEl("div", { style: "width: 10px; height: 10px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981;" });
    headerLeft.createEl("h3", { text: "Beziehung & Graph-Kante erstellen", style: "margin: 0; font-size: 1.1em; font-weight: 700;" });

    headerRow.createEl("span", {
      text: `${count} Notizen gewählt`,
      style: "font-family: monospace; font-size: 0.8em; padding: 4px 10px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border-radius: 12px; border: 1px solid rgba(96, 165, 250, 0.3);"
    });

    // STEP 1: Topology Selection Card
    const step1 = contentEl.createEl("div", {
      style: "background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.06); margin-bottom: 16px;"
    });

    step1.createEl("div", { text: "1. Kanten-Topologie & Richtung", style: "font-size: 0.85em; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;" });

    const topolRow = step1.createEl("div", { style: "display: flex; gap: 8px; margin-bottom: 10px;" });

    const topologies = [
      { id: "FOCAL_TO_REST", label: "Stern (A ➔ Rest)" },
      { id: "REST_TO_FOCAL", label: "Fokus (Rest ➔ A)" },
      { id: "CHAIN", label: "Kette (1 ➔ 2 ➔ 3)" }
    ];

    const topolBtns = [];
    topologies.forEach((t) => {
      const btn = topolRow.createEl("button", { text: t.label });
      btn.style.flex = "1";
      btn.style.fontSize = "0.8em";
      btn.style.padding = "6px 8px";
      btn.style.borderRadius = "6px";
      btn.style.cursor = "pointer";
      btn.style.transition = "all 0.15s ease";

      const updateTopolStyle = () => {
        const isActive = this.topology === t.id;
        btn.style.background = isActive ? "#3b82f6" : "rgba(15, 23, 42, 0.6)";
        btn.style.color = isActive ? "#ffffff" : "#94a3b8";
        btn.style.border = isActive ? "1px solid #60a5fa" : "1px solid rgba(255, 255, 255, 0.08)";
      };

      btn.onclick = () => {
        this.topology = t.id;
        topolBtns.forEach((b) => b.update());
        if (focalWrap) focalWrap.style.display = this.topology === "CHAIN" ? "none" : "block";
        updateCypherPreview();
      };

      btn.update = updateTopolStyle;
      updateTopolStyle();
      topolBtns.push(btn);
    });

    const focalWrap = step1.createEl("div", { style: "margin-top: 10px; display: flex; align-items: center; gap: 10px;" });
    focalWrap.createEl("span", { text: "Haupt-Knoten (A):", style: "font-size: 0.85em; font-weight: 600; color: #cbd5e1; white-space: nowrap;" });

    const focalSelect = focalWrap.createEl("select", {
      style: "flex: 1; padding: 5px 10px; font-size: 0.85em; border-radius: 6px; background: rgba(15, 23, 42, 0.8); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.12);"
    });
    this.selectedNodes.forEach((n, idx) => {
      const opt = focalSelect.createEl("option", { text: `[${n.type.toUpperCase()}] ${n.title}`, value: String(idx) });
      if (idx === this.focalIndex) opt.selected = true;
    });
    focalSelect.onchange = () => {
      this.focalIndex = parseInt(focalSelect.value, 10) || 0;
      updateCypherPreview();
    };

    if (this.topology === "CHAIN") focalWrap.style.display = "none";

    // STEP 2: Relationship Type Chip Badges
    const step2 = contentEl.createEl("div", {
      style: "background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.06); margin-bottom: 16px;"
    });

    step2.createEl("div", { text: "2. Beziehungs-Typ (Label)", style: "font-size: 0.85em; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;" });

    const chipWrap = step2.createEl("div", { style: "display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;" });

    const typeChips = [
      { val: "REQUIRES", label: "REQUIRES (Benötigt)", color: "#3b82f6" },
      { val: "PROVES", label: "PROVES (Beweist)", color: "#10b981" },
      { val: "IMPLIES", label: "IMPLIES (Impliziert)", color: "#8b5cf6" },
      { val: "DEFINES", label: "DEFINES (Definiert)", color: "#06b6d4" },
      { val: "EXTENDS", label: "EXTENDS (Erweitert)", color: "#6366f1" },
      { val: "CONTRADICTS", label: "CONTRADICTS (Widerspricht)", color: "#ef4444" },
      { val: "USES", label: "USES (Nutzt)", color: "#f59e0b" },
      { val: "CUSTOM", label: "Frei...", color: "#ec4899" }
    ];

    const customInput = step2.createEl("input", {
      type: "text",
      placeholder: "Eigener Typ (z. B. IS_HOMOMORPHIC_TO)...",
      style: "width: 100%; font-size: 0.85em; padding: 6px 10px; border-radius: 6px; background: rgba(15, 23, 42, 0.8); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.15); display: none;"
    });

    const chipBtns = [];
    typeChips.forEach((chip) => {
      const btn = chipWrap.createEl("button", { text: chip.label });
      btn.style.fontSize = "0.78em";
      btn.style.fontWeight = "600";
      btn.style.padding = "4px 10px";
      btn.style.borderRadius = "14px";
      btn.style.cursor = "pointer";
      btn.style.transition = "all 0.15s ease";

      const updateChipStyle = () => {
        const isActive = this.relType === chip.val || (chip.val === "CUSTOM" && !typeChips.some((t) => t.val === this.relType));
        btn.style.background = isActive ? chip.color : "rgba(15, 23, 42, 0.5)";
        btn.style.color = isActive ? "#ffffff" : "#94a3b8";
        btn.style.border = isActive ? `1px solid ${chip.color}` : "1px solid rgba(255, 255, 255, 0.08)";
      };

      btn.onclick = () => {
        if (chip.val === "CUSTOM") {
          customInput.style.display = "block";
          this.relType = customInput.value.toUpperCase().replace(/\s+/g, "_") || "RELATED_TO";
        } else {
          customInput.style.display = "none";
          this.relType = chip.val;
        }
        chipBtns.forEach((b) => b.update());
        updateCypherPreview();
      };

      btn.update = updateChipStyle;
      updateChipStyle();
      chipBtns.push(btn);
    });

    customInput.oninput = () => {
      this.relType = customInput.value.toUpperCase().replace(/\s+/g, "_") || "RELATED_TO";
      updateCypherPreview();
    };

    // STEP 3: Description Textarea
    const step3 = contentEl.createEl("div", {
      style: "background: rgba(30, 41, 59, 0.5); padding: 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.06); margin-bottom: 16px;"
    });

    step3.createEl("div", { text: "3. Warum sind diese Notizen verbunden? (Beschreibung)", style: "font-size: 0.85em; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;" });

    const descArea = step3.createEl("textarea", {
      placeholder: "Beschreibe den fachlichen/didaktischen Grund der Verbindung...",
      style: "width: 100%; height: 64px; font-size: 0.85em; padding: 8px 10px; border-radius: 6px; background: rgba(15, 23, 42, 0.8); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.12); resize: vertical;"
    });
    descArea.oninput = () => {
      this.relDesc = descArea.value;
      updateCypherPreview();
    };

    // STEP 4: Collapsible Cypher Code Details Box
    const details = contentEl.createEl("details", {
      style: "background: rgba(15, 23, 42, 0.6); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.06); margin-bottom: 16px; font-size: 0.85em;"
    });

    const summary = details.createEl("summary", {
      text: "▶ Memgraph Cypher Code Vorschau anzeigen",
      style: "cursor: pointer; font-weight: 600; color: #38bdf8;"
    });

    const cypherBox = details.createEl("pre", {
      style: "background: #0f172a; color: #38bdf8; padding: 10px; border-radius: 6px; font-family: var(--font-monospace); font-size: 0.8em; overflow-x: auto; white-space: pre-wrap; margin-top: 8px; border: 1px solid rgba(56, 189, 248, 0.2);"
    });

    const generateEdges = () => {
      const edges = [];
      const focal = this.selectedNodes[this.focalIndex] || this.selectedNodes[0];

      if (this.topology === "CHAIN") {
        for (let i = 0; i < this.selectedNodes.length - 1; i++) {
          edges.push({ src: this.selectedNodes[i], tgt: this.selectedNodes[i + 1] });
        }
      } else if (this.topology === "REST_TO_FOCAL") {
        this.selectedNodes.forEach((n, idx) => {
          if (idx !== this.focalIndex) {
            edges.push({ src: n, tgt: focal });
          }
        });
      } else {
        this.selectedNodes.forEach((n, idx) => {
          if (idx !== this.focalIndex) {
            edges.push({ src: focal, tgt: n });
          }
        });
      }
      return edges;
    };

    const updateCypherPreview = () => {
      const typeStr = this.relType || "REQUIRES";
      const descEscaped = (this.relDesc || "").replace(/"/g, '\\"');
      const edges = generateEdges();

      const lines = [];
      const nodeMap = new Map();
      let nodeCounter = 0;

      edges.forEach((e) => {
        if (!nodeMap.has(e.src.id)) {
          const alias = `n${nodeCounter++}`;
          nodeMap.set(e.src.id, { alias, node: e.src });
        }
        if (!nodeMap.has(e.tgt.id)) {
          const alias = `n${nodeCounter++}`;
          nodeMap.set(e.tgt.id, { alias, node: e.tgt });
        }
      });

      Array.from(nodeMap.values()).forEach((item) => {
        const titleEscaped = item.node.title.replace(/"/g, '\\"');
        lines.push(`MERGE (${item.alias}:Note {id: "${item.node.id}"}) ON CREATE SET ${item.alias}.title = "${titleEscaped}", ${item.alias}.path = "${item.node.path}", ${item.alias}.type = "${item.node.type}"`);
      });

      edges.forEach((e, idx) => {
        const srcAlias = nodeMap.get(e.src.id).alias;
        const tgtAlias = nodeMap.get(e.tgt.id).alias;
        lines.push(`MERGE (${srcAlias})-[r${idx}:${typeStr} { description: "${descEscaped}", source_path: "${e.src.path}", target_path: "${e.tgt.path}", created_at: datetime() }]->(${tgtAlias})`);
      });

      const returnParts = edges.map((_, idx) => `r${idx}`).join(", ");
      lines.push(`RETURN ${returnParts};`);

      cypherBox.setText(lines.join("\n"));
    };

    updateCypherPreview();

    // Action Footer
    const btnRow = contentEl.createEl("div", { style: "display: flex; gap: 10px; justify-content: flex-end; align-items: center;" });

    const copyCypherBtn = btnRow.createEl("button", { text: "Cypher kopieren" });
    copyCypherBtn.style.fontSize = "0.82em";
    copyCypherBtn.style.padding = "6px 12px";
    copyCypherBtn.style.borderRadius = "6px";
    copyCypherBtn.style.cursor = "pointer";
    copyCypherBtn.style.background = "rgba(30, 41, 59, 0.8)";
    copyCypherBtn.style.color = "#f8fafc";
    copyCypherBtn.style.border = "1px solid rgba(255, 255, 255, 0.1)";

    const saveVaultBtn = btnRow.createEl("button", { text: "In Obsidian & Cypher speichern" });
    saveVaultBtn.style.fontSize = "0.82em";
    saveVaultBtn.style.fontWeight = "700";
    saveVaultBtn.style.padding = "6px 14px";
    saveVaultBtn.style.borderRadius = "6px";
    saveVaultBtn.style.cursor = "pointer";
    saveVaultBtn.style.background = "linear-gradient(135deg, #10b981, #06b6d4)";
    saveVaultBtn.style.color = "#ffffff";
    saveVaultBtn.style.border = "none";
    saveVaultBtn.style.boxShadow = "0 2px 10px rgba(16, 185, 129, 0.3)";

    const closeBtn = btnRow.createEl("button", { text: "Schließen" });
    closeBtn.style.fontSize = "0.82em";
    closeBtn.style.padding = "6px 12px";
    closeBtn.style.borderRadius = "6px";

    closeBtn.onclick = () => this.close();

    copyCypherBtn.onclick = () => {
      navigator.clipboard.writeText(cypherBox.innerText);
      copyCypherBtn.setText("Kopiert!");
      setTimeout(() => copyCypherBtn.setText("Cypher kopieren"), 2000);
    };

    saveVaultBtn.onclick = async () => {
      saveVaultBtn.disabled = true;
      saveVaultBtn.setText("Speichere...");
      const typeStr = this.relType || "REQUIRES";
      const edges = generateEdges();

      let savedCount = 0;
      for (const e of edges) {
        const slugA = e.src.id.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const slugB = e.tgt.id.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const relFileName = `wiki/relations/rel-${slugA}-to-${slugB}.md`;

        const relContent = `---
type: relation
title: "${e.src.title} -> ${e.tgt.title}"
relation_type: "${typeStr}"
source_note: "[[${e.src.id}]]"
target_note: "[[${e.tgt.id}]]"
generated:
  by: "LLM Wiki Co-Pilot 2D Graph Engine"
  at: "${new Date().toISOString()}"
---

# relation: [[${e.src.id}|${e.src.title}]] -[${typeStr}]-> [[${e.tgt.id}|${e.tgt.title}]]

## Didaktischer / Fachlicher Grund
${this.relDesc || "Keine zusätzliche Beschreibung angegeben."}

## Memgraph Cypher
\`\`\`cypher
MATCH (a:Note {id: "${e.src.id}"}), (b:Note {id: "${e.tgt.id}"})
MERGE (a)-[r:${typeStr} { description: "${(this.relDesc || "").replace(/"/g, '\\"')}", source_path: "${e.src.path}", target_path: "${e.tgt.path}", created_at: datetime() }]->(b)
RETURN r;
\`\`\`
`;
        try {
          const existing = this.app.vault.getAbstractFileByPath(relFileName);
          if (existing) {
            await this.app.vault.modify(existing, relContent);
          } else {
            await this.app.vault.create(relFileName, relContent);
          }
          savedCount++;
        } catch (err) {
          console.log("Vault relation file append fallback:", err);
        }
      }

      new import_obsidian4.Notice(`${savedCount} Beziehungs-Notizen erfolgreich in 'wiki/relations/' gespeichert!`);

      // Instant seamless real-time update of active 2D Scatterplot Views
      try {
        const scatterLeaves = this.app.workspace.getLeavesOfType(MATH_VECTOR_SCATTER_VIEW_TYPE);
        for (const leaf of scatterLeaves) {
          if (leaf.view && typeof leaf.view.scanVaultNotes === "function") {
            leaf.view.showEdges = true;
            await leaf.view.scanVaultNotes();
            const canvas = leaf.view.containerEl.querySelector("canvas");
            if (canvas) {
              const ctx = canvas.getContext("2d");
              leaf.view.draw(ctx, canvas.clientWidth, canvas.clientHeight);
            }
          }
        }
      } catch (err) {
        console.log("Real-time scatterplot refresh fallback:", err);
      }

      this.close();
    };
  }
};

var LLMMathWikiPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.sidebarView = null;
  }
  async onload() {
    console.log("Loading MemVector Knowledge Engine Plugin...");
    await this.loadSettings();
    this.addSettingTab(new MathWikiSettingTab(this.app, this));
    this.registerView(
      MATH_WIKI_VIEW_TYPE,
      (leaf) => {
        const view = new MathWikiSidebarView(leaf);
        this.sidebarView = view;
        return view;
      }
    );
    this.registerView(
      MATH_VECTOR_SCATTER_VIEW_TYPE,
      (leaf) => new VectorScatterView(leaf, this)
    );
    this.addRibbonIcon("function-square", "MemVector Co-Pilot Seitenleiste", () => {
      this.activateSidebarView();
    });
    this.addRibbonIcon("dot-network", "MemVector 2D Vektorraum", () => {
      this.activateVectorScatterView();
    });
    this.addCommand({
      id: "open-math-wiki-sidebar",
      name: "MemVector: Seitenleiste \xF6ffnen",
      callback: () => this.activateSidebarView()
    });
    this.addCommand({
      id: "open-math-vector-scatterplot",
      name: "MemVector: 2D Vektor-Scatterplot \xF6ffnen",
      callback: () => this.activateVectorScatterView()
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (this.sidebarView) {
          this.sidebarView.renderView();
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        if (this.sidebarView) {
          this.sidebarView.renderView();
        }
      })
    );
  }
  async activateSidebarView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(MATH_WIKI_VIEW_TYPE)[0];
    if (!leaf) {
      let rightLeaf = workspace.getRightLeaf(false);
      if (!rightLeaf) {
        rightLeaf = workspace.getRightLeaf(true);
      }
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: MATH_WIKI_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
  async activateVectorScatterView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(MATH_VECTOR_SCATTER_VIEW_TYPE)[0];
    if (!leaf) {
      const mainLeaf = workspace.getLeaf(true);
      if (mainLeaf) {
        leaf = mainLeaf;
        await leaf.setViewState({ type: MATH_VECTOR_SCATTER_VIEW_TYPE, active: true });
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  onunload() {
    console.log("Unloading MemVector Knowledge Engine Plugin.");
  }
};
