const levelWorkspaceForm = document.querySelector("#level-workspace-form");
const levelWorkspaceName = document.querySelector("#level-workspace-name");
const levelWorkspaceTabs = document.querySelector("#level-workspace-tabs");
const levelWorkspaceView = document.querySelector("#level-workspace-view");
let levelWorkspaceTool = "note";
let levelWorkspacePaintColor = "#434bd7";
let levelWorkspacePaintThickness = 4;

function normalizeLevelWorkspaces(project) {
  project.levelWorkspaces = (Array.isArray(project.levelWorkspaces) ? project.levelWorkspaces : []).map((level, index) => ({
    id: level.id || crypto.randomUUID(),
    name: cleanUserText(level.name, 80, `Level ${index + 1}`),
    document: String(level.document || "").slice(0, 12000),
    notes: (Array.isArray(level.notes) ? level.notes : []).map((note) => ({
      id: note.id || crypto.randomUUID(), type: note.type === "image" ? "image" : "note",
      x: clamp(Number(note.x) || 20, 0, 760), y: clamp(Number(note.y) || 20, 0, 480),
      text: String(note.text || "New note").slice(0, 1000), src: String(note.src || "")
    })),
    drawings: (Array.isArray(level.drawings) ? level.drawings : []).map((drawing) => ({
      id: drawing.id || crypto.randomUUID(), color: normalizeHexColor(drawing.color || "#434bd7", "#434bd7"),
      thickness: clamp(Number(drawing.thickness) || 4, 1, 20),
      points: (Array.isArray(drawing.points) ? drawing.points : []).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    })).filter((drawing) => drawing.points.length > 1)
  }));
  if (!project.levelWorkspaces.some((level) => level.id === project.activeLevelWorkspaceId)) {
    project.activeLevelWorkspaceId = project.levelWorkspaces[0]?.id || "";
  }
}

function getActiveLevelWorkspace(project = getActiveProject()) {
  return project?.levelWorkspaces?.find((level) => level.id === project.activeLevelWorkspaceId) || null;
}

function saveLevelWorkspace(project, before, groupKey) {
  saveState({ historyEntry: createHistoryCommand("updateProject", project.id, before, {
    levelWorkspaces: structuredClone(project.levelWorkspaces), activeLevelWorkspaceId: project.activeLevelWorkspaceId
  }, { projectId: project.id, groupKey }) });
}

function addLevelWorkspace(name) {
  const project = getActiveProject();
  if (!project) return;
  normalizeLevelWorkspaces(project);
  const before = { levelWorkspaces: structuredClone(project.levelWorkspaces), activeLevelWorkspaceId: project.activeLevelWorkspaceId };
  const level = {
    id: crypto.randomUUID(), name: cleanUserText(name, 80, `Level ${project.levelWorkspaces.length + 1}`),
    document: "", notes: [], drawings: []
  };
  project.levelWorkspaces.push(level);
  project.activeLevelWorkspaceId = level.id;
  saveLevelWorkspace(project, before, `project:${project.id}:levels`);
  renderLevelWorkspaces();
}

function updateActiveLevel(mutator, group = "edit") {
  const project = getActiveProject();
  const level = getActiveLevelWorkspace(project);
  if (!project || !level) return;
  const before = { levelWorkspaces: structuredClone(project.levelWorkspaces), activeLevelWorkspaceId: project.activeLevelWorkspaceId };
  mutator(level);
  saveLevelWorkspace(project, before, `project:${project.id}:level:${level.id}:${group}`);
}

async function removeActiveLevel() {
  const project = getActiveProject();
  const level = getActiveLevelWorkspace(project);
  if (!level || !await confirmDangerousAction(`Delete ${level.name}?`)) return;
  const before = { levelWorkspaces: structuredClone(project.levelWorkspaces), activeLevelWorkspaceId: project.activeLevelWorkspaceId };
  project.levelWorkspaces = project.levelWorkspaces.filter((entry) => entry.id !== level.id);
  project.activeLevelWorkspaceId = project.levelWorkspaces[0]?.id || "";
  saveLevelWorkspace(project, before, `project:${project.id}:levels`);
  renderLevelWorkspaces();
}

async function clearActiveLevelBoard() {
  const level = getActiveLevelWorkspace();
  if (!level || !await confirmDangerousAction(`Clear every note, image, and painting from ${level.name}?`)) return;
  updateActiveLevel((entry) => {
    entry.notes = [];
    entry.drawings = [];
  }, "clear-board");
  renderLevelWorkspaces();
}

function addLevelNote(x = 24, y = 24) {
  updateActiveLevel((level) => level.notes.push({ id: crypto.randomUUID(), type: "note", x, y, text: "New level note", src: "" }), "notes");
  renderLevelWorkspaces();
}

async function addLevelImage(file) {
  if (!file?.type?.startsWith("image/")) return;
  try {
    const imported = await prepareImportedImage(file);
    let src = imported.src;
    try { src = await uploadImportedImageToStorage(imported, file) || src; } catch {}
    updateActiveLevel((level) => level.notes.push({ id: crypto.randomUUID(), type: "image", x: 28, y: 28, text: file.name, src }), "images");
    renderLevelWorkspaces();
  } catch { window.alert("Could not import that level image."); }
}

function createLevelBoardPreview(level) {
  const width = 800;
  const height = 480;
  const drawings = level.drawings.map((drawing) => `<polyline points="${drawing.points.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="${escapeHtml(drawing.color)}" stroke-width="${drawing.thickness || 4}" stroke-linecap="round" stroke-linejoin="round" />`).join("");
  const notes = level.notes.map((note) => {
    const x = clamp(Number(note.x) || 20, 0, width - 150);
    const y = clamp(Number(note.y) || 20, 0, height - 110);
    if (note.type === "image" && note.src) {
      return `<g><rect x="${x}" y="${y}" width="150" height="110" rx="8" fill="#fff" stroke="#64748b"/><image href="${escapeHtml(note.src)}" x="${x + 5}" y="${y + 5}" width="140" height="100" preserveAspectRatio="xMidYMid meet"/></g>`;
    }
    const lines = String(note.text || "Level note").split(/\s+/).reduce((rows, word) => {
      const row = rows[rows.length - 1];
      if (!row || `${row} ${word}`.length > 20) rows.push(word); else rows[rows.length - 1] = `${row} ${word}`;
      return rows;
    }, []).slice(0, 5);
    return `<g><rect x="${x}" y="${y}" width="150" height="100" rx="8" fill="#fff1b8" stroke="#c6a72e"/>${lines.map((line, index) => `<text x="${x + 10}" y="${y + 23 + index * 16}" font-family="Arial,sans-serif" font-size="13" fill="#1d2733">${escapeHtml(line)}</text>`).join("")}</g>`;
  }).join("");
  const empty = !drawings && !notes ? `<text x="400" y="250" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#64748b">Paint, add notes, or add images in Level Design</text>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${drawings}${notes}${empty}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getLevelDocumentHeight(text, width = 340) {
  const content = String(text || "");
  const charactersPerLine = Math.max(18, Math.floor((width - 28) / 8.8));
  const visualLines = content.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return clamp(34 + visualLines * 22, 90, 720);
}

function pasteActiveLevelDocument() {
  const level = getActiveLevelWorkspace();
  if (!level) {
    showRealtimeConflictNotice("Create a level first, then add it to the main board.");
    return;
  }
  const position = getNewItemPosition(900, 330);
  const documentText = level.document || `${level.name}\n\nAdd level documentation here.`;
  const documentHeight = getLevelDocumentHeight(documentText);
  const preview = addBoardItem("image", {
    name: `${level.name} level board`, text: `${level.name} level board`, src: createLevelBoardPreview(level),
    x: position.x, y: position.y, width: 540, height: 330,
    color: "#f8fafc", boardRole: "level-preview", levelPreviewTitle: level.name, levelWorkspaceId: level.id
  }, { forceHistoryStep: true });
  addBoardItem("ticket", {
    name: `${level.name} document`, text: documentText,
    html: escapeHtml(documentText).replace(/\n/g, "<br>"),
    x: position.x + 560, y: position.y, width: 340, height: documentHeight,
    color: getCreationColor("#fff1b8"), levelWorkspaceId: level.id
  }, { forceHistoryStep: true });
  closeDrawer("side");
  window.requestAnimationFrame(() => focusBoardItem(preview.id));
  showRealtimeConflictNotice(`${level.name} was added to the main board with its document.`);
}

function renderLevelWorkspaces() {
  if (!levelWorkspaceTabs || !levelWorkspaceView) return;
  const project = getActiveProject();
  levelWorkspaceTabs.innerHTML = "";
  levelWorkspaceView.innerHTML = "";
  levelCount.textContent = "0";
  if (!project) return;
  normalizeLevelWorkspaces(project);
  levelCount.textContent = String(project.levelWorkspaces.length);
  project.levelWorkspaces.forEach((level) => {
    const tab = document.createElement("button");
    tab.type = "button"; tab.className = "level-workspace-tab"; tab.classList.toggle("active", level.id === project.activeLevelWorkspaceId);
    tab.textContent = level.name;
    tab.addEventListener("click", () => { project.activeLevelWorkspaceId = level.id; saveState(); renderLevelWorkspaces(); });
    levelWorkspaceTabs.append(tab);
  });
  const level = getActiveLevelWorkspace(project);
  if (!level) { levelWorkspaceView.innerHTML = '<p class="empty-panel-copy">Create a level to open its design board and document.</p>'; return; }
  levelWorkspaceView.innerHTML = `
    <div class="level-workspace-title"><input class="level-name" maxlength="80" value="${escapeHtml(level.name)}"><button class="small delete-task level-delete" type="button">Delete</button></div>
    <div class="level-split">
      <section class="level-canvas-column">
        <div class="level-canvas-tools">
          <button type="button" data-tool="note" class="${levelWorkspaceTool === "note" ? "active" : ""}">Note</button><button type="button" data-tool="draw" class="${levelWorkspaceTool === "draw" ? "active" : ""}">Paint</button>
          <label class="level-image-tool">Image<input type="file" accept="image/*"></label>
          <label class="level-paint-color" title="Paint color"><span>Color</span><input type="color" value="${levelWorkspacePaintColor}"></label>
          <label class="level-paint-size" title="Paint thickness"><span>Size</span><input type="range" min="1" max="20" value="${levelWorkspacePaintThickness}"><output>${levelWorkspacePaintThickness}px</output></label>
          <button type="button" class="level-clear-board">Clear board</button>
        </div>
        <div class="level-paint-palette" aria-label="Paint colors">
          ${["#1d2733", "#ffffff", "#434bd7", "#ef4444", "#f59e0b", "#22c55e", "#06b6d4", "#d946ef"].map((color) => `<button type="button" data-paint-color="${color}" class="${color === levelWorkspacePaintColor ? "active" : ""}" style="--swatch:${color}" title="Use ${color}" aria-label="Use paint color ${color}"></button>`).join("")}
        </div>
        <div class="level-mini-board"><svg class="level-drawings" aria-hidden="true"></svg><div class="level-mini-items"></div></div>
      </section>
      <label class="level-document-label">Level document<textarea class="level-document" rows="16" placeholder="Objectives, flow, enemies, obstacles, rewards, difficulty...">${escapeHtml(level.document)}</textarea></label>
    </div>`;
  const miniBoard = levelWorkspaceView.querySelector(".level-mini-board");
  const items = levelWorkspaceView.querySelector(".level-mini-items");
  const svg = levelWorkspaceView.querySelector(".level-drawings");
  const boardWidth = Math.max(1, Math.round(miniBoard.getBoundingClientRect().width));
  const boardHeight = Math.max(1, Math.round(miniBoard.getBoundingClientRect().height));
  svg.setAttribute("viewBox", `0 0 ${boardWidth} ${boardHeight}`);
  svg.setAttribute("preserveAspectRatio", "none");
  level.drawings.forEach((drawing) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    path.setAttribute("points", drawing.points.map((point) => `${point.x},${point.y}`).join(" "));
    path.setAttribute("stroke", drawing.color); path.setAttribute("fill", "none"); path.setAttribute("stroke-width", String(drawing.thickness || 4)); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  });
  level.notes.forEach((note) => {
    const node = document.createElement("div"); node.className = `level-mini-item ${note.type}`; node.style.left = `${note.x}px`; node.style.top = `${note.y}px`;
    node.innerHTML = note.type === "image" ? `<img src="${escapeHtml(note.src)}" alt="${escapeHtml(note.text)}"><button type="button">x</button>` : `<textarea>${escapeHtml(note.text)}</textarea><button type="button">x</button>`;
    node.querySelector("button").addEventListener("click", () => { updateActiveLevel((entry) => { entry.notes = entry.notes.filter((item) => item.id !== note.id); }, "notes"); renderLevelWorkspaces(); });
    node.querySelector("textarea")?.addEventListener("change", (event) => updateActiveLevel((entry) => { const target = entry.notes.find((item) => item.id === note.id); if (target) target.text = event.target.value; }, `note:${note.id}`));
    items.append(node);
  });
  levelWorkspaceView.querySelector(".level-name").addEventListener("change", (event) => { updateActiveLevel((entry) => { entry.name = cleanUserText(event.target.value, 80, "Level"); }, "name"); renderLevelWorkspaces(); });
  levelWorkspaceView.querySelector(".level-delete").addEventListener("click", removeActiveLevel);
  levelWorkspaceView.querySelector(".level-clear-board").addEventListener("click", clearActiveLevelBoard);
  levelWorkspaceView.querySelector(".level-document").addEventListener("change", (event) => updateActiveLevel((entry) => { entry.document = event.target.value.slice(0, 12000); }, "document"));
  levelWorkspaceView.querySelector('input[type="file"]').addEventListener("change", (event) => addLevelImage(event.target.files[0]));
  const colorInput = levelWorkspaceView.querySelector('.level-paint-color input[type="color"]');
  const sizeInput = levelWorkspaceView.querySelector('.level-paint-size input[type="range"]');
  const sizeOutput = levelWorkspaceView.querySelector(".level-paint-size output");
  colorInput.addEventListener("input", (event) => { levelWorkspacePaintColor = event.target.value; });
  sizeInput.addEventListener("input", (event) => { levelWorkspacePaintThickness = Number(event.target.value); sizeOutput.value = `${levelWorkspacePaintThickness}px`; });
  levelWorkspaceView.querySelectorAll("[data-paint-color]").forEach((button) => button.addEventListener("click", () => {
    levelWorkspacePaintColor = button.dataset.paintColor;
    colorInput.value = levelWorkspacePaintColor;
    levelWorkspaceView.querySelectorAll("[data-paint-color]").forEach((entry) => entry.classList.toggle("active", entry.dataset.paintColor === levelWorkspacePaintColor));
  }));
  levelWorkspaceView.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => {
    levelWorkspaceTool = button.dataset.tool;
    levelWorkspaceView.querySelectorAll("[data-tool]").forEach((entry) => entry.classList.toggle("active", entry.dataset.tool === levelWorkspaceTool));
  }));
  let points = null;
  let livePath = null;
  miniBoard.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".level-mini-item")) return;
    const rect = miniBoard.getBoundingClientRect(); const point = { x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) };
    if (levelWorkspaceTool === "note") { addLevelNote(point.x, point.y); return; }
    points = [point];
    livePath = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    livePath.classList.add("level-live-stroke");
    livePath.setAttribute("points", `${point.x},${point.y}`);
    livePath.setAttribute("stroke", levelWorkspacePaintColor);
    livePath.setAttribute("stroke-width", String(levelWorkspacePaintThickness));
    livePath.setAttribute("fill", "none");
    livePath.setAttribute("stroke-linecap", "round");
    livePath.setAttribute("stroke-linejoin", "round");
    svg.append(livePath);
    miniBoard.setPointerCapture(event.pointerId);
  });
  miniBoard.addEventListener("pointermove", (event) => {
    if (!points) return;
    const rect = miniBoard.getBoundingClientRect();
    points.push({ x: clamp(Math.round(event.clientX - rect.left), 0, Math.round(rect.width)), y: clamp(Math.round(event.clientY - rect.top), 0, Math.round(rect.height)) });
    livePath?.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  });
  const finishStroke = () => {
    if (!points) return;
    const finished = points; const color = levelWorkspacePaintColor; const thickness = levelWorkspacePaintThickness;
    points = null; livePath = null;
    if (finished.length > 1) { updateActiveLevel((entry) => entry.drawings.push({ id: crypto.randomUUID(), color, thickness, points: finished }), "drawing"); renderLevelWorkspaces(); }
  };
  miniBoard.addEventListener("pointerup", finishStroke);
  miniBoard.addEventListener("pointercancel", finishStroke);
  miniBoard.tabIndex = 0;
  miniBoard.title = "Click here and paste an image, or use the level tools";
  miniBoard.addEventListener("paste", (event) => {
    const file = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"))?.getAsFile();
    if (file) { event.preventDefault(); event.stopPropagation(); addLevelImage(file); }
  });
}

function initializeLevelWorkspaces() {
  levelWorkspaceForm?.addEventListener("submit", (event) => { event.preventDefault(); addLevelWorkspace(levelWorkspaceName.value); levelWorkspaceName.value = ""; });
  document.querySelector("#add-level-design-board")?.addEventListener("click", pasteActiveLevelDocument);
}
