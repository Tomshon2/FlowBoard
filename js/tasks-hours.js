let draggedTaskColumnId = null;
let draggedTaskColumnStartOrder = [];
let taskColumnDropCommitted = false;
let draggedTaskCardState = null;
const TASK_CARD_DRAG_THRESHOLD = 6;
const TASK_PRIORITIES = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};

function renderTasks() {
  const project = getActiveProject();
  tasksList.innerHTML = "";
  if (!project) {
    taskCount.textContent = "0/0";
    return;
  }

  normalizeTaskBoard(project);
  syncTaskFilterOptions(project);
  const doneColumn = getDoneTaskColumn(project);
  const done = project.tasks.filter((task) => task.columnId === doneColumn.id).length;
  const visibleTasks = getFilteredTasks(project);
  taskCount.textContent = `${visibleTasks.length}/${project.tasks.length} shown · ${done} done`;

  const board = document.createElement("div");
  board.className = "kanban-board";
  board.addEventListener("drop", (event) => {
    if (!isColumnDragEvent(event)) return;
    event.preventDefault();
    commitTaskColumnDomOrder();
  });
  const columns = getOrderedTaskColumns(project);
  columns.forEach((column, index) => {
    board.append(createTaskColumnNode(project, column, index, columns.length));
  });
  tasksList.append(board);
}

function createTaskColumnNode(project, column, index, columnCount) {
  const columnTasks = getFilteredTasksForColumn(project, column.id);
  const columnNode = document.createElement("section");
  columnNode.className = "kanban-column";
  columnNode.dataset.columnId = column.id;
  columnNode.style.setProperty("--column-color", column.color);

  const header = document.createElement("div");
  header.className = "kanban-column-header";

  columnNode.addEventListener("dragover", (event) => {
    if (!isColumnDragEvent(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    previewColumnDrop(draggedTaskColumnId || event.dataTransfer.getData("application/x-flowboard-column"), column.id, getColumnDropSide(event, columnNode));
  });
  columnNode.addEventListener("drop", (event) => {
    if (!isColumnDragEvent(event)) return;
    event.preventDefault();
    commitTaskColumnDomOrder();
  });

  const columnTab = document.createElement("div");
  columnTab.className = "kanban-column-tab";
  columnTab.draggable = true;
  columnTab.title = "Drag column";
  columnTab.setAttribute("aria-label", "Drag column");
  columnTab.innerHTML = `
    <span class="kanban-tab-grip" aria-hidden="true"></span>
    <button type="button" class="kanban-tab-delete" title="Delete column" ${columnCount <= 1 ? "disabled" : ""}>x</button>
  `;
  const deleteColumnButton = columnTab.querySelector(".kanban-tab-delete");
  deleteColumnButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  deleteColumnButton.addEventListener("dragstart", (event) => event.preventDefault());
  deleteColumnButton.addEventListener("click", () => deleteTaskColumn(column.id));
  columnTab.addEventListener("dragstart", (event) => {
    if (event.target.closest(".kanban-tab-delete")) {
      event.preventDefault();
      return;
    }
    draggedTaskColumnId = column.id;
    draggedTaskColumnStartOrder = getTaskColumnDomOrder();
    taskColumnDropCommitted = false;
    event.dataTransfer.setData("application/x-flowboard-column", column.id);
    event.dataTransfer.effectAllowed = "move";
    columnNode.classList.add("column-dragging");
    if (event.dataTransfer.setDragImage) {
      event.dataTransfer.setDragImage(columnNode, columnNode.offsetWidth / 2, 24);
    }
  });
  columnTab.addEventListener("dragend", () => {
    columnNode.classList.remove("column-dragging");
    const needsRestore = !taskColumnDropCommitted && hasTaskColumnOrderChanged(draggedTaskColumnStartOrder);
    draggedTaskColumnId = null;
    draggedTaskColumnStartOrder = [];
    taskColumnDropCommitted = false;
    if (needsRestore) render();
  });

  const titleWrap = document.createElement("label");
  titleWrap.className = "kanban-column-title-wrap";
  titleWrap.innerHTML = `
    <input type="color" class="kanban-column-color" value="${normalizeHexColor(column.color || "#434bd7", "#434bd7")}" aria-label="Column color" />
  `;
  const colorInput = titleWrap.querySelector(".kanban-column-color");
  colorInput.addEventListener("pointerdown", (event) => event.stopPropagation());
  colorInput.addEventListener("click", (event) => event.stopPropagation());
  colorInput.addEventListener("input", () => {
    columnNode.style.setProperty("--column-color", colorInput.value);
  });
  colorInput.addEventListener("change", () => updateTaskColumnColor(column.id, colorInput.value));
  const titleInput = document.createElement("input");
  titleInput.className = "kanban-column-title";
  titleInput.value = column.title;
  titleInput.setAttribute("aria-label", "Column name");
  titleInput.addEventListener("change", () => updateTaskColumnTitle(column.id, titleInput.value));
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") titleInput.blur();
  });
  titleWrap.append(titleInput);

  const count = document.createElement("span");
  count.className = "kanban-count";
  count.textContent = String(columnTasks.length);

  header.append(titleWrap, count);

  const cards = document.createElement("div");
  cards.className = "kanban-cards";
  cards.addEventListener("dragover", (event) => {
    if (isColumnDragEvent(event)) return;
    event.preventDefault();
    cards.classList.add("drag-over");
  });
  cards.addEventListener("dragleave", () => cards.classList.remove("drag-over"));
  cards.addEventListener("drop", (event) => {
    if (isColumnDragEvent(event)) return;
    event.preventDefault();
    cards.classList.remove("drag-over");
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) moveTaskToColumn(taskId, column.id);
  });
  columnTasks.forEach((task) => cards.append(createTaskCardNode(project, task)));

  const form = document.createElement("form");
  form.className = "kanban-card-form";
  form.innerHTML = `
    <input type="text" placeholder="Add item" aria-label="Add item to ${escapeHtml(column.title)}" />
    <button type="submit">+</button>
  `;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("input");
    addTaskToColumn(column.id, input.value);
    input.value = "";
  });

  columnNode.append(columnTab, header, cards, form);
  return columnNode;
}

function syncTaskFilterOptions(project) {
  const selectedPerson = taskFilterPerson.value;
  const selectedStatus = taskFilterStatus.value;
  taskFilterPerson.innerHTML = `<option value="">All people</option>`;
  (project.teamRoles || []).forEach((member) => {
    const option = document.createElement("option");
    option.value = member.id;
    option.textContent = member.name || member.role || "Member";
    taskFilterPerson.append(option);
  });
  taskFilterPerson.value = [...taskFilterPerson.options].some((option) => option.value === selectedPerson) ? selectedPerson : "";

  taskFilterStatus.innerHTML = `<option value="">All status</option>`;
  getOrderedTaskColumns(project).forEach((column) => {
    const option = document.createElement("option");
    option.value = column.id;
    option.textContent = column.title;
    taskFilterStatus.append(option);
  });
  taskFilterStatus.value = [...taskFilterStatus.options].some((option) => option.value === selectedStatus) ? selectedStatus : "";
}

function getTaskFilterState() {
  return {
    search: cleanUserText(taskSearch.value, 120).toLowerCase(),
    personId: taskFilterPerson.value,
    statusId: taskFilterStatus.value,
    priority: taskFilterPriority.value
  };
}

function getFilteredTasks(project) {
  const filters = getTaskFilterState();
  return (project.tasks || []).filter((task) => {
    if (filters.personId && !(task.assigneeIds || []).includes(filters.personId)) return false;
    if (filters.statusId && task.columnId !== filters.statusId) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (!filters.search) return true;
    const linkedItem = task.linkedItemId ? project.items?.find((item) => item.id === task.linkedItemId) : null;
    const haystack = [
      task.title,
      task.description,
      task.deadline,
      getBoardItemName(linkedItem, ""),
      TASK_PRIORITIES[task.priority],
      ...(task.tags || []),
      ...(task.checklist || []).map((item) => item.text)
    ].join(" ").toLowerCase();
    return haystack.includes(filters.search);
  });
}

function getFilteredTasksForColumn(project, columnId) {
  const visibleIds = new Set(getFilteredTasks(project).map((task) => task.id));
  return getTasksForColumn(project, columnId).filter((task) => visibleIds.has(task.id));
}

function createTaskCardNode(project, task) {
  const members = project.teamRoles || [];
  const assigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
  const progress = clamp(Number(task.progress) || 0, 0, 100);
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const checklistDone = checklist.filter((item) => item.done).length;
  const dependencyCount = (task.dependencyIds || []).length;
  const blocked = dependencyCount && !areTaskDependenciesDone(project, task);
  const linkedItem = task.linkedItemId ? project.items?.find((item) => item.id === task.linkedItemId) : null;
  const card = document.createElement("article");
  card.className = "kanban-card";
  card.classList.add(`priority-${task.priority || "medium"}`);
  card.draggable = false;
  card.dataset.taskId = task.id;
  card.addEventListener("dragstart", (event) => event.preventDefault());
  card.addEventListener("pointerdown", (event) => startTaskCardDrag(event, task.id, card));
  card.addEventListener("click", (event) => {
    if (!task.linkedItemId || event.target.closest(".kanban-card-controls, button, input, label, details, summary")) return;
    showTaskBoardLink(task.id, task.linkedItemId);
  });

  const title = document.createElement("div");
  title.className = "kanban-card-title";
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "kanban-task-meta";
  const selectedMembers = members.filter((member) => assigneeIds.includes(member.id));
  const selectedMarkup = selectedMembers.length
    ? selectedMembers.map((member) => `<span class="kanban-person-chip">${escapeHtml(member.name || member.role || "Member")}</span>`).join("")
    : `<span class="kanban-no-team">No people assigned</span>`;
  const tagMarkup = (task.tags || []).length
    ? `<div class="kanban-tags">${task.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";
  meta.innerHTML = `
    <div class="kanban-card-badges">
      <span class="priority-chip priority-${escapeHtml(task.priority || "medium")}">${escapeHtml(TASK_PRIORITIES[task.priority] || "Medium")}</span>
      ${task.deadline ? `<span class="deadline-chip">${escapeHtml(task.deadline)}</span>` : ""}
      ${checklist.length ? `<span class="checklist-chip">${checklistDone}/${checklist.length}</span>` : ""}
      ${dependencyCount ? `<span class="dependency-chip ${blocked ? "blocked" : ""}">${blocked ? "Blocked by dependency" : `${dependencyCount} deps`}</span>` : ""}
      ${linkedItem ? `<span class="linked-chip">${escapeHtml(getBoardItemName(linkedItem))}</span>` : ""}
    </div>
    ${tagMarkup}
    <div class="kanban-progress-summary" aria-label="Progress">
      <span class="kanban-progress-label">${progress}% done</span>
      <span class="kanban-progress-track"><span style="width: ${progress}%"></span></span>
    </div>
    <div class="kanban-assignees" aria-label="Assigned people">${selectedMarkup}</div>
  `;

  const body = document.createElement("div");
  body.className = "kanban-card-body";
  body.append(title, meta);

  const controls = document.createElement("div");
  controls.className = "kanban-card-controls";
  controls.innerHTML = `
    <button type="button" class="kanban-edit-button" title="Edit item">Edit</button>
    <button type="button" class="kanban-icon-button delete-task" title="Remove item">x</button>
  `;
  controls.querySelector(".kanban-edit-button").addEventListener("click", () => openTaskIssueDialog(task.id));
  controls.querySelector(".delete-task").addEventListener("click", () => deleteTask(task.id));

  card.append(body, controls);
  return card;
}

function startTaskCardDrag(event, taskId, card) {
  if (event.button !== 0 || event.target.closest(".kanban-card-controls, button, input, label, details, summary")) return;
  const project = getActiveProject();
  const task = project?.tasks.find((candidate) => candidate.id === taskId);
  if (!project || !task) return;

  const startX = event.clientX;
  const startY = event.clientY;
  let activeColumnId = task.columnId;
  let isDragging = false;

  const clearDropTargets = () => {
    tasksList.querySelectorAll(".kanban-cards.drag-over").forEach((node) => node.classList.remove("drag-over"));
  };

  const beginDrag = () => {
    isDragging = true;
    draggedTaskCardState = { taskId };
    if (card.contains(document.activeElement)) document.activeElement.blur();
    card.classList.add("dragging");
    document.body.classList.add("dragging-kanban-card");
  };

  const move = (moveEvent) => {
    const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
    if (!isDragging && distance < TASK_CARD_DRAG_THRESHOLD) return;
    if (!isDragging) beginDrag();

    moveEvent.preventDefault();
    clearDropTargets();
    const targetCards = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest(".kanban-cards");
    const targetColumn = targetCards?.closest(".kanban-column");
    if (targetCards && targetColumn?.dataset.columnId) {
      targetCards.classList.add("drag-over");
      activeColumnId = targetColumn.dataset.columnId;
      const beforeCard = getTaskDropBeforeCard(targetCards, moveEvent.clientY, taskId);
      if (beforeCard) {
        targetCards.insertBefore(card, beforeCard);
      } else {
        targetCards.append(card);
      }
    }
  };

  const end = (endEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    clearDropTargets();
    card.classList.remove("dragging");
    document.body.classList.remove("dragging-kanban-card");
    draggedTaskCardState = null;

    if (!isDragging) return;
    endEvent.preventDefault();
    if (activeColumnId) commitTaskCardDomOrder(taskId, activeColumnId);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function getTaskDropBeforeCard(cardsNode, pointerY, draggedTaskId) {
  const cards = Array.from(cardsNode.querySelectorAll(".kanban-card:not(.dragging)"))
    .filter((candidate) => candidate.dataset.taskId !== draggedTaskId);
  return cards.find((candidate) => {
    const box = candidate.getBoundingClientRect();
    return pointerY < box.top + box.height / 2;
  }) || null;
}

function commitTaskCardDomOrder(taskId, columnId) {
  const project = getActiveProject();
  const task = project?.tasks.find((candidate) => candidate.id === taskId);
  if (!project || !task) return;
  const cardsNode = tasksList.querySelector(`.kanban-column[data-column-id="${CSS.escape(columnId)}"] .kanban-cards`);
  if (!cardsNode) return;

  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  const previousColumnId = task.columnId;
  const orderedIds = Array.from(cardsNode.querySelectorAll(".kanban-card"))
    .map((node) => node.dataset.taskId)
    .filter(Boolean);
  const tasksById = new Map(project.tasks.map((candidate) => [candidate.id, candidate]));

  orderedIds.forEach((id, index) => {
    const candidate = tasksById.get(id);
    if (!candidate) return;
    candidate.columnId = columnId;
    candidate.order = index;
  });
  if (columnId === getDoneTaskColumn(project).id && !areTaskDependenciesDone(project, task)) {
    project.tasks = beforeTasks;
    project.taskColumns = beforeColumns;
    warnBlockedTask(task);
    render();
    return;
  }
  if (previousColumnId !== columnId) reorderTasksInColumn(project, previousColumnId);

  const changedColumn = previousColumnId !== columnId;
  const previousOrder = beforeTasks
    .filter((candidate) => candidate.columnId === columnId)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((candidate) => candidate.id)
    .join(",");
  const nextOrder = orderedIds.join(",");
  if (!changedColumn && previousOrder === nextOrder) {
    render();
    return;
  }

  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task:${taskId}:order`);
}

function getOrderedTaskColumns(project) {
  return [...(project.taskColumns || [])].sort((a, b) => a.order - b.order);
}

function getTasksForColumn(project, columnId) {
  return [...(project.tasks || [])]
    .filter((task) => task.columnId === columnId)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function isColumnDragEvent(event) {
  return Array.from(event.dataTransfer?.types || []).includes("application/x-flowboard-column");
}

function getColumnDropSide(event, columnNode) {
  const bounds = columnNode.getBoundingClientRect();
  return event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
}

function getTaskColumnDomOrder() {
  return Array.from(tasksList.querySelectorAll(".kanban-column"))
    .map((node) => node.dataset.columnId)
    .filter(Boolean);
}

function hasTaskColumnOrderChanged(previousOrder) {
  const currentOrder = getTaskColumnDomOrder();
  return currentOrder.length !== previousOrder.length || currentOrder.some((id, index) => id !== previousOrder[index]);
}

function previewColumnDrop(columnId, targetColumnId, side) {
  if (!columnId || !targetColumnId || columnId === targetColumnId) return;
  const board = tasksList.querySelector(".kanban-board");
  const draggedNode = board?.querySelector(`.kanban-column[data-column-id="${CSS.escape(columnId)}"]`);
  const targetNode = board?.querySelector(`.kanban-column[data-column-id="${CSS.escape(targetColumnId)}"]`);
  if (!board || !draggedNode || !targetNode) return;
  if (side === "after") {
    targetNode.after(draggedNode);
  } else {
    targetNode.before(draggedNode);
  }
}

function commitTaskColumnDomOrder() {
  const project = getActiveProject();
  if (!project) return;
  const nextOrder = getTaskColumnDomOrder();
  if (!nextOrder.length || !hasTaskColumnOrderChanged(draggedTaskColumnStartOrder)) return;
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  const columnsById = new Map(project.taskColumns.map((column) => [column.id, column]));
  const orderedColumns = nextOrder
    .map((id) => columnsById.get(id))
    .filter(Boolean);
  project.taskColumns.forEach((column) => {
    if (!nextOrder.includes(column.id)) orderedColumns.push(column);
  });
  project.taskColumns = orderedColumns.map((column, columnIndex) => ({ ...column, order: columnIndex }));
  taskColumnDropCommitted = true;
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task-columns`);
}

function getDoneTaskColumn(project) {
  const columns = getOrderedTaskColumns(project);
  return columns.find((column) => column.id === "done") ||
    columns.find((column) => column.title.trim().toLowerCase() === "done") ||
    columns[columns.length - 1];
}

function saveTaskBoardChange(project, beforeTasks, beforeColumns, groupKey) {
  project.taskColumns = getOrderedTaskColumns(project).map((column, index) => ({ ...column, order: index }));
  const doneColumn = getDoneTaskColumn(project);
  project.tasks.forEach((task) => {
    task.done = task.columnId === doneColumn.id;
  });
  saveState({
    historyEntry: createHistoryCommand(
      "updateProject",
      project.id,
      { tasks: beforeTasks, taskColumns: beforeColumns },
      { tasks: structuredClone(project.tasks), taskColumns: structuredClone(project.taskColumns) },
      { projectId: project.id, groupKey }
    ),
    forceStep: true
  });
  render();
}

function areTaskDependenciesDone(project, task) {
  const dependencyIds = Array.isArray(task.dependencyIds) ? task.dependencyIds : [];
  return dependencyIds.every((id) => project.tasks.find((candidate) => candidate.id === id)?.done);
}

function warnBlockedTask(task) {
  showRealtimeConflictNotice(`"${task.title}" is blocked by unfinished dependencies.`);
}

function addTaskColumn(title) {
  const project = getActiveProject();
  if (!project) return;
  const cleanedTitle = cleanUserText(title, 60, "New status");
  normalizeTaskBoard(project);
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  const colors = ["#03943a", "#b77900", "#6d28d9", "#2074b4", "#d94a2b", "#e5549f"];
  project.taskColumns.push({
    id: crypto.randomUUID(),
    title: cleanedTitle,
    color: colors[project.taskColumns.length % colors.length],
    order: project.taskColumns.length
  });
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task-columns`);
}

function updateTaskColumnTitle(columnId, title) {
  const project = getActiveProject();
  const column = project?.taskColumns.find((candidate) => candidate.id === columnId);
  if (!project || !column) return;
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  column.title = cleanUserText(title, 60, "New status");
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task-column:${columnId}`);
}

function updateTaskColumnColor(columnId, color) {
  const project = getActiveProject();
  const column = project?.taskColumns.find((candidate) => candidate.id === columnId);
  if (!project || !column) return;
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  column.color = normalizeHexColor(color, column.color || "#434bd7");
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task-column:${columnId}:color`);
}

function moveTaskColumn(columnId, direction) {
  const project = getActiveProject();
  if (!project) return;
  const columns = getOrderedTaskColumns(project);
  const index = columns.findIndex((column) => column.id === columnId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= columns.length) return;
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  [columns[index], columns[nextIndex]] = [columns[nextIndex], columns[index]];
  project.taskColumns = columns.map((column, columnIndex) => ({ ...column, order: columnIndex }));
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task-columns`);
}

async function deleteTaskColumn(columnId) {
  const project = getActiveProject();
  if (!project) return;
  const columns = getOrderedTaskColumns(project);
  if (columns.length <= 1) return;
  if (!await confirmDangerousAction("Delete this task column? Its cards will move to another column.")) return;
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  const fallback = columns.find((column) => column.id !== columnId);
  project.tasks.forEach((task) => {
    if (task.columnId === columnId) task.columnId = fallback.id;
  });
  project.taskColumns = columns.filter((column) => column.id !== columnId);
  reorderTasksInColumn(project, fallback.id);
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task-columns`);
}

function addTaskToColumn(columnId, title) {
  const project = getActiveProject();
  const cleanedTitle = cleanUserText(title, 120);
  if (!project || !cleanedTitle) return;
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  project.tasks.push({
    id: crypto.randomUUID(),
    title: cleanedTitle,
    columnId,
    done: columnId === getDoneTaskColumn(project).id,
    order: getTasksForColumn(project, columnId).length,
    estimateHours: 0,
    progress: 0,
    description: "",
    assigneeIds: [],
    priority: "medium",
    deadline: "",
    tags: [],
    checklist: [],
    linkedItemId: ""
  });
  logProjectEvent("Task created", cleanedTitle);
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:tasks`);
}

function updateTaskTitle(taskId, title) {
  const project = getActiveProject();
  const task = project?.tasks.find((candidate) => candidate.id === taskId);
  if (!project || !task) return;
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  task.title = cleanUserText(title, 120, "New item");
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task:${taskId}`);
}

function updateTaskDetails(taskId, updates) {
  const project = getActiveProject();
  const task = project?.tasks.find((candidate) => candidate.id === taskId);
  if (!project || !task) return;
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  if (Object.prototype.hasOwnProperty.call(updates, "estimateHours")) {
    task.estimateHours = clamp(Number(updates.estimateHours) || 0, 0, 999);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "title")) {
    task.title = cleanUserText(updates.title, 120, "New item");
  }
  if (Object.prototype.hasOwnProperty.call(updates, "description")) {
    task.description = String(updates.description || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 5000);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "priority")) {
    const priority = String(updates.priority || "").toLowerCase();
    task.priority = TASK_PRIORITIES[priority] ? priority : "medium";
  }
  if (Object.prototype.hasOwnProperty.call(updates, "deadline")) {
    const value = String(updates.deadline || "");
    task.deadline = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  }
  if (Object.prototype.hasOwnProperty.call(updates, "tags")) {
    task.tags = (Array.isArray(updates.tags) ? updates.tags : String(updates.tags || "").split(","))
      .map((tag) => cleanUserText(tag, 32))
      .filter(Boolean)
      .slice(0, 12);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "checklist")) {
    task.checklist = (Array.isArray(updates.checklist) ? updates.checklist : [])
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        text: cleanUserText(item.text, 120, "Checklist item"),
        done: Boolean(item.done)
      }))
      .slice(0, 50);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "dependencyIds")) {
    const taskIds = new Set(project.tasks.map((candidate) => candidate.id));
    task.dependencyIds = (Array.isArray(updates.dependencyIds) ? updates.dependencyIds : [])
      .filter((id) => taskIds.has(id) && id !== task.id)
      .slice(0, 30);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "linkedItemId")) {
    task.linkedItemId = project.items?.some((item) => item.id === updates.linkedItemId) ? updates.linkedItemId : "";
  }
  if (Object.prototype.hasOwnProperty.call(updates, "progress")) {
    task.progress = clamp(Number(updates.progress) || 0, 0, 100);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "assigneeIds")) {
    const teamMemberIds = new Set((project.teamRoles || []).map((member) => member.id));
    task.assigneeIds = (Array.isArray(updates.assigneeIds) ? updates.assigneeIds : [])
      .filter((id) => teamMemberIds.has(id));
  }
  if (Object.prototype.hasOwnProperty.call(updates, "columnId")) {
    const nextColumn = project.taskColumns.find((column) => column.id === updates.columnId);
    if (nextColumn && nextColumn.id !== task.columnId) {
      if (nextColumn.id === getDoneTaskColumn(project).id && !areTaskDependenciesDone(project, task)) {
        warnBlockedTask(task);
        return;
      }
      const previousColumnId = task.columnId;
      task.columnId = nextColumn.id;
      task.order = getTasksForColumn(project, nextColumn.id).length;
      reorderTasksInColumn(project, previousColumnId);
      if (nextColumn.id === getDoneTaskColumn(project).id) logProjectEvent("Task completed", task.title, task.id);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(updates, "columnId")) {
    logProjectEvent("Task edited", task.title, task.id);
  }
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task:${taskId}:details`);
}

function openTaskIssueDialog(taskId) {
  const project = getActiveProject();
  const task = project?.tasks.find((candidate) => candidate.id === taskId);
  if (!project || !task) return;
  document.querySelector(".task-issue-backdrop")?.remove();

  const columns = getOrderedTaskColumns(project);
  const members = project.teamRoles || [];
  const assigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
  const progress = clamp(Number(task.progress) || 0, 0, 100);
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const column = columns.find((candidate) => candidate.id === task.columnId) || columns[0];
  const boardItems = (project.items || []).filter((item) => item.type !== "image");
  const dependencyOptions = (project.tasks || []).filter((candidate) => candidate.id !== task.id);
  const dialog = document.createElement("div");
  dialog.className = "task-issue-backdrop";
  dialog.innerHTML = `
    <section class="task-issue-dialog" role="dialog" aria-modal="true" aria-label="Issue editor">
      <div class="task-issue-main">
        <div class="task-issue-heading">
          <p class="eyebrow">Issue</p>
          <input class="task-issue-title" value="${escapeHtml(task.title)}" aria-label="Issue title" />
        </div>
        <label class="task-issue-field">
          <span>Description</span>
          <textarea class="task-issue-description" rows="12" placeholder="Write notes, links, ideas, pasted text, image URLs...">${escapeHtml(task.description || "")}</textarea>
        </label>
      </div>
      <aside class="task-issue-sidebar">
        <button type="button" class="task-issue-close" aria-label="Close issue">x</button>
        <div class="task-issue-field">
          <span>Status</span>
          <div class="task-issue-segmented task-issue-status" role="group" aria-label="Task status">
            ${columns.map((candidate) => `<button type="button" data-value="${escapeHtml(candidate.id)}" class="${candidate.id === task.columnId ? "active" : ""}" style="--segment-color: ${escapeHtml(candidate.color || "#434bd7")}">${escapeHtml(candidate.title)}</button>`).join("")}
          </div>
        </div>
        <div class="task-issue-field">
          <span>Priority</span>
          <div class="task-issue-segmented task-issue-priority" role="group" aria-label="Task priority">
            ${Object.entries(TASK_PRIORITIES).map(([value, label]) => `<button type="button" data-value="${value}" class="priority-${value} ${value === task.priority ? "active" : ""}">${label}</button>`).join("")}
          </div>
        </div>
        <label class="task-issue-field">
          <span>Deadline</span>
          <input class="task-issue-deadline" type="date" value="${escapeHtml(task.deadline || "")}" />
        </label>
        <label class="task-issue-field">
          <span>Tags</span>
          <input class="task-issue-tags" type="text" value="${escapeHtml((task.tags || []).join(", "))}" placeholder="combat, boss, polish" />
        </label>
        <div class="task-issue-field">
          <span>Linked board element</span>
          <div class="task-issue-segmented task-issue-linked-item task-issue-link-options" role="group" aria-label="Linked board element">
            <button type="button" data-value="" class="${!task.linkedItemId ? "active" : ""}">No board link</button>
            ${boardItems.map((item) => `<button type="button" data-value="${escapeHtml(item.id)}" class="${item.id === task.linkedItemId ? "active" : ""}">${escapeHtml(getBoardItemName(item))}</button>`).join("")}
          </div>
          ${task.linkedItemId ? `<button type="button" class="task-issue-go-board">Go to board item</button>` : ""}
        </div>
        <div class="task-issue-field">
          <span>Dependencies</span>
          <div class="task-dependency-editor">
            ${dependencyOptions.length ? dependencyOptions.map((candidate) => `
              <label class="task-dependency-row">
                <input type="checkbox" value="${escapeHtml(candidate.id)}" ${(task.dependencyIds || []).includes(candidate.id) ? "checked" : ""} />
                <span>${escapeHtml(candidate.title)}</span>
              </label>
            `).join("") : `<span class="kanban-no-team">Create another task first</span>`}
          </div>
        </div>
        <label class="task-issue-field">
          <span>Progress</span>
          <div class="task-issue-progress">
            <input class="task-issue-progress-range" type="range" min="0" max="100" step="1" value="${progress}" style="--progress-value: ${progress}%" />
            <input class="task-issue-progress-number" type="number" min="0" max="100" step="1" value="${progress}" aria-label="Progress percent" />
            <strong>%</strong>
          </div>
        </label>
        <div class="task-issue-field">
          <span>People</span>
          <div class="task-issue-people">
            ${members.length ? members.map((member) => `
              <label class="kanban-people-option" title="${escapeHtml(member.role || "Team member")}">
                <input type="checkbox" value="${escapeHtml(member.id)}" ${assigneeIds.includes(member.id) ? "checked" : ""} />
                <span>${escapeHtml(member.name || member.role || "Member")}</span>
              </label>
            `).join("") : `<span class="kanban-no-team">Add team members first</span>`}
          </div>
        </div>
        <div class="task-issue-field">
          <span>Checklist</span>
          <div class="task-checklist-editor">
            ${checklist.map((item) => `
              <label class="task-checklist-row" data-checklist-id="${escapeHtml(item.id)}">
                <input type="checkbox" ${item.done ? "checked" : ""} />
                <input type="text" value="${escapeHtml(item.text)}" />
                <button type="button" title="Remove checklist item">x</button>
              </label>
            `).join("")}
          </div>
          <button type="button" class="task-checklist-add">+ Checklist item</button>
        </div>
        <div class="task-issue-meta">
          <span style="--column-color: ${escapeHtml(column?.color || "#434bd7")}"></span>
          <strong>${escapeHtml(column?.title || "Status")}</strong>
        </div>
        <button type="button" class="task-issue-save">Save issue</button>
      </aside>
    </section>
  `;

  const close = () => dialog.remove();
  const readChecklist = () => Array.from(dialog.querySelectorAll(".task-checklist-row")).map((row) => ({
    id: row.dataset.checklistId || crypto.randomUUID(),
    done: row.querySelector("input[type='checkbox']").checked,
    text: row.querySelector("input[type='text']").value
  })).filter((item) => cleanUserText(item.text, 120));
  const save = () => {
    const range = dialog.querySelector(".task-issue-progress-range");
    const checkedPeople = Array.from(dialog.querySelectorAll(".task-issue-people input:checked")).map((input) => input.value);
    updateTaskDetails(task.id, {
      title: dialog.querySelector(".task-issue-title").value,
      description: dialog.querySelector(".task-issue-description").value,
      priority: dialog.querySelector(".task-issue-priority button.active")?.dataset.value || "medium",
      deadline: dialog.querySelector(".task-issue-deadline").value,
      tags: dialog.querySelector(".task-issue-tags").value,
      checklist: readChecklist(),
      dependencyIds: Array.from(dialog.querySelectorAll(".task-dependency-editor input:checked")).map((input) => input.value),
      linkedItemId: dialog.querySelector(".task-issue-linked-item button.active")?.dataset.value || "",
      progress: Number(range.value),
      columnId: dialog.querySelector(".task-issue-status button.active")?.dataset.value || task.columnId,
      assigneeIds: checkedPeople
    });
    close();
  };
  const syncProgress = (value) => {
    const nextValue = String(clamp(Number(value) || 0, 0, 100));
    const range = dialog.querySelector(".task-issue-progress-range");
    range.value = nextValue;
    range.style.setProperty("--progress-value", `${nextValue}%`);
    dialog.querySelector(".task-issue-progress-number").value = nextValue;
  };

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.querySelector(".task-issue-close").addEventListener("click", close);
  dialog.querySelector(".task-issue-save").addEventListener("click", save);
  dialog.querySelector(".task-issue-go-board")?.addEventListener("click", () => {
    const itemId = dialog.querySelector(".task-issue-linked-item button.active")?.dataset.value || task.linkedItemId;
    if (!itemId) return;
    close();
    openSidePanel("tasks");
    taskSearch.value = "";
    renderTasks();
    focusBoardItem(itemId);
    showTaskBoardLink(task.id, itemId);
  });
  dialog.querySelectorAll(".task-issue-segmented").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      group.querySelectorAll("button").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    });
  });
  dialog.querySelector(".task-checklist-add").addEventListener("click", () => {
    const row = document.createElement("label");
    row.className = "task-checklist-row";
    row.dataset.checklistId = crypto.randomUUID();
    row.innerHTML = `
      <input type="checkbox" />
      <input type="text" value="" placeholder="Checklist item" />
      <button type="button" title="Remove checklist item">x</button>
    `;
    row.querySelector("button").addEventListener("click", () => row.remove());
    dialog.querySelector(".task-checklist-editor").append(row);
    row.querySelector("input[type='text']").focus();
  });
  dialog.querySelectorAll(".task-checklist-row button").forEach((button) => {
    button.addEventListener("click", () => button.closest(".task-checklist-row")?.remove());
  });
  dialog.querySelector(".task-issue-progress-range").addEventListener("input", (event) => syncProgress(event.target.value));
  dialog.querySelector(".task-issue-progress-number").addEventListener("input", (event) => syncProgress(event.target.value));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") save();
  });
  document.body.append(dialog);
  dialog.querySelector(".task-issue-title").focus();
}

function showTaskBoardLink(taskId, itemId) {
  document.querySelector(".task-board-link-line")?.remove();
  const boardNode = boardContent.querySelector(`.board-item[data-id="${CSS.escape(itemId)}"]`);
  const taskNode = tasksList.querySelector(`.kanban-card[data-task-id="${CSS.escape(taskId)}"]`);
  if (!boardNode || !taskNode) return;

  boardNode.classList.add("link-focus-pulse");
  taskNode.classList.add("link-focus-pulse");
  window.setTimeout(() => {
    boardNode.classList.remove("link-focus-pulse");
    taskNode.classList.remove("link-focus-pulse");
  }, 1600);

  const boardRect = boardNode.getBoundingClientRect();
  const taskRect = taskNode.getBoundingClientRect();
  const start = {
    x: boardRect.left + boardRect.width / 2,
    y: boardRect.top + boardRect.height / 2
  };
  const end = {
    x: taskRect.left,
    y: taskRect.top + taskRect.height / 2
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "task-board-link-line");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const midX = start.x + (end.x - start.x) * 0.55;
  path.setAttribute("d", `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`);
  svg.append(path);
  document.body.append(svg);
  window.setTimeout(() => svg.remove(), 2600);
}

async function deleteTask(taskId) {
  const project = getActiveProject();
  if (!project) return;
  if (!await confirmDangerousAction("Delete this task?")) return;
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  const task = project.tasks.find((candidate) => candidate.id === taskId);
  project.tasks = project.tasks.filter((candidate) => candidate.id !== taskId);
  if (task) reorderTasksInColumn(project, task.columnId);
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:tasks`);
}

function moveTaskAcrossColumns(taskId, direction) {
  const project = getActiveProject();
  const task = project?.tasks.find((candidate) => candidate.id === taskId);
  if (!project || !task) return;
  const columns = getOrderedTaskColumns(project);
  const index = columns.findIndex((column) => column.id === task.columnId);
  const nextColumn = columns[index + direction];
  if (!nextColumn) return;
  moveTaskToColumn(taskId, nextColumn.id);
}

function moveTaskToColumn(taskId, columnId) {
  const project = getActiveProject();
  const task = project?.tasks.find((candidate) => candidate.id === taskId);
  if (!project || !task || task.columnId === columnId) return;
  if (columnId === getDoneTaskColumn(project).id && !areTaskDependenciesDone(project, task)) {
    warnBlockedTask(task);
    render();
    return;
  }
  const beforeTasks = structuredClone(project.tasks);
  const beforeColumns = structuredClone(project.taskColumns);
  const previousColumnId = task.columnId;
  const nextOrder = getTasksForColumn(project, columnId).length;
  task.columnId = columnId;
  task.order = nextOrder;
  reorderTasksInColumn(project, previousColumnId);
  if (columnId === getDoneTaskColumn(project).id) logProjectEvent("Task completed", task.title, task.id);
  saveTaskBoardChange(project, beforeTasks, beforeColumns, `project:${project.id}:task:${taskId}:move`);
}

function reorderTasksInColumn(project, columnId) {
  getTasksForColumn(project, columnId).forEach((task, index) => {
    task.order = index;
  });
}

function renderHours() {
  const project = getActiveProject();
  const totalHours = Number(project?.totalHours || 0);
  projectHours.value = totalHours;
  hoursTotalLabel.textContent = `${formatHours(totalHours)}h`;
  hoursTable.innerHTML = "";
  hoursFinalMode.classList.toggle("active", hoursMode === "final");
  hoursEditMode.classList.toggle("active", hoursMode === "edit");
  if (!project) return;

  normalizeHourPlan(project);
  if (hoursMode === "final") {
    renderFinalHours(project, totalHours);
    return;
  }

  renderEditableHours(project, totalHours);
}

function renderFinalHours(project, totalHours) {
  getOrderedHourPhases(project).forEach((phase) => {
    const phaseRow = document.createElement("section");
    phaseRow.className = "hours-final-phase";
    phaseRow.innerHTML = `
      <div class="hours-final-phase-main">
        <strong>${escapeHtml(phase.title)}</strong>
        <span>${formatHours(hoursFromPercent(totalHours, phase.percent))}h</span>
      </div>
      <div class="hours-final-tasks">
        ${getOrderedHourTasks(phase).map((task) => `
          <div class="hours-final-task">
            <span>${escapeHtml(task.title)}</span>
            <strong>${formatHours(hoursFromPercent(totalHours, task.percent))}h</strong>
          </div>
        `).join("")}
      </div>
    `;
    hoursTable.append(phaseRow);
  });
}

function renderEditableHours(project, totalHours) {
  const addPhaseForm = document.createElement("form");
  addPhaseForm.className = "hours-add-form";
  addPhaseForm.innerHTML = `
    <input type="text" placeholder="New phase" aria-label="New phase" />
    <input type="number" min="0" max="100" step="0.5" value="10" aria-label="Phase percent" />
    <button type="submit">+ Phase</button>
  `;
  addPhaseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const [titleInput, percentInput] = addPhaseForm.querySelectorAll("input");
    addHourPhase(titleInput.value, Number(percentInput.value));
  });
  hoursTable.append(addPhaseForm);

  getOrderedHourPhases(project).forEach((phase, phaseIndex, phases) => {
    const phaseHours = hoursFromPercent(totalHours, phase.percent);
    const phaseRow = document.createElement("div");
    phaseRow.className = "hours-phase editable-hours-phase";
    phaseRow.dataset.phaseId = phase.id;
    phaseRow.innerHTML = `
      <div class="phase-handle" title="Drag phase"><span></span></div>
      <div class="phase-name">
        <input class="phase-title-input" value="${escapeHtml(phase.title)}" aria-label="Phase name" />
      </div>
      <div class="phase-percent">
        <input type="number" min="0" max="100" step="0.5" value="${phase.percent}" aria-label="Phase percent" />
        <span>%</span>
      </div>
      <div class="phase-hours">${formatHours(phaseHours)}h</div>
      <div class="phase-controls">
        <button type="button" class="phase-delete">x</button>
      </div>
    `;
    phaseRow.querySelector(".phase-title-input").addEventListener("change", (event) => updateHourPhase(phase.id, { title: event.target.value }));
    phaseRow.querySelector(".phase-percent input").addEventListener("change", (event) => updateHourPhase(phase.id, { percent: Number(event.target.value) }));
    phaseRow.querySelector(".phase-delete").addEventListener("click", () => deleteHourPhase(phase.id));
    phaseRow.querySelector(".phase-handle").addEventListener("pointerdown", (event) => startHourPhaseDrag(event, phase.id));
    phaseRow.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".phase-handle, input, button")) return;
      startHourPhaseDrag(event, phase.id);
    });

    const taskList = document.createElement("div");
    taskList.className = "phase-tasks";
    getOrderedHourTasks(phase).forEach((task, taskIndex, phaseTasks) => {
      const taskRow = document.createElement("div");
      taskRow.className = "phase-task";
      taskRow.dataset.taskId = task.id;
      taskRow.innerHTML = `
        <span class="hour-task-indent" aria-hidden="true"></span>
        <input class="hour-task-title" value="${escapeHtml(task.title)}" aria-label="Task name" />
        <input class="hour-task-percent" type="number" min="0" max="100" step="0.5" value="${task.percent}" aria-label="Task percent" />
        <strong>${formatHours(hoursFromPercent(totalHours, task.percent))}h</strong>
        <button type="button" class="hour-task-delete">x</button>
      `;
      taskRow.querySelectorAll("input").forEach((input) => {
        input.draggable = false;
        input.addEventListener("dragstart", (event) => event.preventDefault());
      });
      taskRow.querySelector(".hour-task-title").addEventListener("change", (event) => updateHourTask(phase.id, task.id, { title: event.target.value }));
      taskRow.querySelector(".hour-task-percent").addEventListener("change", (event) => updateHourTask(phase.id, task.id, { percent: Number(event.target.value) }));
      taskRow.querySelector(".hour-task-delete").addEventListener("click", () => deleteHourTask(phase.id, task.id));
      taskRow.addEventListener("pointerdown", (event) => startHourTaskDrag(event, phase.id, task.id));
      taskList.append(taskRow);
    });

    const taskForm = document.createElement("form");
    taskForm.className = "hours-add-form hour-task-form";
    taskForm.innerHTML = `
      <input type="text" placeholder="Add inside phase" aria-label="New task" />
      <input type="number" min="0" max="100" step="0.5" value="5" aria-label="Task percent" />
      <button type="submit">+</button>
    `;
    taskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const [titleInput, percentInput] = taskForm.querySelectorAll("input");
      addHourTask(phase.id, titleInput.value, Number(percentInput.value));
    });
    taskList.append(taskForm);
    hoursTable.append(phaseRow);
    hoursTable.append(taskList);
  });
}

function setHoursMode(mode) {
  hoursMode = mode === "edit" ? "edit" : "final";
  localStorage.setItem("flowboard-hours-mode", hoursMode);
  renderHours();
}

function startHourPhaseDrag(event, phaseId) {
  if (event.button !== 0) return;
  const project = getActiveProject();
  if (!project) return;
  event.preventDefault();
  const phaseNode = event.currentTarget.closest(".hours-phase");
  const phaseTasksNode = phaseNode?.nextElementSibling?.classList.contains("phase-tasks") ? phaseNode.nextElementSibling : null;
  const before = { hourPlan: structuredClone(project.hourPlan) };
  const beforeOrder = getOrderedHourPhases(project).map((phase) => phase.id).join(",");
  phaseNode?.classList.add("dragging-hour-phase");
  phaseTasksNode?.classList.add("dragging-hour-phase-tasks");
  document.body.classList.add("dragging-hour-plan");
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch (error) {
    // Pointer capture is optional; window listeners keep the drag working.
  }

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    const draggedRow = hoursTable.querySelector(`.hours-phase[data-phase-id="${CSS.escape(phaseId)}"]`);
    const draggedTasks = draggedRow?.nextElementSibling?.classList.contains("phase-tasks") ? draggedRow.nextElementSibling : null;
    if (!draggedRow) return;

    const rows = Array.from(hoursTable.querySelectorAll(".hours-phase"))
      .filter((row) => row.dataset.phaseId !== phaseId);
    const beforeRow = rows.find((row) => {
      const bounds = row.getBoundingClientRect();
      return moveEvent.clientY < bounds.top + bounds.height / 2;
    });

    if (beforeRow) {
      beforeRow.before(draggedRow);
      if (draggedTasks) draggedRow.after(draggedTasks);
      return;
    }

    const lastRow = rows[rows.length - 1];
    const lastTasks = lastRow?.nextElementSibling?.classList.contains("phase-tasks") ? lastRow.nextElementSibling : null;
    if (lastTasks || lastRow) {
      (lastTasks || lastRow).after(draggedRow);
    } else {
      hoursTable.append(draggedRow);
    }
    if (draggedTasks) draggedRow.after(draggedTasks);
  };

  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    document.body.classList.remove("dragging-hour-plan");
    phaseNode?.classList.remove("dragging-hour-phase");
    phaseTasksNode?.classList.remove("dragging-hour-phase-tasks");
    const order = Array.from(hoursTable.querySelectorAll(".hours-phase")).map((row) => row.dataset.phaseId);
    if (order.join(",") === beforeOrder) return;
    const phaseById = new Map(project.hourPlan.map((phase) => [phase.id, phase]));
    project.hourPlan = order.map((id) => phaseById.get(id)).filter(Boolean);
    saveHourPlanChange(project, before, `project:${project.id}:hour-plan`);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function startHourTaskDrag(event, phaseId, taskId) {
  if (event.button !== 0 || event.target.closest("button")) return;
  const project = getActiveProject();
  const phase = project?.hourPlan.find((candidate) => candidate.id === phaseId);
  if (!project || !phase) return;

  const taskRow = event.currentTarget;
  const taskList = taskRow.closest(".phase-tasks");
  if (!taskList) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let isDragging = false;
  const before = { hourPlan: structuredClone(project.hourPlan) };
  const beforeOrder = getOrderedHourTasks(phase).map((task) => task.id).join(",");

  const beginDrag = () => {
    isDragging = true;
    if (taskRow.contains(document.activeElement)) document.activeElement.blur();
    taskRow.classList.add("dragging-hour-task");
    document.body.classList.add("dragging-hour-plan");
  };

  const move = (moveEvent) => {
    const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
    if (!isDragging && distance < TASK_CARD_DRAG_THRESHOLD) return;
    if (!isDragging) beginDrag();

    moveEvent.preventDefault();
    const rows = Array.from(taskList.querySelectorAll(".phase-task"))
      .filter((row) => row.dataset.taskId !== taskId);
    const beforeRow = rows.find((row) => {
      const bounds = row.getBoundingClientRect();
      return moveEvent.clientY < bounds.top + bounds.height / 2;
    });

    if (beforeRow) {
      beforeRow.before(taskRow);
      return;
    }

    const form = taskList.querySelector(".hour-task-form");
    if (form) {
      form.before(taskRow);
    } else {
      taskList.append(taskRow);
    }
  };

  const end = (endEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    taskRow.classList.remove("dragging-hour-task");
    document.body.classList.remove("dragging-hour-plan");

    if (!isDragging) return;
    endEvent.preventDefault();
    const order = Array.from(taskList.querySelectorAll(".phase-task")).map((row) => row.dataset.taskId);
    if (order.join(",") === beforeOrder) return;
    const tasksById = new Map(phase.tasks.map((task) => [task.id, task]));
    phase.tasks = order.map((id) => tasksById.get(id)).filter(Boolean);
    saveHourPlanChange(project, before, `project:${project.id}:hour-phase:${phaseId}:tasks`);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function getOrderedHourPhases(project) {
  return [...(project.hourPlan || [])].sort((a, b) => a.order - b.order);
}

function getOrderedHourTasks(phase) {
  return [...(phase.tasks || [])].sort((a, b) => a.order - b.order);
}

function roundHourPercent(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function redistributeHourPercents(items, totalPercent, lockedId = null, requestedPercent = null) {
  if (!items.length) return;
  const total = roundHourPercent(clamp(Number(totalPercent) || 0, 0, 100));
  const lockedItem = lockedId ? items.find((item) => item.id === lockedId) : null;
  const flexibleItems = lockedItem ? items.filter((item) => item.id !== lockedId) : items;
  if (lockedItem && !flexibleItems.length) {
    lockedItem.percent = total;
    return;
  }

  const lockedPercent = lockedItem
    ? roundHourPercent(clamp(Number(requestedPercent) || 0, 0, total))
    : 0;
  if (lockedItem) lockedItem.percent = lockedPercent;
  const remainingPercent = roundHourPercent(Math.max(0, total - lockedPercent));
  if (!flexibleItems.length) return;

  const currentFlexibleTotal = flexibleItems.reduce((sum, item) => sum + Math.max(0, Number(item.percent) || 0), 0);
  if (currentFlexibleTotal <= 0) {
    const evenPercent = roundHourPercent(remainingPercent / flexibleItems.length);
    flexibleItems.forEach((item) => {
      item.percent = evenPercent;
    });
  } else {
    flexibleItems.forEach((item) => {
      item.percent = roundHourPercent((Math.max(0, Number(item.percent) || 0) / currentFlexibleTotal) * remainingPercent);
    });
  }

  const currentTotal = roundHourPercent(flexibleItems.reduce((sum, item) => sum + item.percent, 0));
  const correction = roundHourPercent(remainingPercent - currentTotal);
  flexibleItems[flexibleItems.length - 1].percent = roundHourPercent(Math.max(0, flexibleItems[flexibleItems.length - 1].percent + correction));
}

function syncHourPlanPercents(project) {
  redistributeHourPercents(project.hourPlan, 100);
  project.hourPlan.forEach((phase) => {
    redistributeHourPercents(phase.tasks || [], phase.percent);
  });
}

function saveHourPlanChange(project, before, groupKey) {
  syncHourPlanPercents(project);
  project.hourPlan = getOrderedHourPhases(project).map((phase, phaseIndex) => ({
    ...phase,
    order: phaseIndex,
    tasks: getOrderedHourTasks(phase).map((task, taskIndex) => ({ ...task, order: taskIndex }))
  }));
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, before, { hourPlan: structuredClone(project.hourPlan) }, {
      projectId: project.id,
      groupKey
    }),
    forceStep: true
  });
  render();
}

function addHourPhase(title, percent) {
  const project = getActiveProject();
  const cleanedTitle = cleanUserText(title, 80);
  if (!project || !cleanedTitle) return;
  const before = { hourPlan: structuredClone(project.hourPlan) };
  const phaseId = crypto.randomUUID();
  project.hourPlan.push({ id: phaseId, title: cleanedTitle, percent: 0, order: project.hourPlan.length, tasks: [] });
  redistributeHourPercents(project.hourPlan, 100, phaseId, percent);
  syncHourPlanPercents(project);
  saveHourPlanChange(project, before, `project:${project.id}:hour-plan`);
}

function updateHourPhase(phaseId, updates) {
  const project = getActiveProject();
  const phase = project?.hourPlan.find((candidate) => candidate.id === phaseId);
  if (!project || !phase) return;
  const before = { hourPlan: structuredClone(project.hourPlan) };
  if (Object.prototype.hasOwnProperty.call(updates, "title")) phase.title = cleanUserText(updates.title, 80, "Phase");
  if (Object.prototype.hasOwnProperty.call(updates, "percent")) {
    redistributeHourPercents(project.hourPlan, 100, phaseId, updates.percent);
    syncHourPlanPercents(project);
  }
  saveHourPlanChange(project, before, `project:${project.id}:hour-phase:${phaseId}`);
}

async function deleteHourPhase(phaseId) {
  const project = getActiveProject();
  if (!project) return;
  if (!await confirmDangerousAction("Delete this hour phase and its tasks?")) return;
  const before = { hourPlan: structuredClone(project.hourPlan) };
  project.hourPlan = project.hourPlan.filter((phase) => phase.id !== phaseId);
  syncHourPlanPercents(project);
  saveHourPlanChange(project, before, `project:${project.id}:hour-plan`);
}

function addHourTask(phaseId, title, percent) {
  const project = getActiveProject();
  const phase = project?.hourPlan.find((candidate) => candidate.id === phaseId);
  const cleanedTitle = cleanUserText(title, 100);
  if (!project || !phase || !cleanedTitle) return;
  const before = { hourPlan: structuredClone(project.hourPlan) };
  const taskId = crypto.randomUUID();
  phase.tasks.push({ id: taskId, title: cleanedTitle, percent: 0, order: phase.tasks.length });
  redistributeHourPercents(phase.tasks, phase.percent, taskId, percent);
  saveHourPlanChange(project, before, `project:${project.id}:hour-phase:${phaseId}:tasks`);
}

function updateHourTask(phaseId, taskId, updates) {
  const project = getActiveProject();
  const phase = project?.hourPlan.find((candidate) => candidate.id === phaseId);
  const task = phase?.tasks.find((candidate) => candidate.id === taskId);
  if (!project || !phase || !task) return;
  const before = { hourPlan: structuredClone(project.hourPlan) };
  if (Object.prototype.hasOwnProperty.call(updates, "title")) task.title = cleanUserText(updates.title, 100, "Task");
  if (Object.prototype.hasOwnProperty.call(updates, "percent")) {
    redistributeHourPercents(phase.tasks, phase.percent, taskId, updates.percent);
  }
  saveHourPlanChange(project, before, `project:${project.id}:hour-task:${taskId}`);
}

async function deleteHourTask(phaseId, taskId) {
  const project = getActiveProject();
  const phase = project?.hourPlan.find((candidate) => candidate.id === phaseId);
  if (!project || !phase) return;
  if (!await confirmDangerousAction("Delete this hour task?")) return;
  const before = { hourPlan: structuredClone(project.hourPlan) };
  phase.tasks = phase.tasks.filter((task) => task.id !== taskId);
  redistributeHourPercents(phase.tasks, phase.percent);
  saveHourPlanChange(project, before, `project:${project.id}:hour-phase:${phaseId}:tasks`);
}

