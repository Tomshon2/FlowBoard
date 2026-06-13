function renderTasks() {
  const project = getActiveProject();
  tasksList.innerHTML = "";
  if (!project) {
    taskCount.textContent = "0/0";
    return;
  }
  const done = project.tasks.filter((task) => task.done).length;
  taskCount.textContent = `${done}/${project.tasks.length}`;

  project.tasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = `task-item ${task.done ? "done" : ""}`;
    row.innerHTML = `
      <input type="checkbox" ${task.done ? "checked" : ""} aria-label="Complete task" />
      <span class="task-text">${escapeHtml(task.title)}</span>
      <button class="delete-task" title="Remove task">x</button>
    `;
    row.querySelector("input").addEventListener("change", (event) => {
      const beforeTasks = structuredClone(project.tasks);
      task.done = event.target.checked;
      const afterTasks = structuredClone(project.tasks);
      saveState({
        historyEntry: createHistoryCommand("updateProject", project.id, { tasks: beforeTasks }, { tasks: afterTasks }, {
          projectId: project.id,
          groupKey: `project:${project.id}:task:${task.id}`
        }),
        forceStep: true
      });
      render();
    });
    row.querySelector("button").addEventListener("click", () => {
      const beforeTasks = structuredClone(project.tasks);
      project.tasks = project.tasks.filter((candidate) => candidate.id !== task.id);
      const afterTasks = structuredClone(project.tasks);
      saveState({
        historyEntry: createHistoryCommand("updateProject", project.id, { tasks: beforeTasks }, { tasks: afterTasks }, {
          projectId: project.id,
          groupKey: `project:${project.id}:tasks`
        }),
        forceStep: true
      });
      render();
    });
    tasksList.append(row);
  });
}

function renderHours() {
  const project = getActiveProject();
  const totalHours = Number(project?.totalHours || 0);
  projectHours.value = totalHours;
  hoursTotalLabel.textContent = `${formatHours(totalHours)}h`;
  hoursTable.innerHTML = "";

  timePlan.forEach((phase) => {
    const phaseHours = hoursFromPercent(totalHours, phase.percent);
    const phaseRow = document.createElement("div");
    phaseRow.className = "hours-phase";
    phaseRow.style.setProperty("--phase-color", phase.color);
    phaseRow.innerHTML = `
      <div class="phase-name">${escapeHtml(phase.title)}</div>
      <div class="phase-hours">${formatHours(phaseHours)}h</div>
      <div class="phase-tasks">
        ${phase.tasks.map((task) => `
          <div class="phase-task">
            <span>${escapeHtml(task.title)}</span>
            <strong>${formatHours(hoursFromPercent(totalHours, task.percent))}h</strong>
          </div>
        `).join("")}
      </div>
    `;
    hoursTable.append(phaseRow);
  });
}
