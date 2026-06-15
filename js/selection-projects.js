async function removeBoardItem(id) {
  const project = getActiveProject();
  if (!project) return;
  const item = project.items.find((candidate) => candidate.id === id);
  const connections = project.connections.filter((connection) => connection.from === id || connection.to === id);
  if (!item) return;
  if (!await confirmDangerousAction("Delete this board element?")) return;
  project.items = project.items.filter((item) => item.id !== id);
  project.connections = project.connections.filter((connection) => connection.from !== id && connection.to !== id);
  saveState({
    historyEntry: createHistoryCommand("deleteItem", id, {
      item,
      connections
    }, {
      item: null,
      connections
    }, { projectId: project.id }),
    forceStep: true
  });
  render();
}

async function deleteProject(id) {
  const project = state.projects.find((candidate) => candidate.id === id);
  if (project && !await confirmDangerousAction(`Delete project "${project.name}"? This cannot be undone.`)) return;
  state.projects = state.projects.filter((project) => project.id !== id);
  if (!state.projects.length) {
    const newProject = {
      id: crypto.randomUUID(),
      name: "New project",
      favorite: false,
      modifiedAt: Date.now(),
      totalHours: 40,
      hourPlan: createDefaultHourPlan(),
      tasks: [],
      taskColumns: createDefaultTaskColumns(),
      story: [],
      teamRoles: [],
      items: [],
      connections: []
    };
    state.projects.push(newProject);
  }
  if (state.activeProjectId === id) {
    state.activeProjectId = state.projects[0].id;
  }
  saveAndRender();
}

function renameProject(id) {
  renamingProjectId = id;
  renderProjects();
}

function finishRenameProject(id, value) {
  const project = state.projects.find((candidate) => candidate.id === id);
  if (!project) return;
  const nextName = value.trim();
  if (nextName) {
    project.name = nextName;
    project.modifiedAt = Date.now();
  }
  renamingProjectId = null;
  saveAndRender();
}

function startNewConnectionDrag(event, fromId, fromSide) {
  if (event.button !== 0) return;
  const project = getActiveProject();
  const from = project?.items.find((item) => item.id === fromId);
  if (!project || !from) return;

  event.preventDefault();
  event.stopPropagation();
  interactionLock = true;
  board.classList.add("connecting-board");
  clearNearbyConnectionDots();
  board.querySelector(`[data-id="${fromId}"]`)?.classList.add("connecting-source", "near-connection-target");

  const preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
  preview.setAttribute("class", "connection-preview");
  connectionsLayer.append(preview);
  activeConnectionDrag = { fromId, fromSide, preview, target: null };
  let dragEnded = false;

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    const point = getBoardPoint(moveEvent);
    const target = getClosestConnectionTarget(point, fromId);
    activeConnectionDrag.target = target;
    updateConnectionDragUi(fromId, target);

    const start = getAnchorBySide(from, fromSide);
    const end = target ? getAnchorBySide(target.item, target.side) : point;
    preview.setAttribute("d", `M ${start.x} ${start.y} L ${end.x} ${end.y}`);
  };

  const end = (endEvent) => {
    if (dragEnded) return;
    dragEnded = true;
    const target = activeConnectionDrag?.target;
    const cancelled = endEvent?.type === "pointercancel" || endEvent?.type === "blur";
    clearConnectionDragUi();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("blur", end);

    if (!target || cancelled) {
      interactionLock = false;
      return;
    }

    const connection = createConnection(fromId, target.item.id, from, target.item, fromSide, target.side);
    project.connections.push(connection);
    interactionLock = false;
    saveState({
      historyEntry: createHistoryCommand("createConnection", connection.id, null, connection, { projectId: project.id }),
      forceStep: true
    });
    render();
  };

  move(event);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("blur", end);
}

function getClosestConnectionTarget(point, fromId, maxDistance = 56) {
  const project = getActiveProject();
  if (!project) return null;

  const previous = activeConnectionDrag?.target;
  if (previous?.item?.id && previous.item.id !== fromId) {
    const item = project.items.find((candidate) => candidate.id === previous.item.id);
    if (item) {
      const side = getClosestSide(item, point, previous.side);
      const anchor = getAnchorBySide(item, side);
      const distance = Math.hypot(anchor.x - point.x, anchor.y - point.y);
      if (distance <= maxDistance + 22) return { item, side, distance };
    }
  }

  return project.items
    .filter((item) => item.id !== fromId)
    .map((item) => {
      const side = getClosestSide(item, point);
      const anchor = getAnchorBySide(item, side);
      return { item, side, distance: Math.hypot(anchor.x - point.x, anchor.y - point.y) };
    })
    .filter((target) => target.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function updateNearbyConnectionDots(point) {
  if (activeConnectionDrag || interactionLock) return;
  const project = getActiveProject();
  if (!project) return;

  boardContent.querySelectorAll(".board-item").forEach((node) => {
    const item = project.items.find((candidate) => candidate.id === node.dataset.id);
    node.classList.toggle("near-connection-target", Boolean(item && getDistanceToItem(point, item) <= 72));
  });
}

function updateConnectionDragUi(fromId, target) {
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    const isSource = node.dataset.id === fromId;
    const isTarget = node.dataset.id === target?.item.id;
    node.classList.toggle("connecting-source", isSource);
    node.classList.toggle("near-connection-target", isSource || isTarget);
    node.querySelectorAll(".connection-dot").forEach((dot) => {
      dot.classList.toggle("hot", isTarget && dot.dataset.side === target.side);
    });
  });
}

function clearConnectionDragUi() {
  activeConnectionDrag?.preview?.remove();
  activeConnectionDrag = null;
  board.classList.remove("connecting-board");
  clearNearbyConnectionDots();
}

function clearNearbyConnectionDots() {
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    node.classList.remove("near-connection-target", "connecting-source");
    node.querySelectorAll(".connection-dot.hot").forEach((dot) => dot.classList.remove("hot"));
  });
}

function getDistanceToItem(point, item) {
  const width = item.width || 210;
  const height = item.height || 140;
  const dx = Math.max(item.x - point.x, 0, point.x - (item.x + width));
  const dy = Math.max(item.y - point.y, 0, point.y - (item.y + height));
  return Math.hypot(dx, dy);
}

function connectionIntersectsBounds(connection, project, bounds) {
  const from = project.items.find((item) => item.id === connection.from);
  const to = project.items.find((item) => item.id === connection.to);
  if (!from || !to) return false;
  return polylineIntersectsBounds(getConnectionRoute(connection, from, to, project).points, bounds);
}

function polylineIntersectsBounds(points, bounds) {
  if (!points?.length) return false;
  if (points.some((point) => pointInBounds(point, bounds))) return true;
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsRectangle(points[index], points[index + 1], bounds)) return true;
  }
  return false;
}

function rectsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function pointInBounds(point, bounds) {
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
}

function segmentIntersectsRectangle(a, b, bounds) {
  if (pointInBounds(a, bounds) || pointInBounds(b, bounds)) return true;
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom }
  ];
  return corners.some((corner, index) => segmentsIntersect(a, b, corner, corners[(index + 1) % corners.length]));
}

function segmentsIntersect(a, b, c, d) {
  const direction = (p, q, r) => (r.x - p.x) * (q.y - p.y) - (q.x - p.x) * (r.y - p.y);
  const onSegment = (p, q, r) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const d1 = direction(c, d, a);
  const d2 = direction(c, d, b);
  const d3 = direction(a, b, c);
  const d4 = direction(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSegment(c, d, a)) ||
    (d2 === 0 && onSegment(c, d, b)) ||
    (d3 === 0 && onSegment(a, b, c)) ||
    (d4 === 0 && onSegment(a, b, d));
}

function createConnection(fromId, toId, from, to, forcedFromSide, forcedToSide) {
  const fromCenter = getItemCenter(from);
  const toCenter = getItemCenter(to);
  const fromSide = forcedFromSide || getAutoSide(fromCenter, toCenter);
  const toSide = forcedToSide || getAutoSide(toCenter, fromCenter);
  const bendAxis = ["left", "right"].includes(fromSide) ? "x" : "y";
  const connection = {
    id: crypto.randomUUID(),
    from: fromId,
    to: toId,
    fromSide,
    toSide,
    bendAxis,
    color: getCreationColor(DEFAULT_CONNECTION_COLOR),
    thickness: DEFAULT_CONNECTION_THICKNESS,
    manualBend: false,
    manualPoints: [],
    snapToGrid: false
  };
  connection.bend = getDefaultConnectionBend(connection, { items: [from, to] });
  return connection;
}

function startDrag(event, id) {
  const project = getActiveProject();
  const item = project?.items.find((candidate) => candidate.id === id);
  const element = board.querySelector(`[data-id="${id}"]`);
  if (!item || !element) return;

  if (event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (event.pointerId !== undefined) {
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // The global pointer listeners below still complete the drag.
    }
  }
  interactionLock = true;
  board.classList.add("dragging-board");
  if (!selectedItemIds.has(id)) {
    selectedItemIds = new Set([id]);
    selectedDrawingIds.clear();
    selectedConnectionIds.clear();
  }
  selectedBoardItemId = id;
  renderSelectionClasses();
  const selectedItems = project.items
    .filter((candidate) => selectedItemIds.has(candidate.id))
    .map((candidate) => ({ item: candidate, x: candidate.x, y: candidate.y }));
  const beforeItems = selectedItems.map(({ item: selectedItem }) => structuredClone(selectedItem));
  const selectedDrawings = getSelectedDrawingDragData(project);
  const beforeDrawings = selectedDrawings.map(({ drawing }) => structuredClone(drawing));
  const selectedConnections = getSelectedConnectionDragData(project);
  const beforeConnections = selectedConnections.map(({ connection }) => structuredClone(connection));
  const origin = {
    pointerX: event.clientX,
    pointerY: event.clientY
  };

  const updateDragPosition = (moveEvent) => {
    if (!Number.isFinite(moveEvent?.clientX) || !Number.isFinite(moveEvent?.clientY)) return;
    const dx = (moveEvent.clientX - origin.pointerX) / boardZoom;
    const dy = (moveEvent.clientY - origin.pointerY) / boardZoom;
    selectedItems.forEach(({ item: selectedItem, x, y }) => {
      const nextX = x + dx;
      const nextY = y + dy;
      selectedItem.x = clamp(nextX, 0, 6400 - (selectedItem.width || 210));
      selectedItem.y = clamp(nextY, 0, 4200 - (selectedItem.height || 140));
      const selectedElement = board.querySelector(`[data-id="${selectedItem.id}"]`);
      if (selectedElement) {
        selectedElement.style.left = `${selectedItem.x}px`;
        selectedElement.style.top = `${selectedItem.y}px`;
      }
    });
    selectedDrawings.forEach(({ drawing, points }) => {
      drawing.points = points.map((point) => ({
        x: Math.round(clamp(point.x + dx, 0, 6400)),
        y: Math.round(clamp(point.y + dy, 0, 4200))
      }));
    });
    moveSelectedConnections(selectedConnections, dx, dy);
    renderDrawings(project);
    connectionsLayer.innerHTML = "";
    renderConnections(project);
  };

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    updateDragPosition(moveEvent);
  };

  let dragEnded = false;
  const end = (endEvent) => {
    if (dragEnded) return;
    dragEnded = true;
    updateDragPosition(endEvent);
    interactionLock = false;
    board.classList.remove("dragging-board");
    selectedItems.forEach(({ item: selectedItem }) => {
      selectedItem.x = Math.round(selectedItem.x);
      selectedItem.y = Math.round(selectedItem.y);
    });
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("mouseup", end, true);
    window.removeEventListener("blur", end);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", end, true);
    document.removeEventListener("pointercancel", end, true);
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("mouseup", end, true);
    element.removeEventListener("lostpointercapture", end);
    if (event.pointerId !== undefined) {
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    }
    const commands = [
      ...selectedItems.map(({ item: selectedItem }, index) =>
        createHistoryCommand("updateItem", selectedItem.id, beforeItems[index], selectedItem, { projectId: project.id })),
      ...selectedDrawings.map(({ drawing }, index) =>
        createHistoryCommand("updateDrawing", drawing.id, beforeDrawings[index], drawing, { projectId: project.id })),
      ...selectedConnections.map(({ connection }, index) =>
        createHistoryCommand("updateConnection", connection.id, beforeConnections[index], connection, { projectId: project.id }))
    ];
    commitState({
      historyEntry: createBatchHistoryCommand("moveSelection", commands, {
        targetId: commands.map((command) => command.targetId).join(",")
      }),
      forceStep: true
    });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("mousemove", move, true);
  window.addEventListener("mouseup", end, true);
  window.addEventListener("blur", end);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", end, true);
  document.addEventListener("pointercancel", end, true);
  document.addEventListener("mousemove", move, true);
  document.addEventListener("mouseup", end, true);
  element.addEventListener("lostpointercapture", end);
}

function getSelectedDrawingDragData(project) {
  return (project.drawings || [])
    .filter((drawing) => selectedDrawingIds.has(drawing.id))
    .map((drawing) => ({
      drawing,
      points: drawing.points.map((point) => ({ ...point }))
    }));
}

function getSelectedConnectionDragData(project) {
  return project.connections
    .filter((connection) => selectedConnectionIds.has(connection.id))
    .map((connection) => {
      const from = project.items.find((item) => item.id === connection.from);
      const to = project.items.find((item) => item.id === connection.to);
      const route = from && to ? getConnectionRoute(connection, from, to, project) : null;
      const savedPoints = getConnectionManualPoints(connection);
      const routePoints = route?.manualPoints || [];
      return {
        connection,
        manualPoints: (savedPoints.length ? savedPoints : routePoints).map((point) => ({ ...point })),
        bend: Number(connection.bend),
        bendAxis: connection.bendAxis
      };
    });
}

function moveSelectedConnections(selectedConnections, dx, dy) {
  selectedConnections.forEach(({ connection, manualPoints, bend, bendAxis }) => {
    if (manualPoints.length) {
      connection.manualPoints = manualPoints.map((point) => {
        const movedPoint = {
          x: Math.round(clamp(point.x + dx, 0, 6400)),
          y: Math.round(clamp(point.y + dy, 0, 4200))
        };
        return connection.snapToGrid && typeof snapConnectionPointToGrid === "function"
          ? snapConnectionPointToGrid(movedPoint)
          : movedPoint;
      });
      connection.manualBend = true;
      return;
    }

    if (!Number.isFinite(bend) || !["x", "y"].includes(bendAxis)) return;
    const max = bendAxis === "x" ? 6400 : 4200;
    const movedBend = Math.round(clamp(bend + (bendAxis === "x" ? dx : dy), 0, max));
    connection.bend = connection.snapToGrid && typeof snapConnectionValueToGrid === "function"
      ? snapConnectionValueToGrid(movedBend, max)
      : movedBend;
    connection.manualBend = true;
  });
}

function startConnectionSelectionDrag(event, project, connectionId) {
  if (!project || event.button !== 0 || !selectedConnectionIds.has(connectionId)) return false;
  const selectedItems = project.items
    .filter((candidate) => selectedItemIds.has(candidate.id))
    .map((candidate) => ({ item: candidate, x: candidate.x, y: candidate.y }));
  const selectedDrawings = getSelectedDrawingDragData(project);
  const selectedConnections = getSelectedConnectionDragData(project);
  if (selectedItems.length + selectedDrawings.length + selectedConnections.length <= 1) return false;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (typeof clearNearbyConnectionDots === "function") clearNearbyConnectionDots();
  selectedBoardItemId = selectedBoardItemId && selectedItemIds.has(selectedBoardItemId) ? selectedBoardItemId : null;
  renderSelectionClasses();
  renderPropertiesPanel();

  const beforeItems = selectedItems.map(({ item: selectedItem }) => structuredClone(selectedItem));
  const beforeDrawings = selectedDrawings.map(({ drawing }) => structuredClone(drawing));
  const beforeConnections = selectedConnections.map(({ connection }) => structuredClone(connection));
  const origin = {
    pointerX: event.clientX,
    pointerY: event.clientY
  };
  let dragEnded = false;

  interactionLock = true;
  board.classList.add("dragging-board", "dragging-connection");

  const move = (moveEvent) => {
    if (typeof isSameConnectionPointer === "function" && !isSameConnectionPointer(moveEvent, pointerCapture.pointerId)) return;
    if (!Number.isFinite(moveEvent?.clientX) || !Number.isFinite(moveEvent?.clientY)) return;
    moveEvent.preventDefault();
    const dx = (moveEvent.clientX - origin.pointerX) / boardZoom;
    const dy = (moveEvent.clientY - origin.pointerY) / boardZoom;
    selectedItems.forEach(({ item: selectedItem, x, y }) => {
      selectedItem.x = clamp(x + dx, 0, 6400 - (selectedItem.width || 210));
      selectedItem.y = clamp(y + dy, 0, 4200 - (selectedItem.height || 140));
      const selectedElement = board.querySelector(`[data-id="${selectedItem.id}"]`);
      if (selectedElement) {
        selectedElement.style.left = `${selectedItem.x}px`;
        selectedElement.style.top = `${selectedItem.y}px`;
      }
    });
    selectedDrawings.forEach(({ drawing, points }) => {
      drawing.points = points.map((point) => ({
        x: Math.round(clamp(point.x + dx, 0, 6400)),
        y: Math.round(clamp(point.y + dy, 0, 4200))
      }));
    });
    moveSelectedConnections(selectedConnections, dx, dy);
    renderDrawings(project);
    connectionsLayer.innerHTML = "";
    renderConnections(project);
  };

  const restoreBeforeState = () => {
    selectedItems.forEach(({ item: selectedItem }, index) => Object.assign(selectedItem, structuredClone(beforeItems[index])));
    selectedDrawings.forEach(({ drawing }, index) => Object.assign(drawing, structuredClone(beforeDrawings[index])));
    selectedConnections.forEach(({ connection }, index) => Object.assign(connection, structuredClone(beforeConnections[index])));
  };

  const end = (endEvent = {}) => {
    if (typeof isSameConnectionPointer === "function" && !isSameConnectionPointer(endEvent, pointerCapture.pointerId)) return;
    if (dragEnded) return;
    dragEnded = true;
    move(endEvent);
    const cancelled = endEvent.type === "pointercancel" || endEvent.type === "blur";
    if (cancelled) restoreBeforeState();
    if (typeof endConnectionPointerCapture === "function") endConnectionPointerCapture(pointerCapture);
    interactionLock = false;
    board.classList.remove("dragging-board", "dragging-connection");
    selectedItems.forEach(({ item: selectedItem }) => {
      selectedItem.x = Math.round(selectedItem.x);
      selectedItem.y = Math.round(selectedItem.y);
    });
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("blur", end);
    renderWorkspace();
    connectionsLayer.innerHTML = "";
    renderConnections(project);
    if (cancelled) return;
    const commands = [
      ...selectedItems.map(({ item: selectedItem }, index) =>
        createHistoryCommand("updateItem", selectedItem.id, beforeItems[index], selectedItem, { projectId: project.id })),
      ...selectedDrawings.map(({ drawing }, index) =>
        createHistoryCommand("updateDrawing", drawing.id, beforeDrawings[index], drawing, { projectId: project.id })),
      ...selectedConnections.map(({ connection }, index) =>
        createHistoryCommand("updateConnection", connection.id, beforeConnections[index], connection, { projectId: project.id }))
    ];
    commitState({
      historyEntry: createBatchHistoryCommand("moveSelection", commands, {
        targetId: commands.map((command) => command.targetId).join(",")
      }),
      forceStep: true
    });
  };

  const pointerCapture = typeof beginConnectionPointerCapture === "function"
    ? beginConnectionPointerCapture(event, end)
    : { pointerId: event.pointerId, target: event.currentTarget };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("blur", end);
  return true;
}

function toggleItemSelection(id) {
  if (selectedItemIds.has(id)) {
    selectedItemIds.delete(id);
    selectedBoardItemId = [...selectedItemIds][0] || null;
  } else {
    selectedItemIds.add(id);
    selectedBoardItemId = id;
  }
  renderSelectionClasses();
  renderPropertiesPanel();
}

function handleConnectionSelection(event, id) {
  event.stopPropagation();
  if (event.shiftKey) {
    selectedBoardItemId = selectedBoardItemId && selectedItemIds.has(selectedBoardItemId) ? selectedBoardItemId : null;
    if (selectedConnectionIds.has(id)) {
      selectedConnectionIds.delete(id);
    } else {
      selectedConnectionIds.add(id);
    }
  } else {
    selectedConnectionIds = new Set([id]);
    selectedItemIds.clear();
    selectedDrawingIds.clear();
    selectedBoardItemId = null;
  }
  renderSelectionClasses();
  connectionsLayer.innerHTML = "";
  renderConnections(getActiveProject());
  renderConnectionStylePanel();
}

function handleDrawingSelection(event, id) {
  event.preventDefault();
  event.stopPropagation();
  if (drawMode) toggleDrawMode();
  const wasSelected = selectedDrawingIds.has(id);
  if (event.shiftKey) {
    selectedBoardItemId = selectedBoardItemId && selectedItemIds.has(selectedBoardItemId) ? selectedBoardItemId : null;
    if (selectedDrawingIds.has(id)) {
      selectedDrawingIds.delete(id);
    } else {
      selectedDrawingIds.add(id);
    }
  } else if (!wasSelected) {
    selectedBoardItemId = null;
    selectedItemIds.clear();
    selectedConnectionIds.clear();
    selectedDrawingIds = new Set([id]);
  } else {
    selectedBoardItemId = selectedBoardItemId && selectedItemIds.has(selectedBoardItemId) ? selectedBoardItemId : null;
  }
  renderSelectionClasses();
  renderDrawings(getActiveProject());
  renderPropertiesPanel();
  if (!event.shiftKey) startDrawingDrag(event, id);
}

function startDrawingDrag(event, id) {
  const project = getActiveProject();
  if (!project || event.button !== 0) return;
  if (!selectedDrawingIds.has(id)) selectedDrawingIds = new Set([id]);
  const selectedItems = project.items
    .filter((candidate) => selectedItemIds.has(candidate.id))
    .map((candidate) => ({ item: candidate, x: candidate.x, y: candidate.y }));
  const beforeItems = selectedItems.map(({ item: selectedItem }) => structuredClone(selectedItem));
  const selectedDrawings = getSelectedDrawingDragData(project);
  if (!selectedDrawings.length) return;
  const beforeDrawings = selectedDrawings.map(({ drawing }) => structuredClone(drawing));
  const selectedConnections = getSelectedConnectionDragData(project);
  const beforeConnections = selectedConnections.map(({ connection }) => structuredClone(connection));

  interactionLock = true;
  board.classList.add("dragging-board");
  const origin = {
    pointerX: event.clientX,
    pointerY: event.clientY
  };

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    if (!Number.isFinite(moveEvent?.clientX) || !Number.isFinite(moveEvent?.clientY)) return;
    const dx = (moveEvent.clientX - origin.pointerX) / boardZoom;
    const dy = (moveEvent.clientY - origin.pointerY) / boardZoom;
    selectedItems.forEach(({ item: selectedItem, x, y }) => {
      selectedItem.x = clamp(x + dx, 0, 6400 - (selectedItem.width || 210));
      selectedItem.y = clamp(y + dy, 0, 4200 - (selectedItem.height || 140));
      const selectedElement = board.querySelector(`[data-id="${selectedItem.id}"]`);
      if (selectedElement) {
        selectedElement.style.left = `${selectedItem.x}px`;
        selectedElement.style.top = `${selectedItem.y}px`;
      }
    });
    selectedDrawings.forEach(({ drawing, points }) => {
      drawing.points = points.map((point) => ({
        x: Math.round(clamp(point.x + dx, 0, 6400)),
        y: Math.round(clamp(point.y + dy, 0, 4200))
      }));
    });
    moveSelectedConnections(selectedConnections, dx, dy);
    renderDrawings(project);
    connectionsLayer.innerHTML = "";
    renderConnections(project);
  };

  let dragEnded = false;
  const updateAndFinish = (endEvent) => {
    if (dragEnded) return;
    dragEnded = true;
    move(endEvent);
    interactionLock = false;
    board.classList.remove("dragging-board");
    selectedItems.forEach(({ item: selectedItem }) => {
      selectedItem.x = Math.round(selectedItem.x);
      selectedItem.y = Math.round(selectedItem.y);
    });
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    const commands = [
      ...selectedItems.map(({ item: selectedItem }, index) =>
        createHistoryCommand("updateItem", selectedItem.id, beforeItems[index], selectedItem, { projectId: project.id })),
      ...selectedDrawings.map(({ drawing }, index) =>
        createHistoryCommand("updateDrawing", drawing.id, beforeDrawings[index], drawing, { projectId: project.id })),
      ...selectedConnections.map(({ connection }, index) =>
        createHistoryCommand("updateConnection", connection.id, beforeConnections[index], connection, { projectId: project.id }))
    ];
    commitState({
      historyEntry: createBatchHistoryCommand("moveSelection", commands, {
        targetId: commands.map((command) => command.targetId).join(",")
      }),
      forceStep: true
    });
  };
  const end = (endEvent) => updateAndFinish(endEvent);

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function renderSelectionClasses() {
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    node.classList.toggle("multi-selected", selectedItemIds.has(node.dataset.id));
  });
}

function isBoardDragBlocked(target) {
  return Boolean(target.closest("button, input, select, textarea, [contenteditable='true'], .color-panel, .format-panel, .resize-handle, .resize-edge, .connection-dot, .connection-handle, .connection-endpoint"));
}

function clearSelection() {
  document.activeElement?.closest?.(".item-text")?.blur();
  selectedItemIds.clear();
  selectedConnectionIds.clear();
  selectedDrawingIds.clear();
  selectedBoardItemId = null;
  clearConnectionDragUi();
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    node.classList.remove("multi-selected", "selected-link-source", "colors-open", "format-open", "editing-text");
    node.querySelector(".item-text")?.setAttribute("contenteditable", "false");
  });
  connectionsLayer.innerHTML = "";
  renderDrawings(getActiveProject());
  renderConnections(getActiveProject());
  renderConnectionStylePanel();
}

function handleGlobalKeydown(event) {
  const target = event.target;
  const key = event.key.toLowerCase();
  if (event.code === "Space" && !target?.matches?.("input, textarea, [contenteditable='true']")) {
    spacePressed = true;
    board.classList.add("space-panning");
    event.preventDefault();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoState();
    } else {
      undoState();
    }
    return;
  }

  if (event.key === "Escape") {
    setActiveShapeTool(null);
    if (drawMode) toggleDrawMode();
    if (target?.matches?.("input, textarea, [contenteditable='true']")) {
      target.blur();
    }
    clearSelection();
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && !target?.matches?.("input, textarea, [contenteditable='true']")) {
    deleteSelection();
  }
}

function handleGlobalKeyup(event) {
  if (event.code !== "Space") return;
  spacePressed = false;
  board.classList.remove("space-panning");
}

async function deleteSelection() {
  const project = getActiveProject();
  if (!project || (!selectedItemIds.size && !selectedConnectionIds.size && !selectedDrawingIds.size && !selectedBoardItemId)) return;
  if (!await confirmDangerousAction("Delete the selected board elements?")) return;

  const idsToDelete = new Set(selectedItemIds);
  if (!idsToDelete.size && selectedBoardItemId) idsToDelete.add(selectedBoardItemId);
  const beforeSnapshot = getHistorySnapshot();
  const selectedConnectionsBefore = project.connections.filter((connection) => selectedConnectionIds.has(connection.id));
  const selectedDrawingsBefore = (project.drawings || []).filter((drawing) => selectedDrawingIds.has(drawing.id));
  const selectedItemsBefore = project.items.filter((item) => idsToDelete.has(item.id));
  const relatedConnectionsBefore = project.connections.filter((connection) =>
    idsToDelete.has(connection.from) || idsToDelete.has(connection.to));

  if (idsToDelete.size) {
    project.items = project.items.filter((item) => !idsToDelete.has(item.id));
    project.connections = project.connections.filter((connection) =>
      !idsToDelete.has(connection.from) &&
      !idsToDelete.has(connection.to) &&
      !selectedConnectionIds.has(connection.id)
    );
  } else {
    project.connections = project.connections.filter((connection) => !selectedConnectionIds.has(connection.id));
  }
  if (selectedDrawingIds.size) {
    project.drawings = (project.drawings || []).filter((drawing) => !selectedDrawingIds.has(drawing.id));
  }

  selectedItemIds.clear();
  selectedConnectionIds.clear();
  selectedDrawingIds.clear();
  selectedBoardItemId = null;
  const afterSnapshot = getHistorySnapshot();
  let historyEntry = createSnapshotHistoryEntry(beforeSnapshot, afterSnapshot);
  const deletedOnlyOneItem = selectedItemsBefore.length === 1 && !selectedDrawingsBefore.length && !selectedConnectionsBefore.length;
  const deletedOnlyOneConnection = !selectedItemsBefore.length && selectedConnectionsBefore.length === 1 && !selectedDrawingsBefore.length;
  const deletedOnlyOneDrawing = !selectedItemsBefore.length && !selectedConnectionsBefore.length && selectedDrawingsBefore.length === 1;
  if (deletedOnlyOneItem) {
    historyEntry = createHistoryCommand("deleteItem", selectedItemsBefore[0].id, {
      item: selectedItemsBefore[0],
      connections: relatedConnectionsBefore
    }, {
      item: null,
      connections: relatedConnectionsBefore
    }, { projectId: project.id });
  } else if (deletedOnlyOneConnection) {
    historyEntry = createHistoryCommand("deleteConnection", selectedConnectionsBefore[0].id, selectedConnectionsBefore[0], null, { projectId: project.id });
  } else if (deletedOnlyOneDrawing) {
    historyEntry = createHistoryCommand("deleteDrawing", selectedDrawingsBefore[0].id, selectedDrawingsBefore[0], null, { projectId: project.id });
  }
  saveState({ historyEntry, forceStep: true });
  render();
}

function persistItemSize(node, item) {
  const nextWidth = Math.round(node.offsetWidth);
  const nextHeight = Math.round(node.offsetHeight);
  if (nextWidth <= 0 || nextHeight <= 0) return;
  item.width = nextWidth;
  item.height = nextHeight;
  commitState({ skipHistory: true });
}

function persistAllVisibleItemSizes() {
  const project = getActiveProject();
  if (!project) return;
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    const item = project.items.find((candidate) => candidate.id === node.dataset.id);
    if (item) persistItemSize(node, item);
  });
}

function persistActiveProjectPanelValues() {
  const project = getActiveProject();
  if (!project) return;
  project.totalHours = Math.max(0, Number(projectHours.value) || 0);
}

function saveProjectHours() {
  const project = getActiveProject();
  if (!project) return;
  const before = { totalHours: project.totalHours };
  project.totalHours = Math.max(0, Number(projectHours.value) || 0);
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, before, { totalHours: project.totalHours }, {
      projectId: project.id,
      groupKey: `project:${project.id}:hours`
    })
  });
  render();
}

function hoursFromPercent(totalHours, percent) {
  return totalHours * (percent / 100);
}

function formatHours(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

