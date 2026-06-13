function countStoryNodes(nodes = []) {
  return nodes.reduce((total, node) => total + 1 + countStoryNodes(node.children || []), 0);
}

function findStoryNode(nodes = [], id) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findStoryNode(node.children || [], id);
    if (child) return child;
  }
  return null;
}

function removeStoryNode(nodes = [], id) {
  const index = nodes.findIndex((node) => node.id === id);
  if (index !== -1) {
    nodes.splice(index, 1);
    return true;
  }
  return nodes.some((node) => removeStoryNode(node.children || [], id));
}

function saveStoryChange(project, beforeStory, groupKey = `project:${project.id}:story`) {
  saveState({
    historyEntry: createHistoryCommand(
      "updateProject",
      project.id,
      { story: beforeStory },
      { story: structuredClone(project.story) },
      { projectId: project.id, groupKey }
    ),
    forceStep: true
  });
}

function addStoryNode(parentId, rawTitle) {
  const project = getActiveProject();
  if (!project) return;
  project.story ??= [];
  const title = String(rawTitle || "").trim() || "New story section";
  const beforeStory = structuredClone(project.story);
  const node = {
    id: crypto.randomUUID(),
    title,
    notes: "",
    children: []
  };

  if (parentId) {
    const parent = findStoryNode(project.story, parentId);
    if (!parent) return;
    parent.children ??= [];
    parent.children.push(node);
  } else {
    project.story.push(node);
  }

  saveStoryChange(project, beforeStory);
  renderStory();
}

function updateStoryNode(id, patch) {
  const project = getActiveProject();
  if (!project) return;
  const node = findStoryNode(project.story || [], id);
  if (!node) return;
  const beforeStory = structuredClone(project.story);
  Object.assign(node, patch);
  saveStoryChange(project, beforeStory, `project:${project.id}:story:${id}`);
}

function deleteStoryNode(id) {
  const project = getActiveProject();
  if (!project) return;
  const beforeStory = structuredClone(project.story || []);
  if (!removeStoryNode(project.story, id)) return;
  saveStoryChange(project, beforeStory);
  renderStory();
}

function renderStory() {
  const project = getActiveProject();
  storyTree.innerHTML = "";
  const nodes = project?.story || [];
  storyCount.textContent = String(countStoryNodes(nodes));
  if (!project) return;
  if (!nodes.length) {
    const empty = document.createElement("p");
    empty.className = "empty-panel-copy";
    empty.textContent = "Create the first division for the story.";
    storyTree.append(empty);
    return;
  }
  renderStoryNodes(nodes, storyTree, 0);
}

function renderStoryNodes(nodes, container, depth) {
  nodes.forEach((node) => {
    const article = document.createElement("article");
    article.className = "story-node";
    article.style.setProperty("--depth", String(depth));

    const head = document.createElement("div");
    head.className = "story-node-head";

    const title = document.createElement("input");
    title.className = "story-node-title";
    title.value = node.title || "";
    title.placeholder = "Story division";
    title.addEventListener("change", () => updateStoryNode(node.id, { title: title.value.trim() || "Story section" }));

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "small story-sub-button";
    addButton.textContent = "+ sub";
    addButton.title = "Add subdivision";
    addButton.addEventListener("click", () => addStoryNode(node.id, "New subdivision"));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "small delete-task";
    deleteButton.textContent = "x";
    deleteButton.title = "Remove section";
    deleteButton.addEventListener("click", () => deleteStoryNode(node.id));

    head.append(title, addButton, deleteButton);

    const notes = document.createElement("textarea");
    notes.className = "story-node-notes";
    notes.rows = 3;
    notes.placeholder = "Story beats, characters, quests, cutscenes...";
    notes.value = node.notes || "";
    notes.addEventListener("change", () => updateStoryNode(node.id, { notes: notes.value }));

    const children = document.createElement("div");
    children.className = "story-node-children";
    renderStoryNodes(node.children || [], children, depth + 1);

    article.append(head, notes, children);
    container.append(article);
  });
}

function saveTeamChange(project, beforeRoles, groupKey = `project:${project.id}:teamRoles`) {
  saveState({
    historyEntry: createHistoryCommand(
      "updateProject",
      project.id,
      { teamRoles: beforeRoles },
      { teamRoles: structuredClone(project.teamRoles) },
      { projectId: project.id, groupKey }
    ),
    forceStep: true
  });
}

function addTeamRole(rawName, rawRole) {
  const project = getActiveProject();
  if (!project) return;
  const role = rawRole.trim();
  const name = rawName.trim();
  if (!name && !role) return;
  project.teamRoles ??= [];
  const beforeRoles = structuredClone(project.teamRoles);
  project.teamRoles.push({
    id: crypto.randomUUID(),
    name: name || "Team member",
    role: role || "Role",
    notes: ""
  });
  saveTeamChange(project, beforeRoles);
  renderTeamRoles();
}

function updateTeamRole(id, patch) {
  const project = getActiveProject();
  if (!project) return;
  const member = (project.teamRoles || []).find((candidate) => candidate.id === id);
  if (!member) return;
  const beforeRoles = structuredClone(project.teamRoles);
  Object.assign(member, patch);
  saveTeamChange(project, beforeRoles, `project:${project.id}:teamRole:${id}`);
}

function deleteTeamRole(id) {
  const project = getActiveProject();
  if (!project) return;
  const beforeRoles = structuredClone(project.teamRoles || []);
  project.teamRoles = (project.teamRoles || []).filter((member) => member.id !== id);
  saveTeamChange(project, beforeRoles);
  renderTeamRoles();
}

function renderTeamRoles() {
  const project = getActiveProject();
  teamRoleList.innerHTML = "";
  const members = project?.teamRoles || [];
  teamCount.textContent = String(members.length);
  if (!project) return;
  if (!members.length) {
    const empty = document.createElement("p");
    empty.className = "empty-panel-copy";
    empty.textContent = "Add roles for design, art, code, audio, QA, production...";
    teamRoleList.append(empty);
    return;
  }

  members.forEach((member) => {
    const row = document.createElement("article");
    row.className = "team-role-card";

    const head = document.createElement("div");
    head.className = "team-role-head";

    const name = document.createElement("input");
    name.value = member.name || "";
    name.placeholder = "Name";
    name.addEventListener("change", () => updateTeamRole(member.id, { name: name.value.trim() || "Team member" }));

    const role = document.createElement("input");
    role.value = member.role || "";
    role.placeholder = "Role";
    role.addEventListener("change", () => updateTeamRole(member.id, { role: role.value.trim() || "Role" }));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "small delete-task";
    deleteButton.textContent = "x";
    deleteButton.title = "Remove role";
    deleteButton.addEventListener("click", () => deleteTeamRole(member.id));

    head.append(name, role, deleteButton);

    const notes = document.createElement("textarea");
    notes.rows = 3;
    notes.placeholder = "Responsibilities, tasks, ownership...";
    notes.value = member.notes || "";
    notes.addEventListener("change", () => updateTeamRole(member.id, { notes: notes.value }));

    row.append(head, notes);
    teamRoleList.append(row);
  });
}
