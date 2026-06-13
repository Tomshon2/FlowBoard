function render() {
  renderBoardTheme();
  renderProjects();
  renderWorkspace();
  renderRemoteCursors();
  renderTasks();
  renderHours();
  renderStory();
  renderTeamRoles();
  renderZoom();
  renderPropertiesPanel();
  syncDrawerButtons();
}

function renderBoardTheme() {
  board.classList.toggle("board-dark", state.boardTheme === "dark");
  boardThemeBtn.textContent = state.boardTheme === "dark" ? "Light background" : "Dark background";
}

function renderConnectionStylePanel() {
  connectionStylePanel.classList.add("hidden");
  renderPropertiesPanel();
}

function renderPropertiesPanel() {
  const project = getActiveProject();
  const selectedBoard = getSelectedBoardItem(project);
  const selectedConnection = project?.connections.find((connection) => selectedConnectionIds.has(connection.id));
  const selectedDrawing = project?.drawings?.find((drawing) => selectedDrawingIds.has(drawing.id));
  const selectedLine = selectedConnection || selectedDrawing;
  const editingDrawingTool = drawMode && !selectedBoard && !selectedLine;
  const hasSelection = Boolean(selectedBoard || selectedLine || editingDrawingTool);
  propertiesPanel.classList.toggle("hidden", !hasSelection);
  propertiesPanel.setAttribute("aria-hidden", String(!hasSelection));
  boardProperties.classList.toggle("hidden", !selectedBoard);
  lineProperties.classList.toggle("hidden", !(selectedLine || editingDrawingTool));
  if (!hasSelection) return;

  if (selectedBoard) {
    const isShape = selectedBoard.type === "shape";
    propertiesTitle.textContent = isShape ? getShapeLabel(selectedBoard.shape) : selectedBoard.type === "image" ? "Image" : "Board";
    const color = normalizeHexColor(selectedBoard.color || ticketColors[0]);
    propertiesBoardColor.value = color;
    propertiesBoardHex.value = color;
    propertiesBoardColor.disabled = selectedBoard.type === "image";
    propertiesBoardHex.disabled = selectedBoard.type === "image";
    propertiesBoardText.value = selectedBoard.text || htmlToPlainText(selectedBoard.html || "");
    const textStyle = getItemTextStyle(selectedBoard);
    propertiesFontFamily.value = textStyle.fontFamily;
    propertiesFontSize.value = String(textStyle.fontSize);
    propertiesTextColor.value = normalizeHexColor(textStyle.color || "#1d2733", "#1d2733");
    propertiesBold.classList.toggle("active", textStyle.bold);
    propertiesItalic.classList.toggle("active", textStyle.italic);
    propertiesUnderline.classList.toggle("active", textStyle.underline);
  }

  if (selectedLine || editingDrawingTool) {
    propertiesTitle.textContent = selectedConnection ? "Connection" : "Drawing";
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
  }
}

function getSelectedBoardItem(project = getActiveProject()) {
  if (!project) return null;
  const selectedId = selectedBoardItemId || [...selectedItemIds][0];
  return project.items.find((item) => item.id === selectedId) || null;
}

function updateSelectedBoardColor(value) {
  if (!isValidHex(value)) return;
  const item = getSelectedBoardItem();
  if (!item || item.type === "image") return;
  const before = structuredClone(item);
  item.color = value;
  propertiesBoardColor.value = value;
  propertiesBoardHex.value = value;
  const node = boardContent.querySelector(`[data-id="${item.id}"]`);
  if (node) applyItemColorToNode(item, node);
  saveState({
    historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
      projectId: state.activeProjectId,
      groupKey: `item:${item.id}:color`
    })
  });
}

function applyItemColorToNode(item, node) {
  if (item.type === "shape") {
    node.querySelector(".shape-visual")?.style.setProperty("--shape-color", item.color || ticketColors[0]);
    node.style.background = "transparent";
    return;
  }
  node.style.background = item.color || ticketColors[0];
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
  const item = getSelectedBoardItem();
  if (!item) return;
  const before = structuredClone(item);
  const textStyle = getItemTextStyle(item);
  Object.assign(textStyle, style);
  textStyle.fontSize = clamp(Number(textStyle.fontSize) || 16, 10, 72);
  const itemNode = boardContent.querySelector(`[data-id="${item.id}"]`);
  const textNode = itemNode?.querySelector(".item-text");
  if (textNode) {
    applyTextStyleToNode(textNode, textStyle);
    ensureItemFitsText(item, itemNode);
    fitItemText(textNode, item);
  }
  renderPropertiesPanel();
  saveState({
    historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
      projectId: state.activeProjectId,
      groupKey: `item:${item.id}:text-style`
    })
  });
}

function toggleSelectedBoardTextStyle(key) {
  const item = getSelectedBoardItem();
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
  node.style.fontSize = `${textStyle.fontSize}px`;
}

function getTextBoxFactors(item) {
  if (item.type !== "shape") return { width: 1, height: 1 };
  const shape = item.shape || "circle";
  if (shape === "triangle") return { width: 0.56, height: 0.42 };
  if (shape === "hexagon") return { width: 0.72, height: 0.56 };
  return { width: 0.88, height: 0.86 };
}

function getMinimumItemSize(item, widthHint = item.width) {
  const base = {
    width: item.type === "image" ? 170 : item.type === "shape" ? 96 : 130,
    height: item.type === "image" ? 160 : item.type === "shape" ? 86 : 90
  };
  if (item.type === "image") return base;

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
  const nextWidth = Math.max(item.width || minSize.width, minSize.width);
  const nextHeight = Math.max(item.height || minSize.height, minSize.height);
  if (nextWidth === item.width && nextHeight === item.height) return;
  item.width = nextWidth;
  item.height = nextHeight;
  if (node) {
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
  }
}

function updateSelectedBoardText(value) {
  const item = getSelectedBoardItem();
  if (!item) return;
  const before = structuredClone(item);
  item.text = value;
  item.html = escapeHtml(value).replace(/\n/g, "<br>");
  const itemNode = boardContent.querySelector(`[data-id="${item.id}"]`);
  const textNode = itemNode?.querySelector(".item-text");
  ensureItemFitsText(item, itemNode);
  if (textNode && textNode !== document.activeElement) {
    textNode.innerHTML = item.html;
    fitItemText(textNode, item);
  }
  saveState({
    historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
      projectId: state.activeProjectId,
      groupKey: `item:${item.id}:text`
    })
  });
}

function htmlToPlainText(html) {
  const template = document.createElement("template");
  template.innerHTML = html.replace(/<br\s*\/?>/gi, "\n");
  return template.content.textContent || "";
}

function getShapeLabel(shape) {
  return {
    circle: "Circle",
    triangle: "Triangle",
    hexagon: "Hexagon"
  }[shape] || "Shape";
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
  state.boardTheme = state.boardTheme === "dark" ? "light" : "dark";
  saveAndRender();
}

function renderProjects() {
  projectsList.innerHTML = "";
  state.projects.forEach((project) => {
    const row = document.createElement("div");
    row.className = `project-item ${project.id === state.activeProjectId ? "active" : ""}`;

    let selectButton;
    if (renamingProjectId === project.id) {
      selectButton = document.createElement("form");
      selectButton.className = "project-rename-form";
      selectButton.innerHTML = `<input class="project-rename-input" value="${escapeHtml(project.name)}" />`;
      const input = selectButton.querySelector("input");
      selectButton.addEventListener("submit", (event) => {
        event.preventDefault();
        finishRenameProject(project.id, input.value);
      });
      input.addEventListener("blur", () => finishRenameProject(project.id, input.value));
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    } else {
      selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "project-select";
      selectButton.innerHTML = `<span>${escapeHtml(project.name)}</span><strong>${project.tasks.length}</strong>`;
      selectButton.addEventListener("click", () => {
        switchActiveProject(project.id);
      });
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-project";
    deleteButton.title = "Delete project";
    deleteButton.textContent = "x";
    deleteButton.addEventListener("click", () => deleteProject(project.id));

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "rename-project";
    renameButton.title = "Rename project";
    renameButton.textContent = "rename";
    renameButton.addEventListener("click", (event) => {
      event.stopPropagation();
      renameProject(project.id);
    });

    row.append(selectButton, renameButton, deleteButton);
    projectsList.append(row);
  });
}

function switchActiveProject(projectId) {
  if (state.activeProjectId === projectId) return;
  persistActiveProjectPanelValues();
  persistAllVisibleItemSizes();
  state.activeProjectId = projectId;
  selectedItemIds.clear();
  selectedConnectionIds.clear();
  selectedDrawingIds.clear();
  selectedBoardItemId = null;
  clearConnectionDragUi();
  projectHours.value = getActiveProject()?.totalHours ?? 0;
  taskTitle.value = "";
  saveAndRender();
}

function renderWorkspace() {
  const project = getActiveProject();
  activeProjectTitle.textContent = project?.name || "No project";
  boardContent.querySelectorAll(".board-item").forEach((item) => item.remove());
  drawingLayer.innerHTML = "";
  connectionsLayer.innerHTML = "";
  if (!project) return;

  project.items.forEach((item) => ensureItemFitsText(item));
  renderDrawings(project);
  renderConnections(project);

  project.items.forEach((item) => {
    const boardLike = item.type === "ticket" || item.type === "shape";
    const showInlineBoardTools = false;
    ensureItemFitsText(item);
    const node = document.createElement("article");
    node.className = `board-item ${item.type}`;
    node.classList.toggle("caption-open", item.type === "image" && item.captionOpen);
    node.classList.toggle("caption-collapsed", item.type === "image" && !item.captionOpen);
    node.style.left = `${item.x}px`;
    node.style.top = `${item.y}px`;
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
    node.style.background = item.type === "ticket" ? item.color : item.type === "image" ? "#ffffff" : "transparent";
    node.dataset.id = item.id;
    node.classList.toggle("multi-selected", selectedItemIds.has(item.id));
    node.addEventListener("pointerdown", (event) => {
      selectedBoardItemId = item.id;
      if (event.target.closest(".resize-handle, .resize-edge")) return;
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        toggleItemSelection(item.id);
        return;
      }
      if (isBoardDragBlocked(event.target)) {
        if (!selectedItemIds.has(item.id)) selectedItemIds = new Set([item.id]);
        selectedConnectionIds.clear();
        selectedDrawingIds.clear();
        selectedBoardItemId = item.id;
        renderSelectionClasses();
        renderPropertiesPanel();
        return;
      }
      if (event.detail > 1) {
        selectedItemIds = new Set([item.id]);
        selectedConnectionIds.clear();
        selectedDrawingIds.clear();
        renderSelectionClasses();
        renderPropertiesPanel();
        enterItemTextEdit(event, node, item);
        return;
      }
      if (!selectedItemIds.has(item.id)) selectedItemIds = new Set([item.id]);
      selectedConnectionIds.clear();
      selectedDrawingIds.clear();
      selectedBoardItemId = item.id;
      renderSelectionClasses();
      renderPropertiesPanel();
      startDrag(event, item.id);
    }, true);

    if (showInlineBoardTools) {
      const toolbar = document.createElement("div");
      toolbar.className = "item-toolbar";
      toolbar.innerHTML = item.type === "image" ? "" : `<span class="item-title">${item.type === "shape" ? getShapeLabel(item.shape) : "Board"}</span>`;

      const actions = document.createElement("div");
      actions.className = "ticket-actions";
      if (boardLike) {
      const colorToggle = document.createElement("button");
      colorToggle.type = "button";
      colorToggle.className = "color-toggle";
      colorToggle.title = "Open colors";
      colorToggle.textContent = "Colors";
      colorToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
      colorToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        node.classList.toggle("colors-open");
      });
      actions.append(colorToggle);

      const textToggle = document.createElement("button");
      textToggle.type = "button";
      textToggle.className = "format-toggle";
      textToggle.title = "Open styles";
      textToggle.textContent = "Text";
      textToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
      textToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        node.classList.toggle("format-open");
      });
      actions.append(textToggle);
    }

      toolbar.append(actions);
      node.append(toolbar);
    }

    if (showInlineBoardTools && boardLike) {
      const formatPanel = document.createElement("div");
      formatPanel.className = "format-panel";
      ["B", "I", "U", "S"].forEach((command) => {
        const styleButton = document.createElement("button");
        styleButton.type = "button";
        styleButton.className = "text-style-button";
        styleButton.title = getStyleTitle(command);
        styleButton.innerHTML = command;
        styleButton.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        styleButton.addEventListener("click", (event) => {
          event.stopPropagation();
          applyTextStyle(command);
        });
        formatPanel.append(styleButton);
      });
      const smallerButton = createFormatButton("A-", "Diminuir letra", () => applyFontSize(-2));
      const biggerButton = createFormatButton("A+", "Aumentar letra", () => applyFontSize(2));
      const fontSelect = document.createElement("select");
      fontSelect.className = "font-select";
      fontSelect.title = "Tipo de letra";
      ["Inter", "Arial", "Georgia", "Verdana", "Courier New", "Trebuchet MS"].forEach((font) => {
        const option = document.createElement("option");
        option.value = font;
        option.textContent = font;
        fontSelect.append(option);
      });
      fontSelect.addEventListener("pointerdown", (event) => event.stopPropagation());
      fontSelect.addEventListener("change", (event) => applyFontFamily(event.target.value));
      formatPanel.append(smallerButton, biggerButton, fontSelect);
      node.append(formatPanel);

      const palette = document.createElement("div");
      palette.className = "color-panel";
      ticketColors.forEach((color) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "color-swatch";
        swatch.title = "Change color";
        swatch.style.background = color;
        swatch.addEventListener("pointerdown", (event) => event.stopPropagation());
        swatch.addEventListener("click", (event) => {
          event.stopPropagation();
          const before = structuredClone(item);
          item.color = color;
          saveState({
            historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
              projectId: state.activeProjectId,
              groupKey: `item:${item.id}:color`
            }),
            forceStep: true
          });
          render();
        });
        palette.append(swatch);
      });

      const colorPicker = document.createElement("input");
      colorPicker.type = "color";
      colorPicker.className = "color-picker";
      colorPicker.title = "Choose color";
      colorPicker.value = normalizeHexColor(item.color);
      colorPicker.addEventListener("pointerdown", (event) => event.stopPropagation());
      colorPicker.addEventListener("click", (event) => event.stopPropagation());
      colorPicker.addEventListener("input", (event) => {
        const before = structuredClone(item);
        item.color = event.target.value;
        applyItemColorToNode(item, node);
        hexInput.value = item.color;
        renderPropertiesPanel();
        saveState({
          historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
            projectId: state.activeProjectId,
            groupKey: `item:${item.id}:color`
          })
        });
      });

      const hexInput = document.createElement("input");
      hexInput.type = "text";
      hexInput.className = "hex-input";
      hexInput.value = normalizeHexColor(item.color);
      hexInput.maxLength = 7;
      hexInput.title = "HEX code";
      hexInput.addEventListener("pointerdown", (event) => event.stopPropagation());
      hexInput.addEventListener("click", (event) => event.stopPropagation());
      hexInput.addEventListener("input", (event) => {
        const value = normalizeHexInput(event.target.value);
        if (!isValidHex(value)) return;
        const before = structuredClone(item);
        item.color = value;
        applyItemColorToNode(item, node);
        colorPicker.value = item.color;
        event.target.value = item.color;
        renderPropertiesPanel();
        saveState({
          historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
            projectId: state.activeProjectId,
            groupKey: `item:${item.id}:color`
          })
        });
      });
      palette.append(colorPicker, hexInput);
      node.append(palette);
    }

    if (item.type === "image") {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.text || "Imported image";
      img.draggable = false;
      node.append(img);

      const captionToggle = document.createElement("button");
      captionToggle.type = "button";
      captionToggle.className = "image-caption-toggle";
      captionToggle.title = item.captionOpen ? "Hide text" : "Show text";
      captionToggle.setAttribute("aria-label", captionToggle.title);
      captionToggle.textContent = item.captionOpen ? "^" : "v";
      captionToggle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      captionToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        selectedBoardItemId = item.id;
        selectedItemIds = new Set([item.id]);
        selectedConnectionIds.clear();
        selectedDrawingIds.clear();
        const before = structuredClone(item);
        item.captionOpen = !item.captionOpen;
        saveState({
          historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
            projectId: state.activeProjectId,
            groupKey: `item:${item.id}:caption`
          }),
          forceStep: true
        });
        render();
      });
      node.append(captionToggle);
    }

    if (item.type === "shape") {
      const shape = document.createElement("div");
      shape.className = `shape-visual shape-${item.shape || "circle"}`;
      shape.style.setProperty("--shape-color", item.color || ticketColors[0]);
      node.append(shape);
    }

    const text = document.createElement("div");
    text.className = `item-text ${item.type === "image" ? "image-caption" : ""} ${item.type === "shape" ? "shape-text" : ""}`;
    text.classList.toggle("caption-hidden", item.type === "image" && !item.captionOpen);
    text.contentEditable = "false";
    text.dataset.placeholder = boardLike ? "Describe the board" : "Write a caption";
    text.innerHTML = boardLike ? (item.html || escapeHtml(item.text || "")) : escapeHtml(item.text || "");
    applyTextStyleToNode(text, getItemTextStyle(item));
    text.addEventListener("pointerdown", (event) => {
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        toggleItemSelection(item.id);
        return;
      }
      selectedBoardItemId = item.id;
      if (!selectedItemIds.has(item.id)) selectedItemIds = new Set([item.id]);
      selectedConnectionIds.clear();
      selectedDrawingIds.clear();
      renderSelectionClasses();
      renderPropertiesPanel();
      event.stopPropagation();
    });
    text.addEventListener("input", () => {
      const before = structuredClone(item);
      item.html = sanitizeEditableHtml(text.innerHTML);
      item.text = text.textContent;
      ensureItemFitsText(item, node);
      fitItemText(text, item);
      renderPropertiesPanel();
      saveState({
        historyEntry: createHistoryCommand("updateItem", item.id, before, item, {
          projectId: state.activeProjectId,
          groupKey: `item:${item.id}:text`
        })
      });
    });
    text.addEventListener("blur", () => exitItemTextEdit(node, text, item));
    text.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        text.blur();
      }
    });
    node.append(text);

    node.append(createResizeHandles(node, item, project));
    node.append(createConnectionDots(item));

    boardContent.append(node);
    window.requestAnimationFrame(() => fitItemText(text, item));
    node.addEventListener("dblclick", (event) => enterItemTextEdit(event, node, item));
    node.addEventListener("dragstart", (event) => event.preventDefault());
  });
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
