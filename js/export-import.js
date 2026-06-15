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
    version: 2,
    exportedAt: new Date().toISOString(),
    project,
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
  if (!items.length) return { left: 0, top: 0, width: 1200, height: 800 };
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + (item.width || 220)));
  const bottom = Math.max(...items.map((item) => item.y + (item.height || 140)));
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
  const cx = x + width / 2;
  const cy = y + height / 2;
  if (item.shape === "triangle") {
    return `<polygon points="${svgPoints([{ x: cx, y }, { x: x + width, y: y + height }, { x, y: y + height }])}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }
  if (item.shape === "hexagon") {
    const inset = width * 0.25;
    return `<polygon points="${svgPoints([
      { x: x + inset, y },
      { x: x + width - inset, y },
      { x: x + width, y: cy },
      { x: x + width - inset, y: y + height },
      { x: x + inset, y: y + height },
      { x, y: cy }
    ])}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }
  return `<ellipse cx="${cx}" cy="${cy}" rx="${width / 2}" ry="${height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
}

function getExportTextAnchor(item) {
  if (item.type === "shape") return { xPercent: 0.5, yPercent: 0.52, anchor: "middle" };
  return { xPercent: 0.08, yPercent: 0.24, anchor: "start" };
}

function buildBoardSvg(project) {
  const bounds = getProjectBounds(project);
  const itemById = new Map((project.items || []).map((item) => [item.id, item]));
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
    const label = escapeHtml(getBoardItemName(item));
    const body = item.type === "shape"
      ? getExportShapeMarkup(item, x, y, width, height)
      : `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${escapeHtml(item.color || "#ffffff")}" stroke="${escapeHtml(item.borderColor || "#9ca3af")}" stroke-width="${clamp(Number(item.borderThickness ?? 1) || 0, 0, 14)}" />`;
    const textPosition = getExportTextAnchor(item);
    const fontSize = item.type === "shape" ? Math.max(12, Math.min(18, Math.round(Math.min(width, height) / 7))) : 16;
    return `${body}<text x="${x + width * textPosition.xPercent}" y="${y + height * textPosition.yPercent}" text-anchor="${textPosition.anchor}" dominant-baseline="middle" font-family="Arial" font-size="${fontSize}" font-weight="700" fill="#1d2733">${label.slice(0, 120)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">
    <defs>
      <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
        <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#d9def8" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="#f7f6ff" />
    <rect width="100%" height="100%" fill="url(#grid)" />
    ${connections}
    ${items}
  </svg>`;
}

async function exportBoardAsPng() {
  const project = getExportProject();
  if (!project) return;
  const svg = buildBoardSvg(project);
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
  const columns = new Map(getOrderedTaskColumns(project).map((column) => [column.id, column.title]));
  const tasks = project.tasks.map((task) => `<tr><td>${escapeHtml(task.title)}</td><td>${escapeHtml(columns.get(task.columnId) || "")}</td><td>${escapeHtml(TASK_PRIORITIES[task.priority] || "Medium")}</td><td>${escapeHtml(task.deadline || "")}</td></tr>`).join("");
  const gdd = project.gdd || {};
  const hasCharacterList = Array.isArray(gdd.characters) && gdd.characters.length > 0;
  const characterText = Array.isArray(gdd.characters) && gdd.characters.length
    ? gdd.characters.map((character) => `<strong>${escapeHtml(character.name || "Character")}</strong><br>${escapeHtml(character.description || "")}`).join("<br><br>")
    : typeof gdd.characters === "string" && gdd.characters ? gdd.characters : "Define main characters, enemies, NPCs, and bosses.";
  const gameDesignRows = [
    ["Concept", gdd.concept || "Define the core concept."],
    ["Genre", gdd.genre || "Define genre."],
    ["Characters", characterText],
    ["Mechanics", gdd.mechanics || "Define mechanics."]
  ].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${label === "Characters" && hasCharacterList ? value : escapeHtml(value)}</td></tr>`).join("");
  openPrintableDocument(`${project.name} report`, `
    <h1>${escapeHtml(project.name)}</h1>
    <p class="muted">Generated ${new Date().toLocaleString()}</p>
    <h2>Game design</h2><table><tbody>${gameDesignRows}</tbody></table>
    <h2>Board</h2><div class="board">${buildBoardSvg(project)}</div>
    <h2>Tasks</h2><table><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Deadline</th></tr></thead><tbody>${tasks}</tbody></table>
  `);
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
