function render() {
  renderBoardSurface();
  renderProjectModeUi();
  renderProjects();
  renderWorkspace();
  renderRemoteCursors();
  renderTasks();
  renderHours();
  renderStory();
  renderLevelWorkspaces();
  renderCharacterWorkspaces();
  renderTeamRoles();
  renderCodeWorkspace();
  renderWorkspaceMembers();
  renderMilestones();
  renderProjectHistory();
  renderZoom();
  renderPropertiesPanel();
  syncDrawerButtons();
}

function renderBoardSurface() {
  personalTheme = loadPersonalTheme();
  board.classList.toggle("board-dark", personalTheme === "dark");
  app.classList.toggle("app-dark", personalTheme === "dark");
  board.classList.toggle("grid-hidden", state.boardGrid === "hidden");
  const gridHidden = state.boardGrid === "hidden";
  boardGridBtn.classList.toggle("active", gridHidden);
  boardGridBtn.title = gridHidden ? "Show grid" : "Hide grid";
  boardGridBtn.setAttribute("aria-label", gridHidden ? "Show grid" : "Hide grid");
  boardGridBtn.setAttribute("aria-pressed", String(gridHidden));
  boardThemeBtn.textContent = personalTheme === "dark" ? "Light mode" : "Dark mode";
}

function renderBoardTheme() {
  renderBoardSurface();
}

function renderProjectModeUi() {
  const project = getActiveProject();
  const gameJam = isGameJamProject(project);
  app.classList.toggle("gamejam-mode", gameJam);
  storyDrawerToggle.title = gameJam ? "Concept" : "Game story";
  storyDrawerToggle.setAttribute("aria-label", storyDrawerToggle.title);
  syncGameJamColorPalette();
  shapeTools.forEach((button) => {
    const allowed = isShapeToolAllowedForProject(button.dataset.shapeTool, project);
    button.classList.toggle("project-mode-hidden", !allowed);
    button.disabled = !allowed;
  });
  if (gameJam && activeShapeTool && !isShapeToolAllowedForProject(activeShapeTool, project)) {
    setActiveShapeTool(null);
  }
  if (gameJam && !["hours", "tasks", "code", "story", "team"].includes(activeSidePanel)) {
    activeSidePanel = "hours";
    sideDrawer.dataset.mode = activeSidePanel;
  }
}

function renderConnectionStylePanel() {
  connectionStylePanel.classList.add("hidden");
  renderPropertiesPanel();
}

function renderPropertiesPanel() {
  const project = getActiveProject();
  const selectedBoard = getSelectedBoardItem(project);
  const selectedBoards = getSelectedBoardItems(project);
  const selectedConnection = project?.connections.find((connection) => selectedConnectionIds.has(connection.id));
  const selectedDrawing = project?.drawings?.find((drawing) => selectedDrawingIds.has(drawing.id));
  const selectedLine = selectedConnection || selectedDrawing;
  const editingDrawingTool = drawMode && !selectedBoard && !selectedLine;
  const hasSelection = Boolean(selectedBoards.length || selectedLine || editingDrawingTool);
  propertiesPanel.classList.toggle("hidden", !hasSelection);
  propertiesPanel.setAttribute("aria-hidden", String(!hasSelection));
  boardProperties.classList.toggle("hidden", !selectedBoards.length);
  lineProperties.classList.toggle("hidden", !(selectedLine || editingDrawingTool));
  propertiesTableControls.classList.add("hidden");
  if (!hasSelection) return;

  if (selectedBoards.length) {
    const editableBoards = selectedBoards.filter((item) => item.type !== "image");
    const styleableBoards = selectedBoards.filter((item) => item.type !== "image" || isLevelPreviewItem(item));
    const referenceBoard = styleableBoards[0] || editableBoards[0] || selectedBoard;
    const isShape = referenceBoard.type === "shape";
    const isTable = referenceBoard.type === "table";
    propertiesTitle.textContent = selectedBoards.length > 1
      ? `${selectedBoards.length} selected boards`
      : isTable ? referenceBoard.tableKind === "folder" ? "Folder" : "Table" : isShape ? getShapeLabel(referenceBoard.shape) : isLevelPreviewItem(referenceBoard) ? "Level design board" : referenceBoard.type === "image" ? "Image" : "Board";
    const color = normalizeHexColor(referenceBoard.color || ticketColors[0]);
    propertiesBoardColor.value = color;
    propertiesBoardHex.value = color;
    propertiesBoardName.disabled = !editableBoards.length;
    propertiesBoardName.value = getBoardItemName(referenceBoard, "");
    propertiesBoardBorderColor.disabled = !styleableBoards.length;
    propertiesBoardBorderThickness.disabled = !styleableBoards.length;
    propertiesBoardBorderColor.value = normalizeHexColor(referenceBoard.borderColor || "#1d2733", "#1d2733");
    propertiesBoardBorderThickness.value = String(clamp(Number(referenceBoard.borderThickness ?? (referenceBoard.type === "shape" ? 2 : 1)), 0, 14));
    propertiesBoardBorderThicknessLabel.textContent = `${propertiesBoardBorderThickness.value}px`;
    propertiesBoardSnapGrid.disabled = !editableBoards.length;
    propertiesBoardSnapGrid.checked = editableBoards.length ? editableBoards.every((item) => item.snapToGrid === true) : false;
    propertiesTableControls.classList.toggle("hidden", !(selectedBoards.length === 1 && isTable));
    if (isTable) {
      const table = normalizeTableData(referenceBoard);
      propertiesTableRows.value = String(table.rows);
      propertiesTableCols.value = String(table.cols);
    }
    propertiesBoardColor.disabled = !styleableBoards.length;
    propertiesBoardHex.disabled = !styleableBoards.length;
    propertiesBoardText.disabled = !editableBoards.length;
    propertiesFontFamily.disabled = !editableBoards.length;
    propertiesFontSize.disabled = !editableBoards.length;
    propertiesTextColor.disabled = !editableBoards.length;
    propertiesBold.disabled = !editableBoards.length;
    propertiesItalic.disabled = !editableBoards.length;
    propertiesUnderline.disabled = !editableBoards.length;
    propertiesBoardText.value = referenceBoard.text || htmlToPlainText(referenceBoard.html || "");
    const textStyle = getItemTextStyle(referenceBoard);
    propertiesFontFamily.value = textStyle.fontFamily;
    propertiesFontSize.value = String(textStyle.fontSize);
    propertiesTextColor.value = normalizeHexColor(textStyle.color || "#1d2733", "#1d2733");
    propertiesBold.classList.toggle("active", textStyle.bold);
    propertiesItalic.classList.toggle("active", textStyle.italic);
    propertiesUnderline.classList.toggle("active", textStyle.underline);
    renderSelectedBoardLinkedTasks(project, selectedBoards.length === 1 ? referenceBoard : null);
  }

  if (selectedLine || editingDrawingTool) {
    const selectedLineCount = selectedConnectionIds.size + selectedDrawingIds.size;
    propertiesTitle.textContent = selectedLineCount > 1
      ? `${selectedLineCount} selected lines`
      : selectedConnection ? "Connection" : "Drawing";
    const color = selectedLine
      ? normalizeHexColor(selectedLine.color || DEFAULT_CONNECTION_COLOR)
      : getCreationColor(DEFAULT_CONNECTION_COLOR);
    const thickness = selectedLine
      ? selectedLine.thickness || (selectedDrawing ? DEFAULT_DRAWING_THICKNESS : DEFAULT_CONNECTION_THICKNESS)
      : drawingToolThickness;
    const maxThickness = selectedConnection ? "14" : "24";
    connectionThickness.max = maxThickness;
    propertiesLineThickness.max = maxThickness;
    connectionColor.value = color;
    connectionThickness.value = String(thickness);
    connectionThicknessLabel.textContent = `${thickness}px`;
    propertiesLineColor.value = color;
    propertiesLineThickness.value = String(thickness);
    propertiesLineThicknessLabel.textContent = `${thickness}px`;
    const isConnection = Boolean(selectedConnection);
    const borderColor = selectedConnection ? normalizeHexColor(selectedConnection.borderColor || "#ffffff", "#ffffff") : "#ffffff";
    const borderThickness = selectedConnection ? clamp(Number(selectedConnection.borderThickness ?? 2) || 0, 0, 10) : 0;
    propertiesLineBorderColorRow.classList.toggle("hidden", !isConnection);
    propertiesLineBorderThicknessRow.classList.toggle("hidden", !isConnection);
    propertiesLineBorderThicknessLabel.classList.toggle("hidden", !isConnection);
    propertiesLineBorderColor.value = borderColor;
    propertiesLineBorderThickness.value = String(borderThickness);
    propertiesLineBorderThicknessLabel.textContent = `${borderThickness}px`;
    connectionSnapRow.classList.toggle("hidden", !isConnection);
    propertiesLineSnapRow.classList.toggle("hidden", !isConnection);
    connectionSnapGrid.checked = isConnection && selectedConnection.snapToGrid === true;
    propertiesLineSnapGrid.checked = isConnection && selectedConnection.snapToGrid === true;
  }
}

function isLevelPreviewItem(item) {
  return item?.type === "image" && Boolean(
    item.levelWorkspaceId ||
    item.boardRole === "level-preview" ||
    item.levelPreviewTitle ||
    /\blevel board$/i.test(String(item.name || item.text || "").trim())
  );
}

function snapBoardValueToGrid(value, max) {
  const gridSize = typeof BOARD_GRID_SIZE === "number" && Number.isFinite(BOARD_GRID_SIZE) && BOARD_GRID_SIZE > 0 ? BOARD_GRID_SIZE : 28;
  return Math.round(clamp(Math.round(value / gridSize) * gridSize, 0, max));
}

function snapBoardItemToGrid(item) {
  if (!item) return;
  item.x = snapBoardValueToGrid(Number(item.x) || 0, 6400 - (item.width || 210));
  item.y = snapBoardValueToGrid(Number(item.y) || 0, 4200 - (item.height || 140));
}

function updateSelectedBoardSnapToGrid(enabled) {
  const project = getActiveProject();
  const items = getSelectedBoardItems(project).filter((item) => item.type !== "image");
  if (!project || !items.length) return;

  const commands = [];
  items.forEach((item) => {
    const before = structuredClone(item);
    item.snapToGrid = Boolean(enabled);
    if (item.snapToGrid) snapBoardItemToGrid(item);
    commands.push(createHistoryCommand("updateItem", item.id, before, item, { projectId: project.id }));
  });

  render();
  renderSelectionClasses();
  renderConnections(project);
  renderPropertiesPanel();
  saveState({
    historyEntry: createBatchHistoryCommand("updateBoardSnapToGrid", commands, {
      targetId: items.map((item) => item.id).join(","),
      groupKey: `items:${items.map((item) => item.id).sort().join(",")}:snapToGrid`
    })
  });
}

function updateSelectedTableSize(size) {
  const project = getActiveProject();
  const item = getSelectedBoardItems(project).find((candidate) => candidate.type === "table");
  if (!project || !item) return;
  const before = structuredClone(item);
  const table = normalizeTableData(item);
  const nextRows = clamp(Number(size.rows ?? table.rows) || table.rows, 1, 12);
  const nextCols = clamp(Number(size.cols ?? table.cols) || table.cols, 1, 12);
  if (nextRows === table.rows && nextCols === table.cols) return;

  const previousCells = table.cells.map((cell) => ({ ...cell }));
  const nextCells = [];
  for (let row = 0; row < nextRows; row += 1) {
    for (let col = 0; col < nextCols; col += 1) {
      nextCells.push(previousCells[row * table.cols + col] || { text: "" });
    }
  }
  item.table = {
    rows: nextRows,
    cols: nextCols,
    cells: nextCells
  };

  const node = boardContent.querySelector(`[data-id="${item.id}"]`);
  if (node) {
    node.querySelector(".board-table")?.remove();
    node.prepend(createTableNode(item));
  }
  propertiesTableRows.value = String(nextRows);
  propertiesTableCols.value = String(nextCols);
  saveState({
    historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
      projectId: project.id,
      groupKey: `item:${item.id}:table-size`
    })
  });
}

function renderSelectedBoardLinkedTasks(project, boardItem) {
  if (!propertiesLinkedTasks || !propertiesLinkedTaskList) return;
  propertiesLinkedTaskList.innerHTML = "";
  propertiesLinkedTasks.classList.toggle("hidden", !boardItem);
  if (!project || !boardItem) return;

  const linkedTasks = (project.tasks || []).filter((task) => task.linkedItemId === boardItem.id);
  if (!linkedTasks.length) {
    const empty = document.createElement("p");
    empty.className = "properties-linked-empty";
    empty.textContent = "No linked tasks yet.";
    propertiesLinkedTaskList.append(empty);
    return;
  }

  linkedTasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "properties-linked-task-row";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "properties-linked-task-open";
    copy.textContent = task.title || "Untitled task";
    copy.addEventListener("click", () => openTaskIssueDialog(task.id));
    const go = document.createElement("button");
    go.type = "button";
    go.className = "properties-linked-task-go";
    go.textContent = "Show link";
    go.addEventListener("click", () => {
      openSidePanelFromBoardContext("tasks");
      taskSearch.value = "";
      renderTasks();
      showTaskBoardLink(task.id, boardItem.id);
    });
    row.append(copy, go);
    propertiesLinkedTaskList.append(row);
  });
}

function updateSelectedBoardName(value) {
  const project = getActiveProject();
  const items = getSelectedBoardItems(project).filter((item) => item.type !== "image");
  const name = cleanUserText(value, 80, "New board");
  if (!project || !items.length) return;
  const commands = [];
  items.forEach((item) => {
    const before = structuredClone(item);
    const previousName = getBoardItemName(item, "New board");
    item.name = name;
    if (!item.text || item.text === previousName || item.text === "New board") {
      item.text = name;
      item.html = escapeHtml(name);
      const itemNode = boardContent.querySelector(`[data-id="${item.id}"]`);
      const textNode = itemNode?.querySelector(".item-text");
      if (textNode && textNode !== document.activeElement) textNode.textContent = name;
    }
    commands.push(createHistoryCommand("updateItem", item.id, before, item, { projectId: project.id }));
  });
  saveState({
    historyEntry: createBatchHistoryCommand("renameBoards", commands, {
      targetId: items.map((item) => item.id).join(","),
      groupKey: `items:${items.map((item) => item.id).sort().join(",")}:name`
    })
  });
  renderTasks();
}

function getSelectedBoardItem(project = getActiveProject()) {
  if (!project) return null;
  const selectedId = selectedBoardItemId || [...selectedItemIds][0];
  return project.items.find((item) => item.id === selectedId) || null;
}

function getSelectedBoardItems(project = getActiveProject()) {
  if (!project) return [];
  const ids = new Set(selectedItemIds);
  if (!ids.size && selectedBoardItemId) ids.add(selectedBoardItemId);
  return project.items.filter((item) => ids.has(item.id));
}

function updateSelectedBoardColor(value) {
  if (!isValidHex(value)) return;
  const project = getActiveProject();
  const items = getSelectedBoardItems(project).filter((item) => item.type !== "image" || isLevelPreviewItem(item));
  if (!project || !items.length) return;
  const commands = [];
  items.forEach((item) => {
    const before = structuredClone(item);
    item.color = value;
    const node = boardContent.querySelector(`[data-id="${item.id}"]`);
    if (node) applyItemColorToNode(item, node);
    commands.push(createHistoryCommand("updateItem", item.id, before, item, { projectId: project.id }));
  });
  propertiesBoardColor.value = value;
  propertiesBoardHex.value = value;
  saveState({
    historyEntry: createBatchHistoryCommand("updateItemSelection", commands, {
      targetId: items.map((item) => item.id).join(","),
      groupKey: `items:${items.map((item) => item.id).sort().join(",")}:color`
    })
  });
}

function applyItemColorToNode(item, node) {
  if (item.type === "shape") {
    node.querySelector(".shape-visual")?.style.setProperty("--shape-color", item.color || ticketColors[0]);
    node.style.background = "transparent";
    return;
  }
  if (item.type === "table") {
    node.style.setProperty("--table-fill-color", item.color || "#ffffff");
    node.style.background = "transparent";
    return;
  }
  node.style.background = item.color || ticketColors[0];
}

function applyItemBorderToNode(item, node) {
  const color = normalizeHexColor(item.borderColor || "#1d2733", "#1d2733");
  const thickness = clamp(Number(item.borderThickness ?? (item.type === "shape" ? 2 : 1)), 0, 14);
  node.style.setProperty("--item-border-color", color);
  node.style.setProperty("--item-border-thickness", `${thickness}px`);
  if (item.type === "shape") {
    const shape = node.querySelector(".shape-visual");
    if (shape) {
      shape.style.borderColor = "";
      shape.style.borderWidth = "";
    }
    return;
  }
  node.style.borderColor = "transparent";
  node.style.borderWidth = "0";
}

function updateSelectedBoardBorder(style) {
  const project = getActiveProject();
  const items = getSelectedBoardItems(project).filter((item) => item.type !== "image" || isLevelPreviewItem(item));
  if (!project || !items.length) return;
  const commands = [];
  items.forEach((item) => {
    const before = structuredClone(item);
    if (style.borderColor) item.borderColor = normalizeHexColor(style.borderColor, "#1d2733");
    if (Object.prototype.hasOwnProperty.call(style, "borderThickness")) {
      item.borderThickness = clamp(Number(style.borderThickness) || 0, 0, 14);
    }
    const node = boardContent.querySelector(`[data-id="${item.id}"]`);
    if (node) applyItemBorderToNode(item, node);
    commands.push(createHistoryCommand("updateItem", item.id, before, item, { projectId: project.id }));
  });
  const reference = items[0];
  propertiesBoardBorderColor.value = normalizeHexColor(reference.borderColor || "#1d2733", "#1d2733");
  propertiesBoardBorderThickness.value = String(clamp(Number(reference.borderThickness ?? 1), 0, 14));
  propertiesBoardBorderThicknessLabel.textContent = `${propertiesBoardBorderThickness.value}px`;
  saveState({
    historyEntry: createBatchHistoryCommand("updateItemSelection", commands, {
      targetId: items.map((item) => item.id).join(","),
      groupKey: `items:${items.map((item) => item.id).sort().join(",")}:border:${Object.keys(style).sort().join(",")}`
    })
  });
}

function getItemTextStyle(item) {
  item.textStyle = {
    fontFamily: "Inter",
    fontSize: 16,
    color: "#1d2733",
    bold: false,
    italic: false,
    underline: false,
    ...(item.textStyle || {})
  };
  item.textStyle.fontSize = clamp(Number(item.textStyle.fontSize) || 16, 10, 72);
  item.textStyle.color = normalizeHexColor(item.textStyle.color || "#1d2733", "#1d2733");
  return item.textStyle;
}

function updateSelectedBoardTextStyle(style) {
  const project = getActiveProject();
  const items = getSelectedBoardItems(project).filter((item) => item.type !== "image");
  if (!project || !items.length) return;
  const commands = [];
  items.forEach((item) => {
    const before = structuredClone(item);
    const textStyle = getItemTextStyle(item);
    Object.assign(textStyle, style);
    textStyle.fontSize = clamp(Number(textStyle.fontSize) || 16, 10, 72);
    if (style.color) textStyle.color = normalizeHexColor(style.color, "#1d2733");
    const itemNode = boardContent.querySelector(`[data-id="${item.id}"]`);
    const textNode = itemNode?.querySelector(".item-text");
    if (textNode) {
      applyTextStyleToNode(textNode, textStyle);
      ensureItemFitsText(item, itemNode);
      fitItemText(textNode, item);
    }
    commands.push(createHistoryCommand("updateItem", item.id, before, item, { projectId: project.id }));
  });
  renderPropertiesPanel();
  saveState({
    historyEntry: createBatchHistoryCommand("updateItemSelection", commands, {
      targetId: items.map((item) => item.id).join(","),
      groupKey: `items:${items.map((item) => item.id).sort().join(",")}:text-style:${Object.keys(style).sort().join(",")}`
    })
  });
}

function toggleSelectedBoardTextStyle(key) {
  const item = getSelectedBoardItems().find((candidate) => candidate.type !== "image");
  if (!item) return;
  const textStyle = getItemTextStyle(item);
  updateSelectedBoardTextStyle({ [key]: !textStyle[key] });
}

function applyTextStyleToNode(node, textStyle) {
  node.style.fontFamily = textStyle.fontFamily;
  node.style.fontSize = `${textStyle.fontSize}px`;
  node.style.fontWeight = textStyle.bold ? "900" : "";
  node.style.fontStyle = textStyle.italic ? "italic" : "";
  node.style.textDecoration = textStyle.underline ? "underline" : "";
  node.style.color = textStyle.color || "#1d2733";
}

function fitItemText(node, item) {
  if (!node || item.type === "image") return;
  const textStyle = getItemTextStyle(item);
  const baseSize = clamp(Number(textStyle.fontSize) || 16, 10, 72);
  node.style.fontSize = `${baseSize}px`;
}

function measureBoardText(node, item, width, height) {
  if (!node || item.type === "image") return { width: 0, height: 0, availableWidth: 0, availableHeight: 0 };
  const factors = getTextBoxFactors(item);
  const availableWidth = Math.max(24, width * factors.width - 8);
  const availableHeight = Math.max(18, height * factors.height - 8);
  const measure = document.createElement("div");
  const style = getComputedStyle(node);
  measure.style.position = "fixed";
  measure.style.left = "-10000px";
  measure.style.top = "0";
  measure.style.width = `${availableWidth}px`;
  measure.style.minHeight = "0";
  measure.style.padding = "0";
  measure.style.border = "0";
  measure.style.visibility = "hidden";
  measure.style.pointerEvents = "none";
  measure.style.boxSizing = "border-box";
  measure.style.fontFamily = style.fontFamily;
  measure.style.fontSize = style.fontSize;
  measure.style.fontWeight = style.fontWeight;
  measure.style.fontStyle = style.fontStyle;
  measure.style.lineHeight = style.lineHeight;
  measure.style.letterSpacing = style.letterSpacing;
  measure.style.textDecoration = style.textDecoration;
  measure.style.textAlign = "center";
  measure.style.whiteSpace = "normal";
  measure.style.overflowWrap = "anywhere";
  measure.style.wordBreak = "break-word";
  measure.innerHTML = node.innerHTML || escapeHtml(item.text || "");
  document.body.append(measure);
  const measured = {
    width: Math.ceil(measure.scrollWidth),
    height: Math.ceil(measure.scrollHeight),
    availableWidth,
    availableHeight
  };
  measure.remove();
  return measured;
}

function getTextBoxFactors(item) {
  if (item.type !== "shape") return { width: 1, height: 1 };
  const box = getShapeTextBox(item.shape || "circle");
  return { width: box.width, height: box.height };
}

function getMinimumItemSize(item, widthHint = item.width) {
  const base = {
    width: item.type === "image" ? 170 : item.type === "table" ? 180 : item.type === "shape" ? 96 : 130,
    height: item.type === "image" ? 160 : item.type === "table" ? 120 : item.type === "shape" ? 86 : 90
  };
  if (item.type === "image" || item.type === "table") return base;

  const plainText = (item.text || htmlToPlainText(item.html || "")).trim();
  if (!plainText) return base;

  const factors = getTextBoxFactors(item);
  const availableTextWidth = Math.max(24, (widthHint || base.width) * factors.width - 6);
  const textStyle = getItemTextStyle(item);
  const fontSize = Math.max(10, Number(textStyle.fontSize) || 16);
  const charsPerLine = Math.max(2, Math.floor(availableTextWidth / (fontSize * 0.58)));
  const hardLines = plainText.split(/\n/);
  const lineCount = hardLines.reduce((count, line) => {
    return count + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
  const textHeight = Math.ceil(lineCount * fontSize * 1.08 + 6);
  const requiredHeight = Math.ceil(textHeight / factors.height);

  return {
    width: base.width,
    height: Math.min(1200, Math.max(base.height, requiredHeight))
  };
}

function ensureItemFitsText(item, node) {
  const minSize = getMinimumItemSize(item, item.width);
  let nextWidth = Math.max(item.width || minSize.width, minSize.width);
  let nextHeight = Math.max(item.height || minSize.height, minSize.height);
  const textNode = node?.querySelector?.(".item-text");
  if (node && textNode && item.type !== "image") {
    if (nextWidth !== item.width) node.style.width = `${nextWidth}px`;
    if (nextHeight !== item.height) node.style.height = `${nextHeight}px`;
    fitItemText(textNode, item);
    const factors = getTextBoxFactors(item);
    for (let attempts = 0; attempts < 8; attempts += 1) {
      const measured = measureBoardText(textNode, item, nextWidth, nextHeight);
      const widthOverflow = Math.max(0, measured.width - measured.availableWidth);
      const heightOverflow = Math.max(0, measured.height - measured.availableHeight);
      if (widthOverflow <= 1 && heightOverflow <= 1) break;
      nextWidth = Math.min(2200, Math.ceil(nextWidth + widthOverflow / Math.max(0.2, factors.width) + 24));
      nextHeight = Math.min(2200, Math.ceil(nextHeight + heightOverflow / Math.max(0.2, factors.height) + 24));
      node.style.width = `${nextWidth}px`;
      node.style.height = `${nextHeight}px`;
      fitItemText(textNode, item);
    }
  }
  if (nextWidth === item.width && nextHeight === item.height) return false;
  item.width = nextWidth;
  item.height = nextHeight;
  if (node) {
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
  }
  return true;
}

function updateSelectedBoardText(value) {
  const project = getActiveProject();
  const items = getSelectedBoardItems(project).filter((item) => item.type !== "image");
  if (!project || !items.length) return;
  const commands = [];
  items.forEach((item) => {
    const before = structuredClone(item);
    item.text = value;
    item.html = escapeHtml(value).replace(/\n/g, "<br>");
    const itemNode = boardContent.querySelector(`[data-id="${item.id}"]`);
    const textNode = itemNode?.querySelector(".item-text");
    if (textNode && textNode !== document.activeElement) {
      textNode.innerHTML = item.html;
      ensureItemFitsText(item, itemNode);
      fitItemText(textNode, item);
    } else {
      ensureItemFitsText(item, itemNode);
    }
    commands.push(createHistoryCommand("updateItem", item.id, before, item, { projectId: project.id }));
  });
  saveState({
    historyEntry: createBatchHistoryCommand("updateItemSelection", commands, {
      targetId: items.map((item) => item.id).join(","),
      groupKey: `items:${items.map((item) => item.id).sort().join(",")}:text`
    })
  });
}

function htmlToPlainText(html) {
  const template = document.createElement("template");
  template.innerHTML = html.replace(/<br\s*\/?>/gi, "\n");
  return template.content.textContent || "";
}

function updateSelectedConnections(style) {
  const project = getActiveProject();
  const hasLineSelection = Boolean(selectedConnectionIds.size || selectedDrawingIds.size);
  if (drawMode && !hasLineSelection) {
    updateDrawingToolSettings(style);
    return;
  }
  if (!project || !hasLineSelection) return;

  const commands = [];
  project.connections.forEach((connection) => {
    if (!selectedConnectionIds.has(connection.id)) return;
    const before = structuredClone(connection);
    if (style.color) connection.color = style.color;
    if (style.thickness) connection.thickness = clamp(style.thickness, 1, 14);
    if (style.borderColor) connection.borderColor = normalizeHexColor(style.borderColor, "#ffffff");
    if (Object.prototype.hasOwnProperty.call(style, "borderThickness")) {
      connection.borderThickness = clamp(Number(style.borderThickness) || 0, 0, 10);
    }
    if (Object.prototype.hasOwnProperty.call(style, "snapToGrid")) {
      connection.snapToGrid = Boolean(style.snapToGrid);
      if (connection.snapToGrid && typeof snapConnectionToGrid === "function") {
        snapConnectionToGrid(connection, project);
      }
    }
    commands.push(createHistoryCommand("updateConnection", connection.id, before, connection, { projectId: project.id }));
  });

  (project.drawings || []).forEach((drawing) => {
    if (!selectedDrawingIds.has(drawing.id)) return;
    const before = structuredClone(drawing);
    if (style.color) drawing.color = style.color;
    if (style.thickness) drawing.thickness = clamp(style.thickness, 1, 24);
    commands.push(createHistoryCommand("updateDrawing", drawing.id, before, drawing, { projectId: project.id }));
  });

  const selectedConnection = project.connections.find((connection) => selectedConnectionIds.has(connection.id));
  const selectedDrawing = project.drawings?.find((drawing) => selectedDrawingIds.has(drawing.id));
  const thickness = selectedConnection?.thickness || selectedDrawing?.thickness || DEFAULT_CONNECTION_THICKNESS;
  connectionThicknessLabel.textContent = `${thickness}px`;
  propertiesLineThicknessLabel.textContent = `${thickness}px`;
  if (selectedConnection) {
    const borderThickness = clamp(Number(selectedConnection.borderThickness ?? 2) || 0, 0, 10);
    propertiesLineBorderThicknessLabel.textContent = `${borderThickness}px`;
  }
  connectionsLayer.innerHTML = "";
  renderDrawings(project);
  renderConnections(project);
  renderPropertiesPanel();
  saveState({
    historyEntry: createBatchHistoryCommand("updateLineSelection", commands, {
      targetId: [...selectedConnectionIds, ...selectedDrawingIds].join(","),
      groupKey: `line:${[...selectedConnectionIds, ...selectedDrawingIds].sort().join(",")}:${Object.keys(style).sort().join(",")}`
    })
  });
}

function updateDrawingToolSettings(style) {
  if (style.color) {
    createColor.value = normalizeHexColor(style.color, DEFAULT_CONNECTION_COLOR);
  }
  if (style.thickness) {
    drawingToolThickness = clamp(Number(style.thickness) || DEFAULT_DRAWING_THICKNESS, 1, 24);
    localStorage.setItem("flowboard-drawing-thickness", String(drawingToolThickness));
  }
  if (activeDrawing) {
    activeDrawing.color = getCreationColor(DEFAULT_CONNECTION_COLOR);
    activeDrawing.thickness = drawingToolThickness;
    const path = drawingLayer.querySelector(`[data-id="${activeDrawing.id}"]`);
    if (path) {
      path.style.stroke = activeDrawing.color;
      path.style.strokeWidth = activeDrawing.thickness;
    }
  }
  connectionThicknessLabel.textContent = `${drawingToolThickness}px`;
  propertiesLineThicknessLabel.textContent = `${drawingToolThickness}px`;
  renderPropertiesPanel();
}

function toggleBoardTheme() {
  setPersonalTheme(personalTheme === "dark" ? "light" : "dark");
  render();
}

function toggleBoardGrid() {
  state.boardGrid = state.boardGrid === "hidden" ? "visible" : "hidden";
  saveAndRender();
}

function normalizeTableData(item) {
  const fallback = typeof createTableItemDefaults === "function" ? createTableItemDefaults(item.tableKind || "table").table : { rows: 3, cols: 3, cells: [] };
  item.table ??= fallback;
  item.table.rows = clamp(Number(item.table.rows) || fallback.rows || 3, 1, 12);
  item.table.cols = clamp(Number(item.table.cols) || fallback.cols || 3, 1, 12);
  const total = item.table.rows * item.table.cols;
  item.table.cells = Array.from({ length: total }, (_, index) => ({
    text: String(item.table.cells?.[index]?.text || "").slice(0, 1000)
  }));
  return item.table;
}

function createTableNode(item) {
  const table = normalizeTableData(item);
  const tableNode = document.createElement("div");
  tableNode.className = `board-table ${item.tableKind === "folder" ? "board-folder" : ""}`;
  tableNode.style.setProperty("--table-rows", String(table.rows));
  tableNode.style.setProperty("--table-cols", String(table.cols));
  table.cells.forEach((cell, index) => {
    const cellNode = document.createElement("div");
    cellNode.className = "board-table-cell";
    cellNode.contentEditable = "false";
    cellNode.dataset.placeholder = "Text";
    cellNode.textContent = cell.text || "";
    cellNode.addEventListener("pointerdown", (event) => {
      if (cellNode.contentEditable !== "true") return;
      selectedBoardItemId = item.id;
      if (!selectedItemIds.has(item.id)) selectedItemIds = new Set([item.id]);
      selectedConnectionIds.clear();
      selectedDrawingIds.clear();
      renderSelectionClasses();
      renderPropertiesPanel();
      event.stopPropagation();
    });
    cellNode.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedBoardItemId = item.id;
      selectedItemIds = new Set([item.id]);
      selectedConnectionIds.clear();
      selectedDrawingIds.clear();
      renderSelectionClasses();
      renderPropertiesPanel();
      cellNode.contentEditable = "true";
      cellNode.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(cellNode);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    cellNode.addEventListener("input", () => {
      const before = structuredClone(item);
      normalizeTableData(item);
      item.table.cells[index].text = cleanUserText(cellNode.textContent, 1000, "");
      saveState({
        historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
          projectId: state.activeProjectId,
          groupKey: `item:${item.id}:table:${index}`
        })
      });
    });
    cellNode.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cellNode.blur();
      }
    });
    cellNode.addEventListener("blur", () => {
      cellNode.contentEditable = "false";
    });
    tableNode.append(cellNode);
  });
  return tableNode;
}

function renderDrawings(project) {
  drawingLayer.innerHTML = "";
  if (!project) return;
  (project.drawings || []).forEach((drawing) => {
    const path = createDrawingPath(drawing);
    if (path) drawingLayer.append(path);
  });
}

function createDrawingPath(drawing) {
  if (!drawing.points?.length) return null;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.dataset.id = drawing.id;
  path.setAttribute("class", `drawing-stroke ${selectedDrawingIds.has(drawing.id) ? "selected-drawing" : ""}`);
  path.setAttribute("d", drawingPointsToPath(drawing.points));
  path.style.stroke = drawing.color || DEFAULT_CONNECTION_COLOR;
  path.style.strokeWidth = drawing.thickness || 4;
  path.addEventListener("pointerdown", (event) => handleDrawingSelection(event, drawing.id));
  return path;
}

function drawingPointsToPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.01} ${points[0].y + 0.01}`;
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${Math.round(point.x)} ${Math.round(point.y)}`).join(" ");
}
