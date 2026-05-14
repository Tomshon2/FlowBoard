const ACCESS_CODE = "equipa2026";
const STORAGE_KEY = "flowboard-state-v2";
const supabaseConfig = window.FLOWBOARD_SUPABASE || {};
const onlineMode = Boolean(
  window.supabase &&
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  !supabaseConfig.url.includes("PASTE_YOUR") &&
  !supabaseConfig.anonKey.includes("PASTE_YOUR")
);

const db = onlineMode ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey) : null;
let currentUser = null;
let currentWorkspaceId = null;
let realtimeChannel = null;
let saveTimer = null;
let applyingRemoteState = false;

const ticketColors = [
  "#fff1b8", "#f6b7d8", "#b987f4", "#7dc7ff", "#71d694", "#ffb15f",
  "#ffffff", "#d9f99d", "#a7f3d0", "#bae6fd", "#c7d2fe", "#fecaca",
  "#fef3c7", "#e5e7eb", "#1d2733"
];

const timePlan = [
  {
    title: "Pre production",
    percent: 14,
    color: "#d94a2b",
    tasks: [
      { title: "Brainstorming Ideas", percent: 5.5 },
      { title: "Concept Art and Style Guide", percent: 8.5 }
    ]
  },
  {
    title: "Prototype",
    percent: 14,
    color: "#e5549f",
    tasks: [
      { title: "Build Game Prototype", percent: 10 },
      { title: "Define Scope", percent: 4 }
    ]
  },
  {
    title: "Production",
    percent: 21,
    color: "#8f2bd5",
    tasks: [
      { title: "Level Design", percent: 6 },
      { title: "Art Production", percent: 10 },
      { title: "Programming Features", percent: 5 }
    ]
  },
  {
    title: "Gameplay Refinement and Iteration",
    percent: 21,
    color: "#2074b4",
    tasks: [
      { title: "Polishing Mechanics", percent: 8 },
      { title: "Audio Integration", percent: 7 },
      { title: "Additional Levels or Features", percent: 6 }
    ]
  },
  {
    title: "Finalization and Testing",
    percent: 21,
    color: "#03943a",
    tasks: [
      { title: "Bug Fixing", percent: 9 },
      { title: "Visual and Audio Enhancements", percent: 7 },
      { title: "Final Level Design", percent: 5 }
    ]
  },
  {
    title: "Polish, Build, and Submit",
    percent: 9,
    color: "#f57a00",
    tasks: [
      { title: "Final Polish", percent: 4 },
      { title: "Game Build", percent: 3 },
      { title: "Submission", percent: 2 }
    ]
  }
];

const defaultState = {
  activeProjectId: "project-1",
  projects: [
    {
      id: "project-1",
      name: "Projeto exemplo",
      totalHours: 40,
      tasks: [
        { id: "task-1", title: "Definir objetivo do sprint", done: false },
        { id: "task-2", title: "Rever imagens e referencias", done: true }
      ],
      items: [
        { id: "item-1", type: "ticket", x: 72, y: 70, width: 230, height: 140, text: "Board: criar wireframe inicial", color: "#fff1b8" },
        { id: "item-2", type: "ticket", x: 330, y: 150, width: 260, height: 150, text: "Board: dividir entregas por blocos de foco", color: "#71d694" }
      ],
      connections: [{ id: "conn-1", from: "item-1", to: "item-2", fromSide: "bottom", toSide: "top", axis: "y", bend: 220 }]
    }
  ]
};

let state = loadState();
let boardZoom = 1;
let boardPan = { x: 0, y: 0 };
let lastBoardPoint = { x: 140, y: 140 };
let copiedBoardItem = null;
let selectedBoardItemId = null;
let selectedItemIds = new Set();
let selectedConnectionIds = new Set();
let renamingProjectId = null;
let interactionLock = false;
let activeResizeId = null;
let activeConnectionDrag = null;
const connectionDotSides = ["top", "right", "bottom", "left"];

const authScreen = document.querySelector("#auth-screen");
const app = document.querySelector("#app");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const loginLabel = document.querySelector("#login-label");
const loginEmail = document.querySelector("#login-email");
const signupBtn = document.querySelector("#signup-btn");
const projectsList = document.querySelector("#projects-list");
const projectForm = document.querySelector("#project-form");
const projectName = document.querySelector("#project-name");
const activeProjectTitle = document.querySelector("#active-project-title");
const board = document.querySelector("#board");
const boardContent = document.querySelector("#board-content");
const connectionsLayer = document.querySelector("#connections-layer");
const zoomIndicator = document.querySelector("#zoom-indicator");
const taskForm = document.querySelector("#task-form");
const taskTitle = document.querySelector("#task-title");
const tasksList = document.querySelector("#tasks-list");
const taskCount = document.querySelector("#task-count");
const imageInput = document.querySelector("#image-input");
const projectHours = document.querySelector("#project-hours");
const hoursTotalLabel = document.querySelector("#hours-total-label");
const hoursTable = document.querySelector("#hours-table");
const hoursPanel = document.querySelector("#hours-panel");
const tasksPanel = document.querySelector("#tasks-panel");
const toggleHours = document.querySelector("#toggle-hours");
const toggleTasks = document.querySelector("#toggle-tasks");
const workspaceDrawerToggle = document.querySelector("#workspace-drawer-toggle");
const hoursDrawerToggle = document.querySelector("#hours-drawer-toggle");
const tasksDrawerToggle = document.querySelector("#tasks-drawer-toggle");
const closeWorkspaceDrawer = document.querySelector("#close-workspace-drawer");
const closeSideDrawer = document.querySelector("#close-side-drawer");
const projectsDrawer = document.querySelector("#projects-drawer");
const sideDrawer = document.querySelector("#side-drawer");
let activeSidePanel = "hours";
sideDrawer.dataset.mode = activeSidePanel;

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (onlineMode) {
    signInOnline();
  } else {
    const code = document.querySelector("#access-code").value.trim();
    if (code !== ACCESS_CODE) {
      loginError.textContent = "Codigo incorreto.";
      return;
    }
    sessionStorage.setItem("flowboard-auth", "true");
    showApp();
  }
});

signupBtn.addEventListener("click", () => signUpOnline());

document.querySelector("#logout-btn").addEventListener("click", () => {
  signOut();
});

projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = projectName.value.trim();
  if (!name) return;
  const project = {
    id: crypto.randomUUID(),
    name,
    totalHours: 40,
    tasks: [],
    items: [],
    connections: []
  };
  state.projects.push(project);
  state.activeProjectId = project.id;
  projectName.value = "";
  saveAndRender();
});

document.querySelector("#add-ticket-btn").addEventListener("click", () => addBoardItem("ticket"));

imageInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  addImageFile(file, lastBoardPoint);
  imageInput.value = "";
});

board.addEventListener("wheel", handleBoardWheel, { passive: false });
board.addEventListener("dragover", (event) => {
  event.preventDefault();
  board.classList.add("drag-over");
  lastBoardPoint = getBoardPoint(event);
});
board.addEventListener("dragleave", () => board.classList.remove("drag-over"));
board.addEventListener("drop", handleBoardDrop);
board.addEventListener("pointermove", (event) => {
  lastBoardPoint = getBoardPoint(event);
  updateNearbyConnectionDots(lastBoardPoint);
});
board.addEventListener("pointerleave", () => clearNearbyConnectionDots());
board.addEventListener("pointerdown", startBoardPan);
document.addEventListener("paste", handlePaste);
document.addEventListener("copy", handleCopy);
document.addEventListener("keydown", handleGlobalKeydown);

document.querySelector("#save-hours-btn").addEventListener("click", saveProjectHours);
projectHours.addEventListener("change", saveProjectHours);
toggleHours.addEventListener("click", () => togglePanel(hoursPanel, toggleHours));
toggleTasks.addEventListener("click", () => togglePanel(tasksPanel, toggleTasks));
workspaceDrawerToggle.addEventListener("click", () => toggleDrawer("workspace"));
hoursDrawerToggle.addEventListener("click", () => toggleSidePanel("hours"));
tasksDrawerToggle.addEventListener("click", () => toggleSidePanel("tasks"));
closeWorkspaceDrawer.addEventListener("click", () => closeDrawer("workspace"));
closeSideDrawer.addEventListener("click", () => closeDrawer("side"));

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const project = getActiveProject();
  const title = taskTitle.value.trim();
  if (!project || !title) return;
  project.tasks.push({ id: crypto.randomUUID(), title, done: false });
  taskTitle.value = "";
  saveAndRender();
});

initializeApp();

function showApp() {
  authScreen.classList.add("hidden");
  app.classList.remove("hidden");
  normalizeState();
  render();
}

async function initializeApp() {
  setupAuthUi();
  normalizeState();

  if (!onlineMode) {
    if (sessionStorage.getItem("flowboard-auth") === "true") {
      showApp();
    } else {
      render();
    }
    return;
  }

  const { data } = await db.auth.getSession();
  currentUser = data.session?.user || null;
  if (!currentUser) {
    authScreen.classList.remove("hidden");
    app.classList.add("hidden");
    render();
    return;
  }

  await loadOnlineWorkspace();
  showApp();
}

function setupAuthUi() {
  if (!onlineMode) return;
  loginLabel.textContent = "Login da equipa";
  loginEmail.classList.remove("hidden");
  signupBtn.classList.remove("hidden");
  document.querySelector("#access-code").placeholder = "password";
}

async function signInOnline() {
  loginError.textContent = "";
  const email = loginEmail.value.trim();
  const password = document.querySelector("#access-code").value;
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = error.message;
    return;
  }
  currentUser = data.user;
  await loadOnlineWorkspace();
  showApp();
}

async function signUpOnline() {
  loginError.textContent = "";
  const email = loginEmail.value.trim();
  const password = document.querySelector("#access-code").value;
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) {
    loginError.textContent = error.message;
    return;
  }
  currentUser = data.user;
  loginError.textContent = data.session ? "" : "Conta criada. Confirma o email se o Supabase pedir.";
  if (data.session) {
    await loadOnlineWorkspace();
    showApp();
  }
}

async function signOut() {
  if (onlineMode) {
    await saveStateRemoteNow();
    if (realtimeChannel) db.removeChannel(realtimeChannel);
    realtimeChannel = null;
    currentWorkspaceId = null;
    currentUser = null;
    await db.auth.signOut();
  } else {
    sessionStorage.removeItem("flowboard-auth");
  }
  authScreen.classList.remove("hidden");
  app.classList.add("hidden");
}

async function loadOnlineWorkspace() {
  const { data: memberships, error: membershipError } = await db
    .from("workspace_members")
    .select("workspace_id, role")
    .limit(1);

  if (membershipError) {
    loginError.textContent = membershipError.message;
    return;
  }

  if (!memberships.length) {
    await createOnlineWorkspace();
  } else {
    currentWorkspaceId = memberships[0].workspace_id;
  }

  const { data: workspace, error } = await db
    .from("workspaces")
    .select("id, state")
    .eq("id", currentWorkspaceId)
    .single();

  if (error) {
    loginError.textContent = error.message;
    return;
  }

  applyingRemoteState = true;
  state = workspace.state?.projects ? workspace.state : structuredClone(defaultState);
  normalizeState();
  applyingRemoteState = false;
  subscribeToWorkspace();
}

async function createOnlineWorkspace() {
  const { data: workspace, error } = await db
    .from("workspaces")
    .insert({
      name: supabaseConfig.workspaceName || "FlowBoard Team",
      owner_id: currentUser.id,
      state
    })
    .select("id")
    .single();

  if (error) {
    loginError.textContent = error.message;
    return;
  }

  currentWorkspaceId = workspace.id;
  const { error: memberError } = await db
    .from("workspace_members")
    .insert({ workspace_id: currentWorkspaceId, user_id: currentUser.id, role: "owner" });

  if (memberError) loginError.textContent = memberError.message;
}

function subscribeToWorkspace() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  realtimeChannel = db
    .channel(`workspace-${currentWorkspaceId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "workspaces", filter: `id=eq.${currentWorkspaceId}` },
      (payload) => {
        if (!payload.new?.state || applyingRemoteState) return;
        if (interactionLock) return;
        applyingRemoteState = true;
        state = payload.new.state;
        normalizeState();
        render();
        applyingRemoteState = false;
      }
    )
    .subscribe();
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState() {
  state.projects.forEach((project) => {
    project.totalHours ??= project.timerMinutes ? project.timerMinutes / 60 : 40;
    project.connections ??= [];
    project.items = (project.items || []).map((item) => ({
      ...item,
      type: item.type === "note" ? "ticket" : item.type,
      color: item.color || ticketColors[0],
      html: item.html || escapeHtml(item.text || ""),
      width: item.width || (item.type === "image" ? 260 : 210),
      height: item.height || (item.type === "image" ? 220 : 140)
    }));
  });
}

function saveState() {
  if (interactionLock) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueRemoteSave();
}

function commitState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueRemoteSave();
}

function queueRemoteSave() {
  if (!onlineMode || !currentWorkspaceId || applyingRemoteState) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveStateRemoteNow();
  }, 650);
}

async function saveStateRemoteNow() {
  if (!onlineMode || !currentWorkspaceId || applyingRemoteState) return;
  window.clearTimeout(saveTimer);
  saveTimer = null;
  const { error } = await db
    .from("workspaces")
    .update({ state })
    .eq("id", currentWorkspaceId);
  if (error) console.warn("FlowBoard online save failed:", error.message);
}

function saveAndRender() {
  saveState();
  render();
}

function getActiveProject() {
  return state.projects.find((project) => project.id === state.activeProjectId);
}

function render() {
  renderProjects();
  renderWorkspace();
  renderTasks();
  renderHours();
  renderZoom();
  syncDrawerButtons();
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
        persistAllVisibleItemSizes();
        state.activeProjectId = project.id;
        selectedItemIds.clear();
        clearConnectionDragUi();
        saveAndRender();
      });
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-project";
    deleteButton.title = "Apagar projeto";
    deleteButton.textContent = "x";
    deleteButton.addEventListener("click", () => deleteProject(project.id));

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "rename-project";
    renameButton.title = "Renomear projeto";
    renameButton.textContent = "rename";
    renameButton.addEventListener("click", (event) => {
      event.stopPropagation();
      renameProject(project.id);
    });

    row.append(selectButton, renameButton, deleteButton);
    projectsList.append(row);
  });
}

function renderWorkspace() {
  const project = getActiveProject();
  activeProjectTitle.textContent = project?.name || "Sem projeto";
  boardContent.querySelectorAll(".board-item").forEach((item) => item.remove());
  connectionsLayer.innerHTML = "";
  if (!project) return;

  renderConnections(project);

  project.items.forEach((item) => {
    const node = document.createElement("article");
    node.className = `board-item ${item.type}`;
    node.style.left = `${item.x}px`;
    node.style.top = `${item.y}px`;
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
    node.style.background = item.type === "ticket" ? item.color : "#ffffff";
    node.dataset.id = item.id;
    node.classList.toggle("multi-selected", selectedItemIds.has(item.id));
    node.addEventListener("pointerdown", (event) => {
      selectedBoardItemId = item.id;
      if (event.target.closest(".resize-grip")) return;
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        toggleItemSelection(item.id);
        return;
      }
      if (isBoardDragBlocked(event.target)) {
        selectedItemIds = new Set([item.id]);
        selectedConnectionIds.clear();
        renderSelectionClasses();
        return;
      }
      selectedItemIds = new Set([item.id]);
      selectedConnectionIds.clear();
      renderSelectionClasses();
      startDrag(event, item.id);
    }, true);

    const toolbar = document.createElement("div");
    toolbar.className = "item-toolbar";
    toolbar.innerHTML = item.type === "image" ? "" : `<span class="item-title">Board</span>`;

    const actions = document.createElement("div");
    actions.className = "ticket-actions";
    if (item.type === "ticket") {
      const colorToggle = document.createElement("button");
      colorToggle.type = "button";
      colorToggle.className = "color-toggle";
      colorToggle.title = "Abrir cores";
      colorToggle.textContent = "Cores";
      colorToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
      colorToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        node.classList.toggle("colors-open");
      });
      actions.append(colorToggle);

      const textToggle = document.createElement("button");
      textToggle.type = "button";
      textToggle.className = "format-toggle";
      textToggle.title = "Abrir estilos";
      textToggle.textContent = "Texto";
      textToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
      textToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        node.classList.toggle("format-open");
      });
      actions.append(textToggle);
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-item";
    deleteButton.title = "Remover";
    deleteButton.textContent = "x";
    deleteButton.addEventListener("pointerdown", (event) => event.stopPropagation());
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      removeBoardItem(item.id);
    });
    actions.append(deleteButton);
    toolbar.append(actions);
    node.append(toolbar);

    if (item.type === "ticket") {
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
        swatch.title = "Mudar cor";
        swatch.style.background = color;
        swatch.addEventListener("pointerdown", (event) => event.stopPropagation());
        swatch.addEventListener("click", (event) => {
          event.stopPropagation();
          item.color = color;
          saveAndRender();
        });
        palette.append(swatch);
      });

      const colorPicker = document.createElement("input");
      colorPicker.type = "color";
      colorPicker.className = "color-picker";
      colorPicker.title = "Escolher cor";
      colorPicker.value = normalizeHexColor(item.color);
      colorPicker.addEventListener("pointerdown", (event) => event.stopPropagation());
      colorPicker.addEventListener("click", (event) => event.stopPropagation());
      colorPicker.addEventListener("input", (event) => {
        item.color = event.target.value;
        node.style.background = item.color;
        hexInput.value = item.color;
        saveState();
      });

      const hexInput = document.createElement("input");
      hexInput.type = "text";
      hexInput.className = "hex-input";
      hexInput.value = normalizeHexColor(item.color);
      hexInput.maxLength = 7;
      hexInput.title = "Codigo HEX";
      hexInput.addEventListener("pointerdown", (event) => event.stopPropagation());
      hexInput.addEventListener("click", (event) => event.stopPropagation());
      hexInput.addEventListener("input", (event) => {
        const value = normalizeHexInput(event.target.value);
        if (!isValidHex(value)) return;
        item.color = value;
        node.style.background = item.color;
        colorPicker.value = item.color;
        event.target.value = item.color;
        saveState();
      });
      palette.append(colorPicker, hexInput);
      node.append(palette);
    }

    if (item.type === "image") {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.text || "Imagem importada";
      img.draggable = false;
      node.append(img);
    }

    const text = document.createElement("div");
    text.className = `item-text ${item.type === "image" ? "image-caption" : ""}`;
    text.contentEditable = "true";
    text.dataset.placeholder = item.type === "ticket" ? "Descreve o board" : "Escreve uma legenda";
    text.innerHTML = item.type === "ticket" ? (item.html || escapeHtml(item.text || "")) : escapeHtml(item.text || "");
    text.addEventListener("pointerdown", (event) => {
      selectedBoardItemId = item.id;
      event.stopPropagation();
    });
    text.addEventListener("input", () => {
      item.html = sanitizeEditableHtml(text.innerHTML);
      item.text = text.textContent;
      saveState();
    });
    node.append(text);

    const resizeGrip = document.createElement("div");
    resizeGrip.className = "resize-grip";
    resizeGrip.title = "Redimensionar";
    const beginResize = (event) => startItemResize(event, node, item, project);
    resizeGrip.addEventListener("pointerdown", beginResize, true);
    resizeGrip.addEventListener("mousedown", beginResize, true);
    node.append(resizeGrip);
    node.append(createConnectionDots(item));

    boardContent.append(node);
    node.addEventListener("dragstart", (event) => event.preventDefault());
    node.addEventListener("pointerup", () => persistItemSize(node, item));
  });
}

function createConnectionDots(item) {
  const dots = document.createElement("div");
  dots.className = "connection-dots";
  dots.setAttribute("aria-hidden", "true");

  connectionDotSides.forEach((side) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `connection-dot connection-dot-${side}`;
    dot.title = "Arrastar para ligar";
    dot.dataset.side = side;
    dot.addEventListener("pointerdown", (event) => startNewConnectionDrag(event, item.id, side));
    dots.append(dot);
  });

  return dots;
}

function renderConnections(project) {
  const ticketMap = new Map(project.items.map((item) => [item.id, item]));
  project.connections = project.connections.filter((connection) => ticketMap.has(connection.from) && ticketMap.has(connection.to));
  ensureArrowMarker();

  project.connections.forEach((connection) => {
    const from = ticketMap.get(connection.from);
    const to = ticketMap.get(connection.to);
    if (!from || !to) return;

    const selectedConnection = selectedConnectionIds.has(connection.id);
    const route = getConnectionRoute(connection, from, to);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", route.path);
    path.setAttribute("class", `connection-line ${selectedConnection ? "selected-connection" : ""}`);
    path.dataset.id = connection.id;
    path.setAttribute("marker-end", "url(#arrow-head)");
    path.addEventListener("pointerdown", (event) => event.stopPropagation());
    path.addEventListener("click", (event) => handleConnectionSelection(event, connection.id));
    connectionsLayer.append(path);

    const fromHandle = createConnectionEndpoint(route.start.x, route.start.y, `connection-endpoint from-endpoint ${selectedConnection ? "selected-connection-control" : ""}`);
    fromHandle.addEventListener("pointerdown", (event) => startConnectionEndpointDrag(event, project, connection, from, "fromSide"));
    connectionsLayer.append(fromHandle);

    const toHandle = createConnectionEndpoint(route.end.x, route.end.y, `connection-endpoint to-endpoint ${selectedConnection ? "selected-connection-control" : ""}`);
    toHandle.addEventListener("pointerdown", (event) => startConnectionEndpointDrag(event, project, connection, to, "toSide"));
    connectionsLayer.append(toHandle);

    const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    handle.setAttribute("cx", String(route.handleX));
    handle.setAttribute("cy", String(route.handleY));
    handle.setAttribute("r", "8");
    handle.setAttribute("class", `connection-handle ${selectedConnection ? "selected-connection-control" : ""}`);
    handle.addEventListener("pointerdown", (event) => startConnectionBendDrag(event, project, connection));
    connectionsLayer.append(handle);
  });
}

function createConnectionEndpoint(x, y, className) {
  const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  handle.setAttribute("cx", String(x));
  handle.setAttribute("cy", String(y));
  handle.setAttribute("r", "7");
  handle.setAttribute("class", className);
  return handle;
}

function ensureArrowMarker() {
  if (connectionsLayer.querySelector("#arrow-head")) return;
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "arrow-head");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  marker.append(arrow);
  defs.append(marker);
  connectionsLayer.append(defs);
}

function getConnectionRoute(connection, from, to) {
  const fromCenter = getItemCenter(from);
  const toCenter = getItemCenter(to);
  connection.fromSide ??= getAutoSide(fromCenter, toCenter);
  connection.toSide ??= getAutoSide(toCenter, fromCenter);
  const start = getAnchorBySide(from, connection.fromSide);
  const end = getAnchorBySide(to, connection.toSide);
  const startDirection = getSideDirection(connection.fromSide);
  const endDirection = getSideDirection(connection.toSide);
  const startStub = {
    x: start.x + startDirection.x * 36,
    y: start.y + startDirection.y * 36
  };
  const endStub = {
    x: end.x + endDirection.x * 36,
    y: end.y + endDirection.y * 36
  };
  const startHorizontal = startDirection.x !== 0;
  connection.bendAxis = startHorizontal ? "x" : "y";
  connection.bend ??= getDefaultConnectionBend(connection, { items: [from, to] });
  connection.bend = getSafeConnectionBend(connection.bendAxis, connection.bend, from, to, startStub, endStub);

  let path;
  let handleX;
  let handleY;

  if (connection.bendAxis === "x") {
    path = `M ${start.x} ${start.y} L ${startStub.x} ${startStub.y} H ${connection.bend} V ${endStub.y} H ${endStub.x} L ${end.x} ${end.y}`;
    handleX = connection.bend;
    handleY = Math.round((startStub.y + endStub.y) / 2);
  } else {
    path = `M ${start.x} ${start.y} L ${startStub.x} ${startStub.y} V ${connection.bend} H ${endStub.x} V ${endStub.y} L ${end.x} ${end.y}`;
    handleX = Math.round((startStub.x + endStub.x) / 2);
    handleY = connection.bend;
  }

  return {
    path,
    handleX,
    handleY,
    start,
    end
  };
}

function getSafeConnectionBend(axis, desired, from, to, startStub, endStub) {
  const padding = 18;
  const bounds = [getItemBounds(from, padding), getItemBounds(to, padding)];
  const candidates = axis === "x"
    ? [
      desired,
      bounds[0].left - padding,
      bounds[0].right + padding,
      bounds[1].left - padding,
      bounds[1].right + padding
    ]
    : [
      desired,
      bounds[0].top - padding,
      bounds[0].bottom + padding,
      bounds[1].top - padding,
      bounds[1].bottom + padding
    ];

  return candidates
    .map((candidate) => Math.round(clamp(candidate, 0, axis === "x" ? 6400 : 4200)))
    .filter((candidate, index, list) => list.indexOf(candidate) === index)
    .map((candidate) => ({
      value: candidate,
      score: getConnectionCollisionScore(axis, candidate, startStub, endStub, bounds) + Math.abs(candidate - desired)
    }))
    .sort((a, b) => a.score - b.score)[0]?.value ?? Math.round(desired);
}

function getConnectionCollisionScore(axis, bend, startStub, endStub, bounds) {
  const points = axis === "x"
    ? [startStub, { x: bend, y: startStub.y }, { x: bend, y: endStub.y }, endStub]
    : [startStub, { x: startStub.x, y: bend }, { x: endStub.x, y: bend }, endStub];

  let collisions = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    if (bounds.some((box) => segmentIntersectsBounds(points[index], points[index + 1], box))) {
      collisions += 1;
    }
  }
  return collisions * 100000;
}

function segmentIntersectsBounds(a, b, bounds) {
  if (a.x === b.x) {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return a.x >= bounds.left && a.x <= bounds.right && maxY >= bounds.top && minY <= bounds.bottom;
  }
  if (a.y === b.y) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return a.y >= bounds.top && a.y <= bounds.bottom && maxX >= bounds.left && minX <= bounds.right;
  }
  return false;
}

function getItemBounds(item, padding = 0) {
  return {
    left: item.x - padding,
    top: item.y - padding,
    right: item.x + (item.width || 210) + padding,
    bottom: item.y + (item.height || 140) + padding
  };
}

function getItemCenter(item) {
  return {
    x: item.x + (item.width || 210) / 2,
    y: item.y + (item.height || 140) / 2
  };
}

function getVerticalAnchor(item, targetY) {
  const center = getItemCenter(item);
  return {
    x: center.x,
    y: targetY >= center.y ? item.y + (item.height || 140) : item.y
  };
}

function getHorizontalAnchor(item, targetX) {
  const center = getItemCenter(item);
  return {
    x: targetX >= center.x ? item.x + (item.width || 210) : item.x,
    y: center.y
  };
}

function getAnchorBySide(item, side) {
  const center = getItemCenter(item);
  const width = item.width || 210;
  const height = item.height || 140;
  return {
    top: { x: center.x, y: item.y },
    right: { x: item.x + width, y: center.y },
    bottom: { x: center.x, y: item.y + height },
    left: { x: item.x, y: center.y }
  }[side] || center;
}

function getSideDirection(side) {
  return {
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 }
  }[side] || { x: 0, y: 1 };
}

function getAutoSide(fromCenter, toCenter) {
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

function cycleConnectionSide(connection, key) {
  const sides = ["top", "right", "bottom", "left"];
  const currentIndex = sides.indexOf(connection[key]);
  connection[key] = sides[(currentIndex + 1) % sides.length];
  connection.bendAxis = ["left", "right"].includes(connection.fromSide) ? "x" : "y";
  connection.bend = undefined;
  saveAndRender();
}

function getDefaultConnectionBend(connection, project) {
  const from = project.items.find((item) => item.id === connection.from);
  const to = project.items.find((item) => item.id === connection.to);
  if (!from || !to) return connection.bend || 0;
  const start = getAnchorBySide(from, connection.fromSide);
  const end = getAnchorBySide(to, connection.toSide);
  const startDirection = getSideDirection(connection.fromSide);
  const endDirection = getSideDirection(connection.toSide);
  const startStub = {
    x: start.x + startDirection.x * 36,
    y: start.y + startDirection.y * 36
  };
  const endStub = {
    x: end.x + endDirection.x * 36,
    y: end.y + endDirection.y * 36
  };
  connection.bendAxis = startDirection.x !== 0 ? "x" : "y";
  const desired = connection.bendAxis === "x"
    ? Math.round((startStub.x + endStub.x) / 2)
    : Math.round((startStub.y + endStub.y) / 2);
  return getSafeConnectionBend(connection.bendAxis, desired, from, to, startStub, endStub);
}

function startConnectionEndpointDrag(event, project, connection, item, key) {
  event.preventDefault();
  event.stopPropagation();
  interactionLock = true;

  const move = (moveEvent) => {
    const point = getBoardPoint(moveEvent);
    connection[key] = getClosestSide(item, point);
    connection.bend = getDefaultConnectionBend(connection, project);
    connectionsLayer.innerHTML = "";
    renderConnections(project);
  };

  const end = () => {
    interactionLock = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    commitState();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function getClosestSide(item, point) {
  const width = item.width || 210;
  const height = item.height || 140;
  const distances = [
    ["top", Math.abs(point.y - item.y)],
    ["right", Math.abs(point.x - (item.x + width))],
    ["bottom", Math.abs(point.y - (item.y + height))],
    ["left", Math.abs(point.x - item.x)]
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

function startConnectionBendDrag(event, project, connection) {
  event.preventDefault();
  event.stopPropagation();
  interactionLock = true;
  const from = project.items.find((item) => item.id === connection.from);
  const to = project.items.find((item) => item.id === connection.to);

  const move = (moveEvent) => {
    const point = getBoardPoint(moveEvent);
    if (!from || !to) return;
    const start = getAnchorBySide(from, connection.fromSide);
    const end = getAnchorBySide(to, connection.toSide);
    const startDirection = getSideDirection(connection.fromSide);
    const endDirection = getSideDirection(connection.toSide);
    const startStub = {
      x: start.x + startDirection.x * 36,
      y: start.y + startDirection.y * 36
    };
    const endStub = {
      x: end.x + endDirection.x * 36,
      y: end.y + endDirection.y * 36
    };
    if (connection.bendAxis === "x") {
      connection.bend = getSafeConnectionBend("x", Math.max(0, Math.round(point.x)), from, to, startStub, endStub);
    } else {
      connection.bend = getSafeConnectionBend("y", Math.max(0, Math.round(point.y)), from, to, startStub, endStub);
    }
    connectionsLayer.innerHTML = "";
    renderConnections(project);
  };

  const end = () => {
    interactionLock = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    commitState();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

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
      <input type="checkbox" ${task.done ? "checked" : ""} aria-label="Concluir tarefa" />
      <span class="task-text">${escapeHtml(task.title)}</span>
      <button class="delete-task" title="Remover tarefa">x</button>
    `;
    row.querySelector("input").addEventListener("change", (event) => {
      task.done = event.target.checked;
      saveAndRender();
    });
    row.querySelector("button").addEventListener("click", () => {
      project.tasks = project.tasks.filter((candidate) => candidate.id !== task.id);
      saveAndRender();
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

function addBoardItem(type, extra = {}) {
  const project = getActiveProject();
  if (!project) return;
  project.items.push({
    id: crypto.randomUUID(),
    type,
    x: extra.x ?? (96 + project.items.length * 22),
    y: extra.y ?? (86 + project.items.length * 18),
    width: type === "image" ? 260 : 230,
    height: type === "image" ? 220 : 140,
    text: type === "ticket" ? "Novo board" : "",
    html: type === "ticket" ? "Novo board" : "",
    color: ticketColors[project.items.length % ticketColors.length],
    ...extra
  });
  saveAndRender();
}

function addImageFile(file, point = lastBoardPoint) {
  if (!file?.type?.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => addBoardItem("image", {
    src: reader.result,
    text: file.name || "Imagem",
    x: Math.max(0, Math.round(point.x)),
    y: Math.max(0, Math.round(point.y))
  });
  reader.readAsDataURL(file);
}

function addImageUrl(src, point = lastBoardPoint) {
  if (!src) return;
  addBoardItem("image", {
    src,
    text: "Imagem colada",
    x: Math.max(0, Math.round(point.x)),
    y: Math.max(0, Math.round(point.y))
  });
}

function handleBoardDrop(event) {
  event.preventDefault();
  board.classList.remove("drag-over");
  const point = getBoardPoint(event);
  const imageFiles = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length) {
    imageFiles.forEach((file, index) => addImageFile(file, { x: point.x + index * 24, y: point.y + index * 24 }));
    return;
  }

  const html = event.dataTransfer.getData("text/html");
  const imageSrc = getImageSrcFromHtml(html);
  if (imageSrc) {
    addImageUrl(imageSrc, point);
    return;
  }

  const uri = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
  if (isImageLikeUrl(uri)) addImageUrl(uri.trim(), point);
}

function handlePaste(event) {
  const target = event.target;
  if (target?.matches?.("input, textarea, [contenteditable='true']")) return;
  const project = getActiveProject();
  const ticketJson = event.clipboardData.getData("application/x-flowboard-ticket");
  if (ticketJson && project) {
    event.preventDefault();
    try {
      pasteTicket(JSON.parse(ticketJson), lastBoardPoint);
    } catch {
      if (copiedBoardItem) pasteTicket(copiedBoardItem, lastBoardPoint);
    }
    return;
  }

  const point = lastBoardPoint;
  const imageItems = [...event.clipboardData.items].filter((item) => item.type.startsWith("image/"));
  if (imageItems.length) {
    event.preventDefault();
    imageItems.forEach((item, index) => addImageFile(item.getAsFile(), { x: point.x + index * 24, y: point.y + index * 24 }));
    return;
  }

  const html = event.clipboardData.getData("text/html");
  const imageSrc = getImageSrcFromHtml(html);
  if (imageSrc) {
    event.preventDefault();
    addImageUrl(imageSrc, point);
    return;
  }

  const text = event.clipboardData.getData("text/plain");
  if (isImageLikeUrl(text)) {
    event.preventDefault();
    addImageUrl(text.trim(), point);
    return;
  }

  if (copiedBoardItem && project) {
    event.preventDefault();
    pasteTicket(copiedBoardItem, lastBoardPoint);
  }
}

function handleCopy(event) {
  const target = event.target;
  if (target?.matches?.("input, textarea, [contenteditable='true']")) return;
  const project = getActiveProject();
  const item = project?.items.find((candidate) => candidate.id === selectedBoardItemId);
  if (!item || item.type !== "ticket") return;

  event.preventDefault();
  copiedBoardItem = structuredClone(item);
  event.clipboardData.setData("application/x-flowboard-ticket", JSON.stringify(copiedBoardItem));
  event.clipboardData.setData("text/plain", item.text || "");
}

function pasteTicket(source, point) {
  const project = getActiveProject();
  if (!project || source.type !== "ticket") return;
  const clone = {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    x: Math.max(0, Math.round(point.x)),
    y: Math.max(0, Math.round(point.y)),
    connections: undefined
  };
  project.items.push(clone);
    selectedBoardItemId = clone.id;
  selectedItemIds = new Set([clone.id]);
  saveAndRender();
}

function startItemResize(event, node, item, project) {
  if (event.type === "mousedown" && event.button !== 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();
  if (activeResizeId) return;
  activeResizeId = item.id;
  if (event.pointerId !== undefined) {
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Some browser/file contexts refuse pointer capture; global listeners still handle the drag.
    }
  }
  interactionLock = true;
  board.classList.add("dragging-board", "resizing-board");
  selectedItemIds = new Set([item.id]);
  selectedConnectionIds.clear();
  renderSelectionClasses();
  const origin = {
    x: event.clientX,
    y: event.clientY,
    width: item.width || Number.parseFloat(node.style.width) || Math.round(node.offsetWidth),
    height: item.height || Number.parseFloat(node.style.height) || Math.round(node.offsetHeight)
  };

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    const clientX = moveEvent.clientX ?? origin.x;
    const clientY = moveEvent.clientY ?? origin.y;
    item.width = Math.max(190, Math.round(origin.width + (clientX - origin.x) / boardZoom));
    item.height = Math.max(120, Math.round(origin.height + (clientY - origin.y) / boardZoom));
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
    connectionsLayer.innerHTML = "";
    renderConnections(project);
  };

  const end = () => {
    if (activeResizeId !== item.id) return;
    activeResizeId = null;
    interactionLock = false;
    board.classList.remove("dragging-board", "resizing-board");
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
    if (event.pointerId !== undefined) {
      try {
        event.currentTarget?.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser on pointerup.
      }
    }
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("mouseup", end, true);
    commitState();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("mousemove", move, true);
  window.addEventListener("mouseup", end, true);
}

function getImageSrcFromHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelector("img")?.src || "";
}

function isImageLikeUrl(value) {
  return /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value.trim()) || value.trim().startsWith("data:image/");
}

function handleBoardWheel(event) {
  if (!event.target.closest("#board")) return;
  event.preventDefault();
  const before = getBoardPoint(event);
  const nextZoom = Math.max(0.25, Math.min(2.5, boardZoom + (event.deltaY > 0 ? -0.08 : 0.08)));
  boardZoom = Math.round(nextZoom * 100) / 100;
  const rect = board.getBoundingClientRect();
  boardPan.x = event.clientX - rect.left - before.x * boardZoom;
  boardPan.y = event.clientY - rect.top - before.y * boardZoom;
  renderZoom();
  lastBoardPoint = before;
}

function renderZoom() {
  boardContent.style.transform = `translate(${boardPan.x}px, ${boardPan.y}px) scale(${boardZoom})`;
  zoomIndicator.textContent = `${Math.round(boardZoom * 100)}%`;
}

function getBoardPoint(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - boardPan.x) / boardZoom,
    y: (event.clientY - rect.top - boardPan.y) / boardZoom
  };
}

function startBoardPan(event) {
  if (event.button !== 0) return;
  if (event.target.closest(".board-item, .drawer-toggle, .connection-handle")) return;
  event.preventDefault();
  board.classList.add("panning");
  const origin = {
    x: event.clientX,
    y: event.clientY,
    panX: boardPan.x,
    panY: boardPan.y
  };

  const move = (moveEvent) => {
    boardPan.x = origin.panX + moveEvent.clientX - origin.x;
    boardPan.y = origin.panY + moveEvent.clientY - origin.y;
    renderZoom();
  };

  const end = () => {
    board.classList.remove("panning");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function observeItemResize(node, item, project) {
  return;
  if (!("ResizeObserver" in window)) return;
  const observer = new ResizeObserver(() => {
    const nextWidth = Math.round(node.offsetWidth);
    const nextHeight = Math.round(node.offsetHeight);
    if (Math.abs((item.width || 0) - nextWidth) < 2 && Math.abs((item.height || 0) - nextHeight) < 2) return;
    item.width = nextWidth;
    item.height = nextHeight;
    connectionsLayer.innerHTML = "";
    renderConnections(project);
    commitState();
  });
  observer.observe(node);
}

function togglePanel(panel, button) {
  const collapsed = panel.classList.toggle("collapsed");
  button.textContent = collapsed ? ">" : "v";
  button.setAttribute("aria-expanded", String(!collapsed));
}

function toggleDrawer(drawer) {
  const className = drawer === "workspace" ? "workspace-open" : "side-open";
  app.classList.toggle(className);
  syncDrawerButtons();
}

function closeDrawer(drawer) {
  app.classList.remove(drawer === "workspace" ? "workspace-open" : "side-open");
  syncDrawerButtons();
}

function syncDrawerButtons() {
  const workspaceOpen = app.classList.contains("workspace-open");
  const sideOpen = app.classList.contains("side-open");
  workspaceDrawerToggle.setAttribute("aria-expanded", String(workspaceOpen));
  hoursDrawerToggle.setAttribute("aria-expanded", String(sideOpen && activeSidePanel === "hours"));
  tasksDrawerToggle.setAttribute("aria-expanded", String(sideOpen && activeSidePanel === "tasks"));
  workspaceDrawerToggle.classList.toggle("active", workspaceOpen);
  hoursDrawerToggle.classList.toggle("active", sideOpen && activeSidePanel === "hours");
  tasksDrawerToggle.classList.toggle("active", sideOpen && activeSidePanel === "tasks");
  projectsDrawer.setAttribute("aria-hidden", String(!workspaceOpen));
  sideDrawer.setAttribute("aria-hidden", String(!sideOpen));
}

function toggleSidePanel(panelName) {
  const sideOpen = app.classList.contains("side-open");
  if (sideOpen && activeSidePanel === panelName) {
    closeDrawer("side");
    return;
  }
  activeSidePanel = panelName;
  sideDrawer.dataset.mode = panelName;
  setPanelOpen(hoursPanel, toggleHours, panelName === "hours");
  setPanelOpen(tasksPanel, toggleTasks, panelName === "tasks");
  app.classList.add("side-open");
  syncDrawerButtons();
}

function setPanelOpen(panel, button, open) {
  panel.classList.toggle("collapsed", !open);
  button.textContent = "";
  button.setAttribute("aria-expanded", String(open));
}

function removeBoardItem(id) {
  const project = getActiveProject();
  if (!project) return;
  project.items = project.items.filter((item) => item.id !== id);
  project.connections = project.connections.filter((connection) => connection.from !== id && connection.to !== id);
  saveAndRender();
}

function deleteProject(id) {
  state.projects = state.projects.filter((project) => project.id !== id);
  if (!state.projects.length) {
    const newProject = {
      id: crypto.randomUUID(),
      name: "Novo projeto",
      totalHours: 40,
      tasks: [],
      items: [],
      connections: []
    };
    state.projects.push(newProject);
  }
  if (state.activeProjectId === id) {
    state.activeProjectId = state.projects[0].id;
  }
  saveAndRender();
}

function renameProject(id) {
  renamingProjectId = id;
  renderProjects();
}

function finishRenameProject(id, value) {
  const project = state.projects.find((candidate) => candidate.id === id);
  if (!project) return;
  const nextName = value.trim();
  if (nextName) project.name = nextName;
  renamingProjectId = null;
  saveAndRender();
}

function startNewConnectionDrag(event, fromId, fromSide) {
  if (event.button !== 0) return;
  const project = getActiveProject();
  const from = project?.items.find((item) => item.id === fromId);
  if (!project || !from) return;

  event.preventDefault();
  event.stopPropagation();
  interactionLock = true;
  board.classList.add("connecting-board");
  clearNearbyConnectionDots();
  board.querySelector(`[data-id="${fromId}"]`)?.classList.add("connecting-source", "near-connection-target");

  const preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
  preview.setAttribute("class", "connection-preview");
  connectionsLayer.append(preview);
  activeConnectionDrag = { fromId, fromSide, preview, target: null };

  const move = (moveEvent) => {
    const point = getBoardPoint(moveEvent);
    const target = getClosestConnectionTarget(point, fromId);
    activeConnectionDrag.target = target;
    updateConnectionDragUi(fromId, target);

    const start = getAnchorBySide(from, fromSide);
    const end = target ? getAnchorBySide(target.item, target.side) : point;
    preview.setAttribute("d", `M ${start.x} ${start.y} L ${end.x} ${end.y}`);
  };

  const end = () => {
    const target = activeConnectionDrag?.target;
    clearConnectionDragUi();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);

    if (!target || target.item.id === fromId) {
      interactionLock = false;
      return;
    }

    const exists = project.connections.some((connection) =>
      (connection.from === fromId && connection.to === target.item.id) ||
      (connection.from === target.item.id && connection.to === fromId)
    );
    if (!exists) {
      project.connections.push(createConnection(fromId, target.item.id, from, target.item, fromSide, target.side));
    }
    interactionLock = false;
    saveAndRender();
  };

  move(event);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function getClosestConnectionTarget(point, fromId, maxDistance = 92) {
  const project = getActiveProject();
  if (!project) return null;

  return project.items
    .filter((item) => item.id !== fromId)
    .map((item) => {
      const side = getClosestSide(item, point);
      const anchor = getAnchorBySide(item, side);
      return { item, side, distance: Math.hypot(anchor.x - point.x, anchor.y - point.y) };
    })
    .filter((target) => target.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function updateNearbyConnectionDots(point) {
  if (activeConnectionDrag) return;
  const project = getActiveProject();
  if (!project) return;

  boardContent.querySelectorAll(".board-item").forEach((node) => {
    const item = project.items.find((candidate) => candidate.id === node.dataset.id);
    node.classList.toggle("near-connection-target", Boolean(item && getDistanceToItem(point, item) <= 72));
  });
}

function updateConnectionDragUi(fromId, target) {
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    const isSource = node.dataset.id === fromId;
    const isTarget = node.dataset.id === target?.item.id;
    node.classList.toggle("connecting-source", isSource);
    node.classList.toggle("near-connection-target", isSource || isTarget);
    node.querySelectorAll(".connection-dot").forEach((dot) => {
      dot.classList.toggle("hot", isTarget && dot.dataset.side === target.side);
    });
  });
}

function clearConnectionDragUi() {
  activeConnectionDrag?.preview?.remove();
  activeConnectionDrag = null;
  board.classList.remove("connecting-board");
  clearNearbyConnectionDots();
}

function clearNearbyConnectionDots() {
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    node.classList.remove("near-connection-target", "connecting-source");
    node.querySelectorAll(".connection-dot.hot").forEach((dot) => dot.classList.remove("hot"));
  });
}

function getDistanceToItem(point, item) {
  const width = item.width || 210;
  const height = item.height || 140;
  const dx = Math.max(item.x - point.x, 0, point.x - (item.x + width));
  const dy = Math.max(item.y - point.y, 0, point.y - (item.y + height));
  return Math.hypot(dx, dy);
}

function createConnection(fromId, toId, from, to, forcedFromSide, forcedToSide) {
  const fromCenter = getItemCenter(from);
  const toCenter = getItemCenter(to);
  const fromSide = forcedFromSide || getAutoSide(fromCenter, toCenter);
  const toSide = forcedToSide || getAutoSide(toCenter, fromCenter);
  const bendAxis = ["left", "right"].includes(fromSide) ? "x" : "y";
  const connection = { id: crypto.randomUUID(), from: fromId, to: toId, fromSide, toSide, bendAxis };
  connection.bend = getDefaultConnectionBend(connection, { items: [from, to] });
  return connection;
}

function startDrag(event, id) {
  const project = getActiveProject();
  const item = project?.items.find((candidate) => candidate.id === id);
  const element = board.querySelector(`[data-id="${id}"]`);
  if (!item || !element) return;

  if (event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (event.pointerId !== undefined) {
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // The global pointer listeners below still complete the drag.
    }
  }
  interactionLock = true;
  board.classList.add("dragging-board");
  if (!selectedItemIds.has(id)) {
    selectedItemIds = new Set([id]);
  }
  selectedConnectionIds.clear();
  selectedBoardItemId = id;
  renderSelectionClasses();
  const selectedItems = project.items
    .filter((candidate) => selectedItemIds.has(candidate.id))
    .map((candidate) => ({ item: candidate, x: candidate.x, y: candidate.y }));
  const origin = {
    pointerX: event.clientX,
    pointerY: event.clientY
  };

  const move = (moveEvent) => {
    const dx = (moveEvent.clientX - origin.pointerX) / boardZoom;
    const dy = (moveEvent.clientY - origin.pointerY) / boardZoom;
    selectedItems.forEach(({ item: selectedItem, x, y }) => {
      selectedItem.x = clamp(x + dx, 0, 6400 - (selectedItem.width || 210));
      selectedItem.y = clamp(y + dy, 0, 4200 - (selectedItem.height || 140));
      const selectedElement = board.querySelector(`[data-id="${selectedItem.id}"]`);
      if (selectedElement) {
        selectedElement.style.left = `${selectedItem.x}px`;
        selectedElement.style.top = `${selectedItem.y}px`;
      }
    });
    connectionsLayer.innerHTML = "";
    renderConnections(project);
  };

  const end = () => {
    interactionLock = false;
    board.classList.remove("dragging-board");
    selectedItems.forEach(({ item: selectedItem }) => {
      selectedItem.x = Math.round(selectedItem.x);
      selectedItem.y = Math.round(selectedItem.y);
    });
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    if (event.pointerId !== undefined) {
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    }
    commitState();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function toggleItemSelection(id) {
  selectedConnectionIds.clear();
  if (selectedItemIds.has(id)) {
    selectedItemIds.delete(id);
  } else {
    selectedItemIds.add(id);
  }
  selectedBoardItemId = id;
  renderSelectionClasses();
}

function handleConnectionSelection(event, id) {
  event.stopPropagation();
  if (event.shiftKey) {
    if (selectedConnectionIds.has(id)) {
      selectedConnectionIds.delete(id);
    } else {
      selectedConnectionIds.add(id);
    }
  } else {
    selectedConnectionIds = new Set([id]);
    selectedItemIds.clear();
    selectedBoardItemId = null;
  }
  renderSelectionClasses();
  connectionsLayer.innerHTML = "";
  renderConnections(getActiveProject());
}

function renderSelectionClasses() {
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    node.classList.toggle("multi-selected", selectedItemIds.has(node.dataset.id));
  });
}

function isBoardDragBlocked(target) {
  return Boolean(target.closest("button, input, select, textarea, [contenteditable='true'], .color-panel, .format-panel, .resize-grip, .connection-dot, .connection-handle, .connection-endpoint"));
}

function clearSelection() {
  selectedItemIds.clear();
  selectedConnectionIds.clear();
  selectedBoardItemId = null;
  clearConnectionDragUi();
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    node.classList.remove("multi-selected", "selected-link-source", "colors-open", "format-open");
  });
  connectionsLayer.innerHTML = "";
  renderConnections(getActiveProject());
}

function handleGlobalKeydown(event) {
  const target = event.target;
  if (event.key === "Escape") {
    if (target?.matches?.("input, textarea, [contenteditable='true']")) {
      target.blur();
    }
    clearSelection();
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && !target?.matches?.("input, textarea, [contenteditable='true']")) {
    deleteSelection();
  }
}

function deleteSelection() {
  const project = getActiveProject();
  if (!project || (!selectedItemIds.size && !selectedConnectionIds.size && !selectedBoardItemId)) return;

  const idsToDelete = new Set(selectedItemIds);
  if (!idsToDelete.size && selectedBoardItemId) idsToDelete.add(selectedBoardItemId);

  if (idsToDelete.size) {
    project.items = project.items.filter((item) => !idsToDelete.has(item.id));
    project.connections = project.connections.filter((connection) =>
      !idsToDelete.has(connection.from) &&
      !idsToDelete.has(connection.to) &&
      !selectedConnectionIds.has(connection.id)
    );
  } else {
    project.connections = project.connections.filter((connection) => !selectedConnectionIds.has(connection.id));
  }

  selectedItemIds.clear();
  selectedConnectionIds.clear();
  selectedBoardItemId = null;
  saveAndRender();
}

function persistItemSize(node, item) {
  const nextWidth = Math.round(node.offsetWidth);
  const nextHeight = Math.round(node.offsetHeight);
  if (nextWidth <= 0 || nextHeight <= 0) return;
  item.width = nextWidth;
  item.height = nextHeight;
  commitState();
}

function persistAllVisibleItemSizes() {
  const project = getActiveProject();
  if (!project) return;
  boardContent.querySelectorAll(".board-item").forEach((node) => {
    const item = project.items.find((candidate) => candidate.id === node.dataset.id);
    if (item) persistItemSize(node, item);
  });
}

function saveProjectHours() {
  const project = getActiveProject();
  if (!project) return;
  project.totalHours = Math.max(0, Number(projectHours.value) || 0);
  saveAndRender();
}

function hoursFromPercent(totalHours, percent) {
  return totalHours * (percent / 100);
}

function formatHours(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function applyTextStyle(command) {
  const commandMap = {
    B: "bold",
    I: "italic",
    U: "underline",
    S: "strikeThrough"
  };
  document.execCommand(commandMap[command], false);
  saveActiveEditable();
}

function createFormatButton(label, title, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-style-button";
  button.title = title;
  button.textContent = label;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
  return button;
}

function applyFontSize(delta) {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  const parentSize = Number.parseInt(window.getComputedStyle(range.commonAncestorContainer.parentElement || document.body).fontSize, 10) || 14;
  span.style.fontSize = `${Math.max(10, Math.min(48, parentSize + delta))}px`;
  span.append(range.extractContents());
  range.insertNode(span);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  selection.addRange(nextRange);
  saveActiveEditable(span);
}

function applyFontFamily(fontFamily) {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  span.style.fontFamily = fontFamily;
  span.append(range.extractContents());
  range.insertNode(span);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  selection.addRange(nextRange);
  saveActiveEditable(span);
}

function saveActiveEditable(fromNode = window.getSelection()?.anchorNode) {
  const element = fromNode?.nodeType === Node.TEXT_NODE ? fromNode.parentElement : fromNode;
  const editable = element?.closest?.(".item-text");
  const itemNode = editable?.closest?.(".board-item");
  const project = getActiveProject();
  const item = project?.items.find((candidate) => candidate.id === itemNode?.dataset.id);
  if (!editable || !item) return;
  item.html = sanitizeEditableHtml(editable.innerHTML);
  item.text = editable.textContent;
  saveState();
}

function getStyleTitle(command) {
  return {
    B: "Negrito",
    I: "Italico",
    U: "Sublinhado",
    S: "Riscado"
  }[command];
}

function sanitizeEditableHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, style, iframe, object").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (attribute.name.startsWith("on")) node.removeAttribute(attribute.name);
    });
  });
  return template.innerHTML;
}

function normalizeHexColor(value) {
  return isValidHex(value) ? value : "#fff1b8";
}

function isValidHex(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHexInput(value) {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
  return trimmed;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
