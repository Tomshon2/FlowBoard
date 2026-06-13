function applyTextStyle(command) {
  const commandMap = {
    B: "bold",
    I: "italic",
    U: "underline",
    S: "strikeThrough"
  };
  document.execCommand(commandMap[command], false);
  saveActiveEditable();
}

function createFormatButton(label, title, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-style-button";
  button.title = title;
  button.textContent = label;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
  return button;
}

function applyFontSize(delta) {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  const parentSize = Number.parseInt(window.getComputedStyle(range.commonAncestorContainer.parentElement || document.body).fontSize, 10) || 14;
  span.style.fontSize = `${Math.max(10, Math.min(48, parentSize + delta))}px`;
  span.append(range.extractContents());
  range.insertNode(span);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  selection.addRange(nextRange);
  saveActiveEditable(span);
}

function applyFontFamily(fontFamily) {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  span.style.fontFamily = fontFamily;
  span.append(range.extractContents());
  range.insertNode(span);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  selection.addRange(nextRange);
  saveActiveEditable(span);
}

function saveActiveEditable(fromNode = window.getSelection()?.anchorNode) {
  const element = fromNode?.nodeType === Node.TEXT_NODE ? fromNode.parentElement : fromNode;
  const editable = element?.closest?.(".item-text");
  const itemNode = editable?.closest?.(".board-item");
  const project = getActiveProject();
  const item = project?.items.find((candidate) => candidate.id === itemNode?.dataset.id);
  if (!editable || !item) return;
  const before = structuredClone(item);
  item.html = sanitizeEditableHtml(editable.innerHTML);
  item.text = editable.textContent;
  saveState({
    historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
      projectId: state.activeProjectId,
      groupKey: `item:${item.id}:text`
    })
  });
}

function getStyleTitle(command) {
  return {
    B: "Bold",
    I: "Italic",
    U: "Underline",
    S: "Strike"
  }[command];
}

function sanitizeEditableHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, style, iframe, object").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (attribute.name.startsWith("on")) node.removeAttribute(attribute.name);
    });
  });
  return template.innerHTML;
}

function normalizeHexColor(value, fallback = "#fff1b8") {
  return isValidHex(value) ? value : fallback;
}

function getCreationColor(fallback = ticketColors[0]) {
  return normalizeHexColor(createColor?.value, fallback);
}

function isValidHex(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHexInput(value) {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
  return trimmed;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
