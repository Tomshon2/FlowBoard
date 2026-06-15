function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeStoryNodes(nodes = []) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => ({
    id: node.id || crypto.randomUUID(),
    title: String(node.title || "Story section"),
    notes: String(node.notes || ""),
    children: normalizeStoryNodes(node.children)
  }));
}

function normalizeTaskBoard(project) {
  const defaultColumns = createDefaultTaskColumns();
  const incomingColumns = Array.isArray(project.taskColumns) && project.taskColumns.length
    ? project.taskColumns
    : defaultColumns;
  project.taskColumns = incomingColumns.map((column, index) => ({
    id: column.id || crypto.randomUUID(),
    title: String(column.title || `Status ${index + 1}`),
    color: normalizeHexColor(column.color || defaultColumns[index % defaultColumns.length]?.color || "#434bd7", "#434bd7"),
    order: Number.isFinite(Number(column.order)) ? Number(column.order) : index
  })).sort((a, b) => a.order - b.order).map((column, index) => ({
    ...column,
    order: index
  }));

  const columnIds = new Set(project.taskColumns.map((column) => column.id));
  const todoColumn = project.taskColumns.find((column) => column.id === "todo") || project.taskColumns[0];
  const doneColumn = project.taskColumns.find((column) => column.id === "done") || project.taskColumns.find((column) => column.title.toLowerCase() === "done") || project.taskColumns[project.taskColumns.length - 1];
  const orderByColumn = new Map();
  const teamMemberIds = new Set((Array.isArray(project.teamRoles) ? project.teamRoles : []).map((member) => member.id).filter(Boolean));
  project.tasks = (Array.isArray(project.tasks) ? project.tasks : []).map((task) => {
    const fallbackColumnId = task.done ? doneColumn.id : todoColumn.id;
    const columnId = columnIds.has(task.columnId) ? task.columnId : fallbackColumnId;
    const order = Number.isFinite(Number(task.order)) ? Number(task.order) : orderByColumn.get(columnId) || 0;
    orderByColumn.set(columnId, Math.max(orderByColumn.get(columnId) || 0, order + 1));
    const assigneeIds = Array.isArray(task.assigneeIds)
      ? task.assigneeIds.filter((id) => !teamMemberIds.size || teamMemberIds.has(id))
      : [];
    return {
      id: task.id || crypto.randomUUID(),
      title: String(task.title || "New task"),
      columnId,
      done: columnId === doneColumn.id,
      order,
      estimateHours: clamp(Number(task.estimateHours) || 0, 0, 999),
      progress: clamp(Number(task.progress) || 0, 0, 100),
      description: String(task.description || ""),
      assigneeIds
    };
  });
}

function normalizeHourPlan(project) {
  const fallbackPlan = createDefaultHourPlan();
  const sourcePlan = Array.isArray(project.hourPlan) && project.hourPlan.length ? project.hourPlan : fallbackPlan;
  project.hourPlan = sourcePlan.map((phase, phaseIndex) => ({
    id: phase.id || crypto.randomUUID(),
    title: String(phase.title || `Phase ${phaseIndex + 1}`),
    percent: clamp(Number(phase.percent) || 0, 0, 100),
    order: Number.isFinite(Number(phase.order)) ? Number(phase.order) : phaseIndex,
    tasks: (Array.isArray(phase.tasks) ? phase.tasks : []).map((task, taskIndex) => ({
      id: task.id || crypto.randomUUID(),
      title: String(task.title || `Task ${taskIndex + 1}`),
      percent: clamp(Number(task.percent) || 0, 0, 100),
      order: Number.isFinite(Number(task.order)) ? Number(task.order) : taskIndex
    })).sort((a, b) => a.order - b.order).map((task, taskIndex) => ({
      ...task,
      order: taskIndex
    }))
  })).sort((a, b) => a.order - b.order).map((phase, phaseIndex) => ({
    ...phase,
    order: phaseIndex
  }));
}

function normalizeState() {
  state.boardTheme = state.boardTheme === "dark" ? "dark" : "light";
  state.boardGrid = state.boardGrid === "hidden" ? "hidden" : "visible";
  state.updatedAt = Number(state.updatedAt) || 0;
  latestLocalStateStamp = Math.max(latestLocalStateStamp, state.updatedAt);
  state.projects.forEach((project) => {
    project.favorite = Boolean(project.favorite);
    project.modifiedAt = Number(project.modifiedAt) || Number(state.updatedAt) || 0;
    project.totalHours ??= project.timerMinutes ? project.timerMinutes / 60 : 40;
    project.connections ??= [];
    normalizeHourPlan(project);
    normalizeTaskBoard(project);
    project.story = normalizeStoryNodes(project.story);
    project.teamRoles = (Array.isArray(project.teamRoles) ? project.teamRoles : []).map((member) => ({
      id: member.id || crypto.randomUUID(),
      name: String(member.name || ""),
      role: String(member.role || "Team role"),
      notes: String(member.notes || "")
    }));
    project.drawings = (project.drawings || []).map((drawing) => ({
      id: drawing.id || crypto.randomUUID(),
      color: normalizeHexColor(drawing.color, DEFAULT_CONNECTION_COLOR),
      thickness: clamp(Number(drawing.thickness) || 4, 1, 24),
      points: Array.isArray(drawing.points)
        ? drawing.points
          .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
          .map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }))
        : []
    })).filter((drawing) => drawing.points.length);
    project.connections = project.connections.map((connection) => {
      const normalized = {
        color: DEFAULT_CONNECTION_COLOR,
        thickness: DEFAULT_CONNECTION_THICKNESS,
        manualBend: false,
        manualPoints: [],
        snapToGrid: false,
        ...connection,
        snapToGrid: connection.snapToGrid === true,
        manualPoints: Array.isArray(connection.manualPoints)
          ? connection.manualPoints
            .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
            .map((point) => normalizeConnectionPoint(point, connection.snapToGrid === true))
          : [],
        thickness: clamp(Number(connection.thickness) || DEFAULT_CONNECTION_THICKNESS, 1, 14)
      };
      delete normalized.manualRoute;
      return normalized;
    });
    project.items = (project.items || []).map((item) => ({
      ...item,
      type: item.type === "note" ? "ticket" : item.type,
      shape: item.shape || "circle",
      color: item.color || ticketColors[0],
      html: item.html || escapeHtml(item.text || ""),
      captionOpen: item.type === "image" ? Boolean(item.captionOpen) : true,
      textStyle: {
        fontFamily: "Inter",
        fontSize: 16,
        color: "#1d2733",
        bold: false,
        italic: false,
        underline: false,
        ...(item.textStyle || {})
      },
      width: item.width || (item.type === "image" ? 260 : item.type === "shape" ? 140 : 210),
      height: item.height || (item.type === "image" ? 220 : item.type === "shape" ? 140 : 140)
    }));
  });
}

function saveState(options = {}) {
  if (interactionLock) return;
  recordHistoryChange(options);
  touchLocalState(getTouchedProjectIds(options));
  lastHistorySnapshot = getHistorySnapshot();
  persistStateLocally();
  queueRemoteSave();
}

function commitState(options = {}) {
  recordHistoryChange(options);
  touchLocalState(getTouchedProjectIds(options));
  lastHistorySnapshot = getHistorySnapshot();
  persistStateLocally();
  queueRemoteSave();
}

function persistStateLocally() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("FlowBoard local save failed. The board will still stay open, but browser storage may be full.", error);
  }
}

function initializeHistory() {
  undoStack = [];
  redoStack = [];
  lastHistorySnapshot = getHistorySnapshot();
  lastHistoryRecordedAt = 0;
}

function getHistorySnapshot() {
  return JSON.stringify(state);
}

function recordHistoryChange(options = {}) {
  if (applyingRemoteState) {
    lastHistorySnapshot = getHistorySnapshot();
    return;
  }

  const currentSnapshot = getHistorySnapshot();
  if (options.skipHistory) {
    lastHistorySnapshot = currentSnapshot;
    return;
  }
  if (!lastHistorySnapshot) {
    lastHistorySnapshot = currentSnapshot;
    return;
  }
  if (currentSnapshot === lastHistorySnapshot) return;

  const entry = options.historyEntry || createSnapshotHistoryEntry(lastHistorySnapshot, currentSnapshot);
  pushHistoryEntry(entry, options);
  lastHistorySnapshot = currentSnapshot;
}

// History is hybrid:
// - Normal local edits store compact command entries: { type, targetId, before, after }.
// - Large/ambiguous edits fall back to a full JSON snapshot entry.
// - saveState()/commitState() still own persistence, timestamps, localStorage, and backend sync.
function pushHistoryEntry(entry, options = {}) {
  const now = Date.now();
  const previous = undoStack[undoStack.length - 1];
  const canMerge = !options.forceStep &&
    entry.kind === "command" &&
    previous?.kind === "command" &&
    entry.groupKey &&
    previous.groupKey === entry.groupKey &&
    now - lastHistoryRecordedAt <= HISTORY_GROUP_MS;

  if (canMerge) {
    mergeHistoryCommand(previous, entry);
  } else if (options.forceStep || entry.kind === "snapshot" || now - lastHistoryRecordedAt > HISTORY_GROUP_MS || !undoStack.length || entry.kind === "command") {
    undoStack.push(entry);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  }
  redoStack = [];
  lastHistoryRecordedAt = now;
}

function mergeHistoryCommand(previous, next) {
  previous.after = structuredClone(next.after);
  if (!previous.commands || !next.commands) return;

  // Batched edits keep the original "before" for each target, while the latest
  // tiny input/color movement replaces only the "after" value.
  const previousByKey = new Map(previous.commands.map((command) => [`${command.type}:${command.targetId}`, command]));
  next.commands.forEach((nextCommand) => {
    const key = `${nextCommand.type}:${nextCommand.targetId}`;
    const previousCommand = previousByKey.get(key);
    if (previousCommand) {
      previousCommand.after = structuredClone(nextCommand.after);
    } else {
      previous.commands.push(structuredClone(nextCommand));
    }
  });
  previous.before = previous.commands.map((command) => structuredClone(command.before));
  previous.after = previous.commands.map((command) => structuredClone(command.after));
}

function undoState() {
  if (!undoStack.length) return;
  const entry = undoStack.pop();
  redoStack.push(entry);
  restoreHistorySnapshot(entry, "undo");
}

function redoState() {
  if (!redoStack.length) return;
  const entry = redoStack.pop();
  undoStack.push(entry);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  restoreHistorySnapshot(entry, "redo");
}

function restoreHistorySnapshot(entry, direction = "undo") {
  try {
    if (typeof entry === "string") {
      state = JSON.parse(entry);
    } else if (entry?.kind === "snapshot") {
      state = JSON.parse(direction === "redo" ? entry.after : entry.before);
    } else if (entry?.kind === "command") {
      applyHistoryCommand(entry, direction);
    }
  } catch (error) {
    console.warn("FlowBoard history restore failed:", error);
    return;
  }
  normalizeState();
  pruneSelectionToState();
  touchLocalState();
  lastHistorySnapshot = getHistorySnapshot();
  lastHistoryRecordedAt = 0;
  persistStateLocally();
  queueRemoteSave();
  app.classList.add("history-restoring");
  render();
  window.requestAnimationFrame(() => app.classList.remove("history-restoring"));
}

function createSnapshotHistoryEntry(beforeSnapshot, afterSnapshot = getHistorySnapshot()) {
  return {
    kind: "snapshot",
    type: "snapshot",
    targetId: state.activeProjectId,
    before: beforeSnapshot,
    after: afterSnapshot
  };
}

function createHistoryCommand(type, targetId, before, after, extra = {}) {
  return {
    kind: "command",
    type,
    targetId,
    before: structuredClone(before),
    after: structuredClone(after),
    ...extra
  };
}

function createBatchHistoryCommand(type, commands, extra = {}) {
  return {
    kind: "command",
    type,
    targetId: extra.targetId || state.activeProjectId,
    before: commands.map((command) => structuredClone(command.before)),
    after: commands.map((command) => structuredClone(command.after)),
    commands: structuredClone(commands),
    ...extra
  };
}

function applyHistoryCommand(entry, direction) {
  if (entry.commands) {
    const commands = direction === "redo" ? entry.commands : [...entry.commands].reverse();
    commands.forEach((command) => applyHistoryCommand(command, direction));
    return;
  }

  const value = direction === "redo" ? entry.after : entry.before;
  switch (entry.type) {
    case "createItem":
      setHistoryItem(entry.projectId, direction === "redo" ? value : null, entry.targetId);
      break;
    case "deleteItem":
      applyDeleteItemHistory(entry, direction);
      break;
    case "updateItem":
      setHistoryItem(entry.projectId, value, entry.targetId);
      break;
    case "createConnection":
      setHistoryConnection(entry.projectId, direction === "redo" ? value : null, entry.targetId);
      break;
    case "deleteConnection":
      setHistoryConnection(entry.projectId, direction === "redo" ? null : value, entry.targetId);
      break;
    case "updateConnection":
      setHistoryConnection(entry.projectId, value, entry.targetId);
      break;
    case "createDrawing":
      setHistoryDrawing(entry.projectId, direction === "redo" ? value : null, entry.targetId);
      break;
    case "deleteDrawing":
      setHistoryDrawing(entry.projectId, direction === "redo" ? null : value, entry.targetId);
      break;
    case "updateDrawing":
      setHistoryDrawing(entry.projectId, value, entry.targetId);
      break;
    case "updateProject":
      Object.assign(getHistoryProject(entry.projectId) || {}, value || {});
      break;
    default:
      if (entry.before && entry.after) state = JSON.parse(direction === "redo" ? entry.after : entry.before);
  }
}

function getHistoryProject(projectId = state.activeProjectId) {
  return state.projects.find((project) => project.id === projectId);
}

function setHistoryItem(projectId, item, fallbackId) {
  const project = getHistoryProject(projectId);
  if (!project) return;
  project.items = project.items.filter((candidate) => candidate.id !== (item?.id || fallbackId));
  if (item) project.items.push(structuredClone(item));
}

function applyDeleteItemHistory(entry, direction) {
  const project = getHistoryProject(entry.projectId);
  if (!project) return;
  const payload = direction === "redo" ? entry.after : entry.before;
  if (direction === "redo") {
    project.items = project.items.filter((item) => item.id !== entry.targetId);
    project.connections = project.connections.filter((connection) => !payload.connections.some((deleted) => deleted.id === connection.id));
    return;
  }
  project.items = project.items.filter((item) => item.id !== payload.item.id);
  project.items.push(structuredClone(payload.item));
  const existingConnectionIds = new Set(project.connections.map((connection) => connection.id));
  payload.connections.forEach((connection) => {
    if (!existingConnectionIds.has(connection.id)) project.connections.push(structuredClone(connection));
  });
}

function setHistoryConnection(projectId, connection, fallbackId) {
  const project = getHistoryProject(projectId);
  if (!project) return;
  project.connections = project.connections.filter((candidate) => candidate.id !== (connection?.id || fallbackId));
  if (connection) project.connections.push(structuredClone(connection));
}

function setHistoryDrawing(projectId, drawing, fallbackId) {
  const project = getHistoryProject(projectId);
  if (!project) return;
  project.drawings = (project.drawings || []).filter((candidate) => candidate.id !== (drawing?.id || fallbackId));
  if (drawing) project.drawings.push(structuredClone(drawing));
}

function pruneSelectionToState() {
  const project = getActiveProject();
  if (!project) {
    selectedBoardItemId = null;
    selectedItemIds.clear();
    selectedConnectionIds.clear();
    selectedDrawingIds.clear();
    return;
  }

  const itemIds = new Set(project.items.map((item) => item.id));
  const connectionIds = new Set(project.connections.map((connection) => connection.id));
  const drawingIds = new Set((project.drawings || []).map((drawing) => drawing.id));
  selectedItemIds = new Set([...selectedItemIds].filter((id) => itemIds.has(id)));
  selectedConnectionIds = new Set([...selectedConnectionIds].filter((id) => connectionIds.has(id)));
  selectedDrawingIds = new Set([...selectedDrawingIds].filter((id) => drawingIds.has(id)));
  if (!selectedBoardItemId || !itemIds.has(selectedBoardItemId)) {
    selectedBoardItemId = [...selectedItemIds][0] || null;
  }
}

function getTouchedProjectIds(options = {}) {
  if (options.skipProjectTouch) return [];
  const entries = [
    ...(Array.isArray(options.historyEntries) ? options.historyEntries : []),
    ...(options.historyEntry ? [options.historyEntry] : [])
  ];
  const ids = new Set(entries.map((entry) => entry?.projectId).filter(Boolean));
  if (options.projectId) ids.add(options.projectId);
  return [...ids];
}

function touchLocalState(projectIds = []) {
  const nextStamp = Math.max(Date.now(), latestLocalStateStamp + 1);
  state.updatedAt = nextStamp;
  latestLocalStateStamp = nextStamp;
  projectIds.forEach((projectId) => {
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (project) project.modifiedAt = nextStamp;
  });
}

function queueRemoteSave() {
  if (!currentWorkspaceId || applyingRemoteState) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveStateRemoteNow();
  }, 650);
}

async function saveStateRemoteNow() {
  if (!currentWorkspaceId || applyingRemoteState) return;
  window.clearTimeout(saveTimer);
  saveTimer = null;
  try {
    await saveWorkspaceState();
  } catch (error) {
    console.warn("FlowBoard online save failed:", error.message);
  }
}

function saveAndRender() {
  saveState({ skipProjectTouch: true });
  render();
}

function getActiveProject() {
  return state.projects.find((project) => project.id === state.activeProjectId);
}
