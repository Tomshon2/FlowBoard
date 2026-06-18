function renderHours() {
  const project = getActiveProject();
  const effectiveHoursMode = isGameJamProject(project) ? "final" : hoursMode;
  const totalHours = Number(project?.totalHours || 0);
  projectHours.value = totalHours;
  hoursTotalLabel.textContent = `${formatHours(totalHours)}h`;
  hoursTable.innerHTML = "";
  hoursFinalMode.classList.toggle("active", effectiveHoursMode === "final");
  hoursEditMode.classList.toggle("active", effectiveHoursMode === "edit");
  if (!project) return;

  normalizeHourPlan(project);
  if (effectiveHoursMode === "final") {
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
  if (isGameJamProject()) mode = "final";
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
    project.hourPlan.forEach((phase, index) => {
      phase.order = index;
    });
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
    phase.tasks.forEach((task, index) => {
      task.order = index;
    });
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
