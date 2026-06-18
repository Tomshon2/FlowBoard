function renderProjects() {
  projectsList.innerHTML = "";
  const projects = [...state.projects].sort((a, b) => {
    if (Boolean(a.favorite) !== Boolean(b.favorite)) return a.favorite ? -1 : 1;
    return (Number(b.modifiedAt) || 0) - (Number(a.modifiedAt) || 0);
  });
  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "projects-empty-state";
    empty.innerHTML = `
      <strong>No projects yet</strong>
      <span>Create your first board to start working.</span>
    `;
    const createButton = document.createElement("button");
    createButton.type = "button";
    createButton.textContent = "Create project 1";
    createButton.addEventListener("click", () => {
      createProject("Project 1", PROJECT_KIND_GAMEDEV);
      saveAndRender();
    });
    empty.append(createButton);
    projectsList.append(empty);
    return;
  }
  projects.forEach((project) => {
    const row = document.createElement("div");
    row.className = `project-item ${project.id === state.activeProjectId ? "active" : ""}`;

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = `favorite-project ${project.favorite ? "active" : ""}`;
    favoriteButton.title = project.favorite ? "Remove favorite" : "Favorite project";
    favoriteButton.setAttribute("aria-pressed", String(Boolean(project.favorite)));
    favoriteButton.textContent = project.favorite ? "★" : "☆";
    favoriteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleProjectFavorite(project.id);
    });

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
      selectButton.innerHTML = `
        <span class="project-name">${escapeHtml(project.name)}</span>
        <small>${getProjectKind(project) === PROJECT_KIND_GAMEJAM ? "Game Jam" : "Game Dev"} - Modified ${formatProjectModified(project.modifiedAt)}</small>
        <strong>${project.tasks.length}</strong>
      `;
      selectButton.addEventListener("click", () => {
        switchActiveProject(project.id);
      });
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-project";
    deleteButton.title = "Delete project";
    deleteButton.textContent = "x";
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteProject(project.id);
    });

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "rename-project";
    renameButton.title = "Rename project";
    renameButton.textContent = "rename";
    renameButton.addEventListener("click", (event) => {
      event.stopPropagation();
      renameProject(project.id);
    });

    row.append(favoriteButton, selectButton, renameButton, deleteButton);
    projectsList.append(row);
  });
}

function formatProjectModified(value) {
  const stamp = Number(value) || 0;
  if (!stamp) return "unknown";
  const diff = Date.now() - stamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))}h ago`;
  return new Date(stamp).toLocaleDateString();
}

function toggleProjectFavorite(projectId) {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  project.favorite = !project.favorite;
  saveState({ projectId });
  render();
}

function switchActiveProject(projectId) {
  if (state.activeProjectId === projectId) return;
  flushCodeWorkspaceSave();
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
    const boardLike = item.type === "ticket" || item.type === "shape" || item.type === "table";
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
    if (item.type === "table") node.style.setProperty("--table-fill-color", item.color || "#ffffff");
    if (item.type === "shape") applyShapeTextBoxStyles(node, item.shape || "circle");
    node.dataset.id = item.id;
    applyItemBorderToNode(item, node);
    node.classList.toggle("multi-selected", selectedItemIds.has(item.id));
    node.addEventListener("pointerdown", (event) => {
      if (spacePressed) return;
      if (activeShapeTool) setActiveShapeTool(null);
      if (drawMode) toggleDrawMode();
      selectedBoardItemId = item.id;
      if (event.target.closest(".resize-handle, .resize-edge")) return;
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        toggleItemSelection(item.id);
        return;
      }
      if (isBoardDragBlocked(event.target)) {
        if (!selectedItemIds.has(item.id)) {
          selectedItemIds = new Set([item.id]);
          selectedConnectionIds.clear();
          selectedDrawingIds.clear();
        }
        selectedBoardItemId = item.id;
        closeDrawersForBoardSelection();
        renderSelectionClasses();
        renderPropertiesPanel();
        return;
      }
      if (event.detail > 1) {
        selectedItemIds = new Set([item.id]);
        selectedConnectionIds.clear();
        selectedDrawingIds.clear();
        closeDrawersForBoardSelection();
        renderSelectionClasses();
        renderPropertiesPanel();
        enterItemTextEdit(event, node, item);
        return;
      }
      if (!selectedItemIds.has(item.id)) {
        selectedItemIds = new Set([item.id]);
        selectedConnectionIds.clear();
        selectedDrawingIds.clear();
      }
      selectedBoardItemId = item.id;
      closeDrawersForBoardSelection();
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
      img.loading = "lazy";
      img.decoding = "async";
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
      node.append(createShapeVisual(item.shape || "circle", item.color || ticketColors[0]));
    }

    if (item.type === "table") {
      node.append(createTableNode(item, node));
    }

    let text = null;
    if (item.type !== "table") {
      text = document.createElement("div");
      text.className = `item-text ${item.type === "image" ? "image-caption" : ""} ${item.type === "shape" ? "shape-text" : ""}`;
      text.classList.toggle("caption-hidden", item.type === "image" && !item.captionOpen);
      text.contentEditable = "false";
      text.dataset.placeholder = boardLike ? "Describe the board" : "Write a caption";
      text.innerHTML = boardLike ? (item.html || escapeHtml(item.text || "")) : escapeHtml(item.text || "");
      applyTextStyleToNode(text, getItemTextStyle(item));
      text.addEventListener("pointerdown", (event) => {
        if (spacePressed) return;
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
    }

    const linkedTasks = (project.tasks || []).filter((task) => task.linkedItemId === item.id);
    if (linkedTasks.length) {
      const linkedBadge = document.createElement("button");
      linkedBadge.type = "button";
      linkedBadge.className = "board-linked-tasks";
      linkedBadge.title = "Open linked tasks";
      linkedBadge.textContent = `${linkedTasks.length} task${linkedTasks.length === 1 ? "" : "s"} linked`;
      linkedBadge.addEventListener("pointerdown", (event) => event.stopPropagation());
      linkedBadge.addEventListener("click", (event) => {
        event.stopPropagation();
        taskSearch.value = getBoardItemName(item, "");
        openSidePanelFromBoardContext("tasks");
        renderTasks();
        showTaskBoardLink(linkedTasks[0].id, item.id);
      });
      node.append(linkedBadge);
    }

    node.append(createResizeHandles(node, item, project));
    node.append(createConnectionDots(item));

    boardContent.append(node);
    if (text) {
      window.requestAnimationFrame(() => {
        const resizedForText = ensureItemFitsText(item, node);
        fitItemText(text, item);
        if (resizedForText) {
          connectionsLayer.innerHTML = "";
          renderConnections(project);
        }
      });
      node.addEventListener("dblclick", (event) => enterItemTextEdit(event, node, item));
    }
    node.addEventListener("dragstart", (event) => event.preventDefault());
  });
}
