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
  template.content.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value || "");
      if (name.startsWith("on")) {
        node.removeAttribute(attribute.name);
        return;
      }
      if (["href", "src", "xlink:href"].includes(name) && /^\s*javascript:/i.test(value)) {
        node.removeAttribute(attribute.name);
        return;
      }
      if (name === "style") {
        const safeStyle = sanitizeInlineStyle(value);
        if (safeStyle) {
          node.setAttribute("style", safeStyle);
        } else {
          node.removeAttribute("style");
        }
        return;
      }
      if (!["class", "title", "aria-label"].includes(name)) node.removeAttribute(attribute.name);
    });
  });
  return template.innerHTML;
}

function sanitizeInlineStyle(value) {
  const safeRules = [];
  value.split(";").forEach((rule) => {
    const [rawProperty, ...rawValueParts] = rule.split(":");
    const property = rawProperty?.trim().toLowerCase();
    const ruleValue = rawValueParts.join(":").trim();
    if (!property || !ruleValue || /url\s*\(|expression\s*\(|javascript:/i.test(ruleValue)) return;
    if (property === "font-size" && /^([1-4]?\d|50)px$/.test(ruleValue)) safeRules.push(`${property}: ${ruleValue}`);
    if (property === "font-family" && /^[\w\s"',-]{1,80}$/.test(ruleValue)) safeRules.push(`${property}: ${ruleValue}`);
    if (property === "color" && (/^#[0-9a-fA-F]{6}$/.test(ruleValue) || /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(ruleValue))) {
      safeRules.push(`${property}: ${ruleValue}`);
    }
    if (["font-weight", "font-style", "text-decoration-line"].includes(property) && /^[a-z0-9\s-]{1,32}$/i.test(ruleValue)) {
      safeRules.push(`${property}: ${ruleValue}`);
    }
  });
  return safeRules.join("; ");
}

function cleanUserText(value, maxLength = 120, fallback = "") {
  const cleaned = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function confirmDangerousAction(message) {
  return new Promise((resolve) => {
    document.querySelector(".delete-confirm-backdrop")?.remove();

    const backdrop = document.createElement("div");
    backdrop.className = "delete-confirm-backdrop";
    backdrop.innerHTML = `
      <section class="delete-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
        <div class="delete-confirm-icon" aria-hidden="true">!</div>
        <div class="delete-confirm-copy">
          <p class="eyebrow">Confirm delete</p>
          <h2 id="delete-confirm-title">Delete this?</h2>
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="delete-confirm-actions">
          <button type="button" class="delete-confirm-cancel">Cancel</button>
          <button type="button" class="delete-confirm-delete">Delete</button>
        </div>
      </section>
    `;

    const close = (confirmed) => {
      backdrop.remove();
      document.removeEventListener("keydown", handleKeydown);
      resolve(confirmed);
    };
    const handleKeydown = (event) => {
      if (event.key === "Escape") close(false);
    };

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(false);
    });
    backdrop.querySelector(".delete-confirm-cancel").addEventListener("click", () => close(false));
    backdrop.querySelector(".delete-confirm-delete").addEventListener("click", () => close(true));
    document.addEventListener("keydown", handleKeydown);
    document.body.append(backdrop);
    backdrop.querySelector(".delete-confirm-cancel").focus();
  });
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
