function setActiveShapeTool(tool) {
  if (tool && !isShapeToolAllowedForProject(tool)) tool = null;
  activeShapeTool = tool;
  shapeTools.forEach((button) => button.classList.toggle("active", button.dataset.shapeTool === activeShapeTool));
  shapeMenuToggle?.classList.toggle("active", Boolean(activeShapeTool));
  shapeMenuToggle?.setAttribute("aria-label", activeShapeTool ? `Selected shape: ${getShapeToolLabel(activeShapeTool)}` : "Choose shape");
  board.classList.toggle("shape-placement-mode", Boolean(activeShapeTool));
  if (activeShapeTool) clearSelection();
}

function setShapeMenuOpen(open) {
  shapeMenu?.classList.toggle("hidden", !open);
  shapeMenuToggle?.setAttribute("aria-expanded", String(open));
}

function startShapePlacement(event) {
  if (!activeShapeTool || event.button !== 0 || event.shiftKey || spacePressed) return;
  if (!isShapeToolAllowedForProject(activeShapeTool)) {
    setActiveShapeTool(null);
    return;
  }
  if (event.target.closest("button, input, select, textarea, [contenteditable='true'], .resize-handle, .resize-edge, .connection-dot, .connection-handle, .connection-endpoint, .board-item, .drawing-stroke, .connection-line")) return;
  const project = getActiveProject();
  if (!project) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const getPlacementPoint = (placementEvent) => getBoardPoint(placementEvent);
  const origin = getPlacementPoint(event);
  const preview = createShapePlacementPreview(activeShapeTool);
  boardContent.append(preview);

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    updateAreaSelectionBox(origin, getPlacementPoint(moveEvent), preview);
  };

  const end = (endEvent) => {
    move(endEvent);
    const bounds = getBoundsFromPoints(origin, getPlacementPoint(endEvent));
    preview.remove();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    createItemFromPlacement(activeShapeTool, bounds);
  };

  move(event);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function createShapePlacementPreview(tool) {
  const preview = document.createElement("div");
  preview.className = `shape-placement-preview ${tool === "ticket" ? "ticket-preview" : tool === "table" || tool === "folder" ? `${tool}-preview` : `shape-preview shape-${tool}`}`;
  preview.style.setProperty("--shape-color", tool === "ticket" ? getCreationColor() : getCreationColor());
  if (tool === "table" || tool === "folder") {
    preview.append(createTablePreview(tool));
  } else if (tool !== "ticket") {
    preview.append(createShapeVisual(tool, getCreationColor()));
  }
  return preview;
}

function createItemFromPlacement(tool, bounds) {
  const placementBounds = bounds;
  const minWidth = tool === "ticket" ? 130 : tool === "table" || tool === "folder" ? 180 : tool === "triangle" ? 96 : 90;
  const minHeight = tool === "ticket" ? 90 : tool === "table" || tool === "folder" ? 120 : 86;
  const width = Math.max(minWidth, Math.round(placementBounds.right - placementBounds.left));
  const height = Math.max(minHeight, Math.round(placementBounds.bottom - placementBounds.top));
  const x = Math.round(clamp(placementBounds.left, 0, 6400 - width));
  const y = Math.round(clamp(placementBounds.top, 0, 4200 - height));

  if (tool === "ticket") {
    addBoardItem("ticket", { x, y, width, height }, { forceHistoryStep: true });
    return;
  }

  if (tool === "table" || tool === "folder") {
    addBoardItem("table", {
      ...createTableItemDefaults(tool),
      x,
      y,
      width,
      height,
      color: getCreationColor(),
      borderColor: "#1d2733",
      borderThickness: 2
    }, { forceHistoryStep: true });
    return;
  }

  addBoardItem("shape", {
    shape: tool,
    x,
    y,
    width,
    height,
    color: getCreationColor(),
    name: "New board",
    text: "New board",
    html: "New board",
    borderColor: "#1d2733",
    borderThickness: 2
  }, { forceHistoryStep: true });
}

function createTablePreview(tool) {
  const previewTable = document.createElement("div");
  previewTable.className = `table-preview-grid ${tool === "folder" ? "folder-preview-grid" : ""}`;
  const rows = tool === "folder" ? 2 : 3;
  const cols = tool === "folder" ? 1 : 3;
  previewTable.style.setProperty("--table-rows", String(rows));
  previewTable.style.setProperty("--table-cols", String(cols));
  for (let index = 0; index < rows * cols; index += 1) {
    previewTable.append(document.createElement("span"));
  }
  return previewTable;
}

function createTableItemDefaults(kind = "table") {
  const rows = kind === "folder" ? 2 : 3;
  const cols = kind === "folder" ? 1 : 3;
  return {
    tableKind: kind,
    table: {
      rows,
      cols,
      cells: Array.from({ length: rows * cols }, () => ({ text: "" }))
    }
  };
}

function startAreaSelection(event) {
  if (!event.shiftKey || event.button !== 0) return;
  if (event.target.closest("button, input, select, textarea, [contenteditable='true'], .resize-handle, .resize-edge, .connection-dot, .connection-handle, .connection-endpoint, .board-item, .drawing-stroke, .connection-line")) return;
  const project = getActiveProject();
  if (!project) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (drawMode) toggleDrawMode();
  clearSelection();

  const origin = getBoardPoint(event);
  const box = document.createElement("div");
  box.className = "area-selection-box";
  boardContent.append(box);
  activeAreaSelection = { origin, box };

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    const point = getBoardPoint(moveEvent);
    updateAreaSelectionBox(origin, point, box);
    applyAreaSelection(getBoundsFromPoints(origin, point), project);
  };

  const end = (endEvent) => {
    move(endEvent);
    activeAreaSelection = null;
    box.remove();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };

  move(event);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function updateAreaSelectionBox(start, end, box) {
  const bounds = getBoundsFromPoints(start, end);
  box.style.left = `${bounds.left}px`;
  box.style.top = `${bounds.top}px`;
  box.style.width = `${Math.max(1, bounds.right - bounds.left)}px`;
  box.style.height = `${Math.max(1, bounds.bottom - bounds.top)}px`;
}

function getBoundsFromPoints(a, b) {
  return {
    left: Math.round(Math.min(a.x, b.x)),
    top: Math.round(Math.min(a.y, b.y)),
    right: Math.round(Math.max(a.x, b.x)),
    bottom: Math.round(Math.max(a.y, b.y))
  };
}

function applyAreaSelection(bounds, project) {
  selectedBoardItemId = null;
  selectedItemIds = new Set(project.items
    .filter((item) => rectsIntersect(getItemBounds(item), bounds))
    .map((item) => item.id));
  selectedConnectionIds = new Set(project.connections
    .filter((connection) => connectionIntersectsBounds(connection, project, bounds))
    .map((connection) => connection.id));
  selectedDrawingIds = new Set((project.drawings || [])
    .filter((drawing) => polylineIntersectsBounds(drawing.points || [], bounds))
    .map((drawing) => drawing.id));
  selectedBoardItemId = [...selectedItemIds][0] || null;
  renderSelectionClasses();
  renderDrawings(project);
  connectionsLayer.innerHTML = "";
  renderConnections(project);
  renderPropertiesPanel();
}

function toggleDrawMode() {
  drawMode = !drawMode;
  board.classList.toggle("drawing-mode", drawMode);
  drawTool.classList.toggle("active", drawMode);
  drawTool.setAttribute("aria-pressed", String(drawMode));
  if (drawMode) {
    setActiveShapeTool(null);
    clearSelection();
  } else {
    renderPropertiesPanel();
  }
}

function startFreehandDrawing(event) {
  if (!drawMode || event.button !== 0) return;
  if (spacePressed) return;
  const project = getActiveProject();
  if (!project) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  interactionLock = true;
  selectedBoardItemId = null;
  selectedItemIds.clear();
  selectedConnectionIds.clear();
  selectedDrawingIds.clear();
  renderSelectionClasses();
  renderPropertiesPanel();

  const firstPoint = getBoardPoint(event);
  const drawing = {
    id: crypto.randomUUID(),
    color: getCreationColor(DEFAULT_CONNECTION_COLOR),
    thickness: drawingToolThickness,
    points: [{ x: Math.round(firstPoint.x), y: Math.round(firstPoint.y) }]
  };
  project.drawings ??= [];
  project.drawings.push(drawing);
  activeDrawing = drawing;

  const path = createDrawingPath(drawing);
  drawingLayer.append(path);

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    const point = getBoardPoint(moveEvent);
    const previous = drawing.points[drawing.points.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return;
    drawing.points.push({
      x: Math.round(clamp(point.x, 0, 6400)),
      y: Math.round(clamp(point.y, 0, 4200))
    });
    path.setAttribute("d", drawingPointsToPath(drawing.points));
  };

  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    interactionLock = false;
    activeDrawing = null;
    commitState({
      historyEntry: createHistoryCommand("createDrawing", drawing.id, null, drawing, { projectId: project.id }),
      forceStep: true
    });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function enterItemTextEdit(event, node, item) {
  event?.preventDefault();
  event?.stopPropagation();
  const text = node?.querySelector(".item-text");
  if (!text) return;

  if (item.type === "image" && !item.captionOpen) {
    const before = structuredClone(item);
    item.captionOpen = true;
    saveState({
      historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
        projectId: state.activeProjectId,
        groupKey: `item:${item.id}:caption`
      }),
      forceStep: true
    });
    render();
    window.setTimeout(() => {
      const nextNode = boardContent.querySelector(`[data-id="${item.id}"]`);
      const nextItem = getActiveProject()?.items.find((candidate) => candidate.id === item.id);
      if (nextNode && nextItem) enterItemTextEdit(null, nextNode, nextItem);
    }, 0);
    return;
  }

  interactionLock = false;
  board.classList.remove("dragging-board");
  selectedBoardItemId = item.id;
  selectedItemIds = new Set([item.id]);
  selectedConnectionIds.clear();
  selectedDrawingIds.clear();
  renderSelectionClasses();
  renderPropertiesPanel();
  node.classList.add("editing-text");
  text.contentEditable = "true";
  text.focus({ preventScroll: true });

  const range = document.createRange();
  range.selectNodeContents(text);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function exitItemTextEdit(node, text, item) {
  if (!node?.classList.contains("editing-text")) return;
  const before = structuredClone(item);
  item.html = sanitizeEditableHtml(text.innerHTML);
  item.text = text.textContent;
  text.contentEditable = "false";
  node.classList.remove("editing-text");
  ensureItemFitsText(item, node);
  fitItemText(text, item);
  renderPropertiesPanel();
  saveState({
    historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
      projectId: state.activeProjectId,
      groupKey: `item:${item.id}:text`
    })
  });
}

function createResizeHandles(node, item, project) {
  const handles = document.createElement("div");
  handles.className = "resize-handles";
  ["n", "e", "s", "w"].forEach((direction) => {
    const edge = document.createElement("div");
    edge.className = `resize-edge resize-edge-${direction}`;
    edge.dataset.resize = direction;
    edge.title = "Resize";
    const beginResize = (event) => startItemResize(event, node, item, project, direction);
    edge.addEventListener("pointerdown", beginResize, true);
    edge.addEventListener("mousedown", beginResize, true);
    handles.append(edge);
  });
  ["n", "e", "s", "w", "nw", "ne", "se", "sw"].forEach((direction) => {
    const handle = document.createElement("div");
    handle.className = `resize-handle resize-handle-${direction}`;
    handle.dataset.resize = direction;
    handle.title = "Resize";
    const beginResize = (event) => startItemResize(event, node, item, project, direction);
    handle.addEventListener("pointerdown", beginResize, true);
    handle.addEventListener("mousedown", beginResize, true);
    handles.append(handle);
  });
  return handles;
}

function createConnectionDots(item) {
  const dots = document.createElement("div");
  dots.className = "connection-dots";
  dots.setAttribute("aria-hidden", "true");

  connectionDotSides.forEach((side) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `connection-dot connection-dot-${side}`;
    dot.title = "Drag to connect";
    dot.dataset.side = side;
    dot.addEventListener("pointerdown", (event) => startNewConnectionDrag(event, item.id, side));
    dots.append(dot);
  });

  return dots;
}
