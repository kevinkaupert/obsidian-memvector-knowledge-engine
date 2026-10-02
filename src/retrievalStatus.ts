/** A successful empty lookup differs from an unavailable retrieval channel. */
export type RetrievalStatus = "ready" | "unindexed" | "error";

export interface RetrievalResult<T> {
  status: RetrievalStatus;
  data: T;
}

/** Shared accessible warning treatment for context preview, synthesis and radar. */
export function renderRetrievalWarning(container: HTMLElement, message: string): void {
  container.createDiv({
    text: message,
    cls: "memvector-retrieval-warning",
    attr: { role: "status" },
  });
}
