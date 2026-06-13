function setActiveShapeTool(tool) {
  activeShapeTool = tool;
  shapeTools.forEach((button) => button.classList.toggle("active", button.dataset.shapeTool === activeShapeTool));
  board.classList.toggle("shape-placement-mode", Boolean(activeShapeTool));
  if (activeShapeTool) clearSelection();
}

function startShapePlacement(event) {
  if (!activeShapeTool || event.button !== 0 || event.shiftKey || spacePressed) return;
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
  preview.className = `shape-placement-preview ${tool === "ticket" ? "ticket-preview" : "shape-preview shape-${tool}"}`;
  preview.style.setProperty("--shape-color", tool === "ticket" ? getCreationColor() : getCreationColor());
  if (tool !== "ticket") {
    const visual = document.createElement("div");
    visual.className = `shape-visual shape-${tool}`;
    visual.style.setProperty("--shape-color", getCreationColor());
    preview.append(visual);
  }
  return preview;
}

function createItemFromPlacement(tool, bounds) {
  const placementBounds = bounds;
  const minWidth = tool === "ticket" ? 130 : tool === "triangle" ? 96 : 90;
  const minHeight = tool === "ticket" ? 90 : 86;
  const width = Math.max(minWidth, Math.round(placementBounds.right - placementBounds.left));
  const height = Math.max(minHeight, Math.round(placementBounds.bottom - placementBounds.top));
  const x = Math.round(clamp(placementBounds.left, 0, 6400 - width));
  const y = Math.round(clamp(placementBounds.top, 0, 4200 - height));

  if (tool === "ticket") {
    addBoardItem("ticket", { x, y, width, height }, { forceHistoryStep: true });
    return;
  }

  addBoardItem("shape", {
    shape: tool,
    x,
    y,
    width,
    height,
    color: getCreationColor(),
    text: "New board",
    html: "New board"
  }, { forceHistoryStep: true });
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

function renderConnections(project) {
  const ticketMap = new Map(project.items.map((item) => [item.id, item]));
  project.connections = project.connections.filter((connection) => ticketMap.has(connection.from) && ticketMap.has(connection.to));
  project.connections.forEach((connection) => {
    const from = ticketMap.get(connection.from);
    const to = ticketMap.get(connection.to);
    if (!from || !to) return;

    const selectedConnection = selectedConnectionIds.has(connection.id);
    const connectionColorValue = connection.color || DEFAULT_CONNECTION_COLOR;
    const connectionThicknessValue = Number(connection.thickness) || DEFAULT_CONNECTION_THICKNESS;
    const markerId = ensureArrowMarker(`arrow-head-${connection.id}`, connectionColorValue);
    const route = getConnectionRoute(connection, from, to, project);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", route.path);
    path.setAttribute("class", `connection-line ${selectedConnection ? "selected-connection" : ""}`);
    path.dataset.id = connection.id;
    path.setAttribute("marker-end", `url(#${markerId})`);
    path.style.stroke = connectionColorValue;
    path.style.strokeWidth = String(selectedConnection ? connectionThicknessValue + 2 : connectionThicknessValue);
    path.addEventListener("pointerdown", (event) => event.stopPropagation());
    path.addEventListener("click", (event) => handleConnectionSelection(event, connection.id));
    connectionsLayer.append(path);

    const fromHandle = createConnectionEndpoint(route.start.x, route.start.y, `connection-endpoint from-endpoint ${selectedConnection ? "selected-connection-control" : ""}`);
    fromHandle.dataset.id = connection.id;
    fromHandle.style.stroke = connectionColorValue;
    fromHandle.addEventListener("pointerdown", (event) => startConnectionEndpointDrag(event, project, connection, from, "fromSide"));
    connectionsLayer.append(fromHandle);

    const toHandle = createConnectionEndpoint(route.end.x, route.end.y, `connection-endpoint to-endpoint ${selectedConnection ? "selected-connection-control" : ""}`);
    toHandle.dataset.id = connection.id;
    toHandle.style.stroke = connectionColorValue;
    toHandle.addEventListener("pointerdown", (event) => startConnectionEndpointDrag(event, project, connection, to, "toSide"));
    connectionsLayer.append(toHandle);

    renderConnectionBendHandle(project, connection, route, selectedConnection, connectionColorValue);
  });
}

function createConnectionEndpoint(x, y, className) {
  const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  handle.setAttribute("cx", String(x));
  handle.setAttribute("cy", String(y));
  handle.setAttribute("r", "7");
  handle.setAttribute("class", className);
  return handle;
}

function renderConnectionBendHandle(project, connection, route, selectedConnection, color) {
  if (!selectedConnection) return;
  const point = route.bendHandle || getRouteMidpoint(route.points);
  const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  handle.setAttribute("cx", String(point.x));
  handle.setAttribute("cy", String(point.y));
  handle.setAttribute("r", "10");
  handle.setAttribute("class", "connection-handle selected-connection-control");
  handle.dataset.id = connection.id;
  handle.style.stroke = color;
  handle.addEventListener("pointerdown", (event) => startConnectionBendDrag(event, project, connection));
  connectionsLayer.append(handle);
}

function findConnectionSvgNode(selector, id) {
  return [...connectionsLayer.querySelectorAll(selector)].find((node) => node.dataset.id === id) || null;
}

function setConnectionCirclePosition(node, point) {
  if (!node || !point) return;
  node.setAttribute("cx", String(point.x));
  node.setAttribute("cy", String(point.y));
}

function updateRenderedConnection(project, connection) {
  const from = project.items.find((item) => item.id === connection.from);
  const to = project.items.find((item) => item.id === connection.to);
  if (!from || !to) return;

  const route = getConnectionRoute(connection, from, to, project);
  const line = findConnectionSvgNode(".connection-line", connection.id);
  if (line) line.setAttribute("d", route.path);
  setConnectionCirclePosition(findConnectionSvgNode(".from-endpoint", connection.id), route.start);
  setConnectionCirclePosition(findConnectionSvgNode(".to-endpoint", connection.id), route.end);
  setConnectionCirclePosition(findConnectionSvgNode(".connection-handle", connection.id), route.bendHandle || getRouteMidpoint(route.points));
}

function beginConnectionPointerCapture(event, finishDrag) {
  const target = event.currentTarget;
  const pointerId = event.pointerId;
  const onLostCapture = (lostEvent) => finishDrag(lostEvent);

  if (pointerId !== undefined) {
    try {
      target?.setPointerCapture?.(pointerId);
      target?.addEventListener?.("lostpointercapture", onLostCapture);
    } catch {
      // Global listeners below still keep the drag alive in browsers that refuse SVG capture.
    }
  }

  return { target, pointerId, onLostCapture };
}

function endConnectionPointerCapture(capture) {
  if (!capture?.target || capture.pointerId === undefined) return;
  capture.target.removeEventListener?.("lostpointercapture", capture.onLostCapture);
  try {
    if (capture.target.hasPointerCapture?.(capture.pointerId)) {
      capture.target.releasePointerCapture(capture.pointerId);
    }
  } catch {
    // The browser may already have released capture during pointerup/cancel.
  }
}

function isSameConnectionPointer(event, pointerId) {
  return pointerId === undefined || event.pointerId === undefined || event.pointerId === pointerId;
}

function ensureArrowMarker(id = "arrow-head", color = DEFAULT_CONNECTION_COLOR) {
  const existingMarker = document.getElementById(id);
  if (existingMarker) {
    existingMarker.querySelector("path")?.setAttribute("fill", color);
    return id;
  }
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", id);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  arrow.setAttribute("fill", color);
  marker.append(arrow);
  defs.append(marker);
  connectionsLayer.append(defs);
  return id;
}

function getConnectionRoute(connection, from, to, project) {
  const fromCenter = getItemCenter(from);
  const toCenter = getItemCenter(to);
  connection.fromSide ??= getAutoSide(fromCenter, toCenter);
  connection.toSide ??= getAutoSide(toCenter, fromCenter);
  const start = getAnchorBySide(from, connection.fromSide);
  const end = getAnchorBySide(to, connection.toSide);
  const startDirection = getSideDirection(connection.fromSide);
  const endDirection = getSideDirection(connection.toSide);
  const startStub = {
    x: start.x + startDirection.x * 36,
    y: start.y + startDirection.y * 36
  };
  const endStub = {
    x: end.x + endDirection.x * 36,
    y: end.y + endDirection.y * 36
  };
  const isSelfConnection = from.id === to.id;
  const obstacles = isSelfConnection
    ? (project?.items || []).map((item) => getItemBounds(item, 28))
    : getConnectionObstacles(project, connection);
  const route = isSelfConnection
    ? getSelfConnectionRoutePoints(from, connection.fromSide, connection.toSide, startStub, endStub, obstacles)
    : getBendRoutePoints(connection, from, to, startStub, endStub);
  const points = simplifyRoutePoints([start, ...route.points, end]);

  return {
    path: pointsToPath(points),
    points,
    bendHandle: route.bendHandle || getRouteMidpoint(points),
    start,
    end
  };
}

function getRouteMidpoint(points = []) {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const index = Math.max(1, Math.floor(points.length / 2));
  const a = points[index - 1];
  const b = points[index] || a;
  return {
    x: Math.round((a.x + b.x) / 2),
    y: Math.round((a.y + b.y) / 2)
  };
}

function getBendRoutePoints(connection, from, to, startStub, endStub) {
  if (!["x", "y"].includes(connection.bendAxis)) {
    connection.bendAxis = ["left", "right"].includes(connection.fromSide) ? "x" : "y";
  }
  const max = connection.bendAxis === "x" ? 6400 : 4200;
  if (!Number.isFinite(Number(connection.bend))) {
    connection.bend = getDefaultConnectionBend(connection, { items: [from, to] });
  }
  const bend = Math.round(clamp(Number(connection.bend), 0, max));
  const points = connection.bendAxis === "x"
    ? [startStub, { x: bend, y: startStub.y }, { x: bend, y: endStub.y }, endStub]
    : [startStub, { x: startStub.x, y: bend }, { x: endStub.x, y: bend }, endStub];
  const bendHandle = connection.bendAxis === "x"
    ? { x: bend, y: Math.round((startStub.y + endStub.y) / 2) }
    : { x: Math.round((startStub.x + endStub.x) / 2), y: bend };
  return { points: simplifyRoutePoints(points), bendHandle };
}

function getSafeConnectionBend(axis, desired, from, to, startStub, endStub) {
  const padding = 18;
  const bounds = [getItemBounds(from, padding), getItemBounds(to, padding)];
  const candidates = axis === "x"
    ? [
      desired,
      bounds[0].left - padding,
      bounds[0].right + padding,
      bounds[1].left - padding,
      bounds[1].right + padding
    ]
    : [
      desired,
      bounds[0].top - padding,
      bounds[0].bottom + padding,
      bounds[1].top - padding,
      bounds[1].bottom + padding
    ];

  return candidates
    .map((candidate) => Math.round(clamp(candidate, 0, axis === "x" ? 6400 : 4200)))
    .filter((candidate, index, list) => list.indexOf(candidate) === index)
    .map((candidate) => ({
      value: candidate,
      score: getConnectionCollisionScore(axis, candidate, startStub, endStub, bounds) + Math.abs(candidate - desired)
    }))
    .sort((a, b) => a.score - b.score)[0]?.value ?? Math.round(desired);
}

function getConnectionObstacles(project, connection) {
  const padding = 28;
  return (project?.items || [])
    .filter((item) => item.id !== connection.from && item.id !== connection.to)
    .map((item) => getItemBounds(item, padding));
}

function getSelfConnectionRoutePoints(item, fromSide, toSide, startStub, endStub, obstacles) {
  const box = getItemBounds(item, 64);
  const width = item.width || 210;
  const height = item.height || 140;
  const horizontalGap = Math.max(100, width * 0.62);
  const verticalGap = Math.max(100, height * 0.62);

  if (fromSide === toSide) {
    if (fromSide === "top" || fromSide === "bottom") {
      const outsideY = fromSide === "top" ? box.top : box.bottom;
      const sideSign = startStub.x + horizontalGap < 6400 ? 1 : -1;
      const loopX = Math.round(clamp(startStub.x + sideSign * horizontalGap, 0, 6400));
      const points = simplifyRoutePoints([
        startStub,
        { x: startStub.x, y: outsideY },
        { x: loopX, y: outsideY },
        { x: loopX, y: endStub.y },
        endStub
      ]);
      return { points, bendHandle: getRouteMidpoint(points) };
    }

    const outsideX = fromSide === "left" ? box.left : box.right;
    const sideSign = startStub.y + verticalGap < 4200 ? 1 : -1;
    const loopY = Math.round(clamp(startStub.y + sideSign * verticalGap, 0, 4200));
    const points = simplifyRoutePoints([
      startStub,
      { x: outsideX, y: startStub.y },
      { x: outsideX, y: loopY },
      { x: endStub.x, y: loopY },
      endStub
    ]);
    return { points, bendHandle: getRouteMidpoint(points) };
  }

  return getOrthogonalRoutePoints(startStub, endStub, obstacles);
}

function getOrthogonalRoutePoints(start, end, obstacles) {
  const xValues = new Set([Math.round(start.x), Math.round(end.x), Math.round((start.x + end.x) / 2)]);
  const yValues = new Set([Math.round(start.y), Math.round(end.y), Math.round((start.y + end.y) / 2)]);
  obstacles.forEach((box) => {
    [box.left - 1, box.right + 1].forEach((x) => xValues.add(Math.round(clamp(x, 0, 6400))));
    [box.top - 1, box.bottom + 1].forEach((y) => yValues.add(Math.round(clamp(y, 0, 4200))));
  });

  const candidates = [
    [start, end],
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end]
  ];
  xValues.forEach((x) => {
    candidates.push([start, { x, y: start.y }, { x, y: end.y }, end]);
  });
  yValues.forEach((y) => {
    candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
  });

  const points = candidates
    .map((points) => simplifyRoutePoints(points))
    .map((points) => ({ points, score: scoreRoutePoints(points, obstacles) }))
    .sort((a, b) => a.score - b.score)[0]?.points || [start, end];
  return { points, bendHandle: getRouteMidpoint(points) };
}

function scoreRoutePoints(points, obstacles) {
  let collisions = 0;
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (segmentIntersectsAnyBounds(a, b, obstacles)) collisions += 1;
  }
  return collisions * 1000000 + length + points.length * 12;
}

function segmentIntersectsAnyBounds(a, b, bounds) {
  return bounds.some((box) => segmentIntersectsBounds(a, b, box));
}

function simplifyRoutePoints(points) {
  const deduped = [];
  points.forEach((point) => {
    const rounded = { x: Math.round(point.x), y: Math.round(point.y) };
    const previous = deduped[deduped.length - 1];
    if (!previous || previous.x !== rounded.x || previous.y !== rounded.y) deduped.push(rounded);
  });

  const simplified = [];
  deduped.forEach((point) => {
    simplified.push(point);
    while (simplified.length >= 3) {
      const a = simplified[simplified.length - 3];
      const b = simplified[simplified.length - 2];
      const c = simplified[simplified.length - 1];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
        simplified.splice(simplified.length - 2, 1);
      } else {
        break;
      }
    }
  });
  return simplified;
}

function pointsToPath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function getConnectionCollisionScore(axis, bend, startStub, endStub, bounds) {
  const points = axis === "x"
    ? [startStub, { x: bend, y: startStub.y }, { x: bend, y: endStub.y }, endStub]
    : [startStub, { x: startStub.x, y: bend }, { x: endStub.x, y: bend }, endStub];

  let collisions = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    if (bounds.some((box) => segmentIntersectsBounds(points[index], points[index + 1], box))) {
      collisions += 1;
    }
  }
  return collisions * 100000;
}

function segmentIntersectsBounds(a, b, bounds) {
  if (a.x === b.x) {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return a.x >= bounds.left && a.x <= bounds.right && maxY >= bounds.top && minY <= bounds.bottom;
  }
  if (a.y === b.y) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return a.y >= bounds.top && a.y <= bounds.bottom && maxX >= bounds.left && minX <= bounds.right;
  }
  return false;
}

function getItemBounds(item, padding = 0) {
  return {
    left: item.x - padding,
    top: item.y - padding,
    right: item.x + (item.width || 210) + padding,
    bottom: item.y + (item.height || 140) + padding
  };
}

function getItemCenter(item) {
  return {
    x: item.x + (item.width || 210) / 2,
    y: item.y + (item.height || 140) / 2
  };
}

function getVerticalAnchor(item, targetY) {
  const center = getItemCenter(item);
  return {
    x: center.x,
    y: targetY >= center.y ? item.y + (item.height || 140) : item.y
  };
}

function getHorizontalAnchor(item, targetX) {
  const center = getItemCenter(item);
  return {
    x: targetX >= center.x ? item.x + (item.width || 210) : item.x,
    y: center.y
  };
}

function getAnchorBySide(item, side) {
  const center = getItemCenter(item);
  const width = item.width || 210;
  const height = item.height || 140;
  return {
    top: { x: center.x, y: item.y },
    right: { x: item.x + width, y: center.y },
    bottom: { x: center.x, y: item.y + height },
    left: { x: item.x, y: center.y }
  }[side] || center;
}

function getSideDirection(side) {
  return {
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 }
  }[side] || { x: 0, y: 1 };
}

function getAutoSide(fromCenter, toCenter) {
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

function cycleConnectionSide(connection, key) {
  const project = getActiveProject();
  const before = structuredClone(connection);
  const sides = ["top", "right", "bottom", "left"];
  const currentIndex = sides.indexOf(connection[key]);
  connection[key] = sides[(currentIndex + 1) % sides.length];
  connection.bendAxis = ["left", "right"].includes(connection.fromSide) ? "x" : "y";
  connection.bend = undefined;
  saveState({
    historyEntry: createHistoryCommand("updateConnection", connection.id, before, connection, {
      projectId: project?.id || state.activeProjectId
    }),
    forceStep: true
  });
  render();
}

function getDefaultConnectionBend(connection, project) {
  const from = project.items.find((item) => item.id === connection.from);
  const to = project.items.find((item) => item.id === connection.to);
  if (!from || !to) return connection.bend || 0;
  const start = getAnchorBySide(from, connection.fromSide);
  const end = getAnchorBySide(to, connection.toSide);
  const startDirection = getSideDirection(connection.fromSide);
  const endDirection = getSideDirection(connection.toSide);
  const startStub = {
    x: start.x + startDirection.x * 36,
    y: start.y + startDirection.y * 36
  };
  const endStub = {
    x: end.x + endDirection.x * 36,
    y: end.y + endDirection.y * 36
  };
  connection.bendAxis = startDirection.x !== 0 ? "x" : "y";
  const desired = connection.bendAxis === "x"
    ? Math.round((startStub.x + endStub.x) / 2)
    : Math.round((startStub.y + endStub.y) / 2);
  return getSafeConnectionBend(connection.bendAxis, desired, from, to, startStub, endStub);
}

function startConnectionEndpointDrag(event, project, connection, item, key) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  interactionLock = true;
  board.classList.add("dragging-connection");
  clearNearbyConnectionDots();
  selectedConnectionIds = new Set([connection.id]);
  selectedItemIds.clear();
  selectedDrawingIds.clear();
  selectedBoardItemId = null;
  renderConnectionStylePanel();
  const beforeConnection = structuredClone(connection);
  let dragEnded = false;

  const move = (moveEvent) => {
    if (!isSameConnectionPointer(moveEvent, pointerCapture.pointerId)) return;
    moveEvent.preventDefault();
    const point = getBoardPoint(moveEvent);
    const nextSide = getClosestSide(item, point, connection[key]);
    if (nextSide === connection[key]) return;
    connection[key] = nextSide;
    connection.manualBend = false;
    connection.bend = getDefaultConnectionBend(connection, project);
    updateRenderedConnection(project, connection);
  };

  const end = (endEvent = {}) => {
    if (!isSameConnectionPointer(endEvent, pointerCapture.pointerId)) return;
    if (dragEnded) return;
    dragEnded = true;
    const cancelled = endEvent.type === "pointercancel" || endEvent.type === "blur";
    if (cancelled) Object.assign(connection, structuredClone(beforeConnection));
    endConnectionPointerCapture(pointerCapture);
    interactionLock = false;
    board.classList.remove("dragging-connection");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("blur", end);
    connectionsLayer.innerHTML = "";
    renderConnections(project);
    if (!cancelled) {
      commitState({
        historyEntry: createHistoryCommand("updateConnection", connection.id, beforeConnection, connection, {
          projectId: project.id
        }),
        forceStep: true
      });
    }
  };

  const pointerCapture = beginConnectionPointerCapture(event, end);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("blur", end);
}

function getClosestSide(item, point, preferredSide = "") {
  const width = item.width || 210;
  const height = item.height || 140;
  const distances = [
    ["top", Math.abs(point.y - item.y)],
    ["right", Math.abs(point.x - (item.x + width))],
    ["bottom", Math.abs(point.y - (item.y + height))],
    ["left", Math.abs(point.x - item.x)]
  ];
  distances.sort((a, b) => a[1] - b[1]);
  if (preferredSide) {
    const current = distances.find(([side]) => side === preferredSide);
    if (current && distances[0][1] > current[1] - 18) return preferredSide;
  }
  return distances[0][0];
}

function startConnectionBendDrag(event, project, connection) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  interactionLock = true;
  board.classList.add("dragging-connection");
  clearNearbyConnectionDots();
  selectedConnectionIds = new Set([connection.id]);
  selectedItemIds.clear();
  selectedDrawingIds.clear();
  selectedBoardItemId = null;
  renderConnectionStylePanel();
  const beforeConnection = structuredClone(connection);
  const from = project.items.find((item) => item.id === connection.from);
  const to = project.items.find((item) => item.id === connection.to);
  if (!["x", "y"].includes(connection.bendAxis)) {
    connection.bendAxis = ["left", "right"].includes(connection.fromSide) ? "x" : "y";
  }
  const axis = connection.bendAxis;
  const axisKey = axis === "x" ? "x" : "y";
  const max = axis === "x" ? 6400 : 4200;
  const originPoint = getBoardPoint(event);
  const originBend = Number.isFinite(Number(connection.bend))
    ? Number(connection.bend)
    : getDefaultConnectionBend(connection, project);
  let dragEnded = false;

  const move = (moveEvent) => {
    if (!isSameConnectionPointer(moveEvent, pointerCapture.pointerId)) return;
    moveEvent.preventDefault();
    const point = getBoardPoint(moveEvent);
    if (!from || !to) return;
    connection.manualBend = true;
    connection.bendAxis = axis;
    connection.bend = clamp(Math.round(originBend + point[axisKey] - originPoint[axisKey]), 0, max);
    updateRenderedConnection(project, connection);
  };

  const end = (endEvent = {}) => {
    if (!isSameConnectionPointer(endEvent, pointerCapture.pointerId)) return;
    if (dragEnded) return;
    dragEnded = true;
    const cancelled = endEvent.type === "pointercancel" || endEvent.type === "blur";
    if (cancelled) Object.assign(connection, structuredClone(beforeConnection));
    endConnectionPointerCapture(pointerCapture);
    interactionLock = false;
    board.classList.remove("dragging-connection");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("blur", end);
    connectionsLayer.innerHTML = "";
    renderConnections(project);
    if (!cancelled) {
      commitState({
        historyEntry: createHistoryCommand("updateConnection", connection.id, beforeConnection, connection, {
          projectId: project.id
        }),
        forceStep: true
      });
    }
  };

  const pointerCapture = beginConnectionPointerCapture(event, end);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("blur", end);
}
