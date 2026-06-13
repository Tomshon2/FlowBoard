function addSelectedShape(selected = "ticket") {
  if (selected === "ticket") {
    addBoardItem("ticket");
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
  const width = extra.width ?? (type === "image" ? 260 : isShape ? 140 : 230);
  const height = extra.height ?? (type === "image" ? 220 : 140);
  const position = getNewItemPosition(width, height, extra);
  const item = {
    id: crypto.randomUUID(),
    type,
    x: position.x,
    y: position.y,
    width,
    height,
    text: type === "ticket" ? "New board" : "",
    html: type === "ticket" ? "New board" : "",
    shape: isShape ? "circle" : undefined,
    color: type === "image" ? "#ffffff" : getCreationColor(),
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
    saveAndRender();
  }
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

const IMPORT_IMAGE_MAX_DIMENSION = 1600;
const IMPORT_IMAGE_QUALITY = 0.84;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImageSource(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

function getImageBoardSize(width, height) {
  const maxWidth = 420;
  const maxHeight = 320;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(160, Math.round(width * scale)),
    height: Math.max(120, Math.round(height * scale))
  };
}

async function prepareImportedImage(file) {
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    const src = await readFileAsDataUrl(file);
    return { src, width: 260, height: 220 };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageSource(objectUrl);
    const naturalWidth = image.naturalWidth || 260;
    const naturalHeight = image.naturalHeight || 220;
    const scale = Math.min(1, IMPORT_IMAGE_MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: true });
    const outputType = file.type === "image/png" && file.size < 800000 ? "image/png" : "image/jpeg";
    if (outputType === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      src: canvas.toDataURL(outputType, IMPORT_IMAGE_QUALITY),
      ...getImageBoardSize(naturalWidth, naturalHeight)
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function addImageFile(file, point = null) {
  if (!file?.type?.startsWith("image/")) {
    window.alert("Choose an image file.");
    return;
  }
  try {
    const imported = await prepareImportedImage(file);
    const placement = point ? {
      x: Math.max(0, Math.round(point.x)),
      y: Math.max(0, Math.round(point.y))
    } : {};
    addBoardItem("image", {
      src: imported.src,
      text: file.name || "Image",
      width: imported.width,
      height: imported.height,
      ...placement
    }, { forceHistoryStep: true });
  } catch (error) {
    console.warn("FlowBoard image import failed:", error);
    window.alert("Could not import that image. Try another image file.");
  }
}

function addImageUrl(src, point = null) {
  if (!src) return;
  const placement = point ? {
    x: Math.max(0, Math.round(point.x)),
    y: Math.max(0, Math.round(point.y))
  } : {};
  addBoardItem("image", {
    src,
    text: "Pasted image",
    ...placement
  });
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

function startItemResize(event, node, item, project, direction = "se") {
  if (event.type === "mousedown" && event.button !== 0) return;
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
  return /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value.trim()) || value.trim().startsWith("data:image/");
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
  if (event.target.closest(".board-item, .drawer-toggle, .connection-handle")) return;
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

function togglePanel(panel, button) {
  const collapsed = panel.classList.toggle("collapsed");
  button.textContent = collapsed ? ">" : "v";
  button.setAttribute("aria-expanded", String(!collapsed));
}

function toggleDrawer(drawer) {
  const className = drawer === "workspace" ? "workspace-open" : "side-open";
  if (drawer === "workspace") app.classList.remove("side-open");
  app.classList.toggle(className);
  syncDrawerButtons();
}

function closeDrawer(drawer) {
  app.classList.remove(drawer === "workspace" ? "workspace-open" : "side-open");
  syncDrawerButtons();
}

function syncDrawerButtons() {
  const workspaceOpen = app.classList.contains("workspace-open");
  const sideOpen = app.classList.contains("side-open");
  workspaceDrawerToggle.setAttribute("aria-expanded", String(workspaceOpen));
  hoursDrawerToggle.setAttribute("aria-expanded", String(sideOpen && activeSidePanel === "hours"));
  tasksDrawerToggle.setAttribute("aria-expanded", String(sideOpen && activeSidePanel === "tasks"));
  storyDrawerToggle.setAttribute("aria-expanded", String(sideOpen && activeSidePanel === "story"));
  teamDrawerToggle.setAttribute("aria-expanded", String(sideOpen && activeSidePanel === "team"));
  workspaceDrawerToggle.classList.toggle("active", workspaceOpen);
  hoursDrawerToggle.classList.toggle("active", sideOpen && activeSidePanel === "hours");
  tasksDrawerToggle.classList.toggle("active", sideOpen && activeSidePanel === "tasks");
  storyDrawerToggle.classList.toggle("active", sideOpen && activeSidePanel === "story");
  teamDrawerToggle.classList.toggle("active", sideOpen && activeSidePanel === "team");
  projectsDrawer.setAttribute("aria-hidden", String(!workspaceOpen));
  sideDrawer.setAttribute("aria-hidden", String(!sideOpen));
}

function toggleSidePanel(panelName) {
  const sideOpen = app.classList.contains("side-open");
  if (sideOpen && activeSidePanel === panelName) {
    closeDrawer("side");
    return;
  }
  activeSidePanel = panelName;
  sideDrawer.dataset.mode = panelName;
  setPanelOpen(hoursPanel, toggleHours, panelName === "hours");
  setPanelOpen(tasksPanel, toggleTasks, panelName === "tasks");
  setPanelOpen(storyPanel, toggleStory, panelName === "story");
  setPanelOpen(teamPanel, toggleTeam, panelName === "team");
  app.classList.remove("workspace-open");
  app.classList.add("side-open");
  syncDrawerButtons();
}

function setPanelOpen(panel, button, open) {
  panel.classList.toggle("collapsed", !open);
  button.textContent = "";
  button.setAttribute("aria-expanded", String(open));
}
