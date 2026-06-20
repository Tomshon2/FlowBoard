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

function saveGddFields() {
  const project = getActiveProject();
  if (!project) return;
  const before = { gdd: structuredClone(project.gdd || {}) };
  const nextGdd = {
    ...(project.gdd || {}),
    concept: String(gddConcept.value || "").slice(0, 3000),
    genre: cleanUserText(gddGenre.value, 120, "")
  };
  project.gdd = nextGdd;
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, before, {
      gdd: structuredClone(project.gdd)
    }, { projectId: project.id, groupKey: `project:${project.id}:gdd` })
  });
}

function addStoryNode(parentId, rawTitle) {
  const project = getActiveProject();
  if (!project || isGameJamProject(project)) return;
  project.story ??= [];
  const title = cleanUserText(rawTitle, 100, "New story section");
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
  if (!project || isGameJamProject(project)) return;
  const node = findStoryNode(project.story || [], id);
  if (!node) return;
  const beforeStory = structuredClone(project.story);
  if (Object.prototype.hasOwnProperty.call(patch, "title")) node.title = cleanUserText(patch.title, 100, "Story section");
  if (Object.prototype.hasOwnProperty.call(patch, "notes")) node.notes = String(patch.notes || "").slice(0, 5000);
  saveStoryChange(project, beforeStory, `project:${project.id}:story:${id}`);
}

async function deleteStoryNode(id) {
  const project = getActiveProject();
  if (!project || isGameJamProject(project)) return;
  if (!await confirmDangerousAction("Delete this story section and its subdivisions?")) return;
  const beforeStory = structuredClone(project.story || []);
  if (!removeStoryNode(project.story, id)) return;
  saveStoryChange(project, beforeStory);
  renderStory();
}

function renderStory() {
  const project = getActiveProject();
  storyTree.innerHTML = "";
  const nodes = project?.story || [];
  storyCount.textContent = isGameJamProject(project) ? "0" : String(countStoryNodes(nodes));
  if (!project) return;
  project.gdd ??= {};
  gddConcept.value = project.gdd.concept || "";
  gddGenre.value = project.gdd.genre || "";
  if (isGameJamProject(project)) return;
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
    title.addEventListener("change", () => updateStoryNode(node.id, { title: title.value }));

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
