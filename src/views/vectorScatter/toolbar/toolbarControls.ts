export interface ToggleHandle {
  setOn(on: boolean): void;
}

export function createToggle(parent: HTMLElement, label: string, initialOn: boolean, onChange: (on: boolean) => void): ToggleHandle {
  const row = parent.createEl("div");
  row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:7px 12px; cursor:pointer;";

  const lbl = row.createEl("span", { text: label });
  lbl.style.cssText = "font-size:0.82em; color:var(--text-normal, #cbd5e1); flex:1;";

  let on = initialOn;
  const track = row.createEl("div");
  const thumb = track.createEl("div");

  const applyStyle = () => {
    track.style.cssText = `
      width:32px; height:17px; border-radius:9px; position:relative; flex-shrink:0;
      background:${on ? "#06b6d4" : "var(--background-modifier-border, rgba(100,116,139,0.5))"};
      transition: background 0.2s ease; cursor:pointer;
      border: 1px solid ${on ? "rgba(6,182,212,0.4)" : "var(--background-modifier-border, rgba(255,255,255,0.08))"};
    `;
    thumb.style.cssText = `
      width:11px; height:11px; border-radius:50%; background:#fff;
      position:absolute; top:2px; left:${on ? "17px" : "2px"};
      transition: left 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    `;
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
  row.onmouseenter = () => {
    row.style.background = "var(--background-modifier-hover, rgba(255,255,255,0.04))";
  };
  row.onmouseleave = () => {
    row.style.background = "transparent";
  };

  return { setOn: setState };
}

export function createSection(parentEl: HTMLElement, title: string, defaultOpen = true): HTMLElement {
  const section = parentEl.createEl("div");
  section.style.cssText = "border-top:1px solid var(--background-modifier-border, rgba(255,255,255,0.06));";

  const header = section.createEl("div");
  header.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:7px 12px; cursor:pointer; transition: background 0.15s ease;";
  const titleEl = header.createEl("span", { text: title });
  titleEl.style.cssText = "font-size:0.75em; font-weight:600; letter-spacing:0.04em; color:var(--text-muted, #94a3b8); text-transform:uppercase;";
  const chevron = header.createEl("span", { text: defaultOpen ? "⌃" : "⌄" });
  chevron.style.cssText = "font-size:0.72em; color:var(--text-faint, #475569); transition: transform 0.2s ease;";

  const body = section.createEl("div");
  body.style.cssText = `display:${defaultOpen ? "block" : "none"};`;

  let open = defaultOpen;
  header.onclick = () => {
    open = !open;
    body.style.display = open ? "block" : "none";
    chevron.textContent = open ? "⌃" : "⌄";
  };
  header.onmouseenter = () => {
    header.style.background = "var(--background-modifier-hover, rgba(255,255,255,0.03))";
  };
  header.onmouseleave = () => {
    header.style.background = "transparent";
  };

  return body;
}

export interface DropdownOption {
  id: string;
  label: string;
}

export function createDropdown(parent: HTMLElement, label: string, options: DropdownOption[], initialValue: string, onChange: (value: string) => void): HTMLSelectElement {
  const row = parent.createEl("div");
  row.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:6px 12px;";
  const lbl = row.createEl("span", { text: label });
  lbl.style.cssText = "font-size:0.8em; color:var(--text-muted, #94a3b8); flex:1;";

  const select = row.createEl("select");
  select.style.cssText =
    "font-size:0.75em; padding:4px 8px; border-radius:6px; border:none; outline:none; box-shadow:none; background:var(--background-primary-alt, var(--background-secondary)); color:var(--text-normal); cursor:pointer;";
  options.forEach((opt) => {
    const option = select.createEl("option", { text: opt.label, value: opt.id });
    if (opt.id === initialValue) option.selected = true;
  });
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
}

export function createActionBtn(parent: HTMLElement, label: string, onClick: (() => void) | null): HTMLButtonElement {
  const btn = parent.createEl("button", { text: label });
  btn.style.cssText = `
    width:100%; text-align:left; padding:7px 12px; background:transparent;
    border:none; border-top:1px solid var(--background-modifier-border, rgba(255,255,255,0.05));
    color:var(--text-muted, #94a3b8); font-size:0.8em; cursor:pointer;
    transition: color 0.15s ease, background 0.15s ease;
  `;
  btn.onmouseenter = () => {
    btn.style.background = "var(--background-modifier-hover, rgba(255,255,255,0.04))";
    btn.style.color = "var(--text-normal, #f1f5f9)";
  };
  btn.onmouseleave = () => {
    btn.style.background = "transparent";
    btn.style.color = "var(--text-muted, #94a3b8)";
  };
  if (onClick) btn.onclick = onClick;
  return btn;
}

export function setActionBtnEnabled(btn: HTMLButtonElement, enabled: boolean): void {
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1" : "0.35";
  btn.style.cursor = enabled ? "pointer" : "not-allowed";
  if (enabled) {
    btn.onmouseenter = () => {
      btn.style.background = "var(--background-modifier-hover, rgba(255,255,255,0.04))";
      btn.style.color = "var(--text-normal, #f1f5f9)";
    };
    btn.onmouseleave = () => {
      btn.style.background = "transparent";
      btn.style.color = "var(--text-muted, #94a3b8)";
    };
  } else {
    btn.onmouseenter = null;
    btn.onmouseleave = null;
  }
}
