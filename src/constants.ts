export const MATH_WIKI_VIEW_TYPE = "llm-math-wiki-sidebar";
export const MATH_VECTOR_SCATTER_VIEW_TYPE = "math-vector-scatterplot-view";

export interface CloudPalette {
  inner: string;
  outer: string;
  labelColor: string;
}

export const CLOUD_PALETTES: CloudPalette[] = [
  { inner: "rgba(100, 116, 139, 0.16)", outer: "rgba(100, 116, 139, 0.01)", labelColor: "#94a3b8" }, // Muted Slate
  { inner: "rgba(99, 102, 241, 0.16)", outer: "rgba(99, 102, 241, 0.01)", labelColor: "#a5b4fc" }, // Muted Indigo
  { inner: "rgba(20, 184, 166, 0.16)", outer: "rgba(20, 184, 166, 0.01)", labelColor: "#5eead4" }, // Muted Teal
  { inner: "rgba(168, 85, 247, 0.16)", outer: "rgba(168, 85, 247, 0.01)", labelColor: "#c084fc" }, // Muted Violet
  { inner: "rgba(234, 179, 8, 0.14)", outer: "rgba(234, 179, 8, 0.01)", labelColor: "#fde047" }, // Muted Gold
  { inner: "rgba(59, 130, 246, 0.16)", outer: "rgba(59, 130, 246, 0.01)", labelColor: "#93c5fd" }, // Muted Blue
  { inner: "rgba(16, 185, 129, 0.16)", outer: "rgba(16, 185, 129, 0.01)", labelColor: "#6ee7b7" }, // Muted Emerald
  { inner: "rgba(244, 114, 182, 0.14)", outer: "rgba(244, 114, 182, 0.01)", labelColor: "#fbcfe8" }, // Muted Rose
];
