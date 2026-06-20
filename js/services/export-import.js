function slugifyFileName(value, fallback = "flowboard") {
  return cleanUserText(value, 80, fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || fallback;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename, text, type) {
  downloadBlob(filename, new Blob([text], { type }));
}

function getExportProject() {
  const project = getActiveProject();
  if (!project) {
    window.alert("Open a project first.");
    return null;
  }
  normalizeTaskBoard(project);
  normalizeHourPlan(project);
  return project;
}

function exportProjectJson() {
  const project = getExportProject();
  if (!project) return;
  const payload = {
    type: "flowboard-project",
    version: 3,
    exportedAt: new Date().toISOString(),
    contents: ["project settings", "boards", "drawings", "connections", "tasks", "statuses", "team roles", "hours", "GDD", "characters", "story", "levels", "code", "milestones", "history"],
    project: structuredClone(project),
    tasksCsv: buildTasksCsv(project)
  };
  downloadTextFile(`${slugifyFileName(project.name)}.flowboard.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

async function importProjectJsonFile(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const project = payload.project || payload;
    if (!project || !Array.isArray(project.items) || !Array.isArray(project.tasks)) {
      throw new Error("That file is not a FlowBoard project JSON.");
    }
    const imported = structuredClone(project);
    imported.id = crypto.randomUUID();
    imported.name = cleanUserText(imported.name, 80, "Imported project");
    imported.modifiedAt = Date.now();
    state.projects.push(imported);
    state.activeProjectId = imported.id;
    normalizeState();
    saveAndRender();
  } catch (error) {
    window.alert(error.message || "Could not import that project JSON.");
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildTasksCsv(project) {
  const columns = new Map(getOrderedTaskColumns(project).map((column) => [column.id, column.title]));
  const members = new Map((project.teamRoles || []).map((member) => [member.id, member.name || member.role || "Member"]));
  const boardItems = new Map((project.items || []).map((item) => [item.id, getBoardItemName(item)]));
  const headers = ["title", "status", "priority", "deadline", "tags", "assignees", "progress", "linked_board_item", "description"];
  const rows = project.tasks.map((task) => [
    task.title,
    columns.get(task.columnId) || "",
    task.priority || "medium",
    task.deadline || "",
    (task.tags || []).join("|"),
    (task.assigneeIds || []).map((id) => members.get(id)).filter(Boolean).join("|"),
    task.progress || 0,
    boardItems.get(task.linkedItemId) || "",
    task.description || ""
  ]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function exportTasksCsv() {
  const project = getExportProject();
  if (!project) return;
  const csv = buildTasksCsv(project);
  downloadTextFile(`${slugifyFileName(project.name)}-tasks.csv`, csv, "text/csv;charset=utf-8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

async function importTasksCsvFile(file) {
  const project = getExportProject();
  if (!file || !project) return;
  try {
    const rows = parseCsv(await file.text());
    const headers = rows.shift()?.map((header) => header.trim().toLowerCase()) || [];
    const beforeTasks = structuredClone(project.tasks);
    const beforeColumns = structuredClone(project.taskColumns);
    const columnsByTitle = new Map(getOrderedTaskColumns(project).map((column) => [column.title.toLowerCase(), column]));
    rows.forEach((row) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
      const title = cleanUserText(record.title, 120);
      if (!title) return;
      const status = cleanUserText(record.status, 60, "To do");
      let column = columnsByTitle.get(status.toLowerCase());
      if (!column) {
        column = { id: crypto.randomUUID(), title: status, color: "#2074b4", order: project.taskColumns.length };
        project.taskColumns.push(column);
        columnsByTitle.set(status.toLowerCase(), column);
      }
      const priorityValue = String(record.priority || "").toLowerCase();
      const priority = TASK_PRIORITIES[priorityValue] ? priorityValue : "medium";
      project.tasks.push({
        id: crypto.randomUUID(),
        title,
        columnId: column.id,
        done: false,
        order: getTasksForColumn(project, column.id).length,
        estimateHours: 0,
        progress: clamp(Number(record.progress) || 0, 0, 100),
        description: String(record.description || "").slice(0, 5000),
        assigneeIds: [],
        priority,
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(record.deadline || "") ? record.deadline : "",
        tags: String(record.tags || "").split("|").map((tag) => cleanUserText(tag, 32)).filter(Boolean).slice(0, 12),
        checklist: [],
        linkedItemId: ""
      });
    });
    saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:tasks:csv-import`);
  } catch {
    window.alert("Could not import that task CSV.");
  }
}

function getProjectBounds(project) {
  const items = project.items || [];
  const drawingPoints = (project.drawings || []).flatMap((drawing) => drawing.points || []);
  if (!items.length && !drawingPoints.length) return { left: 0, top: 0, width: 1200, height: 800 };
  const left = Math.min(
    ...items.map((item) => item.x),
    ...drawingPoints.map((point) => point.x)
  );
  const top = Math.min(
    ...items.map((item) => item.y),
    ...drawingPoints.map((point) => point.y)
  );
  const right = Math.max(
    ...items.map((item) => item.x + (item.width || 220)),
    ...drawingPoints.map((point) => point.x)
  );
  const bottom = Math.max(
    ...items.map((item) => item.y + (item.height || 140)),
    ...drawingPoints.map((point) => point.y)
  );
  return {
    left: Math.max(0, left - 80),
    top: Math.max(0, top - 80),
    width: Math.max(800, right - left + 160),
    height: Math.max(600, bottom - top + 160)
  };
}

function svgPoints(points) {
  return points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(" ");
}

function getExportShapeMarkup(item, x, y, width, height) {
  const fill = escapeHtml(item.color || "#fff1b8");
  const stroke = escapeHtml(item.borderColor || "#1f2937");
  const strokeWidth = clamp(Number(item.borderThickness ?? 2) || 0, 0, 14);
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 100 100" preserveAspectRatio="none">${getShapeSvgMarkup(item.shape || "circle", fill, stroke, strokeWidth)}</svg>`;
}

function wrapExportText(text, availableWidth, fontSize) {
  const maxCharacters = Math.max(2, Math.floor(availableWidth / (fontSize * 0.58)));
  const lines = [];
  String(text || "").split(/\n/).forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    let line = "";
    words.forEach((word) => {
      const pieces = [];
      for (let index = 0; index < word.length; index += maxCharacters) {
        pieces.push(word.slice(index, index + maxCharacters));
      }
      pieces.forEach((piece) => {
        const candidate = line ? `${line} ${piece}` : piece;
        if (candidate.length <= maxCharacters) {
          line = candidate;
        } else {
          if (line) lines.push(line);
          line = piece;
        }
      });
    });
    if (line) lines.push(line);
  });
  return lines.length ? lines : [""];
}

function getExportFontFamily(fontFamily) {
  const families = {
    Inter: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
    Arial: "Arial, sans-serif",
    Georgia: "Georgia, serif",
    Verdana: "Verdana, sans-serif",
    "Courier New": '"Courier New", monospace',
    "Trebuchet MS": '"Trebuchet MS", sans-serif'
  };
  return families[fontFamily] || `${fontFamily || "Inter"}, sans-serif`;
}

function getExportTextLayout(item, x, y, width, height, fontSize) {
  const factors = item.type === "shape"
    ? getShapeTextBox(item.shape || "circle")
    : { width: 0.9, height: 0.86 };
  const boxWidth = Math.max(24, width * factors.width);
  const boxHeight = Math.max(fontSize, height * factors.height);
  const centerY = item.type === "shape" && Number.isFinite(factors.top)
    ? y + height * factors.top + boxHeight / 2
    : y + height / 2;
  return {
    centerX: x + width / 2,
    centerY,
    width: boxWidth,
    height: boxHeight
  };
}

function getRenderedBoardTextStyles() {
  const styles = new Map();
  boardContent?.querySelectorAll(".board-item[data-id]").forEach((node) => {
    const textNode = node.querySelector(".item-text");
    if (!textNode) return;
    const computed = getComputedStyle(textNode);
    styles.set(node.dataset.id, {
      fontFamily: computed.fontFamily,
      fontSize: Number.parseFloat(computed.fontSize),
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle,
      textDecoration: computed.textDecorationLine,
      color: computed.color,
      lineHeight: Number.parseFloat(computed.lineHeight)
    });
  });
  return styles;
}

async function embedExportImageSource(src) {
  if (!src || String(src).startsWith("data:")) return src || "";
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error("Image download failed.");
    return await readFileAsDataUrl(await response.blob());
  } catch {
    return src;
  }
}

async function getExportImageSources(project) {
  const sources = new Map();
  await Promise.all((project.items || []).filter((item) => item.type === "image").map(async (item) => {
    const sourceLevel = item.levelWorkspaceId
      ? project.levelWorkspaces?.find((level) => level.id === item.levelWorkspaceId)
      : null;
    if (isLevelPreviewItem(item) && sourceLevel) {
      const level = structuredClone(sourceLevel);
      await Promise.all((level.notes || []).filter((note) => note.type === "image" && note.src).map(async (note) => {
        note.src = await embedExportImageSource(note.src);
      }));
      sources.set(String(item.id), createLevelBoardPreview(level));
      return;
    }
    sources.set(String(item.id), await embedExportImageSource(item.src));
  }));
  return sources;
}

function getExportImageSource(item, project, imageSources) {
  const embedded = imageSources.get(String(item.id));
  if (embedded) return embedded;
  const sourceLevel = item.levelWorkspaceId
    ? project.levelWorkspaces?.find((level) => level.id === item.levelWorkspaceId)
    : null;
  return isLevelPreviewItem(item) && sourceLevel ? createLevelBoardPreview(sourceLevel) : item.src || "";
}

function getExportImageMarkup(item, project, imageSources, x, y, width, height) {
  const source = escapeHtml(getExportImageSource(item, project, imageSources));
  const levelPreview = isLevelPreviewItem(item);
  const titleHeight = levelPreview ? Math.min(40, height * 0.2) : 0;
  const imageHeight = Math.max(1, height - titleHeight);
  const fill = levelPreview ? item.color || "#f8fafc" : "#ffffff";
  const borderColor = levelPreview ? item.borderColor || "#9ca3af" : "#9ca3af";
  const borderThickness = levelPreview ? clamp(Number(item.borderThickness ?? 1) || 0, 0, 14) : 1;
  const title = levelPreview
    ? `<rect x="${x}" y="${y}" width="${width}" height="${titleHeight}" fill="#3037b8"/><text x="${x + 13}" y="${y + titleHeight / 2}" dominant-baseline="middle" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="900" fill="#ffffff">${escapeHtml(item.levelPreviewTitle || item.name || "Level")}</text>`
    : "";
  const image = source
    ? `<image href="${source}" x="${x}" y="${y + titleHeight}" width="${width}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice"/>`
    : "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${escapeHtml(fill)}" stroke="${escapeHtml(borderColor)}" stroke-width="${borderThickness}"/>${image}${title}`;
}

function buildBoardSvg(project, imageSources = new Map()) {
  const bounds = getProjectBounds(project);
  const itemById = new Map((project.items || []).map((item) => [item.id, item]));
  const renderedTextStyles = getRenderedBoardTextStyles();
  const drawings = (project.drawings || []).map((drawing) => {
    const points = (drawing.points || []).map((point) => ({
      x: point.x - bounds.left,
      y: point.y - bounds.top
    }));
    if (!points.length) return "";
    return `<polyline points="${svgPoints(points)}" fill="none" stroke="${escapeHtml(drawing.color || DEFAULT_CONNECTION_COLOR)}" stroke-width="${clamp(Number(drawing.thickness) || DEFAULT_DRAWING_THICKNESS, 1, 24)}" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");
  const connections = (project.connections || []).map((connection) => {
    const from = itemById.get(connection.from);
    const to = itemById.get(connection.to);
    if (!from || !to) return "";
    const route = getConnectionRoute(connection, from, to, project);
    const points = (route.points || []).map((point) => ({ x: point.x - bounds.left, y: point.y - bounds.top }));
    const thickness = Number(connection.thickness) || 3;
    const borderThickness = clamp(Number(connection.borderThickness ?? 2) || 0, 0, 10);
    const border = borderThickness > 0
      ? `<polyline points="${svgPoints(points)}" fill="none" stroke="${escapeHtml(connection.borderColor || "#ffffff")}" stroke-width="${thickness + borderThickness * 2}" stroke-linecap="round" stroke-linejoin="round" />`
      : "";
    return `${border}<polyline points="${svgPoints(points)}" fill="none" stroke="${escapeHtml(connection.color || "#172033")}" stroke-width="${thickness}" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");
  const items = (project.items || []).map((item) => {
    const x = item.x - bounds.left;
    const y = item.y - bounds.top;
    const width = item.width || 220;
    const height = item.height || 140;
    const label = item.text || htmlToPlainTextFallback(item.html || "") || item.name || "Board item";
    const body = item.type === "shape"
      ? getExportShapeMarkup(item, x, y, width, height)
      : item.type === "image"
      ? getExportImageMarkup(item, project, imageSources, x, y, width, height)
      : `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${escapeHtml(item.color || "#ffffff")}" stroke="${escapeHtml(item.borderColor || "#9ca3af")}" stroke-width="${clamp(Number(item.borderThickness ?? 1) || 0, 0, 14)}" />`;
    if (item.type === "image") return body;
    const textStyle = {
      fontFamily: "Inter",
      fontSize: 16,
      color: "#1d2733",
      bold: false,
      italic: false,
      underline: false,
      ...(item.textStyle || {})
    };
    const renderedStyle = renderedTextStyles.get(String(item.id));
    const fontFamily = escapeHtml(renderedStyle?.fontFamily || getExportFontFamily(String(textStyle.fontFamily || "Inter")));
    const fontSize = clamp(renderedStyle?.fontSize || Number(textStyle.fontSize) || 16, 10, 72);
    const fontWeight = renderedStyle?.fontWeight || (textStyle.bold ? "900" : item.type === "shape" ? "800" : "400");
    const fontStyle = renderedStyle?.fontStyle || (textStyle.italic ? "italic" : "normal");
    const textDecoration = renderedStyle?.textDecoration || (textStyle.underline ? "underline" : "none");
    const textColor = escapeHtml(renderedStyle?.color || textStyle.color || "#1d2733");
    const textLayout = getExportTextLayout(item, x, y, width, height, fontSize);
    const lineHeight = renderedStyle?.lineHeight || fontSize * (item.type === "shape" ? 1.08 : 1.35);
    const maxLines = Math.max(1, Math.floor(textLayout.height / lineHeight));
    const lines = wrapExportText(label, textLayout.width, fontSize).slice(0, maxLines);
    const firstLineY = textLayout.centerY - ((lines.length - 1) * lineHeight) / 2;
    const textLines = lines.map((line, index) => `<tspan x="${textLayout.centerX}" y="${firstLineY + index * lineHeight}">${escapeHtml(line)}</tspan>`).join("");
    return `${body}<text text-anchor="middle" dominant-baseline="middle" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" font-synthesis="weight style" text-decoration="${textDecoration}" fill="${textColor}">${textLines}</text>`;
  }).join("");
  const darkTheme = personalTheme === "dark";
  const backgroundColor = darkTheme ? "#111827" : "#f4f2ff";
  const gridColor = darkTheme ? "rgba(255,255,255,0.13)" : "rgba(67,75,215,0.12)";
  const grid = state.boardGrid === "hidden" ? "" : `<rect width="100%" height="100%" fill="url(#grid)" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">
    <defs>
      <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
        <path d="M 28 0 L 0 0 0 28" fill="none" stroke="${gridColor}" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="${backgroundColor}" />
    ${grid}
    ${drawings}
    ${connections}
    ${items}
  </svg>`;
}

async function exportBoardAsPng() {
  const project = getExportProject();
  if (!project) return;
  await document.fonts?.ready;
  const imageSources = await getExportImageSources(project);
  const svg = buildBoardSvg(project, imageSources);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(`${slugifyFileName(project.name)}-board.png`, blob);
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    window.alert("Could not export this board as PNG.");
  };
  image.src = url;
}

function openPrintableDocument(title, body) {
  const popup = window.open("", "_blank");
  if (!popup) {
    window.alert("Allow popups to export printable PDFs.");
    return;
  }
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
    body{font-family:Arial,sans-serif;margin:32px;color:#1d2733} h1{margin:0 0 18px} h2{margin-top:28px}
    table{width:100%;border-collapse:collapse;margin-top:12px} th,td{border:1px solid #d8def0;padding:8px;text-align:left;vertical-align:top}
    .board svg{max-width:100%;height:auto;border:1px solid #d8def0}.muted{color:#667085}
    .section{break-inside:avoid;margin-top:28px}.card{border:1px solid #d8def0;border-radius:8px;padding:12px;margin:10px 0}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #d8def0;background:#f7f8fc;padding:12px;font:12px/1.45 Consolas,monospace}
    ul{margin:8px 0;padding-left:20px}small{color:#667085}
    @media print{
      @page{
        margin:14mm 14mm 18mm;
        @top-left{content:""}
        @top-center{content:""}
        @top-right{content:""}
        @bottom-left{content:""}
        @bottom-center{content:"Page " counter(page);font:11px Arial,sans-serif;color:#667085}
        @bottom-right{content:""}
      }
      body{margin:0;padding:0}
    }
  </style></head><body>${body}<script>window.print();<\/script></body></html>`);
  popup.document.close();
}

function exportBoardAsPdf() {
  const project = getExportProject();
  if (!project) return;
  openPrintableDocument(`${project.name} board`, `<h1>${escapeHtml(project.name)} board</h1><div class="board">${buildBoardSvg(project)}</div>`);
}

function exportProjectReportPdf() {
  const project = getExportProject();
  if (!project) return;
  const isGameJam = getProjectKind(project) === PROJECT_KIND_GAMEJAM;
  const columns = new Map(getOrderedTaskColumns(project).map((column) => [column.id, column.title]));
  const members = new Map((project.teamRoles || []).map((member) => [member.id, member.name || member.role || "Member"]));
  const tasksById = new Map((project.tasks || []).map((task) => [task.id, task.title]));
  const boardItems = new Map((project.items || []).map((item) => [item.id, getBoardItemName(item)]));
  const tasks = (project.tasks || []).map((task) => `
    <tr>
      <td><strong>${escapeHtml(task.title)}</strong><br><small>${reportText(task.description)}</small></td>
      <td>${escapeHtml(columns.get(task.columnId) || "")}</td>
      <td>${escapeHtml(TASK_PRIORITIES[task.priority] || "Medium")}</td>
      <td>${clamp(Number(task.progress) || 0, 0, 100)}%</td>
      <td>${escapeHtml(task.deadline || "")}</td>
      <td>${escapeHtml((task.assigneeIds || []).map((id) => members.get(id)).filter(Boolean).join(", "))}</td>
      <td>${escapeHtml((task.dependencyIds || []).map((id) => tasksById.get(id)).filter(Boolean).join(", "))}</td>
      <td>${escapeHtml(boardItems.get(task.linkedItemId) || "")}</td>
    </tr>`).join("") || '<tr><td colspan="8">No tasks</td></tr>';
  const gdd = project.gdd || {};
  const characters = Array.isArray(gdd.characters) ? gdd.characters : [];
  const characterCards = characters.map((character) => `
    <div class="card">
      <h3>${escapeHtml(character.name || "Character")}</h3>
      ${character.image ? `<img src="${escapeHtml(character.image)}" alt="" style="max-width:160px;max-height:160px">` : ""}
      <p><strong>Story:</strong><br>${reportText(character.story || character.description)}</p>
      <p><strong>Personality:</strong><br>${reportText(character.personality)}</p>
      <p><strong>Abilities:</strong><br>${reportText(character.abilities)}</p>
      <p><strong>Notes:</strong><br>${reportText(character.notes)}</p>
    </div>`).join("") || "<p>No characters</p>";
  const gameDesignRows = [
    ["Concept", gdd.concept],
    ["Genre", gdd.genre]
  ].map(([label, value]) => `<tr><th>${label}</th><td>${reportText(value)}</td></tr>`).join("");
  const storyRows = buildReportStoryRows(project.story || []) || '<tr><td colspan="2">No story sections</td></tr>';
  const levelCards = (project.levelWorkspaces || []).map((level) => `
    <div class="card"><h3>${escapeHtml(level.name || "Level")}</h3>
      <p>${reportText(level.document)}</p>
      <strong>Notes and images: ${(level.notes || []).length}</strong>
      ${(level.notes || []).filter((note) => note.type !== "image").map((note) => `<p>${reportText(note.text)}</p>`).join("")}
      <p>Paint strokes: ${(level.drawings || []).length}</p>
    </div>`).join("") || "<p>No levels</p>";
  const teamRows = (project.teamRoles || []).map((member) => `<tr><td>${escapeHtml(member.name || "")}</td><td>${escapeHtml(member.role || "")}</td><td>${reportText(member.notes)}</td></tr>`).join("") || '<tr><td colspan="3">No team roles</td></tr>';
  const hourRows = getOrderedHourPhases(project).map((phase) => `
    <tr><td><strong>${escapeHtml(phase.title)}</strong></td><td>${phase.percent}%</td><td>${formatHours(hoursFromPercent(Number(project.totalHours) || 0, phase.percent))}h</td></tr>
    ${(phase.tasks || []).map((task) => `<tr><td>&nbsp;&nbsp;${escapeHtml(task.title)}</td><td>${task.percent}%</td><td>${formatHours(hoursFromPercent(Number(project.totalHours) || 0, task.percent))}h</td></tr>`).join("")}
  `).join("");
  const milestoneRows = (project.milestones || []).map((milestone) => `<tr><td>${escapeHtml(milestone.name)}</td><td>${escapeHtml(milestone.status)}</td><td>${milestone.progress || 0}%</td><td>${escapeHtml(milestone.deadline || "")}</td><td>${reportText(milestone.description)}</td></tr>`).join("") || '<tr><td colspan="5">No milestones</td></tr>';
  const codeCards = (project.codeFiles || []).map((file) => `<div class="card"><h3>${escapeHtml(file.name)}</h3><small>${escapeHtml(file.language || "Plain text")}</small><pre>${escapeHtml(file.content || "")}</pre></div>`).join("") || "<p>No code files</p>";
  const historyRows = (project.history || []).map((event) => `<tr><td>${escapeHtml(new Date(event.at).toLocaleString())}</td><td>${escapeHtml(event.user || "")}</td><td>${escapeHtml(event.action || "")}</td><td>${escapeHtml(event.target || "")}</td></tr>`).join("") || '<tr><td colspan="4">No history</td></tr>';
  openPrintableDocument(`${project.name} report`, `
    <h1>${escapeHtml(project.name)}</h1>
    <p class="muted">${escapeHtml(isGameJam ? "Game Jam" : "Game Dev")} · Generated ${new Date().toLocaleString()}</p>
    <div class="section"><h2>Game design document</h2><table><tbody>${gameDesignRows}</tbody></table></div>
    ${isGameJam ? "" : `<div class="section"><h2>Story</h2><table><thead><tr><th>Section</th><th>Notes</th></tr></thead><tbody>${storyRows}</tbody></table></div>`}
    ${isGameJam ? "" : `<div class="section"><h2>Characters</h2>${characterCards}</div>`}
    <div class="section"><h2>Board</h2><p>${(project.items || []).length} elements · ${(project.drawings || []).length} drawings · ${(project.connections || []).length} connections</p><div class="board">${buildBoardSvg(project)}</div></div>
    ${isGameJam ? "" : `<div class="section"><h2>Levels</h2>${levelCards}</div>`}
    <div class="section"><h2>Tasks</h2><table><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Progress</th><th>Deadline</th><th>People</th><th>Dependencies</th><th>Board link</th></tr></thead><tbody>${tasks}</tbody></table></div>
    <div class="section"><h2>Hours plan</h2><p>Total: ${formatHours(Number(project.totalHours) || 0)}h</p><table><thead><tr><th>Phase or task</th><th>Percent</th><th>Hours</th></tr></thead><tbody>${hourRows}</tbody></table></div>
    <div class="section"><h2>Team roles</h2><table><thead><tr><th>Name</th><th>Role</th><th>Notes</th></tr></thead><tbody>${teamRows}</tbody></table></div>
    ${isGameJam ? "" : `<div class="section"><h2>Milestones</h2><table><thead><tr><th>Name</th><th>Status</th><th>Progress</th><th>Deadline</th><th>Description</th></tr></thead><tbody>${milestoneRows}</tbody></table></div>`}
    ${isGameJam ? "" : `<div class="section"><h2>Code files</h2>${codeCards}</div>`}
    <div class="section"><h2>Project history</h2><table><thead><tr><th>Date</th><th>User</th><th>Action</th><th>Target</th></tr></thead><tbody>${historyRows}</tbody></table></div>
  `);
}

function reportText(value, fallback = "-") {
  const text = String(value || "").trim();
  return escapeHtml(text || fallback).replace(/\n/g, "<br>");
}

function buildReportStoryRows(nodes, depth = 0) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => `
    <tr><td>${"&nbsp;&nbsp;".repeat(depth)}${escapeHtml(node.title || "Story section")}</td><td>${reportText(node.notes)}</td></tr>
    ${buildReportStoryRows(node.children, depth + 1)}
  `).join("");
}

function exportHoursPlanPdf() {
  const project = getExportProject();
  if (!project) return;
  const totalHours = Number(project.totalHours || 0);
  const rows = getOrderedHourPhases(project).map((phase) => `
    <tr><td><strong>${escapeHtml(phase.title)}</strong></td><td>${phase.percent}%</td><td>${formatHours(hoursFromPercent(totalHours, phase.percent))}h</td></tr>
    ${(phase.tasks || []).map((task) => `<tr><td>&nbsp;&nbsp;${escapeHtml(task.title)}</td><td>${task.percent}%</td><td>${formatHours(hoursFromPercent(totalHours, task.percent))}h</td></tr>`).join("")}
  `).join("");
  openPrintableDocument(`${project.name} hours`, `<h1>${escapeHtml(project.name)} hours plan</h1><p>Total: ${formatHours(totalHours)}h</p><table><thead><tr><th>Phase/task</th><th>Percent</th><th>Hours</th></tr></thead><tbody>${rows}</tbody></table>`);
}
