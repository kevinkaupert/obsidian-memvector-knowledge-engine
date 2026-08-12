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

    const radarTooltip = radarWrap.createEl("div", {
      style: "position: absolute; display: none; pointer-events: none; padding: 3px 7px; border-radius: 4px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255, 255, 255, 0.2); color: #f1f5f9; font-size: 0.78em; font-weight: 500; font-family: sans-serif; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.5); whitespace: nowrap;"
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
    containerEl.createEl("h3", { text: "5. Wissensdomäne & Vektorraum-Filter" });
    new import_obsidian3.Setting(containerEl)
      .setName("Wissensdomäne / Fachbereich")
      .setDesc("Wähle zwischen universellen Notizbüchern (Allgemeines Wissen, Code, Forschung, PKM) oder spezialisierter Mathematik (LaTeX-Beweise & Formeln).")
      .addDropdown((dropdown) => dropdown
        .addOption("general", "Universelles Notizbuch (Allgemeines Wissen, Code, Forschung, PKM)")
        .addOption("math", "Mathematik & Formalwissenschaften (LaTeX-Formeln & Beweise)")
        .setValue(this.plugin.settings.knowledgeDomain || "general")
        .onChange(async (value) => {
          this.plugin.settings.knowledgeDomain = value;
          await this.plugin.saveSettings();
        })
      );
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

    containerEl.createEl("h3", { text: "6. Qdrant Vektor-Datenbank Anbindung" });
    new import_obsidian3.Setting(containerEl)
      .setName("Qdrant Server URL")
      .setDesc("HTTP-URL deiner Qdrant-Instanz (z. B. http://localhost:6333 oder Cloud-URL).")
      .addText((text) => text
        .setPlaceholder("http://localhost:6333")
        .setValue(this.plugin.settings.qdrantUrl || "http://localhost:6333")
        .onChange(async (value) => {
          this.plugin.settings.qdrantUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new import_obsidian3.Setting(containerEl)
      .setName("Qdrant Collection Name")
      .setDesc("Name der Vektor-Collection für bge-m3 Notiz-Embeddings.")
      .addText((text) => text
        .setPlaceholder("obsidian_wiki_vectors")
        .setValue(this.plugin.settings.qdrantCollection || "obsidian_wiki_vectors")
        .onChange(async (value) => {
          this.plugin.settings.qdrantCollection = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new import_obsidian3.Setting(containerEl)
      .setName("Qdrant API Key (Optional)")
      .setDesc("API-Schlüssel für Qdrant Cloud oder geschützte Server.")
      .addText((text) => text
        .setPlaceholder("Optional Key...")
        .setValue(this.plugin.settings.qdrantApiKey || "")
        .onChange(async (value) => {
          this.plugin.settings.qdrantApiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "7. Memgraph Graph-Datenbank Anbindung" });
    new import_obsidian3.Setting(containerEl)
      .setName("Memgraph Cypher HTTP Server URL")
      .setDesc("HTTP Cypher Endpoint deiner Memgraph-Instanz (z. B. http://localhost:7000).")
      .addText((text) => text
        .setPlaceholder("http://localhost:7000")
        .setValue(this.plugin.settings.memgraphUrl || "http://localhost:7000")
        .onChange(async (value) => {
          this.plugin.settings.memgraphUrl = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new import_obsidian3.Setting(containerEl)
      .setName("Memgraph Benutzername")
      .setDesc("Benutzername für Memgraph Authentifizierung (Standard: leer).")
      .addText((text) => text
        .setPlaceholder("Benutzername...")
        .setValue(this.plugin.settings.memgraphUser || "")
        .onChange(async (value) => {
          this.plugin.settings.memgraphUser = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new import_obsidian3.Setting(containerEl)
      .setName("Memgraph Passwort")
      .setDesc("Passwort für Memgraph Authentifizierung.")
      .addText((text) => text
        .setPlaceholder("Passwort...")
        .setValue(this.plugin.settings.memgraphPassword || "")
        .onChange(async (value) => {
          this.plugin.settings.memgraphPassword = value.trim();
          await this.plugin.saveSettings();
        })
      );
    new import_obsidian3.Setting(containerEl)
      .setName("Automatische Cypher-Ausführung")
      .setDesc("Führe erstellte Cypher-Kanten beim Speichern direkt auf dem Memgraph-Server aus.")
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
  radarNoteCount: 10,
  qdrantUrl: "http://localhost:6333",
  qdrantCollection: "obsidian_wiki_vectors",
  qdrantApiKey: "",
  autoSyncQdrant: false,
  memgraphUrl: "http://localhost:7000",
  memgraphUser: "",
  memgraphPassword: "",
  autoSyncMemgraph: false
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
    this.isDraggingLasso = false;
    this.dragStart = { x: 0, y: 0 };
    this.lassoPath = [];
    this.lassoSelectMode = false;
    this.hoveredNode = null;
    this.showEdges = false;
    this.relationEdges = [];
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
    this.containerEl.style.position = "relative";

    // 1. Native View Header Action Button (Top-Right Sliders Icon to toggle top toolbar)
    this.addAction("sliders", "Werkzeugleiste ein/ausblenden", () => {
      if (toolbar) {
        const isVisible = toolbar.style.display !== "none";
        toolbar.style.display = isVisible ? "none" : "flex";
      }
    });

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

    // 2. Executive Top Glassmorphism Toolbar (Collapsible via Sliders Button)
    const toolbar = container.createEl("div");
    toolbar.style.display = "flex";
    toolbar.style.alignItems = "center";
    toolbar.style.flexWrap = "wrap";
    toolbar.style.gap = "10px";
    toolbar.style.padding = "8px 16px";
    toolbar.style.borderBottom = "1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.08))";
    toolbar.style.background = "var(--background-secondary, rgba(15, 23, 42, 0.85))";
    toolbar.style.backdropFilter = "blur(12px)";
    toolbar.style.zIndex = "10";
    toolbar.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.25)";

    const titleBadge = toolbar.createEl("div", {
      style: "display: flex; align-items: center; gap: 8px; margin-right: 8px;"
    });
    titleBadge.createEl("div", {
      style: "width: 8px; height: 8px; border-radius: 50%; background: #06b6d4; box-shadow: 0 0 10px #06b6d4;"
    });
    const isMathDomain = this.plugin.settings?.knowledgeDomain === "math";

    titleBadge.createEl("span", {
      text: isMathDomain ? "2D MATH VECTOR SPACE" : "2D KNOWLEDGE VECTOR SPACE",
      style: "font-family: monospace; font-size: 0.82em; font-weight: 700; letter-spacing: 0.08em; color: var(--text-normal, #f1f5f9);"
    });

    const filterInput = toolbar.createEl("input", {
      type: "text",
      placeholder: "Filter (z.B. path:wiki -file:index)...",
      value: this.plugin.settings.vectorSearchExclusions || "-path: schema -file:index -file:log -file:README -file:AGENTS -file:PROFILE -file:canvas- -file:Beweistricks"
    });
    filterInput.style.flex = "1";
    filterInput.style.minWidth = "220px";
    filterInput.style.maxWidth = "400px";
    filterInput.style.fontSize = "0.82em";
    filterInput.style.padding = "5px 12px";
    filterInput.style.borderRadius = "20px";
    filterInput.style.border = "1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.12))";
    filterInput.style.background = "var(--background-primary, rgba(30, 41, 59, 0.7))";
    filterInput.style.color = "var(--text-normal, #f8fafc)";
    filterInput.style.outline = "none";

    const btnGroup = toolbar.createEl("div", {
      style: "display: flex; align-items: center; gap: 6px;"
    });

    const styleButton = (btn, bg, hoverBg) => {
      btn.style.fontSize = "0.78em";
      btn.style.fontWeight = "600";
      btn.style.padding = "5px 12px";
      btn.style.borderRadius = "6px";
      btn.style.cursor = "pointer";
      btn.style.border = "1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.1))";
      btn.style.background = bg;
      btn.style.color = "var(--text-normal, #f8fafc)";
      btn.style.transition = "all 0.15s ease";
      btn.onmouseenter = () => { if (!btn.disabled) btn.style.background = hoverBg; };
      btn.onmouseleave = () => { if (!btn.disabled) btn.style.background = bg; };
    };

    const refreshBtn = btnGroup.createEl("button", { text: "Scannen" });
    styleButton(refreshBtn, "var(--interactive-normal, rgba(30, 41, 59, 0.8))", "var(--interactive-hover, rgba(51, 65, 85, 0.9))");

    const calcVectorsBtn = btnGroup.createEl("button", { text: "BGE-M3 Vektoren" });
    styleButton(calcVectorsBtn, "linear-gradient(135deg, #06b6d4, #3b82f6)", "linear-gradient(135deg, #0891b2, #2563eb)");

    const showEdgesToggleBtn = btnGroup.createEl("button", { text: this.showEdges ? "Kanten [ON]" : "Kanten [OFF]" });
    styleButton(showEdgesToggleBtn, this.showEdges ? "linear-gradient(135deg, #06b6d4, #3b82f6)" : "var(--interactive-normal, rgba(30, 41, 59, 0.8))", "rgba(51, 65, 85, 0.9)");

    const lassoToggleBtn = btnGroup.createEl("button", { text: this.lassoSelectMode ? "Lasso-Select [ON]" : "Lasso-Select [OFF]" });
    styleButton(lassoToggleBtn, this.lassoSelectMode ? "var(--interactive-accent, #38bdf8)" : "var(--interactive-normal, rgba(30, 41, 59, 0.8))", "rgba(51, 65, 85, 0.9)");

    const createRelBtn = btnGroup.createEl("button", { text: "Beziehung (≥2 wählen)" });
    styleButton(createRelBtn, "linear-gradient(135deg, #10b981, #06b6d4)", "linear-gradient(135deg, #059669, #0891b2)");
    createRelBtn.disabled = true;
    createRelBtn.style.opacity = "0.5";

    const synthesizeBtn = btnGroup.createEl("button", { text: "DeepSeek-R1 Synthese (0)" });
    styleButton(synthesizeBtn, "linear-gradient(135deg, #ec4899, #8b5cf6)", "linear-gradient(135deg, #db2777, #7c3aed)");
    synthesizeBtn.disabled = true;
    synthesizeBtn.style.opacity = "0.5";

    const clearSelBtn = btnGroup.createEl("button", { text: "Leeren" });
    styleButton(clearSelBtn, "rgba(239, 68, 68, 0.15)", "rgba(239, 68, 68, 0.3)");

    const statusBadge = toolbar.createEl("div", {
      style: "margin-left: auto; display: flex; align-items: center; gap: 6px; font-family: monospace; font-size: 0.78em; color: var(--text-muted, #94a3b8); padding: 4px 10px; background: var(--background-primary, rgba(30, 41, 59, 0.5)); border-radius: 12px; border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.05));"
    });
    statusBadge.createEl("div", {
      style: "width: 6px; height: 6px; border-radius: 50%; background: #10b981;"
    });
    const statusText = statusBadge.createEl("span", { text: "Lade Vault..." });

    // 3. Canvas Container (Flex 1, 100% space)
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

    // 4. Hover Bar at Bottom
    const hoverBar = container.createEl("div");
    hoverBar.style.padding = "6px 12px";
    hoverBar.style.borderTop = "1px solid var(--border-color, rgba(255, 255, 255, 0.08))";
    hoverBar.style.background = "var(--background-secondary, rgba(15, 23, 42, 0.9))";
    hoverBar.style.fontSize = "0.85em";
    hoverBar.style.color = "var(--text-muted)";
    hoverBar.style.zIndex = "10";
    hoverBar.setText("Bewege die Maus über einen Vektor-Punkt. Ziehe mit gedrückter Shift-Taste oder Cmd-Klick zum Auswählen.");

    edgeCheckbox.onchange = async () => {
      this.showEdges = edgeCheckbox.checked;
      if (this.showEdges) {
        await this.loadRelationEdges();
      }
      this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
    };

    lassoCheckbox.onchange = () => {
      this.lassoSelectMode = lassoCheckbox.checked;
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
      synthesizeBtn.disabled = count === 0;
      synthesizeBtn.style.opacity = count === 0 ? "0.5" : "1.0";
      synthesizeBtn.setText(`DeepSeek-R1 Synthese (${count})`);

      createRelBtn.disabled = count < 2;
      createRelBtn.style.opacity = count >= 2 ? "1.0" : "0.5";
      createRelBtn.setText(count >= 2 ? `Beziehung erstellen (${count})` : "Beziehung (≥2 wählen)");

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
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const clicked = this.hitTest(mouseX, mouseY);
      if (clicked) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          if (this.selectedNodeIds.has(clicked.id)) {
            this.selectedNodeIds.delete(clicked.id);
          } else {
            this.selectedNodeIds.add(clicked.id);
          }
          updateSelectionUI();
        } else {
          this.pan.x = canvasWrap.clientWidth / 2 - clicked.x * this.zoom;
          this.pan.y = canvasWrap.clientHeight / 2 - clicked.y * this.zoom;
          this.draw(ctx, canvasWrap.clientWidth, canvasWrap.clientHeight);
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
    await this.loadRelationEdges();
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

    // 2D Kernel Density Field Heatmap Layer (Glowing Cluster Density)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const heatmapRadius = 80 * this.zoom;
    this.nodes.forEach((node) => {
      const pos = this.worldToScreen(node.x, node.y);
      if (
        pos.x >= -heatmapRadius &&
        pos.x <= width + heatmapRadius &&
        pos.y >= -heatmapRadius &&
        pos.y <= height + heatmapRadius
      ) {
        const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, heatmapRadius);
        grad.addColorStop(0, "rgba(59, 130, 246, 0.14)");
        grad.addColorStop(0.5, "rgba(139, 92, 246, 0.05)");
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
          const typeWidth = ctx.measureText(typeText).width;
          ctx.font = "9px sans-serif";
          const descWidth = descText ? ctx.measureText(descText).width : 0;

          const badgeWidth = Math.max(typeWidth, descWidth) + 14;
          const badgeHeight = descText ? 28 : 16;

          ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
          ctx.fillRect(midX - badgeWidth / 2, midY - badgeHeight / 2, badgeWidth, badgeHeight);
          ctx.strokeStyle = edgeColor;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(midX - badgeWidth / 2, midY - badgeHeight / 2, badgeWidth, badgeHeight);

          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = descText ? "top" : "middle";
          ctx.fillStyle = edgeColor;
          ctx.fillText(typeText, midX, descText ? midY - badgeHeight / 2 + 3 : midY);

          if (descText) {
            ctx.font = "9px sans-serif";
            ctx.fillStyle = "#e2e8f0";
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

      if (this.zoom > 0.6 || isSelected || isHovered) {
        ctx.fillStyle = isSelected ? "#ffffff" : isHovered ? "#e2e8f0" : "#94a3b8";
        ctx.font = `${Math.max(10, Math.min(14, 11 * this.zoom))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(node.title, pos.x, pos.y + 16 * this.zoom);
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

    hoverBar.setText("🤖 DeepSeek-R1 (7B) analysiert und synthetisiert die mathematischen Konzepte...");

    const notesSummary = selected.map((n, idx) => `
### Notiz ${idx + 1}: [${n.type.toUpperCase()}] ${n.title}
Pfad: ${n.path}
Formeln: ${n.latexFormulas.map((f) => `$${f}$`).join(", ")}
Auszug:
${n.content}
`).join("\n---\n");

    const isMath = this.plugin.settings?.knowledgeDomain === "math";

    const prompt = isMath
      ? `Du bist ein führender mathematischer Tutor und KI-Co-Pilot für ein Obsidian Studium-Wiki.
Der Benutzer hat folgende ${selected.length} mathematische Notizen im 2D-Vektorraum selektiert:

${notesSummary}

Aufgabe:
1. Erläutere präzise auf Deutsch den mathematischen Zusammenhang, die Brücke und den roten Faden zwischen diesen ${selected.length} Notizen.
2. Zeige, wie sie sich gegenseitig ergänzen, wo Vorbedingung/Beweisschritte vorliegen und welche mathematische Identität oder Struktur sie verbindet.
3. Formuliere eine saubere Synthese in Markdown mit LaTeX-Formeln ($...$) und Obsidian [[WikiLinks]] zu den Notiz-Titeln.`
      : `Du bist ein führender Wissens-Synthesizer und KI-Co-Pilot für Obsidian Knowledge Vaults.
Der Benutzer hat folgende ${selected.length} Notizen im 2D-Vektorraum selektiert:

${notesSummary}

Aufgabe:
1. Erläutere präzise auf Deutsch den inhaltlichen Zusammenhang, die Kerngedanken und den roten Faden zwischen diesen ${selected.length} Notizen.
2. Zeige, wie die Konzepte aufeinander aufbauen, sich ergänzen oder verschiedene Blickwinkel einnehmen.
3. Formuliere eine strukturierte Synthese in Markdown mit klaren Überschriften, Kernaussagen und Obsidian [[WikiLinks]] zu den Notiz-Titeln.`;

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
