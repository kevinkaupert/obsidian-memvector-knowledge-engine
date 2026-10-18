/** Shows `text` in the 2D view's hover bar with an optional status style. */
export function setHoverBarText(hoverBar: HTMLElement, text: string, status?: "warning" | "error" | "muted"): void {
  hoverBar.removeClass("is-warning", "is-error", "is-muted");
  if (status) hoverBar.addClass(`is-${status}`);
  hoverBar.setText(text);
}
