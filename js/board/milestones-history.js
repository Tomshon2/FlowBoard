const MILESTONE_STATUS_LABELS = {
  planned: "Planned",
  active: "Active",
  blocked: "Blocked",
  done: "Done"
};

function getCurrentEventUser() {
  return currentDisplayName || currentUser?.email || "Local user";
}

function logProjectEvent(action, target = "", targetId = "") {
  const project = getActiveProject();
  if (!project) return;
  project.history ??= [];
  project.history.unshift({
    id: crypto.randomUUID(),
    user: getCurrentEventUser(),
    action: cleanUserText(action, 120, "Updated project"),
    target: cleanUserText(target, 120),
    targetId: targetId ? String(targetId) : "",
    at: new Date().toISOString()
  });
  project.history = project.history.slice(0, 300);
}

function addMilestone(rawName, deadline = "") {
  const project = getActiveProject();
  const name = cleanUserText(rawName, 80);
  if (!project || !name) return;
  const before = { milestones: structuredClone(project.milestones || []), history: structuredClone(project.history || []) };
  project.milestones ??= [];
  const milestone = {
    id: crypto.randomUUID(),
    name,
    description: "",
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : "",
    taskIds: [],
    progress: 0,
    status: "planned",
    order: project.milestones.length
  };
  project.milestones.push(milestone);
  logProjectEvent("Milestone created", name, milestone.id);
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, before, {
      milestones: structuredClone(project.milestones),
      history: structuredClone(project.history)
    }, { projectId: project.id, groupKey: `project:${project.id}:milestones` }),
    forceStep: true
  });
  render();
}

function updateMilestone(id, patch) {
  const project = getActiveProject();
  const milestone = project?.milestones?.find((candidate) => candidate.id === id);
  if (!project || !milestone) return;
  const before = { milestones: structuredClone(project.milestones), history: structuredClone(project.history || []) };
  if (Object.prototype.hasOwnProperty.call(patch, "name")) milestone.name = cleanUserText(patch.name, 80, "Milestone");
  if (Object.prototype.hasOwnProperty.call(patch, "description")) milestone.description = String(patch.description || "").slice(0, 2000);
  if (Object.prototype.hasOwnProperty.call(patch, "deadline")) {
    milestone.deadline = /^\d{4}-\d{2}-\d{2}$/.test(patch.deadline || "") ? patch.deadline : "";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    milestone.status = MILESTONE_STATUS_LABELS[patch.status] ? patch.status : "planned";
    if (patch.status === "done") logProjectEvent("Milestone completed", milestone.name, milestone.id);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "taskIds")) {
    const taskIds = new Set((project.tasks || []).map((task) => task.id));
    milestone.taskIds = (Array.isArray(patch.taskIds) ? patch.taskIds : []).filter((taskId) => taskIds.has(taskId));
  }
  normalizeMilestones(project);
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, before, {
      milestones: structuredClone(project.milestones),
      history: structuredClone(project.history || [])
    }, { projectId: project.id, groupKey: `project:${project.id}:milestone:${id}` })
  });
  render();
}

async function deleteMilestone(id) {
  const project = getActiveProject();
  if (!project) return;
  const milestone = project.milestones?.find((candidate) => candidate.id === id);
  if (!milestone || !await confirmDangerousAction(`Delete milestone "${milestone.name}"?`)) return;
  const before = { milestones: structuredClone(project.milestones), history: structuredClone(project.history || []) };
  project.milestones = project.milestones.filter((candidate) => candidate.id !== id);
  logProjectEvent("Milestone deleted", milestone.name, id);
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, before, {
      milestones: structuredClone(project.milestones),
      history: structuredClone(project.history || [])
    }, { projectId: project.id, groupKey: `project:${project.id}:milestones` }),
    forceStep: true
  });
  render();
}

function renderMilestones() {
  const project = getActiveProject();
  milestoneList.innerHTML = "";
  if (!project) return;
  normalizeMilestones(project);
  const milestones = project.milestones || [];
  milestoneCount.textContent = String(milestones.length);
  if (!milestones.length) {
    const empty = document.createElement("p");
    empty.className = "empty-panel-copy";
    empty.textContent = "Add milestones for Prototype, Alpha, Beta, Playtest, Polish, or Release.";
    milestoneList.append(empty);
    return;
  }
  milestones.forEach((milestone) => milestoneList.append(createMilestoneCard(project, milestone)));
}

function createMilestoneCard(project, milestone) {
  const card = document.createElement("article");
  card.className = `milestone-card milestone-${milestone.status}`;
  card.innerHTML = `
    <div class="milestone-card-head">
      <input class="milestone-name-input" value="${escapeHtml(milestone.name)}" aria-label="Milestone name" />
      <button type="button" class="milestone-delete" title="Delete milestone">x</button>
    </div>
    <textarea class="milestone-description" rows="3" placeholder="Description">${escapeHtml(milestone.description || "")}</textarea>
    <div class="milestone-grid">
      <label><span>Deadline</span><input class="milestone-deadline-input" type="date" value="${escapeHtml(milestone.deadline || "")}" /></label>
      <div class="milestone-status-field"><span>Status</span><div class="milestone-status-options" role="group" aria-label="Milestone status">
        ${Object.entries(MILESTONE_STATUS_LABELS).map(([value, label]) => `<button type="button" data-value="${value}" class="milestone-status-${value} ${value === milestone.status ? "active" : ""}">${label}</button>`).join("")}
      </div></div>
    </div>
    <div class="milestone-progress">
      <span>${milestone.progress}%</span>
      <strong><span style="width:${milestone.progress}%"></span></strong>
    </div>
  `;
  card.querySelector(".milestone-name-input").addEventListener("change", (event) => updateMilestone(milestone.id, { name: event.target.value }));
  card.querySelector(".milestone-description").addEventListener("change", (event) => updateMilestone(milestone.id, { description: event.target.value }));
  card.querySelector(".milestone-deadline-input").addEventListener("change", (event) => updateMilestone(milestone.id, { deadline: event.target.value }));
  card.querySelector(".milestone-status-options").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    updateMilestone(milestone.id, { status: button.dataset.value });
  });
  card.querySelector(".milestone-delete").addEventListener("click", () => deleteMilestone(milestone.id));
  return card;
}

function renderProjectHistory() {
  const project = getActiveProject();
  projectHistoryList.innerHTML = "";
  const events = project?.history || [];
  historyCount.textContent = String(events.length);
  if (!project) return;
  if (!events.length) {
    const empty = document.createElement("p");
    empty.className = "empty-panel-copy";
    empty.textContent = "Project events will appear here.";
    projectHistoryList.append(empty);
    return;
  }
  events.slice(0, 80).forEach((event) => {
    const row = document.createElement("article");
    row.className = "history-event";
    const date = new Date(event.at);
    row.innerHTML = `
      <strong>${escapeHtml(event.action)}</strong>
      <span>${escapeHtml(event.target || "Project")}</span>
      <small>${escapeHtml(event.user)} · ${Number.isNaN(date.getTime()) ? "" : date.toLocaleString()}</small>
    `;
    projectHistoryList.append(row);
  });
}

function inferGddSections(project) {
  const storyText = countStoryNodes(project.story || []) ? "See story section tree in FlowBoard." : "";
  const conceptItem = (project.items || []).find((item) => /concept|game|idea|pitch/i.test(`${item.text || ""} ${item.html || ""}`));
  const mechanics = (project.tasks || []).filter((task) => /mechanic|gameplay|combat|movement|enemy|boss/i.test(`${task.title} ${task.description || ""}`));
  const assets = (project.items || []).filter((item) => item.type === "image");
  const characters = typeof normalizeGddCharacters === "function"
    ? normalizeGddCharacters(project.gdd || {})
    : [];
  return {
    gameName: project.name || "Untitled game",
    concept: project.gdd?.concept || conceptItem?.text || conceptItem?.html?.replace(/<[^>]*>/g, " ").trim() || "Define the core concept.",
    genre: project.gdd?.genre || "Define genre",
    story: storyText || "Define story, world, characters, and key beats.",
    characters,
    mechanics: project.gdd?.mechanics
      ? project.gdd.mechanics.split(/\n|,/).map((item) => cleanUserText(item, 120)).filter(Boolean)
      : mechanics.map((task) => task.title),
    objectives: (project.tasks || []).slice(0, 8).map((task) => task.title),
    assets
  };
}

function exportGameDesignDocumentPdf() {
  const project = getExportProject();
  if (!project) return;
  normalizeMilestones(project);
  const gdd = inferGddSections(project);
  const milestones = (project.milestones || []).map((milestone) => `<tr><td>${escapeHtml(milestone.name)}</td><td>${escapeHtml(MILESTONE_STATUS_LABELS[milestone.status] || milestone.status)}</td><td>${escapeHtml(milestone.deadline || "")}</td><td>${milestone.progress}%</td></tr>`).join("");
  const tasks = (project.tasks || []).map((task) => `<tr><td>${escapeHtml(task.title)}</td><td>${escapeHtml(TASK_PRIORITIES[task.priority] || "Medium")}</td><td>${escapeHtml(task.deadline || "")}</td><td>${task.progress || 0}%</td></tr>`).join("");
  const team = (project.teamRoles || []).map((member) => `<tr><td>${escapeHtml(member.name || "Team member")}</td><td>${escapeHtml(member.role || "")}</td><td>${escapeHtml(member.notes || "")}</td></tr>`).join("");
  const characters = gdd.characters.length
    ? gdd.characters.map((character) => `<li><strong>${escapeHtml(character.name)}</strong><br>${escapeHtml(character.story || character.description || "")}</li>`).join("")
    : "<li>Define main characters, enemies, NPCs, and bosses.</li>";
  const totalHours = Number(project.totalHours || 0);
  const hours = getOrderedHourPhases(project).map((phase) => `
    <tr><td><strong>${escapeHtml(phase.title)}</strong></td><td>${phase.percent}%</td><td>${formatHours(hoursFromPercent(totalHours, phase.percent))}h</td></tr>
    ${(phase.tasks || []).map((task) => `<tr><td>&nbsp;&nbsp;${escapeHtml(task.title)}</td><td>${task.percent}%</td><td>${formatHours(hoursFromPercent(totalHours, task.percent))}h</td></tr>`).join("")}
  `).join("");
  openPrintableDocument(`${project.name} GDD`, `
    <h1>${escapeHtml(gdd.gameName)} Game Design Document</h1>
    <p class="muted">Generated ${new Date().toLocaleString()}</p>
    <h2>Concept</h2><p>${escapeHtml(gdd.concept)}</p>
    <h2>Genre</h2><p>${escapeHtml(gdd.genre)}</p>
    <h2>Story</h2><p>${escapeHtml(gdd.story)}</p>
    <h2>Characters</h2><ul>${characters}</ul>
    <h2>Mechanics</h2><ul>${(gdd.mechanics.length ? gdd.mechanics : ["Define mechanics"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h2>Objectives</h2><ul>${(gdd.objectives.length ? gdd.objectives : ["Define project objectives"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h2>Tasks</h2><table><thead><tr><th>Task</th><th>Priority</th><th>Deadline</th><th>Progress</th></tr></thead><tbody>${tasks}</tbody></table>
    <h2>Team</h2><table><thead><tr><th>Name</th><th>Role</th><th>Notes</th></tr></thead><tbody>${team}</tbody></table>
    <h2>Milestones</h2><table><thead><tr><th>Name</th><th>Status</th><th>Deadline</th><th>Progress</th></tr></thead><tbody>${milestones}</tbody></table>
    <h2>Hours plan</h2><table><thead><tr><th>Phase</th><th>Percent</th><th>Hours</th></tr></thead><tbody>${hours}</tbody></table>
    <h2>Assets</h2><p>${gdd.assets.length} image assets linked in the board.</p>
    <h2>Overall progress</h2><p>${getProjectProgress(project)}%</p>
  `);
}

function getProjectProgress(project) {
  const tasks = project.tasks || [];
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((sum, task) => sum + (Number(task.progress) || 0), 0) / tasks.length);
}
