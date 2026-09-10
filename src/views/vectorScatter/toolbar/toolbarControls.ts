export interface ToggleHandle {
  setOn(on: boolean): void;
}

export function createToggle(parent: HTMLElement, label: string, initialOn: boolean, onChange: (on: boolean) => void): ToggleHandle {
  const row = parent.createDiv({ cls: "memvector-toggle-row" });
  row.createSpan({ text: label, cls: "memvector-toggle-label" });

  let on = initialOn;
  const track = row.createDiv({ cls: "memvector-toggle-track" });
  const thumb = track.createDiv({ cls: "memvector-toggle-thumb" });

  const applyStyle = () => {
    track.toggleClass("is-on", on);
    thumb.toggleClass("is-on", on);
  };
  applyStyle();

  const setState = (newOn: boolean) => {
    on = newOn;
    applyStyle();
  };

  row.onclick = () => {
    setState(!on);
    onChange(on);
  };

  return { setOn: setState };
}

export function createSection(parentEl: HTMLElement, title: string, defaultOpen = true): HTMLElement {
  const section = parentEl.createDiv({ cls: "memvector-toolbar-section" });

  const header = section.createDiv({ cls: "memvector-toolbar-section-header" });
  header.createSpan({ text: title, cls: "memvector-toolbar-section-title" });
  const chevron = header.createSpan({ text: defaultOpen ? "⌃" : "⌄", cls: "memvector-toolbar-section-chevron" });

  const body = section.createDiv({ cls: "memvector-toolbar-section-body" });
  body.toggleClass("is-hidden", !defaultOpen);

  let open = defaultOpen;
  header.onclick = () => {
    open = !open;
    body.toggleClass("is-hidden", !open);
    chevron.setText(open ? "⌃" : "⌄");
  };

  return body;
}

export interface DropdownOption {
  id: string;
  label: string;
}

export function createDropdown(
  parent: HTMLElement,
  label: string,
  options: DropdownOption[],
  initialValue: string,
  onChange: (value: string) => void
): HTMLSelectElement {
  const row = parent.createDiv({ cls: "memvector-dropdown-row" });
  row.createSpan({ text: label, cls: "memvector-dropdown-label" });

  const select = row.createEl("select", { cls: "memvector-dropdown-select" });
  for (const opt of options) {
    const option = select.createEl("option", { text: opt.label, value: opt.id });
    if (opt.id === initialValue) option.selected = true;
  }
  select.onchange = () => onChange(select.value);
  return select;
}

export function createSlider(
  parent: HTMLElement,
  label: string,
  min: number,
  max: number,
  step: number,
  initialValue: number,
  displayFormatter: (val: number) => string,
  onChange: (val: number) => void
): HTMLInputElement {
  const row = parent.createDiv({ cls: "memvector-slider-row" });
  row.createSpan({ text: label, cls: "memvector-slider-label" });
  const valText = row.createSpan({ text: displayFormatter(initialValue), cls: "memvector-slider-value" });

  const input = row.createEl("input", { type: "range", cls: "memvector-slider-input" });
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initialValue);

  input.oninput = () => {
    const val = Number(input.value);
    valText.setText(displayFormatter(val));
    onChange(val);
  };
  return input;
}

export function createActionBtn(parent: HTMLElement, label: string, onClick: (() => void) | null, isPrimary = false): HTMLButtonElement {
  const btn = parent.createEl("button", { text: label, cls: "memvector-action-btn" });
  if (isPrimary) btn.addClass("is-primary");
  if (onClick) btn.onclick = onClick;
  return btn;
}

export function setActionBtnEnabled(btn: HTMLButtonElement, enabled: boolean): void {
  btn.disabled = !enabled;
}
