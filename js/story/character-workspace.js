const characterWorkspaceForm = document.querySelector("#character-workspace-form");
const characterWorkspaceName = document.querySelector("#character-workspace-name");
const characterWorkspaceList = document.querySelector("#character-workspace-list");

function normalizeCharacterWorkspaces(project) {
  const source = project?.gdd?.characters;
  const legacy = typeof source === "string" && source.trim()
    ? [{ name: "Character", description: source }]
    : Array.isArray(source) ? source : [];
  return legacy.map((character) => ({
    id: character.id || crypto.randomUUID(),
    name: cleanUserText(character.name, 100, "Character"),
    image: String(character.image || ""),
    story: String(character.story || character.description || "").slice(0, 5000),
    personality: String(character.personality || "").slice(0, 3000),
    abilities: String(character.abilities || "").slice(0, 3000),
    notes: String(character.notes || "").slice(0, 5000),
    linkedItemIds: (Array.isArray(character.linkedItemIds) ? character.linkedItemIds : []).map(String).slice(0, 50)
  }));
}

function saveCharacterWorkspaces(project, before, groupKey) {
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, { gdd: before }, { gdd: structuredClone(project.gdd) }, {
      projectId: project.id,
      groupKey
    })
  });
}

function addCharacterWorkspace(name) {
  const project = getActiveProject();
  if (!project) return;
  project.gdd ??= {};
  const before = structuredClone(project.gdd);
  project.gdd.characters = normalizeCharacterWorkspaces(project);
  project.gdd.characters.push({
    id: crypto.randomUUID(), name: cleanUserText(name, 100, "New character"), image: "",
    story: "", personality: "", abilities: "", notes: "", linkedItemIds: []
  });
  saveCharacterWorkspaces(project, before, `project:${project.id}:characters`);
  renderCharacterWorkspaces();
  renderStory();
}

function updateCharacterWorkspace(id, patch) {
  const project = getActiveProject();
  if (!project) return;
  const characters = normalizeCharacterWorkspaces(project);
  const character = characters.find((entry) => entry.id === id);
  if (!character) return;
  const before = structuredClone(project.gdd || {});
  Object.assign(character, patch);
  character.name = cleanUserText(character.name, 100, "Character");
  project.gdd.characters = characters;
  saveCharacterWorkspaces(project, before, `project:${project.id}:character:${id}`);
  if (Object.prototype.hasOwnProperty.call(patch, "linkedItemIds")) renderWorkspace();
  renderStory();
}

async function deleteCharacterWorkspace(id) {
  const project = getActiveProject();
  if (!project || !await confirmDangerousAction("Delete this character design?")) return;
  const before = structuredClone(project.gdd || {});
  project.gdd.characters = normalizeCharacterWorkspaces(project).filter((entry) => entry.id !== id);
  saveCharacterWorkspaces(project, before, `project:${project.id}:characters`);
  renderCharacterWorkspaces();
  renderStory();
}

async function importCharacterImage(id, file) {
  if (!file?.type?.startsWith("image/")) return;
  try {
    const imported = await prepareImportedImage(file);
    let src = imported.src;
    try { src = await uploadImportedImageToStorage(imported, file) || src; } catch {}
    updateCharacterWorkspace(id, { image: src });
    renderCharacterWorkspaces();
  } catch {
    window.alert("Could not import that character image.");
  }
}

function renderCharacterWorkspaces() {
  if (!characterWorkspaceList) return;
  const project = getActiveProject();
  characterWorkspaceList.innerHTML = "";
  if (!project) return;
  project.gdd ??= {};
  project.gdd.characters = normalizeCharacterWorkspaces(project);
  if (!project.gdd.characters.length) {
    characterWorkspaceList.innerHTML = '<p class="empty-panel-copy">Create a character to start its design document.</p>';
    return;
  }
  project.gdd.characters.forEach((character) => {
    const card = document.createElement("article");
    card.className = "character-workspace-card";
    card.dataset.characterId = character.id;
    const linked = new Set(character.linkedItemIds || []);
    const options = (project.items || []).filter((item) =>
      item.type !== "image" || item.levelWorkspaceId || item.boardRole === "level-preview"
    ).map((item) =>
      `<label><input type="checkbox" value="${escapeHtml(item.id)}" ${linked.has(item.id) ? "checked" : ""}> ${escapeHtml(getBoardItemName(item))}</label>`
    ).join("");
    card.innerHTML = `
      <div class="character-workspace-head">
        <input class="character-name" maxlength="100" value="${escapeHtml(character.name)}" aria-label="Character name">
        <button class="character-delete small delete-task" type="button" title="Delete character">x</button>
      </div>
      <div class="character-image-box" tabindex="0" title="Click here, then paste an image">${character.image ? `<img src="${escapeHtml(character.image)}" alt="${escapeHtml(character.name)}">` : '<span>No image yet. Click here and paste.</span>'}</div>
      <label class="character-image-action">Paste or choose image<input class="character-image-input" type="file" accept="image/*"></label>
      <label>Story<textarea data-field="story" rows="4" placeholder="Origin, arc, relationships...">${escapeHtml(character.story)}</textarea></label>
      <label>Personality<textarea data-field="personality" rows="3" placeholder="Traits, motives, fears...">${escapeHtml(character.personality)}</textarea></label>
      <label>Abilities<textarea data-field="abilities" rows="3" placeholder="Skills, powers, limits...">${escapeHtml(character.abilities)}</textarea></label>
      <label>Notes<textarea data-field="notes" rows="3" placeholder="Animation, sprites, sound, references...">${escapeHtml(character.notes)}</textarea></label>
      <details class="character-links"><summary>Connected boards and notes (${linked.size})</summary><div>${options || '<p class="muted">Add a board or note to the main canvas first.</p>'}</div></details>`;
    card.querySelector(".character-name").addEventListener("change", (event) => updateCharacterWorkspace(character.id, { name: event.target.value }));
    card.querySelector(".character-delete").addEventListener("click", () => deleteCharacterWorkspace(character.id));
    card.querySelector(".character-image-input").addEventListener("change", (event) => importCharacterImage(character.id, event.target.files[0]));
    card.querySelector(".character-image-box").addEventListener("paste", (event) => {
      const file = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"))?.getAsFile();
      if (file) { event.preventDefault(); event.stopPropagation(); importCharacterImage(character.id, file); }
    });
    card.querySelectorAll("textarea[data-field]").forEach((field) => field.addEventListener("change", () => updateCharacterWorkspace(character.id, { [field.dataset.field]: field.value })));
    card.querySelectorAll('.character-links input[type="checkbox"]').forEach((box) => box.addEventListener("change", () => {
      const ids = [...card.querySelectorAll('.character-links input:checked')].map((input) => input.value);
      updateCharacterWorkspace(character.id, { linkedItemIds: ids });
    }));
    characterWorkspaceList.append(card);
  });
}

function focusCharacterWorkspace(characterId) {
  window.requestAnimationFrame(() => {
    const card = characterWorkspaceList?.querySelector(`[data-character-id="${CSS.escape(characterId)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("link-focus-pulse");
    window.setTimeout(() => card.classList.remove("link-focus-pulse"), 1800);
  });
}

function initializeCharacterWorkspaces() {
  characterWorkspaceForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    addCharacterWorkspace(characterWorkspaceName.value);
    characterWorkspaceName.value = "";
  });
}
