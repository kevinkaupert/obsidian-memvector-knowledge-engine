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

// src/ClientMathEngine.ts
var import_obsidian = require("obsidian");
var ClientMathEngine = class {
  /**
   * Converts math strings (e.g. SymPy's x**2 + 2*x*y + y**2) into clean LaTeX (x^2 + 2xy + y^2).
   */
  static toLatex(exprStr) {
    if (!exprStr)
      return "";
    let latex = exprStr.trim();
    latex = latex.replace(/\*\*/g, "^");
    latex = latex.replace(/(\d+)\s*\*\s*([a-zA-Z])/g, "$1$2");
    latex = latex.replace(/([a-zA-Z0-9])\s*\*\s*([a-zA-Z])/g, "$1$2");
    latex = latex.replace(/\*/g, " ");
    latex = latex.replace(/\s+/g, " ");
    return latex.trim();
  }
  /**
   * Extracts variable names from a math expression string.
   */
  static getFreeVariables(exprStr) {
    const matches = exprStr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    const mathKeywords = /* @__PURE__ */ new Set(["sin", "cos", "tan", "sqrt", "log", "exp", "abs", "pi"]);
    const vars = /* @__PURE__ */ new Set();
    for (const m of matches) {
      if (!mathKeywords.has(m.toLowerCase())) {
        vars.add(m);
      }
    }
    return Array.from(vars).sort();
  }
  /**
   * Canonicalizes variable names to v1, v2, v3... for Alpha-Equivalence matching.
   */
  static canonicalizeVariables(exprStr) {
    const vars = this.getFreeVariables(exprStr);
    const mapping = {};
    let canonical = exprStr;
    vars.forEach((v, idx) => {
      const placeholder = `v${idx + 1}`;
      mapping[v] = placeholder;
    });
    const sortedVars = [...vars].sort((a, b) => b.length - a.length);
    for (const v of sortedVars) {
      const regex = new RegExp(`\\b${v}\\b`, "g");
      canonical = canonical.replace(regex, mapping[v]);
    }
    return { canonical, mapping };
  }
  /**
   * Checks Alpha-Equivalence between two expressions directly in JS.
   */
  static checkAlphaEquivalence(expr1, expr2) {
    const c1 = this.canonicalizeVariables(expr1);
    const c2 = this.canonicalizeVariables(expr2);
    const exp1 = this.expandExpression(c1.canonical);
    const exp2 = this.expandExpression(c2.canonical);
    if (this.normalizeExprString(exp1) === this.normalizeExprString(exp2)) {
      const varMap = {};
      const vars1 = this.getFreeVariables(expr1);
      const vars2 = this.getFreeVariables(expr2);
      vars1.forEach((v1, idx) => {
        if (vars2[idx]) {
          varMap[v1] = vars2[idx];
        }
      });
      return {
        isEquivalent: true,
        variableMapping: varMap,
        explanation: "Strukturell identisch unter Variablensubstitution (Client-Side JS Engine)."
      };
    }
    return {
      isEquivalent: false,
      explanation: "Keine direkte \xDCberdeckung durch Client-Side Regeln gefunden."
    };
  }
  /**
   * Expands basic algebraic patterns like (A + B)^2, (A - B)^2, (A - B)(A + B).
   */
  static expandExpression(exprStr) {
    let result = exprStr.trim();
    const squarePlusMatch = result.match(/^\(([^+-]+)\s*\+\s*([^+-]+)\)\s*(\^|\*\*)\s*2$/);
    if (squarePlusMatch) {
      const a = squarePlusMatch[1].trim();
      const b = squarePlusMatch[2].trim();
      return `${a}^2 + 2*${a}*${b} + ${b}^2`;
    }
    const squareMinusMatch = result.match(/^\(([^+-]+)\s*-\s*([^+-]+)\)\s*(\^|\*\*)\s*2$/);
    if (squareMinusMatch) {
      const a = squareMinusMatch[1].trim();
      const b = squareMinusMatch[2].trim();
      return `${a}^2 - 2*${a}*${b} + ${b}^2`;
    }
    return result;
  }
  /**
   * Factors basic algebraic patterns.
   */
  static factorExpression(exprStr) {
    let clean = this.normalizeExprString(exprStr);
    const binomMatch = clean.match(/^([a-zA-Z0-9]+)\^2\+2\*?\1\*?([a-zA-Z0-9]+)\+\2\^2$/);
    if (binomMatch) {
      return `(${binomMatch[1]} + ${binomMatch[2]})^2`;
    }
    return exprStr;
  }
  /**
   * Normalizes expression string spacing and operators for string comparison.
   */
  static normalizeExprString(str) {
    return str.replace(/\s+/g, "").replace(/\*\*/g, "^").replace(/\*/g, "").toLowerCase();
  }
  /**
   * Sub-expression replacement in JavaScript.
   */
  static replaceSubExpression(fullExpr, subExpr, replacement) {
    if (fullExpr.includes(subExpr)) {
      return fullExpr.replace(subExpr, replacement);
    }
    return fullExpr;
  }
  /**
   * Direct LLM Call (Ollama or DeepSeek Cloud) using Obsidian's requestUrl.
   */
  static async callDirectLLM(prompt, apiBase, apiKey, modelName) {
    try {
      const cleanBase = apiBase.replace(/\/+$/, "");
      const url = `${cleanBase}/chat/completions`;
      const headers = { "Content-Type": "application/json" };
      if (apiKey && apiKey !== "ollama") {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      const payload = {
        model: modelName || "deepseek-r1:7b",
        messages: [
          {
            role: "system",
            content: "Du bist ein Mathematik-Assistent fuer Obsidian. Erklaere mathematische Aequivalenzen und Umformungen kurz auf Deutsch."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.1
      };
      const response = await (0, import_obsidian.requestUrl)({
        url,
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        throwOnError: false
      });
      if (response.status === 200) {
        const data = response.json;
        return data.choices[0]?.message?.content || "Keine Antwort vom LLM erhalten.";
      } else {
        return `LLM API Fehler (${response.status}): ${response.text || "Verbindung abgebrochen."}`;
      }
    } catch (err) {
      return `LLM Verbindungsfehler zu '${apiBase}': ${err.message || String(err)}`;
    }
  }
  static async getOllamaEmbedding(text, apiBase = "http://localhost:11434/v1", modelName = "bge-m3") {
    try {
      const cleanBase = apiBase.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
      const url = `${cleanBase}/api/embeddings`;
      const response = await (0, import_obsidian.requestUrl)({
        url,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, prompt: text }),
        throwOnError: false
      });
      if (response.status === 200 && response.json && response.json.embedding) {
        return response.json.embedding;
      }
      return null;
    } catch (err) {
      console.error("Ollama Embedding Error:", err);
      return null;
    }
  }
};

// src/i18n.ts
var translations = {
  de: {
    // Sidebar View
    sidebarTitle: "Math Co-Pilot",
    selectSubExprHint: "Markiere eine Formel oder einen Teilausdruck im Editor mit der Maus...",
    selectedSubExpr: "Markierter Teilausdruck:",
    contextFullExpr: "Kontext (Gesamtformel):",
    calculating: "Berechne Umformungen...",
    transformationSuggestions: "Umformungs-Vorschl\xE4ge",
    expandedForm: "Ausmultipliziert: ",
    factoredForm: "Faktorisiert: ",
    replaceInEditor: "Im Editor ersetzen",
    noSuggestions: "Keine direkten Regelumformungen f\xFCr diesen Ausdruck.",
    newFullEquation: "Neue Gesamtgleichung: ",
    replacedNotice: "Teilausdruck ersetzt durch: ",
    pythonServerOffline: "Python Server nicht erreichbar.",
    // Settings Tab
    settingsTitle: "LLM Math Wiki Co-Pilot Einstellungen",
    settingsDesc: "Passen Sie Einstellungen f\xFCr Sprache, Ausl\xF6se-Modus, SymPy-Backend und LLM an.",
    languageSettingName: "Sprache (Language)",
    languageSettingDesc: "W\xE4hlen Sie die Benutzeroberfl\xE4chen-Sprache f\xFCr das Plugin.",
    triggerModeName: "Ausl\xF6se-Modus (Trigger Mode)",
    triggerModeDesc: "W\xE4hlen Sie, wie Math Co-Pilot gestartet wird.",
    triggerModeButton: "Per Button oben rechts im Editor & Rechtsklick",
    triggerModeAuto: "Automatisch bei jeder Maus-Markierung",
    executionModeName: "Ausf\xFChrungs-Engine Modus",
    executionModeDesc: "W\xE4hlen Sie, ob Berechnungen rein lokal im Browser (Standalone) oder \xFCber den Python SymPy Server ausgef\xFChrt werden.",
    autoDetectMode: "Auto-Detect (Python Server bevorzugen, sonst Standalone Engine)",
    standaloneMode: "Reiner Standalone-Modus (100% Obsidian JS Engine - Kein Python Server)",
    pythonMode: "Erzwinge Python SymPy Server",
    pythonServerUrlName: "Python REST Server URL",
    pythonServerUrlDesc: "Adresse des lokalen Python-Servers (gestartet mit 'python3 -m llm_wiki_tools.cli serve').",
    testServerBtn: "Server-Verbindung testen",
    serverOnlineNotice: "Verbindung erfolgreich! SymPy Server ist ONLINE.",
    serverOfflineNotice: "Server nicht erreichbar. Hast du 'llm-wiki-math serve' gestartet?",
    llmProviderName: "LLM Provider",
    llmProviderDesc: "W\xE4hlen Sie Ihren LLM-Provider aus.",
    apiBaseUrlName: "API Base Endpoint URL",
    apiBaseUrlDesc: "Basis-URL der LLM API (z.B. http://localhost:11434/v1 f\xFCr Ollama oder https://api.deepseek.com/v1).",
    apiKeyName: "API Key (Nur f\xFCr Cloud APIs)",
    apiKeyDesc: "F\xFCr Ollama leer lassen oder 'ollama' eintragen. F\xFCr DeepSeek Cloud Ihren sk-... Key eintragen.",
    modelNameTitle: "Modellname (Model Name)",
    modelNameDesc: "Name des Modells in Ollama/DeepSeek (z.B. 'deepseek-r1', 'deepseek-r1:8b', 'deepseek-reasoner').",
    temperatureTitle: "Temperatur (Temperature)",
    temperatureDesc: "Niedrigere Werte (0.0 - 0.2) liefern pr\xE4zisere mathematische Antworten.",
    level1Name: "Level 1: Exakte SymPy Algebra aktivieren",
    level1Desc: "Pr\xFCft exakte algebraische Gleichheit bei identischen Variablennamen ($a,b$).",
    level2Name: "Level 2: Alpha-\xC4quivalenz (Variablen-Umbennung) aktivieren",
    level2Desc: "Normalisiert freie Variablen, um (a+b)^2 und x^2+2xy+y^2 als strukturell identisch zu erkennen.",
    level3Name: "Level 3: DeepSeek-R1 LLM Reasoning aktivieren",
    level3Desc: "Nutzt das LLM f\xFCr nicht-triviale, konzeptionelle oder physikalische Herleitungen.",
    autoUpdateName: "Automatische Seitenleisten-Aktualisierung",
    autoUpdateDesc: "Aktualisiert die Seitenleiste automatisch, sobald Sie einen Teilausdruck im Editor mit der Maus markieren.",
    replaceModeName: "Ersetzungs-Modus im Editor",
    replaceModeDesc: "Bestimmt, wie die gew\xE4hlte Umformung beim Klick auf 'Ersetzen' in Ihre Notiz eingef\xFCgt wird.",
    replaceModeDirect: "Markierten Text direkt durch Umformung ersetzen",
    replaceModeNewLine: "Umformung in neuer Zeile unter dem Original einf\xFCgen (= ...)",
    // Commands & Notices
    scanVaultCmd: "Vault nach \xE4quivalenten Formeln durchsuchen",
    scanVaultNoticeStart: "Durchsuche Vault nach Formel-\xC4quivalenzen...",
    scanVaultNoticeComplete: "Scan komplett! \xC4quivalente Formeln im Vault gefunden: "
  },
  en: {
    // Sidebar View
    sidebarTitle: "Math Co-Pilot",
    selectSubExprHint: "Highlight a formula or sub-expression in the editor with your mouse...",
    selectedSubExpr: "Selected Sub-expression:",
    contextFullExpr: "Context (Full Formula):",
    calculating: "Calculating transformations...",
    transformationSuggestions: "Transformation Suggestions",
    expandedForm: "Expanded: ",
    factoredForm: "Factored: ",
    replaceInEditor: "Replace in Editor",
    noSuggestions: "No direct rule transformations for this expression.",
    newFullEquation: "New Full Equation: ",
    replacedNotice: "Sub-expression replaced with: ",
    pythonServerOffline: "Python Server unreachable.",
    // Settings Tab
    settingsTitle: "LLM Math Wiki Co-Pilot Settings",
    settingsDesc: "Configure settings for language, trigger mode, SymPy backend, and LLM.",
    languageSettingName: "Language",
    languageSettingDesc: "Select user interface language for the plugin.",
    triggerModeName: "Trigger Mode",
    triggerModeDesc: "Select how Math Co-Pilot is triggered.",
    triggerModeButton: "Via top-right editor button & right-click",
    triggerModeAuto: "Automatically on mouse highlight",
    executionModeName: "Execution Engine Mode",
    executionModeDesc: "Choose whether calculations run locally in browser (Standalone) or via Python SymPy Server.",
    autoDetectMode: "Auto-Detect (Prefer Python Server, fallback to Standalone Engine)",
    standaloneMode: "Pure Standalone Mode (100% Obsidian JS Engine - No Python Server)",
    pythonMode: "Force Python SymPy Server",
    pythonServerUrlName: "Python REST Server URL",
    pythonServerUrlDesc: "Address of the local Python server (started with 'python3 -m llm_wiki_tools.cli serve').",
    testServerBtn: "Test Server Connection",
    serverOnlineNotice: "Connection successful! SymPy Server is ONLINE.",
    serverOfflineNotice: "Server unreachable. Have you started 'llm-wiki-math serve'?",
    llmProviderName: "LLM Provider",
    llmProviderDesc: "Select your LLM provider.",
    apiBaseUrlName: "API Base Endpoint URL",
    apiBaseUrlDesc: "Base URL of LLM API (e.g. http://localhost:11434/v1 for Ollama or https://api.deepseek.com/v1).",
    apiKeyName: "API Key (Cloud APIs Only)",
    apiKeyDesc: "Leave blank or type 'ollama' for Ollama. Enter your sk-... key for DeepSeek Cloud.",
    modelNameTitle: "Model Name",
    modelNameDesc: "Name of model in Ollama/DeepSeek (e.g. 'deepseek-r1', 'deepseek-r1:8b', 'deepseek-reasoner').",
    temperatureTitle: "Temperature",
    temperatureDesc: "Lower values (0.0 - 0.2) produce more precise mathematical answers.",
    level1Name: "Enable Level 1: Exact SymPy Algebra",
    level1Desc: "Checks exact algebraic equality for identical variable names ($a,b$).",
    level2Name: "Enable Level 2: Alpha-Equivalence (Variable Renaming)",
    level2Desc: "Normalizes free variables to recognize (a+b)^2 and x^2+2xy+y^2 as structurally identical.",
    level3Name: "Enable Level 3: DeepSeek-R1 LLM Reasoning",
    level3Desc: "Uses LLM for non-trivial, conceptual, or physical derivations.",
    autoUpdateName: "Automatic Sidebar Update",
    autoUpdateDesc: "Automatically updates sidebar whenever a sub-expression is highlighted in the editor.",
    replaceModeName: "Editor Replace Mode",
    replaceModeDesc: "Determines how chosen transformation is inserted into your note when clicking 'Replace'.",
    replaceModeDirect: "Replace selected text directly with transformation",
    replaceModeNewLine: "Insert transformation on new line below original (= ...)",
    // Commands & Notices
    scanVaultCmd: "Scan Vault for Equivalent Formulas",
    scanVaultNoticeStart: "Scanning vault for formula equivalences...",
    scanVaultNoticeComplete: "Scan complete! Equivalent formulas found in vault: "
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
    return "Math Wiki Co-Pilot";
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
    try {
      await (0, import_obsidian2.loadMathJax)();
    } catch (err) {
      console.error("Failed to pre-load MathJax:", err);
    }
    await this.renderView();
  }
  renderMathElement(container, mathStr, isDisplay = false) {
    const mathWrapper = container.createEl("div", { cls: "math-rendered-node" });
    try {
      let cleanMath = ClientMathEngine.toLatex(mathStr);
      if (cleanMath.startsWith("$$") && cleanMath.endsWith("$$")) {
        cleanMath = cleanMath.slice(2, -2).trim();
      } else if (cleanMath.startsWith("$") && cleanMath.endsWith("$")) {
        cleanMath = cleanMath.slice(1, -1).trim();
      } else if (cleanMath.startsWith("\\(") && cleanMath.endsWith("\\)")) {
        cleanMath = cleanMath.slice(2, -2).trim();
      } else if (cleanMath.startsWith("\\[") && cleanMath.endsWith("\\]")) {
        cleanMath = cleanMath.slice(2, -2).trim();
      }
      const renderedNode = (0, import_obsidian2.renderMath)(cleanMath, isDisplay);
      mathWrapper.appendChild(renderedNode);
    } catch (err) {
      mathWrapper.setText(mathStr);
    }
    return mathWrapper;
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
    radarWrap.style.background = "#0f1015";
    radarWrap.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    radarWrap.style.overflow = "hidden";
    radarWrap.style.marginBottom = "10px";

    const canvas = radarWrap.createEl("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.cursor = "pointer";

    const ctx = canvas.getContext("2d");

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

        scores.push({
          file: f,
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

        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.lineWidth = 1;
        const gridSize = 40 * radarZoom;
        const startX = (centerX + radarPan.x) % gridSize;
        const startY = (centerY + radarPan.y) % gridSize;
        for (let x = startX; x < width; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = startY; y < height; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        const cX = centerX + radarPan.x;
        const cY = centerY + radarPan.y;
        const effectiveScale = baseScale * radarZoom;

        const centerSize = Math.max(3.5, 6 * Math.sqrt(radarZoom));
        ctx.beginPath();
        ctx.arc(cX, cY, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#06b6d4";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cX - centerSize, cY);
        ctx.lineTo(cX + centerSize, cY);
        ctx.moveTo(cX, cY - centerSize);
        ctx.lineTo(cX, cY + centerSize);
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        neighborNodes.forEach((node) => {
          node.x = cX + node.dx * effectiveScale;
          node.y = cY + node.dy * effectiveScale;

          const size = Math.max(2.5, 4 * Math.sqrt(radarZoom));
          ctx.beginPath();
          ctx.moveTo(node.x - size, node.y - size);
          ctx.lineTo(node.x + size, node.y + size);
          ctx.moveTo(node.x + size, node.y - size);
          ctx.lineTo(node.x - size, node.y + size);
          ctx.strokeStyle = "rgba(226, 232, 240, 0.85)";
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      };

      drawRadar();

      canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
          radarZoom = Math.min(5.0, Math.max(0.2, radarZoom * zoomFactor));
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
      };

      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (isDragging) {
          radarPan.x = e.clientX - dragStart.x;
          radarPan.y = e.clientY - dragStart.y;
          drawRadar();
        } else {
          const found = neighborNodes.find((n) => Math.hypot(mx - n.x, my - n.y) <= 14);
          canvas.title = found ? `${found.file.name}` : "";
        }
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
      detailsEl.style.marginTop = "8px";

      detailsEl.createEl("summary", {
        text: "Nahestehende Notizen (Liste anzeigen)",
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

        const scoreSpan = row.createEl("span", { text: `${item.score}` });
        scoreSpan.style.color = "var(--text-muted)";

        row.onclick = () => {
          this.app.workspace.openLinkText(item.file.basename, item.file.path, true);
        };
      });

      const synthNeighborsBtn = focusBox.createEl("button", {
        text: "Mit DeepSeek-R1 synthetisieren",
        style: "width: 100%; margin-top: 10px; font-size: 0.85em; background: var(--interactive-accent); color: var(--text-on-accent);"
      });

      synthNeighborsBtn.onclick = async () => {
        synthNeighborsBtn.disabled = true;
        synthNeighborsBtn.setText("Synthetisiere mit DeepSeek-R1...");
        const selectedNodes = [
          { id: activeFile.basename, title: activeFile.basename, path: activeFile.path, type: "active", latexFormulas: Array.from(activeFormulas), content: activeContent.slice(0, 800) },
          ...topNeighbors.slice(0, 5).map((t) => ({ id: t.file.basename, title: t.file.basename, path: t.file.path, type: "neighbor", latexFormulas: t.formulas, content: t.content }))
        ];

        const notesSummary = selectedNodes.map((n, i) => `Notiz ${i + 1}: ${n.title} (${n.path})`).join("\n");
        const prompt = `Du bist ein mathematischer Co-Pilot. Der Benutzer analysiert die Notiz '${activeFile.basename}' und ihre 5 nahen Vektor-Nachbarn:\n${notesSummary}\n\nErläutere kurz den mathematischen Zusammenhang und die Verbindung dieser Konzepte auf Deutsch.`;

        const apiBase = pluginSettings?.apiBaseUrl || "http://localhost:11434/v1";
        const apiKey = pluginSettings?.deepseekApiKey || "ollama";
        const modelName = pluginSettings?.modelName || "deepseek-r1:7b";

        const resText = await ClientMathEngine.callDirectLLM(prompt, apiBase, apiKey, modelName);
        new SynthesisResultModal(this.app, selectedNodes, resText).open();
        synthNeighborsBtn.disabled = false;
        synthNeighborsBtn.setText("Mit DeepSeek-R1 synthetisieren");
      };
    } catch (err) {
      console.error("Error rendering active note radar focus:", err);
    }
  }

  async renderView() {
    const container = this.containerEl.children[1];
    container.empty();
    const pluginSettings = this.app.plugins?.plugins?.["obsidian-llm-math-wiki"]?.settings;
    const lang = pluginSettings?.language || "de";
    const t = getTranslation(lang);
    const header = container.createEl("h3", { text: t.sidebarTitle });
    header.style.marginBottom = "15px";

    await this.renderActiveNoteFocus(container, pluginSettings);

    if (!this.selectionState || !this.selectionState.subExpr) {
      const emptyMsg = container.createEl("div", {
        text: t.selectSubExprHint
      });
      emptyMsg.style.color = "var(--text-muted)";
      emptyMsg.style.fontStyle = "italic";
      emptyMsg.style.padding = "10px 0";
      return;
    }
    const { fullExpr, subExpr } = this.selectionState;
    const selectionBox = container.createEl("div");
    selectionBox.style.background = "var(--background-secondary)";
    selectionBox.style.borderRadius = "8px";
    selectionBox.style.padding = "12px";
    selectionBox.style.marginBottom = "15px";
    selectionBox.createEl("small", { text: t.selectedSubExpr, cls: "math-label" });
    const subDisplay = selectionBox.createEl("div");
    subDisplay.style.fontSize = "1.3em";
    subDisplay.style.fontWeight = "bold";
    subDisplay.style.color = "var(--text-accent)";
    subDisplay.style.margin = "6px 0 10px 0";
    this.renderMathElement(subDisplay, subExpr, true);
    if (fullExpr && fullExpr !== subExpr) {
      selectionBox.createEl("small", { text: t.contextFullExpr, cls: "math-label" });
      const fullDisplay = selectionBox.createEl("div");
      fullDisplay.style.color = "var(--text-muted)";
      fullDisplay.style.fontSize = "1.05em";
      fullDisplay.style.marginTop = "4px";
      this.renderMathElement(fullDisplay, fullExpr, false);
    }
    const transformationsContainer = container.createEl("div");
    this.renderClientSideFallback(transformationsContainer, fullExpr, subExpr, t);
    this.renderDeepSeekSection(container, fullExpr, subExpr, pluginSettings);
    (0, import_obsidian2.finishRenderMath)();
    const mode = pluginSettings?.executionMode || "auto";
    if (mode === "standalone")
      return;
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;
    try {
      const res = await fetch(`${this.apiServerUrl}/api/subexpression`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_expr: fullExpr, sub_expr: subExpr }),
        signal
      });
      if (res.ok) {
        const data = await res.json();
        if (!signal.aborted) {
          transformationsContainer.empty();
          this.renderTransformations(
            transformationsContainer,
            data.sub_transformations || {},
            data.substituted_full_expr,
            fullExpr,
            subExpr,
            "[Level 1: SymPy Engine]",
            t
          );
          (0, import_obsidian2.finishRenderMath)();
        }
      }
    } catch (err) {
      if (err.name === "AbortError")
        return;
      if (mode === "python") {
        transformationsContainer.createEl("div", { text: t.pythonServerOffline, style: "color: var(--text-error);" });
      }
    }
  }
  renderClientSideFallback(container, fullExpr, subExpr, t) {
    const expanded = ClientMathEngine.expandExpression(subExpr);
    const factored = ClientMathEngine.factorExpression(subExpr);
    const substitutedFull = ClientMathEngine.replaceSubExpression(fullExpr, subExpr, expanded);
    const transformations = {
      original: subExpr,
      expanded: expanded !== subExpr ? expanded : void 0,
      factored: factored !== subExpr ? factored : void 0
    };
    this.renderTransformations(container, transformations, substitutedFull, fullExpr, subExpr, "[Level 1: Client JS Engine]", t);
  }
  renderTransformations(container, subTrans, substitutedFull, fullExpr, subExpr, engineBadge, t) {
    const transBox = container.createEl("div");
    transBox.style.background = "var(--background-primary-alt)";
    transBox.style.border = "1px solid var(--background-modifier-border)";
    transBox.style.borderRadius = "8px";
    transBox.style.padding = "12px";
    transBox.style.marginBottom = "15px";
    const header = transBox.createEl("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "12px";
    header.createEl("h4", { text: t.transformationSuggestions, style: "margin:0;" });
    header.createEl("span", {
      text: engineBadge,
      style: "background: var(--background-secondary); padding: 2px 8px; border-radius: 4px; font-size: 0.75em; color: var(--text-accent);"
    });
    let hasSuggestions = false;
    if (subTrans.expanded && subTrans.expanded !== subExpr) {
      hasSuggestions = true;
      const expItem = transBox.createEl("div");
      expItem.style.marginBottom = "12px";
      expItem.style.display = "flex";
      expItem.style.flexDirection = "column";
      expItem.style.gap = "4px";
      expItem.createEl("strong", { text: t.expandedForm });
      const mathContainer = expItem.createEl("div");
      mathContainer.style.fontSize = "1.1em";
      this.renderMathElement(mathContainer, subTrans.expanded, true);
      const btn = expItem.createEl("button", { text: t.replaceInEditor });
      btn.style.alignSelf = "flex-start";
      btn.style.marginTop = "4px";
      btn.onclick = () => {
        if (this.onReplaceCallback) {
          const latexText = ClientMathEngine.toLatex(subTrans.expanded);
          this.onReplaceCallback(latexText);
          new import_obsidian2.Notice(`${t.replacedNotice} ${latexText}`);
        }
      };
    }
    if (subTrans.factored && subTrans.factored !== subExpr) {
      hasSuggestions = true;
      const factItem = transBox.createEl("div");
      factItem.style.marginBottom = "12px";
      factItem.style.display = "flex";
      factItem.style.flexDirection = "column";
      factItem.style.gap = "4px";
      factItem.createEl("strong", { text: t.factoredForm });
      const mathContainer = factItem.createEl("div");
      mathContainer.style.fontSize = "1.1em";
      this.renderMathElement(mathContainer, subTrans.factored, true);
      const btn = factItem.createEl("button", { text: t.replaceInEditor });
      btn.style.alignSelf = "flex-start";
      btn.style.marginTop = "4px";
      btn.onclick = () => {
        if (this.onReplaceCallback) {
          const latexText = ClientMathEngine.toLatex(subTrans.factored);
          this.onReplaceCallback(latexText);
          new import_obsidian2.Notice(`${t.replacedNotice} ${latexText}`);
        }
      };
    }
    if (!hasSuggestions) {
      transBox.createEl("div", { text: t.noSuggestions, style: "color: var(--text-muted);" });
    }
    if (substitutedFull && substitutedFull !== fullExpr) {
      const fullResBox = transBox.createEl("div");
      fullResBox.style.marginTop = "14px";
      fullResBox.style.paddingTop = "10px";
      fullResBox.style.borderTop = "1px dashed var(--background-modifier-border)";
      fullResBox.createEl("strong", { text: t.newFullEquation });
      const fullMathContainer = fullResBox.createEl("div");
      fullMathContainer.style.fontSize = "1.15em";
      fullMathContainer.style.marginTop = "4px";
      this.renderMathElement(fullMathContainer, substitutedFull, true);
    }
  }
  renderDeepSeekSection(container, fullExpr, subExpr, pluginSettings) {
    const llmSection = container.createEl("div");
    llmSection.style.background = "var(--background-secondary)";
    llmSection.style.borderRadius = "8px";
    llmSection.style.padding = "12px";
    llmSection.style.marginTop = "15px";
    const llmHeader = llmSection.createEl("div");
    llmHeader.style.display = "flex";
    llmHeader.style.justifyContent = "space-between";
    llmHeader.style.alignItems = "center";
    llmHeader.style.marginBottom = "8px";
    llmHeader.createEl("h4", { text: "DeepSeek-R1 LLM Reasoning", style: "margin: 0;" });
    llmHeader.createEl("span", {
      text: "[Level 3: DeepSeek]",
      style: "background: var(--background-primary); padding: 2px 8px; border-radius: 4px; font-size: 0.75em; color: var(--text-accent);"
    });
    const askBtn = llmSection.createEl("button", {
      text: "Mit DeepSeek-R1 analysieren",
      style: "width: 100%; margin-bottom: 8px;"
    });
    const llmResultBox = llmSection.createEl("div");
    llmResultBox.style.fontSize = "0.9em";
    llmResultBox.style.color = "var(--text-muted)";
    llmResultBox.style.whiteSpace = "pre-wrap";
    const runLLMAnalysis = async () => {
      askBtn.disabled = true;
      askBtn.setText("Analysiere mit DeepSeek-R1...");
      llmResultBox.setText("Sende Anfrage an Ollama / DeepSeek...");
      const prompt = `Analysiere und erklaere diesen mathematischen Teilausdruck '${subExpr}' im Kontext von '${fullExpr}'. Zeige Schritte zur Vereinfachung.`;
      const apiBase = pluginSettings?.apiBaseUrl || "http://localhost:11434/v1";
      const apiKey = pluginSettings?.deepseekApiKey || "ollama";
      const modelName = pluginSettings?.modelName || "deepseek-r1:7b";
      const resText = await ClientMathEngine.callDirectLLM(prompt, apiBase, apiKey, modelName);
      llmResultBox.setText(resText);
      askBtn.disabled = false;
      askBtn.setText("Erneut mit DeepSeek-R1 analysieren");
    };
    askBtn.onclick = runLLMAnalysis;
    if (pluginSettings?.enableLevel3LLM) {
      runLLMAnalysis();
    }
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
    const t = getTranslation(this.plugin.settings.language || "de");
    containerEl.createEl("h2", { text: t.settingsTitle });
    containerEl.createEl("p", {
      text: t.settingsDesc,
      cls: "setting-item-description"
    });
    new import_obsidian3.Setting(containerEl).setName(t.languageSettingName).setDesc(t.languageSettingDesc).addDropdown(
      (dropdown) => dropdown.addOption("de", "Deutsch").addOption("en", "English").setValue(this.plugin.settings.language || "de").onChange(async (value) => {
        this.plugin.settings.language = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    new import_obsidian3.Setting(containerEl).setName(t.triggerModeName).setDesc(t.triggerModeDesc).addDropdown(
      (dropdown) => dropdown.addOption("button", t.triggerModeButton).addOption("auto", t.triggerModeAuto).setValue(this.plugin.settings.triggerMode || "button").onChange(async (value) => {
        this.plugin.settings.triggerMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName(t.executionModeName).setDesc(t.executionModeDesc).addDropdown(
      (dropdown) => dropdown.addOption("auto", t.autoDetectMode).addOption("standalone", t.standaloneMode).addOption("python", t.pythonMode).setValue(this.plugin.settings.executionMode || "auto").onChange(async (value) => {
        this.plugin.settings.executionMode = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "1. Python SymPy Server" });
    new import_obsidian3.Setting(containerEl).setName(t.pythonServerUrlName).setDesc(t.pythonServerUrlDesc).addText(
      (text) => text.setPlaceholder("http://localhost:8000").setValue(this.plugin.settings.apiServerUrl).onChange(async (value) => {
        this.plugin.settings.apiServerUrl = value.trim();
        await this.plugin.saveSettings();
      })
    ).addButton(
      (button) => button.setButtonText(t.testServerBtn).onClick(async () => {
        try {
          const res = await fetch(`${this.plugin.settings.apiServerUrl}/`);
          if (res.ok) {
            new import_obsidian3.Notice(t.serverOnlineNotice);
          } else {
            new import_obsidian3.Notice(`Status: ${res.status}`);
          }
        } catch (e) {
          new import_obsidian3.Notice(t.serverOfflineNotice);
        }
      })
    );
    containerEl.createEl("h3", { text: "2. LLM Provider & Model" });
    new import_obsidian3.Setting(containerEl).setName(t.llmProviderName).setDesc(t.llmProviderDesc).addDropdown(
      (dropdown) => dropdown.addOption("ollama", "Ollama (Local LLM - No API Key)").addOption("deepseek", "DeepSeek Cloud API (api.deepseek.com)").addOption("openai", "OpenAI (GPT-4o)").addOption("custom", "Custom REST API Endpoint").setValue(this.plugin.settings.llmProvider).onChange(async (value) => {
        this.plugin.settings.llmProvider = value;
        if (value === "ollama") {
          this.plugin.settings.apiBaseUrl = "http://localhost:11434/v1";
          this.plugin.settings.modelName = "deepseek-r1:7b";
          this.plugin.settings.deepseekApiKey = "ollama";
        } else if (value === "deepseek") {
          this.plugin.settings.apiBaseUrl = "https://api.deepseek.com/v1";
          this.plugin.settings.modelName = "deepseek-reasoner";
        }
        await this.plugin.saveSettings();
        this.display();
      })
    );
    new import_obsidian3.Setting(containerEl).setName(t.apiBaseUrlName).setDesc(t.apiBaseUrlDesc).addText(
      (text) => text.setPlaceholder("http://localhost:11434/v1").setValue(this.plugin.settings.apiBaseUrl).onChange(async (value) => {
        this.plugin.settings.apiBaseUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName(t.apiKeyName).setDesc(t.apiKeyDesc).addText(
      (text) => text.setPlaceholder("sk-...").setValue(this.plugin.settings.deepseekApiKey).onChange(async (value) => {
        this.plugin.settings.deepseekApiKey = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName(t.modelNameTitle).setDesc(t.modelNameDesc).addText(
      (text) => text.setPlaceholder("deepseek-r1").setValue(this.plugin.settings.modelName).onChange(async (value) => {
        this.plugin.settings.modelName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName(t.temperatureTitle).setDesc(t.temperatureDesc).addSlider(
      (slider) => slider.setLimits(0, 1, 0.05).setValue(this.plugin.settings.temperature).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.temperature = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "3. Equivalence Engine Cascade" });
    new import_obsidian3.Setting(containerEl).setName(t.level1Name).setDesc(t.level1Desc).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableLevel1Sympy).onChange(async (value) => {
        this.plugin.settings.enableLevel1Sympy = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName(t.level2Name).setDesc(t.level2Desc).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableLevel2AlphaEquiv).onChange(async (value) => {
        this.plugin.settings.enableLevel2AlphaEquiv = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName(t.level3Name).setDesc(t.level3Desc).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableLevel3LLM).onChange(async (value) => {
        this.plugin.settings.enableLevel3LLM = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "4. Editor Behavior" });
    new import_obsidian3.Setting(containerEl).setName(t.autoUpdateName).setDesc(t.autoUpdateDesc).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableAutoSidebarUpdate).onChange(async (value) => {
        this.plugin.settings.enableAutoSidebarUpdate = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName(t.replaceModeName).setDesc(t.replaceModeDesc).addDropdown(
      (dropdown) => dropdown.addOption("replace", t.replaceModeDirect).addOption("insert_below", t.replaceModeNewLine).setValue(this.plugin.settings.replaceBehavior).onChange(async (value) => {
        this.plugin.settings.replaceBehavior = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "5. 2D Vektor-Graph Filter (Ausschlüsse)" });
    new import_obsidian3.Setting(containerEl)
      .setName("Pfad- & Datei-Ausschlüsse")
      .setDesc("Schließe Pfade und Dateien aus dem 2D-Scatterplot aus (z. B. -path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks). Syntax wie im Obsidian Graph View.")
      .addText((text) => text
        .setPlaceholder("-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks")
        .setValue(this.plugin.settings.vectorSearchExclusions || "-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks")
        .onChange(async (value) => {
          this.plugin.settings.vectorSearchExclusions = value;
          await this.plugin.saveSettings();
        })
      );
    new import_obsidian3.Setting(containerEl)
      .setName("Mini-Radar Notizen-Anzahl (X)")
      .setDesc("Anzahl der nahesten Vektor-Notizen (X), auf die der Mini-Radar in der Seitenleiste beim Öffnen automatisch skaliert.")
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
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  language: "de",
  triggerMode: "button",
  executionMode: "auto",
  apiServerUrl: "http://localhost:8000",
  serverTimeout: 10,
  llmProvider: "ollama",
  apiBaseUrl: "http://localhost:11434/v1",
  deepseekApiKey: "ollama",
  modelName: "deepseek-r1:7b",
  temperature: 0.1,
  enableLevel1Sympy: true,
  enableLevel2AlphaEquiv: true,
  enableLevel3LLM: true,
  maxVaultScanResults: 50,
  enableAutoSidebarUpdate: false,
  replaceBehavior: "replace",
  vectorSearchExclusions: "-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks",
  radarNoteCount: 10
};

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
    this.isDraggingBox = false;
    this.dragStart = { x: 0, y: 0 };
    this.boxStart = { x: 0, y: 0 };
    this.boxEnd = { x: 0, y: 0 };
    this.boxSelectMode = false;
    this.hoveredNode = null;
  }
  getViewType() {
    return MATH_VECTOR_SCATTER_VIEW_TYPE;
  }
  getDisplayText() {
    return "2D Math Vector Scatterplot";
  }
  getIcon() {
    return "dot-network";
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("math-vector-scatter-container");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.width = "100%";
    container.style.background = "var(--background-primary)";
    container.style.position = "relative";
    container.style.overflow = "hidden";

    const toolbar = container.createEl("div");
    toolbar.style.display = "flex";
    toolbar.style.alignItems = "center";
    toolbar.style.gap = "8px";
    toolbar.style.padding = "8px 12px";
    toolbar.style.borderBottom = "1px solid var(--border-color)";
    toolbar.style.background = "var(--background-secondary)";
    toolbar.style.zIndex = "10";

    toolbar.createEl("span", {
      text: "2D Math Vector Space",
      style: "font-weight: bold; margin-right: 12px; color: var(--text-normal);"
    });

    const filterGroup = toolbar.createEl("div", {
      style: "display: flex; align-items: center; gap: 6px; flex: 1; max-width: 480px;"
    });
    const filterInput = filterGroup.createEl("input", {
      type: "text",
      placeholder: "Filter (z.B. path:wiki -file:index)...",
      value: this.plugin.settings.vectorSearchExclusions || "-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks"
    });
    filterInput.style.width = "100%";
    filterInput.style.fontSize = "0.85em";
    filterInput.style.padding = "4px 8px";
    filterInput.style.borderRadius = "4px";
    filterInput.style.border = "1px solid var(--border-color)";
    filterInput.style.background = "var(--background-primary)";
    filterInput.style.color = "var(--text-normal)";

    const refreshBtn = toolbar.createEl("button", { text: "Scannen" });
    const calcVectorsBtn = toolbar.createEl("button", {
      text: "BGE-M3 Vektoren",
      style: "background: var(--interactive-accent); color: var(--text-on-accent); font-weight: bold;"
    });
    const boxToggleBtn = toolbar.createEl("button", { text: "Box-Select [OFF]" });
    const synthesizeBtn = toolbar.createEl("button", {
      text: "Mit DeepSeek-R1 synthetisieren (0)",
      style: "background: var(--interactive-accent); color: var(--text-on-accent);"
    });
    synthesizeBtn.disabled = true;

    const clearSelBtn = toolbar.createEl("button", { text: "Auswahl loeschen" });
    const statusText = toolbar.createEl("span", {
      text: "Lade Vault Notizen...",
      style: "margin-left: auto; font-size: 0.85em; color: var(--text-muted);"
    });

    calcVectorsBtn.onclick = async () => {
      calcVectorsBtn.disabled = true;
      calcVectorsBtn.setText("Vektorisieren...");
      statusText.setText(`Berechne bge-m3 Embeddings via Ollama (0/${this.nodes.length})...`);

      const apiBase = this.plugin.settings?.apiBaseUrl || "http://localhost:11434/v1";
      const modelName = "bge-m3";

      let done = 0;
      for (const node of this.nodes) {
        const textToEmbed = `Title: ${node.title}\nType: ${node.type}\nFormeln: ${node.latexFormulas.join(" ; ")}\nText: ${node.content}`;
        const vec = await ClientMathEngine.getOllamaEmbedding(textToEmbed, apiBase, modelName);
        if (vec) {
          node.embedding = vec;
        }
        done++;
        statusText.setText(`Berechne bge-m3 Embeddings (${done}/${this.nodes.length})...`);
      }

      statusText.setText("Berechne 2D-UMAP/PCA Clustering...");
      this.compute2DPCA(this.nodes);

      statusText.setText(`bge-m3 Vektor-Clustering komplett (${this.nodes.length} Notizen)!`);
      calcVectorsBtn.disabled = false;
      calcVectorsBtn.setText("BGE-M3 Vektoren");

      this.animateToTargets(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    };

    let filterDebounceTimer = null;
    filterInput.addEventListener("input", () => {
      clearTimeout(filterDebounceTimer);
      filterDebounceTimer = setTimeout(async () => {
        this.plugin.settings.vectorSearchExclusions = filterInput.value;
        await this.plugin.saveSettings();
        statusText.setText("Filtere Vault Notizen...");
        await this.scanVaultNotes(filterInput.value);
        updateSelectionUI();
      }, 250);
    });

    const canvasWrap = container.createEl("div");
    canvasWrap.style.flex = "1";
    canvasWrap.style.position = "relative";
    canvasWrap.style.width = "100%";
    canvasWrap.style.height = "100%";

    const canvas = canvasWrap.createEl("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.cursor = "grab";

    const ctx = canvas.getContext("2d");

    const hoverBar = container.createEl("div");
    hoverBar.style.padding = "6px 12px";
    hoverBar.style.borderTop = "1px solid var(--border-color)";
    hoverBar.style.background = "var(--background-secondary)";
    hoverBar.style.fontSize = "0.85em";
    hoverBar.style.color = "var(--text-muted)";
    hoverBar.style.zIndex = "10";
    hoverBar.setText("Bewege die Maus über einen Vektor-Punkt für Notiz-Details. Halte Shift gedrückt zum Ziehen einer 2D Box.");

    const resizeCanvas = () => {
      canvas.width = canvasWrap.clientWidth * window.devicePixelRatio;
      canvas.height = canvasWrap.clientHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    };

    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvasWrap);

    this.pan = { x: canvasWrap.clientWidth / 2, y: canvasWrap.clientHeight / 2 };

    boxToggleBtn.onclick = () => {
      this.boxSelectMode = !this.boxSelectMode;
      boxToggleBtn.setText(this.boxSelectMode ? "🔲 Box-Select [ON]" : "🔲 Box-Select [OFF]");
      boxToggleBtn.style.background = this.boxSelectMode ? "var(--interactive-accent)" : "";
      canvas.style.cursor = this.boxSelectMode ? "crosshair" : "grab";
    };

    const updateSelectionUI = () => {
      const count = this.selectedNodeIds.size;
      synthesizeBtn.disabled = count === 0;
      synthesizeBtn.setText(`✨ Mit DeepSeek-R1 synthetisieren (${count})`);
      statusText.setText(`${this.nodes.length} Notizen | ${count} ausgewählt`);
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    };

    clearSelBtn.onclick = () => {
      this.selectedNodeIds.clear();
      updateSelectionUI();
    };

    refreshBtn.onclick = async () => {
      statusText.setText("Scanne Vault Notizen...");
      await this.scanVaultNotes();
      statusText.setText(`${this.nodes.length} Notizen geladen.`);
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    };

    synthesizeBtn.onclick = () => this.runDeepSeekSynthesis(hoverBar);

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.max(0.2, Math.min(8, this.zoom * zoomFactor));

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.pan.x = mouseX - (mouseX - this.pan.x) * (newZoom / this.zoom);
      this.pan.y = mouseY - (mouseY - this.pan.y) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    });

    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const isBoxMode = this.boxSelectMode || e.shiftKey;
      if (isBoxMode) {
        this.isDraggingBox = true;
        this.boxStart = { x: mouseX, y: mouseY };
        this.boxEnd = { x: mouseX, y: mouseY };
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

      if (this.isDraggingPan) {
        this.pan.x = mouseX - this.dragStart.x;
        this.pan.y = mouseY - this.dragStart.y;
        this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
      } else if (this.isDraggingBox) {
        this.boxEnd = { x: mouseX, y: mouseY };
        this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
      } else {
        const hovered = this.hitTest(mouseX, mouseY);
        if (hovered !== this.hoveredNode) {
          this.hoveredNode = hovered;
          if (hovered) {
            const mathSample = hovered.latexFormulas.length > 0 ? ` | Formel: $${hovered.latexFormulas[0]}$` : "";
            hoverBar.setText(`📍 [${hovered.type.toUpperCase()}] ${hovered.title} (${hovered.path})${mathSample}`);
          } else {
            hoverBar.setText("Bewege die Maus über einen Vektor-Punkt für Notiz-Details. Halte Shift gedrückt zum Ziehen einer 2D Box.");
          }
          this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
        }
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.isDraggingPan) {
        this.isDraggingPan = false;
        canvas.style.cursor = this.boxSelectMode ? "crosshair" : "grab";
      }
      if (this.isDraggingBox) {
        this.isDraggingBox = false;
        const xMin = Math.min(this.boxStart.x, this.boxEnd.x);
        const xMax = Math.max(this.boxStart.x, this.boxEnd.x);
        const yMin = Math.min(this.boxStart.y, this.boxEnd.y);
        const yMax = Math.max(this.boxStart.y, this.boxEnd.y);

        if (Math.abs(xMax - xMin) > 5 && Math.abs(yMax - yMin) > 5) {
          this.nodes.forEach((node) => {
            const screenPos = this.worldToScreen(node.x, node.y);
            if (screenPos.x >= xMin && screenPos.x <= xMax && screenPos.y >= yMin && screenPos.y <= yMax) {
              this.selectedNodeIds.add(node.id);
            }
          });
        }
        updateSelectionUI();
      }
    });

    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const clicked = this.hitTest(mouseX, mouseY);
      if (clicked) {
        if (e.shiftKey) {
          if (this.selectedNodeIds.has(clicked.id)) {
            this.selectedNodeIds.delete(clicked.id);
          } else {
            this.selectedNodeIds.add(clicked.id);
          }
          updateSelectionUI();
        } else {
          this.plugin.app.workspace.openLinkText(clicked.id, clicked.path, true);
        }
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

      if (this.zoom > 0.6 || isSelected || isHovered) {
        ctx.fillStyle = isSelected ? "#ffffff" : isHovered ? "#e2e8f0" : "#94a3b8";
        ctx.font = `${Math.max(10, Math.min(14, 11 * this.zoom))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(node.title, pos.x, pos.y + 16 * this.zoom);
      }
    });

    if (this.isDraggingBox) {
      const x = Math.min(this.boxStart.x, this.boxEnd.x);
      const y = Math.min(this.boxStart.y, this.boxEnd.y);
      const w = Math.abs(this.boxEnd.x - this.boxStart.x);
      const h = Math.abs(this.boxEnd.y - this.boxStart.y);

      ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  async runDeepSeekSynthesis(hoverBar) {
    const selected = this.nodes.filter((n) => this.selectedNodeIds.has(n.id));
    if (selected.length === 0) return;

    hoverBar.setText("🤖 DeepSeek-R1 (7B) analysiert und synthetisiert die mathematischen Konzepte...");

    const notesSummary = selected.map((n, idx) => `
### Notiz ${idx + 1}: [${n.type.toUpperCase()}] ${n.title}
Pfad: ${n.path}
Formeln: ${n.latexFormulas.map((f) => `$${f}$`).join(", ")}
Auszug:
${n.content}
`).join("\n---\n");

    const prompt = `Du bist ein führender mathematischer Tutor und KI-Co-Pilot für ein Obsidian Studium-Wiki.
Der Benutzer hat folgende ${selected.length} mathematische Notizen im 2D-Vektorraum selektiert:

${notesSummary}

Aufgabe:
1. Erläutere präzise auf Deutsch den mathematischen Zusammenhang, die Brücke und den roten Faden zwischen diesen ${selected.length} Notizen.
2. Zeige, wie sie sich gegenseitig ergänzen, wo Vorbedingung/Beweisschritte vorliegen und welche mathematische Identität oder Struktur sie verbindet.
3. Formuliere eine saubere Synthese in Markdown mit LaTeX-Formeln ($...$) und Obsidian [[WikiLinks]] zu den Notiz-Titeln.`;

    const apiBase = this.plugin.settings?.apiBaseUrl || "http://localhost:11434/v1";
    const apiKey = this.plugin.settings?.deepseekApiKey || "ollama";
    const modelName = this.plugin.settings?.modelName || "deepseek-r1:7b";

    const synthesisText = await ClientMathEngine.callDirectLLM(prompt, apiBase, apiKey, modelName);

    new SynthesisResultModal(this.plugin.app, selected, synthesisText).open();
    hoverBar.setText(`DeepSeek-R1 Synthese für ${selected.length} Notizen abgeschlossen.`);
  }
};

var SynthesisResultModal = class extends import_obsidian4.Modal {
  constructor(app, selectedNodes, synthesisText) {
    super(app);
    this.selectedNodes = selectedNodes;
    this.synthesisText = synthesisText;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.maxHeight = "80vh";
    contentEl.style.overflowY = "auto";

    contentEl.createEl("h2", { text: "DeepSeek-R1 Mathe-Synthese" });
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
description: "Automatisch von DeepSeek-R1 7B generierte mathematische Synthese."
status: draft
sources: [${this.selectedNodes.map((n) => `"${n.path}"`).join(", ")}]
generated:
  by: "DeepSeek-R1 7B"
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

var LLMMathWikiPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.sidebarView = null;
    this.lastSelectionRange = null;
  }
  async onload() {
    console.log("Loading LLM Wiki Math Co-Pilot Plugin...");
    await this.loadSettings();
    this.addSettingTab(new MathWikiSettingTab(this.app, this));
    this.registerView(
      MATH_WIKI_VIEW_TYPE,
      (leaf) => {
        const view = new MathWikiSidebarView(leaf, this.settings.apiServerUrl);
        this.sidebarView = view;
        view.setReplaceCallback((replacement) => this.replaceSelectionInActiveEditor(replacement));
        return view;
      }
    );
    this.registerView(
      MATH_VECTOR_SCATTER_VIEW_TYPE,
      (leaf) => new VectorScatterView(leaf, this)
    );
    this.addRibbonIcon("function-square", "Math Co-Pilot Sidebar", () => {
      this.activateSidebarView();
    });
    this.addRibbonIcon("dot-network", "Math 2D Vector Scatterplot", () => {
      this.activateVectorScatterView();
    });
    this.addCommand({
      id: "analyze-selected-math",
      name: "Math Co-Pilot: Markierte Formel analysieren",
      editorCallback: (editor) => {
        this.analyzeCurrentSelection(editor);
      }
    });
    this.addCommand({
      id: "open-math-wiki-sidebar",
      name: "Math Co-Pilot: Seitenleiste \xF6ffnen",
      callback: () => this.activateSidebarView()
    });
    this.addCommand({
      id: "open-math-vector-scatterplot",
      name: "Math Co-Pilot: 2D Vektor-Scatterplot \xF6ffnen",
      callback: () => this.activateVectorScatterView()
    });
    this.addCommand({
      id: "scan-vault-math-equivalences",
      name: "Math Co-Pilot: Vault nach \xE4quivalenten Formeln durchsuchen",
      callback: () => this.scanVaultEquivalences()
    });
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.registerTopRightHeaderButton();
      })
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.registerTopRightHeaderButton();
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
    this.registerTopRightHeaderButton();
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection().trim();
        if (selection) {
          menu.addItem((item) => {
            item.setTitle("Math Co-Pilot: Formel analysieren").setIcon("function-square").onClick(() => {
              this.analyzeCurrentSelection(editor);
            });
          });
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor) => {
        if (this.settings.triggerMode === "auto") {
          this.handleEditorSelection(editor);
        }
      })
    );
  }
  registerTopRightHeaderButton() {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    leaves.forEach((leaf) => {
      if (leaf.view instanceof import_obsidian4.MarkdownView) {
        const view = leaf.view;
        const headerActions = view.containerEl.querySelector(".view-actions");
        if (headerActions && !headerActions.querySelector(".math-copilot-top-btn")) {
          const btn = view.addAction("function-square", "Math Co-Pilot: Formel analysieren", () => {
            this.analyzeCurrentSelection(view.editor);
          });
          if (btn) {
            btn.addClass("math-copilot-top-btn");
          }
        }
      }
    });
  }
  async analyzeCurrentSelection(editor) {
    const selectedText = editor.getSelection().trim();
    const cursor = editor.getCursor();
    const lineContent = editor.getLine(cursor.line).trim();
    const subExpr = selectedText || lineContent;
    if (!subExpr) {
      new import_obsidian4.Notice("Bitte markiere eine Formel im Editor.");
      return;
    }
    if (selectedText) {
      this.lastSelectionRange = {
        from: editor.getCursor("from"),
        to: editor.getCursor("to")
      };
    } else {
      this.lastSelectionRange = null;
    }
    await this.activateSidebarView();
    if (this.sidebarView) {
      this.sidebarView.updateSelection({
        subExpr,
        fullExpr: lineContent || subExpr
      });
    }
  }
  handleEditorSelection(editor) {
    const selectedText = editor.getSelection().trim();
    if (!selectedText)
      return;
    const cursor = editor.getCursor();
    const lineContent = editor.getLine(cursor.line).trim();
    if (selectedText) {
      this.lastSelectionRange = {
        from: editor.getCursor("from"),
        to: editor.getCursor("to")
      };
    }
    if (this.sidebarView) {
      this.sidebarView.updateSelection({
        subExpr: selectedText,
        fullExpr: lineContent || selectedText
      });
    }
  }
  replaceSelectionInActiveEditor(replacement) {
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    if (activeView) {
      const editor = activeView.editor;
      if (this.lastSelectionRange) {
        if (this.settings.replaceBehavior === "replace") {
          editor.replaceRange(replacement, this.lastSelectionRange.from, this.lastSelectionRange.to);
        } else {
          editor.replaceRange(`${editor.getRange(this.lastSelectionRange.from, this.lastSelectionRange.to)}
= ${replacement}`, this.lastSelectionRange.from, this.lastSelectionRange.to);
        }
        new import_obsidian4.Notice("Formel erfolgreich im Editor ersetzt!");
      } else {
        editor.replaceSelection(replacement);
      }
    }
  }
  async activateSidebarView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(MATH_WIKI_VIEW_TYPE)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: MATH_WIKI_VIEW_TYPE, active: true });
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
  async scanVaultEquivalences() {
    new import_obsidian4.Notice("Scanning vault for formula equivalences...");
    try {
      const vaultPath = this.app.vault.adapter.getBasePath();
      const res = await fetch(`${this.settings.apiServerUrl}/api/vault/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vault_path: vaultPath })
      });
      if (res.ok) {
        const data = await res.json();
        new import_obsidian4.Notice(`Scan komplett! ${data.total_matches} \xE4quivalente Formeln im Vault gefunden.`);
      } else {
        new import_obsidian4.Notice("Fehler beim Scannen. Ist der Python Server gestartet?");
      }
    } catch (err) {
      new import_obsidian4.Notice("Konnte Python Server nicht erreichen.");
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    if (this.sidebarView) {
      this.sidebarView.apiServerUrl = this.settings.apiServerUrl;
    }
  }
  onunload() {
    console.log("Unloading LLM Wiki Math Co-Pilot Plugin.");
  }
};
