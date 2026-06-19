function addSelectedShape(selected = "ticket") {
  if (!isShapeToolAllowedForProject(selected)) return;
  if (selected === "ticket") {
    addBoardItem("ticket");
    return;
  }
  if (selected === "table" || selected === "folder") {
    addBoardItem("table", createTableItemDefaults(selected));
    return;
  }
  addBoardItem("shape", {
    shape: selected,
    width: selected === "triangle" ? 150 : 140,
    height: 140,
    color: getCreationColor(),
    text: "New board",
    html: "New board"
  });
}

function addBoardItem(type, extra = {}, options = {}) {
  const project = getActiveProject();
  if (!project) return;
  const isShape = type === "shape";
  const isTable = type === "table";
  const width = extra.width ?? (type === "image" ? 260 : isTable ? 320 : isShape ? 140 : 230);
  const height = extra.height ?? (type === "image" ? 220 : isTable ? 220 : 140);
  const position = getNewItemPosition(width, height, extra);
  const item = {
    id: crypto.randomUUID(),
    type,
    x: position.x,
    y: position.y,
    width,
    height,
    name: type === "image" ? "Imported image" : isTable ? (extra.tableKind === "folder" ? "Folder" : "Table") : "New board",
    text: type === "ticket" ? "New board" : "",
    html: type === "ticket" ? "New board" : "",
    shape: isShape ? "circle" : undefined,
    color: type === "image" ? "#ffffff" : getCreationColor(),
    borderColor: "#1d2733",
    borderThickness: isShape ? 2 : 1,
    captionOpen: type !== "image",
    ...extra
  };
  project.items.push(item);
  selectedBoardItemId = item.id;
  selectedItemIds = new Set([item.id]);
  selectedConnectionIds.clear();
  selectedDrawingIds.clear();
  if (type !== "image") {
    const historyEntry = createHistoryCommand("createItem", item.id, null, item, { projectId: project.id });
    if (options.forceHistoryStep) {
      commitState({ forceStep: true, historyEntry });
    } else {
      saveState({ historyEntry, forceStep: true });
    }
    render();
  } else {
    saveState({ projectId: project.id, forceStep: true });
    render();
  }
  return item;
}

const designBoardTemplates = {
  level: {
    title: "Level Design Board",
    fields: [
      "Objetivo do nivel",
      "Obstaculos",
      "Inimigos",
      "Progressao",
      "Recompensas",
      "Dificuldade",
      "Referencias visuais"
    ]
  },
  character: {
    title: "Character Design Board",
    fields: [
      "Nome",
      "Historia",
      "Personalidade",
      "Habilidades",
      "Animacoes",
      "Sprites",
      "Sons",
      "Referencias"
    ]
  }
};

function addDesignBoardTemplate(kind) {
  const template = designBoardTemplates[kind];
  if (!template) return;
  const rows = template.fields.length + 1;
  const cells = [
    { text: template.title },
    { text: "Notas" },
    ...template.fields.flatMap((field) => [{ text: field }, { text: "" }])
  ];
  addBoardItem("table", {
    tableKind: "table",
    name: template.title,
    width: 560,
    height: Math.max(300, rows * 58),
    color: getCreationColor("#fff1b8"),
    borderColor: "#1d2733",
    borderThickness: 2,
    table: {
      rows,
      cols: 2,
      cells
    }
  }, { forceHistoryStep: true });
}

const templateLayouts = {
  "one-to-three": {
    label: "1 to 3",
    nodes: [
      { key: "root", x: 0, y: 168 },
      { key: "top", x: 448, y: 0 },
      { key: "middle", x: 448, y: 168 },
      { key: "bottom", x: 448, y: 336 }
    ],
    links: [
      { from: "root", to: "top", fromSide: "right", toSide: "left", points: [{ x: 336, y: 224 }, { x: 336, y: 56 }] },
      { from: "root", to: "middle", fromSide: "right", toSide: "left", points: [] },
      { from: "root", to: "bottom", fromSide: "right", toSide: "left", points: [{ x: 336, y: 224 }, { x: 336, y: 392 }] }
    ]
  },
  "one-to-six": {
    label: "1 to 6",
    nodes: [
      { key: "center", x: 448, y: 280 },
      { key: "top", x: 448, y: 0 },
      { key: "bottom", x: 448, y: 560 },
      { key: "leftTop", x: 0, y: 112 },
      { key: "leftBottom", x: 0, y: 448 },
      { key: "rightTop", x: 896, y: 112 },
      { key: "rightBottom", x: 896, y: 448 }
    ],
    links: [
      { from: "center", to: "top", fromSide: "top", toSide: "bottom", points: [] },
      { from: "center", to: "bottom", fromSide: "bottom", toSide: "top", points: [] },
      { from: "center", to: "leftTop", fromSide: "left", toSide: "right", points: [{ x: 336, y: 336 }, { x: 336, y: 168 }] },
      { from: "center", to: "leftBottom", fromSide: "left", toSide: "right", points: [{ x: 336, y: 336 }, { x: 336, y: 504 }] },
      { from: "center", to: "rightTop", fromSide: "right", toSide: "left", points: [{ x: 784, y: 336 }, { x: 784, y: 168 }] },
      { from: "center", to: "rightBottom", fromSide: "right", toSide: "left", points: [{ x: 784, y: 336 }, { x: 784, y: 504 }] }
    ]
  }
};

const templateBoardSize = { width: 224, height: 112 };

function addTemplateLayout(templateId) {
  const project = getActiveProject();
  const template = templateLayouts[templateId];
  if (!project || !template) return;
  if (drawMode) toggleDrawMode();
  setActiveShapeTool(null);

  const origin = getTemplateOrigin(template);
  const itemsByKey = new Map();
  const items = template.nodes.map((node) => {
    const item = createTemplateBoard(node, origin);
    itemsByKey.set(node.key, item);
    return item;
  });
  const connections = template.links
    .map((link) => createTemplateConnection(link, itemsByKey, origin))
    .filter(Boolean);

  project.items.push(...items);
  project.connections.push(...connections);
  selectedBoardItemId = items[0]?.id || null;
  selectedItemIds = new Set(items.map((item) => item.id));
  selectedConnectionIds = new Set(connections.map((connection) => connection.id));
  selectedDrawingIds.clear();

  const commands = [
    ...items.map((item) => createHistoryCommand("createItem", item.id, null, item, { projectId: project.id })),
    ...connections.map((connection) => createHistoryCommand("createConnection", connection.id, null, connection, { projectId: project.id }))
  ];
  commitState({
    historyEntry: createBatchHistoryCommand("createTemplateLayout", commands, {
      targetId: commands.map((command) => command.targetId).join(",")
    }),
    forceStep: true
  });
  render();
}

function createTemplateBoard(node, origin) {
  const text = "New board";
  return {
    id: crypto.randomUUID(),
    type: "ticket",
    name: text,
    x: snapTemplateValue(origin.x + node.x, 0, 6400 - templateBoardSize.width),
    y: snapTemplateValue(origin.y + node.y, 0, 4200 - templateBoardSize.height),
    width: templateBoardSize.width,
    height: templateBoardSize.height,
    text,
    html: text,
    color: getCreationColor(),
    borderColor: "#1d2733",
    borderThickness: 1,
    captionOpen: true
  };
}

function createTemplateConnection(link, itemsByKey, origin) {
  const from = itemsByKey.get(link.from);
  const to = itemsByKey.get(link.to);
  if (!from || !to) return null;
  const connection = createConnection(from.id, to.id, from, to, link.fromSide, link.toSide);
  connection.snapToGrid = true;
  connection.manualBend = true;
  connection.manualPoints = link.points.map((point) => snapConnectionPointToGrid({
    x: origin.x + point.x,
    y: origin.y + point.y
  }));
  connection.bend = getDefaultConnectionBend(connection, { items: [from, to] });
  snapConnectionToGrid(connection, { items: [from, to] });
  return connection;
}

function getTemplateOrigin(template) {
  const bounds = template.nodes.reduce((box, node) => ({
    left: Math.min(box.left, node.x),
    top: Math.min(box.top, node.y),
    right: Math.max(box.right, node.x + templateBoardSize.width),
    bottom: Math.max(box.bottom, node.y + templateBoardSize.height)
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  const rect = board.getBoundingClientRect();
  const center = {
    x: (rect.width / 2 - boardPan.x) / boardZoom,
    y: (rect.height / 2 - boardPan.y) / boardZoom
  };
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  return {
    x: snapTemplateValue(center.x - width / 2 - bounds.left, 0, 6400 - width),
    y: snapTemplateValue(center.y - height / 2 - bounds.top, 0, 4200 - height)
  };
}

function snapTemplateValue(value, min, max) {
  const gridSize = typeof BOARD_GRID_SIZE === "number" && BOARD_GRID_SIZE > 0 ? BOARD_GRID_SIZE : 28;
  return Math.round(clamp(Math.round(value / gridSize) * gridSize, min, max));
}

function getNewItemPosition(width, height, extra = {}) {
  if (Number.isFinite(extra.x) && Number.isFinite(extra.y)) {
    return {
      x: Math.max(0, Math.round(extra.x)),
      y: Math.max(0, Math.round(extra.y))
    };
  }

  const rect = board.getBoundingClientRect();
  const center = {
    x: (rect.width / 2 - boardPan.x) / boardZoom,
    y: (rect.height / 2 - boardPan.y) / boardZoom
  };

  return {
    x: Math.round(clamp(center.x - width / 2, 0, 6400 - width)),
    y: Math.round(clamp(center.y - height / 2, 0, 4200 - height))
  };
}

function handleBoardDrop(event) {
  event.preventDefault();
  board.classList.remove("drag-over");
  const point = getBoardPoint(event);
  const imageFiles = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length) {
    imageFiles.forEach((file, index) => addImageFile(file, { x: point.x + index * 24, y: point.y + index * 24 }));
    return;
  }

  const html = event.dataTransfer.getData("text/html");
  const imageSrc = getImageSrcFromHtml(html);
  if (imageSrc) {
    addImageUrl(imageSrc, point);
    return;
  }

  const uri = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
  if (isImageLikeUrl(uri)) addImageUrl(uri.trim(), point);
}

function handlePaste(event) {
  const target = event.target;
  if (target?.matches?.("input, textarea, [contenteditable='true']")) return;
  const project = getActiveProject();
  const ticketJson = event.clipboardData.getData("application/x-flowboard-ticket");
  if (ticketJson && project) {
    event.preventDefault();
    try {
      pasteTicket(JSON.parse(ticketJson), lastBoardPoint);
    } catch {
      if (copiedBoardItem) pasteTicket(copiedBoardItem, lastBoardPoint);
    }
    return;
  }

  const imageItems = [...event.clipboardData.items].filter((item) => item.type.startsWith("image/"));
  if (imageItems.length) {
    event.preventDefault();
    imageItems.forEach((item) => addImageFile(item.getAsFile()));
    return;
  }

  const html = event.clipboardData.getData("text/html");
  const imageSrc = getImageSrcFromHtml(html);
  if (imageSrc) {
    event.preventDefault();
    addImageUrl(imageSrc);
    return;
  }

  const text = event.clipboardData.getData("text/plain");
  if (isImageLikeUrl(text)) {
    event.preventDefault();
    addImageUrl(text.trim());
    return;
  }

  if (copiedBoardItem && project) {
    event.preventDefault();
    pasteTicket(copiedBoardItem, lastBoardPoint);
  }
}

function handleCopy(event) {
  const target = event.target;
  if (target?.matches?.("input, textarea, [contenteditable='true']")) return;
  const project = getActiveProject();
  const item = project?.items.find((candidate) => candidate.id === selectedBoardItemId);
  if (!item || !["ticket", "shape"].includes(item.type)) return;

  event.preventDefault();
  copiedBoardItem = structuredClone(item);
  event.clipboardData.setData("application/x-flowboard-ticket", JSON.stringify(copiedBoardItem));
  event.clipboardData.setData("text/plain", item.text || "");
}

function pasteTicket(source, point) {
  const project = getActiveProject();
  if (!project || !["ticket", "shape"].includes(source.type)) return;
  const clone = {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    x: Math.max(0, Math.round(point.x)),
    y: Math.max(0, Math.round(point.y)),
    connections: undefined
  };
  project.items.push(clone);
  selectedBoardItemId = clone.id;
  selectedItemIds = new Set([clone.id]);
  selectedConnectionIds.clear();
  selectedDrawingIds.clear();
  saveState({
    historyEntry: createHistoryCommand("createItem", clone.id, null, clone, { projectId: project.id }),
    forceStep: true
  });
  render();
}

function getResizeFrameFromSize(origin, direction, width, height) {
  let x = origin.itemX;
  let y = origin.itemY;

  if (direction.includes("w")) {
    x = origin.itemX + origin.width - width;
  } else if (!direction.includes("e")) {
    x = origin.itemX + (origin.width - width) / 2;
  }

  if (direction.includes("n")) {
    y = origin.itemY + origin.height - height;
  } else if (!direction.includes("s")) {
    y = origin.itemY + (origin.height - height) / 2;
  }

  return { x, y, width, height };
}

function getMaxProportionalResizeScale(origin, direction) {
  const centerX = origin.itemX + origin.width / 2;
  const centerY = origin.itemY + origin.height / 2;
  const maxWidth = direction.includes("w")
    ? origin.itemX + origin.width
    : direction.includes("e")
      ? 6400 - origin.itemX
      : Math.min(centerX * 2, (6400 - centerX) * 2);
  const maxHeight = direction.includes("n")
    ? origin.itemY + origin.height
    : direction.includes("s")
      ? 4200 - origin.itemY
      : Math.min(centerY * 2, (4200 - centerY) * 2);

  return Math.max(0.01, Math.min(maxWidth / origin.width, maxHeight / origin.height));
}

function getProportionalResizeScale(origin, direction, dx, dy) {
  const hasHorizontalDrag = direction.includes("e") || direction.includes("w");
  const hasVerticalDrag = direction.includes("n") || direction.includes("s");
  const scaleX = hasHorizontalDrag
    ? (origin.width + (direction.includes("e") ? dx : -dx)) / origin.width
    : 1;
  const scaleY = hasVerticalDrag
    ? (origin.height + (direction.includes("s") ? dy : -dy)) / origin.height
    : 1;

  if (hasHorizontalDrag && hasVerticalDrag) {
    return Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
  }
  return hasHorizontalDrag ? scaleX : scaleY;
}

function getProportionalResizeFrame(item, origin, direction, dx, dy) {
  if (origin.width <= 0 || origin.height <= 0) return null;
  const maxScale = getMaxProportionalResizeScale(origin, direction);
  const minSize = getMinimumItemSize(item, origin.width);
  const minScale = Math.max(minSize.width / origin.width, minSize.height / origin.height);
  let scale = getProportionalResizeScale(origin, direction, dx, dy);
  scale = maxScale < minScale ? maxScale : clamp(scale, minScale, maxScale);

  const refinedMinSize = getMinimumItemSize(item, Math.round(origin.width * scale));
  const refinedMinScale = Math.max(refinedMinSize.width / origin.width, refinedMinSize.height / origin.height);
  if (refinedMinScale > scale && refinedMinScale <= maxScale) {
    scale = refinedMinScale;
  }

  return getResizeFrameFromSize(origin, direction, origin.width * scale, origin.height * scale);
}

function startItemResize(event, node, item, project, direction = "se") {
  if (event.type === "mousedown" && event.button !== 0) return;
  if (spacePressed) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();
  if (activeResizeId) return;
  activeResizeId = item.id;
  if (event.pointerId !== undefined) {
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Some browser/file contexts refuse pointer capture; global listeners still handle the drag.
    }
  }
  interactionLock = true;
  board.classList.add("dragging-board", "resizing-board");
  selectedItemIds = new Set([item.id]);
  selectedConnectionIds.clear();
  selectedDrawingIds.clear();
  renderSelectionClasses();
  const beforeItem = structuredClone(item);
  const origin = {
    x: event.clientX,
    y: event.clientY,
    itemX: item.x,
    itemY: item.y,
    width: item.width || Number.parseFloat(node.style.width) || Math.round(node.offsetWidth),
    height: item.height || Number.parseFloat(node.style.height) || Math.round(node.offsetHeight)
  };

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    const clientX = moveEvent.clientX ?? origin.x;
    const clientY = moveEvent.clientY ?? origin.y;
    const dx = (clientX - origin.x) / boardZoom;
    const dy = (clientY - origin.y) / boardZoom;
    let nextX = origin.itemX;
    let nextY = origin.itemY;
    let nextWidth = origin.width;
    let nextHeight = origin.height;

    const proportionalFrame = moveEvent.shiftKey
      ? getProportionalResizeFrame(item, origin, direction, dx, dy)
      : null;

    if (proportionalFrame) {
      nextX = proportionalFrame.x;
      nextY = proportionalFrame.y;
      nextWidth = proportionalFrame.width;
      nextHeight = proportionalFrame.height;
    } else {
      if (direction.includes("e")) nextWidth = origin.width + dx;
      if (direction.includes("s")) nextHeight = origin.height + dy;
      if (direction.includes("w")) {
        nextWidth = origin.width - dx;
        nextX = origin.itemX + dx;
      }
      if (direction.includes("n")) {
        nextHeight = origin.height - dy;
        nextY = origin.itemY + dy;
      }

      const minSize = getMinimumItemSize(item, Math.round(nextWidth));
      if (nextWidth < minSize.width) {
        if (direction.includes("w")) nextX -= minSize.width - nextWidth;
        nextWidth = minSize.width;
      }
      if (nextHeight < minSize.height) {
        if (direction.includes("n")) nextY -= minSize.height - nextHeight;
        nextHeight = minSize.height;
      }
    }

    const minSize = getMinimumItemSize(item, Math.round(nextWidth));
    item.width = Math.round(clamp(nextWidth, minSize.width, 6400));
    item.height = Math.round(clamp(nextHeight, minSize.height, 4200));
    item.x = Math.round(clamp(nextX, 0, 6400 - item.width));
    item.y = Math.round(clamp(nextY, 0, 4200 - item.height));
    node.style.left = `${item.x}px`;
    node.style.top = `${item.y}px`;
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
    fitItemText(node.querySelector(".item-text"), item);
    connectionsLayer.innerHTML = "";
    renderConnections(project);
  };

  const end = () => {
    if (activeResizeId !== item.id) return;
    activeResizeId = null;
    interactionLock = false;
    board.classList.remove("dragging-board", "resizing-board");
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
    if (event.pointerId !== undefined) {
      try {
        event.currentTarget?.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser on pointerup.
      }
    }
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("mouseup", end, true);
    commitState({
      historyEntry: createHistoryCommand("updateItem", item.id, beforeItem, item, {
        projectId: project.id,
        groupKey: `item:${item.id}:resize`
      }),
      forceStep: true
    });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("mousemove", move, true);
  window.addEventListener("mouseup", end, true);
}

function getImageSrcFromHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelector("img")?.src || "";
}

function isImageLikeUrl(value) {
  return /^https:\/\/.+\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value.trim()) || value.trim().startsWith("data:image/");
}

function handleBoardWheel(event) {
  if (!event.target.closest("#board")) return;
  event.preventDefault();
  const before = getBoardPoint(event);
  const nextZoom = Math.max(0.25, Math.min(2.5, boardZoom + (event.deltaY > 0 ? -0.08 : 0.08)));
  boardZoom = Math.round(nextZoom * 100) / 100;
  const rect = board.getBoundingClientRect();
  boardPan.x = event.clientX - rect.left - before.x * boardZoom;
  boardPan.y = event.clientY - rect.top - before.y * boardZoom;
  renderZoom();
  lastBoardPoint = before;
}

function renderZoom() {
  boardContent.style.transform = `translate(${boardPan.x}px, ${boardPan.y}px) scale(${boardZoom})`;
  zoomIndicator.textContent = `${Math.round(boardZoom * 100)}%`;
}

function getBoardPoint(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - boardPan.x) / boardZoom,
    y: (event.clientY - rect.top - boardPan.y) / boardZoom
  };
}

function startBoardPan(event) {
  if (event.button !== 0) return;
  if (drawMode && !spacePressed) return;
  if (!spacePressed && event.target.closest(".board-item, .drawer-toggle, .connection-handle")) return;
  if (spacePressed && event.target.closest(".drawer-toggle")) return;
  event.preventDefault();
  clearSelection();
  board.classList.add("panning");
  const origin = {
    x: event.clientX,
    y: event.clientY,
    panX: boardPan.x,
    panY: boardPan.y
  };

  const move = (moveEvent) => {
    boardPan.x = origin.panX + moveEvent.clientX - origin.x;
    boardPan.y = origin.panY + moveEvent.clientY - origin.y;
    renderZoom();
  };

  const end = () => {
    board.classList.remove("panning");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function observeItemResize(node, item, project) {
  return;
  if (!("ResizeObserver" in window)) return;
  const observer = new ResizeObserver(() => {
    const nextWidth = Math.round(node.offsetWidth);
    const nextHeight = Math.round(node.offsetHeight);
    if (Math.abs((item.width || 0) - nextWidth) < 2 && Math.abs((item.height || 0) - nextHeight) < 2) return;
    item.width = nextWidth;
    item.height = nextHeight;
    connectionsLayer.innerHTML = "";
    renderConnections(project);
    commitState({ skipHistory: true });
  });
  observer.observe(node);
}
