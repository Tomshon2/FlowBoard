const ACCESS_CODE = "equipa2026";
const STORAGE_KEY = "flowboard-state-v2";
const SUPABASE_CONFIG = window.FLOWBOARD_SUPABASE || {};
const pendingInviteToken = new URLSearchParams(window.location.search).get("invite") || "";
let currentUser = null;
let currentWorkspaceId = null;
let supabaseClient = null;
let workspaceChannel = null;
let saveTimer = null;
let applyingRemoteState = false;
const HISTORY_LIMIT = 300;
const HISTORY_GROUP_MS = 700;
let undoStack = [];
let redoStack = [];
let lastHistorySnapshot = "";
let lastHistoryRecordedAt = 0;
const cursorColors = ["#126c83", "#d94a2b", "#8f2bd5", "#03943a", "#e5549f", "#2074b4", "#f57a00"];
const clientId = sessionStorage.getItem("flowboard-client-id") || crypto.randomUUID();
sessionStorage.setItem("flowboard-client-id", clientId);
let currentDisplayName = localStorage.getItem("flowboard-display-name") || "";
let personalTheme = loadPersonalTheme();
let cursorChannelReady = false;
let cursorSendTimer = null;
let pendingCursorPoint = null;
let remoteCursors = new Map();
let workspaceMembers = [];
let currentWorkspaceRole = "guest";

const ticketColors = [
  "#fff1b8", "#f6b7d8", "#b987f4", "#7dc7ff", "#71d694", "#ffb15f",
  "#ffffff", "#d9f99d", "#a7f3d0", "#bae6fd", "#c7d2fe", "#fecaca",
  "#fef3c7", "#e5e7eb", "#1d2733"
];
const DEFAULT_CONNECTION_COLOR = "#172033";
const DEFAULT_CONNECTION_THICKNESS = 3;
const DEFAULT_DRAWING_THICKNESS = 4;
const BOARD_GRID_SIZE = 28;
const PROJECT_KIND_GAMEDEV = "gamedev";
const PROJECT_KIND_GAMEJAM = "gamejam";
const GAMEJAM_SHAPE_TOOLS = new Set(["rectangle", "circle", "diamond"]);

function getProjectKind(project = typeof getActiveProject === "function" ? getActiveProject() : null) {
  return project?.kind === PROJECT_KIND_GAMEJAM ? PROJECT_KIND_GAMEJAM : PROJECT_KIND_GAMEDEV;
}

function isGameJamProject(project = typeof getActiveProject === "function" ? getActiveProject() : null) {
  return getProjectKind(project) === PROJECT_KIND_GAMEJAM;
}

function isShapeToolAllowedForProject(tool, project = typeof getActiveProject === "function" ? getActiveProject() : null) {
  if (!isGameJamProject(project)) return true;
  return GAMEJAM_SHAPE_TOOLS.has(tool);
}

function getPersonalThemeKey() {
  const userKey = currentUser?.id || currentUser?.email || currentDisplayName || "local";
  return `flowboard-ui-theme:${userKey}`;
}

function loadPersonalTheme() {
  return localStorage.getItem(getPersonalThemeKey()) === "dark" ? "dark" : "light";
}

function setPersonalTheme(theme) {
  personalTheme = theme === "dark" ? "dark" : "light";
  localStorage.setItem(getPersonalThemeKey(), personalTheme);
}

function createDefaultTaskColumns() {
  return [
    { id: "todo", title: "To do", color: "#03943a", order: 0 },
    { id: "in-progress", title: "In progress", color: "#b77900", order: 1 },
    { id: "done", title: "Done", color: "#6d28d9", order: 2 }
  ].map((column) => ({ ...column }));
}

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

function createDefaultHourPlan() {
  return timePlan.map((phase, phaseIndex) => ({
    id: crypto.randomUUID(),
    title: phase.title,
    percent: phase.percent,
    order: phaseIndex,
    tasks: phase.tasks.map((task, taskIndex) => ({
      id: crypto.randomUUID(),
      title: task.title,
      percent: task.percent,
      order: taskIndex
    }))
  }));
}

function createDefaultMilestones() {
  return [
    { name: "Prototype", status: "planned", progress: 0 },
    { name: "Alpha", status: "planned", progress: 0 },
    { name: "Beta", status: "planned", progress: 0 },
    { name: "Playtest", status: "planned", progress: 0 },
    { name: "Polish", status: "planned", progress: 0 },
    { name: "Release", status: "planned", progress: 0 }
  ].map((milestone, index) => ({
    id: crypto.randomUUID(),
    name: milestone.name,
    description: "",
    deadline: "",
    taskIds: [],
    progress: milestone.progress,
    status: milestone.status,
    order: index
  }));
}

const defaultState = {
  activeProjectId: "project-1",
  boardTheme: "light",
  boardGrid: "visible",
  updatedAt: 0,
  projects: [
    {
      id: "project-1",
      name: "Example project",
      kind: PROJECT_KIND_GAMEDEV,
      totalHours: 40,
      hourPlan: createDefaultHourPlan(),
      tasks: [
        { id: "task-1", title: "Define sprint goal", columnId: "todo", done: false, order: 0 },
        { id: "task-2", title: "Review images and references", columnId: "done", done: true, order: 0 }
      ],
      taskColumns: createDefaultTaskColumns(),
      milestones: createDefaultMilestones(),
      history: [],
      story: [
        { id: "story-1", title: "Premise", notes: "What is the game about?", children: [] }
      ],
      teamRoles: [
        { id: "role-1", name: "Designer", role: "Game design", notes: "Owns mechanics, rules, and player flow." }
      ],
      items: [
        { id: "item-1", type: "ticket", x: 72, y: 70, width: 230, height: 140, text: "Board: create first wireframe", color: "#fff1b8" },
        { id: "item-2", type: "ticket", x: 330, y: 150, width: 260, height: 150, text: "Board: split work into focus blocks", color: "#71d694" }
      ],
      connections: [{ id: "conn-1", from: "item-1", to: "item-2", fromSide: "bottom", toSide: "top", axis: "y", bend: 220 }]
    }
  ]
};

let state = structuredClone(defaultState);
let boardZoom = 1;
let boardPan = { x: 0, y: 0 };
let lastBoardPoint = { x: 140, y: 140 };
let copiedBoardItem = null;
let selectedBoardItemId = null;
let selectedItemIds = new Set();
let selectedConnectionIds = new Set();
let selectedDrawingIds = new Set();
let drawMode = false;
let activeShapeTool = null;
let drawingToolThickness = Number(localStorage.getItem("flowboard-drawing-thickness")) || DEFAULT_DRAWING_THICKNESS;
let activeDrawing = null;
let activeAreaSelection = null;
let spacePressed = false;
let renamingProjectId = null;
let interactionLock = false;
let activeResizeId = null;
let activeConnectionDrag = null;
let latestLocalStateStamp = 0;
let boardMoveFrame = null;
let queuedBoardMovePoint = null;
const connectionDotSides = ["top", "right", "bottom", "left"];

const authScreen = document.querySelector("#auth-screen");
const authPanel = document.querySelector("#auth-panel");
const app = document.querySelector("#app");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const loginLabel = document.querySelector("#login-label");
const loginEmail = document.querySelector("#login-email");
const displayNameInput = document.querySelector("#display-name");
const authLoginMode = document.querySelector("#auth-login-mode");
const authSignupMode = document.querySelector("#auth-signup-mode");
const authFormTitle = document.querySelector("#auth-form-title");
const authFormCopy = document.querySelector("#auth-form-copy");
const authBrandCopy = document.querySelector("#auth-brand-copy");
const authSubmitBtn = document.querySelector("#auth-submit-btn");
const passwordRules = document.querySelector("#password-rules");
const projectsList = document.querySelector("#projects-list");
const projectForm = document.querySelector("#project-form");
const projectName = document.querySelector("#project-name");
const projectKind = document.querySelector("#project-kind");
const activeProjectTitle = document.querySelector("#active-project-title");
const board = document.querySelector("#board");
const boardContent = document.querySelector("#board-content");
const drawingLayer = document.querySelector("#drawing-layer");
const connectionsLayer = document.querySelector("#connections-layer");
const cursorLayer = document.querySelector("#cursor-layer");
const zoomIndicator = document.querySelector("#zoom-indicator");
const taskForm = document.querySelector("#task-form");
const taskTitle = document.querySelector("#task-title");
const tasksList = document.querySelector("#tasks-list");
const taskCount = document.querySelector("#task-count");
const taskSearch = document.querySelector("#task-search");
const taskFilterPerson = document.querySelector("#task-filter-person");
const taskFilterStatus = document.querySelector("#task-filter-status");
const taskFilterPriority = document.querySelector("#task-filter-priority");
const dataActionsToggle = document.querySelector("#data-actions-toggle");
const kanbanDataActions = document.querySelector("#kanban-data-actions");
const exportBoardPngBtn = document.querySelector("#export-board-png-btn");
const exportBoardPdfBtn = document.querySelector("#export-board-pdf-btn");
const exportProjectJsonBtn = document.querySelector("#export-project-json-btn");
const exportProjectReportBtn = document.querySelector("#export-project-report-btn");
const exportGddPdfBtn = document.querySelector("#export-gdd-pdf-btn");
const importProjectJsonInput = document.querySelector("#import-project-json-input");
const importTasksCsvInput = document.querySelector("#import-tasks-csv-input");
const imageInput = document.querySelector("#image-input");
const drawTool = document.querySelector("#draw-tool");
const createColor = document.querySelector("#create-color");
const shapeMenuToggle = document.querySelector("#shape-menu-toggle");
const shapeMenu = document.querySelector("#shape-menu");
const shapeTools = document.querySelectorAll("[data-shape-tool]");
const templateSelect = document.querySelector("#template-select");
const boardGridBtn = document.querySelector("#board-grid-btn");
const boardThemeBtn = document.querySelector("#board-theme-btn");
const projectHours = document.querySelector("#project-hours");
const hoursTotalLabel = document.querySelector("#hours-total-label");
const hoursTable = document.querySelector("#hours-table");
const hoursFinalMode = document.querySelector("#hours-final-mode");
const hoursEditMode = document.querySelector("#hours-edit-mode");
const connectionStylePanel = document.querySelector("#connection-style-panel");
const connectionColor = document.querySelector("#connection-color");
const connectionThickness = document.querySelector("#connection-thickness");
const connectionThicknessLabel = document.querySelector("#connection-thickness-label");
const connectionSnapRow = document.querySelector("#connection-snap-row");
const connectionSnapGrid = document.querySelector("#connection-snap-grid");
const propertiesPanel = document.querySelector("#properties-panel");
const propertiesTitle = document.querySelector("#properties-title");
const boardProperties = document.querySelector("#board-properties");
const lineProperties = document.querySelector("#line-properties");
const propertiesBoardName = document.querySelector("#properties-board-name");
const propertiesBoardColor = document.querySelector("#properties-board-color");
const propertiesBoardBorderColor = document.querySelector("#properties-board-border-color");
const propertiesBoardBorderThickness = document.querySelector("#properties-board-border-thickness");
const propertiesBoardBorderThicknessLabel = document.querySelector("#properties-board-border-thickness-label");
const propertiesBoardSnapGrid = document.querySelector("#properties-board-snap-grid");
const propertiesTableControls = document.querySelector("#properties-table-controls");
const propertiesTableRows = document.querySelector("#properties-table-rows");
const propertiesTableCols = document.querySelector("#properties-table-cols");
const propertiesBoardHex = document.querySelector("#properties-board-hex");
const propertiesBoardText = document.querySelector("#properties-board-text");
const propertiesFontFamily = document.querySelector("#properties-font-family");
const propertiesFontSize = document.querySelector("#properties-font-size");
const propertiesTextColor = document.querySelector("#properties-text-color");
const propertiesBold = document.querySelector("#properties-bold");
const propertiesItalic = document.querySelector("#properties-italic");
const propertiesUnderline = document.querySelector("#properties-underline");
const propertiesLinkedTasks = document.querySelector("#properties-linked-tasks");
const propertiesLinkedTaskList = document.querySelector("#properties-linked-task-list");
const propertiesLineColor = document.querySelector("#properties-line-color");
const propertiesLineThickness = document.querySelector("#properties-line-thickness");
const propertiesLineThicknessLabel = document.querySelector("#properties-line-thickness-label");
const propertiesLineBorderColorRow = document.querySelector("#properties-line-border-color-row");
const propertiesLineBorderColor = document.querySelector("#properties-line-border-color");
const propertiesLineBorderThicknessRow = document.querySelector("#properties-line-border-thickness-row");
const propertiesLineBorderThickness = document.querySelector("#properties-line-border-thickness");
const propertiesLineBorderThicknessLabel = document.querySelector("#properties-line-border-thickness-label");
const propertiesLineSnapRow = document.querySelector("#properties-line-snap-row");
const propertiesLineSnapGrid = document.querySelector("#properties-line-snap-grid");
const hoursPanel = document.querySelector("#hours-panel");
const tasksPanel = document.querySelector("#tasks-panel");
const storyPanel = document.querySelector("#story-panel");
const levelDesignPanel = document.querySelector("#level-design-panel");
const characterDesignPanel = document.querySelector("#character-design-panel");
const teamPanel = document.querySelector("#team-panel");
const milestonesPanel = document.querySelector("#milestones-panel");
const historyPanel = document.querySelector("#history-panel");
const toggleHours = document.querySelector("#toggle-hours");
const toggleTasks = document.querySelector("#toggle-tasks");
const toggleStory = document.querySelector("#toggle-story");
const toggleLevelDesign = document.querySelector("#toggle-level-design");
const toggleCharacterDesign = document.querySelector("#toggle-character-design");
const toggleTeam = document.querySelector("#toggle-team");
const toggleMilestones = document.querySelector("#toggle-milestones");
const toggleHistory = document.querySelector("#toggle-history");
const workspaceDrawerToggle = document.querySelector("#workspace-drawer-toggle");
const hoursDrawerToggle = document.querySelector("#hours-drawer-toggle");
const tasksDrawerToggle = document.querySelector("#tasks-drawer-toggle");
const storyDrawerToggle = document.querySelector("#story-drawer-toggle");
const levelDesignDrawerToggle = document.querySelector("#level-design-drawer-toggle");
const characterDesignDrawerToggle = document.querySelector("#character-design-drawer-toggle");
const teamDrawerToggle = document.querySelector("#team-drawer-toggle");
const milestonesDrawerToggle = document.querySelector("#milestones-drawer-toggle");
const historyDrawerToggle = document.querySelector("#history-drawer-toggle");
const closeWorkspaceDrawer = document.querySelector("#close-workspace-drawer");
const closeSideDrawer = document.querySelector("#close-side-drawer");
const topLogoutBtn = document.querySelector("#top-logout-btn");
const inviteBtn = document.querySelector("#invite-btn");
const invitePanel = document.querySelector("#invite-panel");
const inviteLink = document.querySelector("#invite-link");
const copyInviteBtn = document.querySelector("#copy-invite-btn");
const inviteStatus = document.querySelector("#invite-status");
const projectsDrawer = document.querySelector("#projects-drawer");
const sideDrawer = document.querySelector("#side-drawer");
const sideDrawerResize = document.querySelector("#side-drawer-resize");
const workspaceDrawerResize = document.querySelector("#workspace-drawer-resize");
const storyRootForm = document.querySelector("#story-root-form");
const storyRootTitle = document.querySelector("#story-root-title");
const storyTree = document.querySelector("#story-tree");
const storyCount = document.querySelector("#story-count");
const addLevelDesignBoard = document.querySelector("#add-level-design-board");
const addCharacterDesignBoard = document.querySelector("#add-character-design-board");
const gddConcept = document.querySelector("#gdd-concept");
const gddGenre = document.querySelector("#gdd-genre");
const gddCharacterList = document.querySelector("#gdd-character-list");
const gddAddCharacter = document.querySelector("#gdd-add-character");
const gddMechanics = document.querySelector("#gdd-mechanics");
const teamRoleForm = document.querySelector("#team-role-form");
const teamMemberName = document.querySelector("#team-member-name");
const teamMemberRole = document.querySelector("#team-member-role");
const teamRoleList = document.querySelector("#team-role-list");
const teamCount = document.querySelector("#team-count");
const workspaceMembersList = document.querySelector("#workspace-members-list");
const workspaceRoleBadge = document.querySelector("#workspace-role-badge");
const workspaceMembersHelp = document.querySelector("#workspace-members-help");
const milestoneForm = document.querySelector("#milestone-form");
const milestoneName = document.querySelector("#milestone-name");
const milestoneDeadline = document.querySelector("#milestone-deadline");
const milestoneList = document.querySelector("#milestone-list");
const milestoneCount = document.querySelector("#milestone-count");
const projectHistoryList = document.querySelector("#project-history-list");
const historyCount = document.querySelector("#history-count");
let activeSidePanel = "hours";
let drawerSwitchTimer = null;
let pendingDrawerTarget = null;
const DRAWER_SWITCH_MS = 500;
let authMode = "login";
let eventListenersReady = false;
let hoursMode = localStorage.getItem("flowboard-hours-mode") === "edit" ? "edit" : "final";
sideDrawer.dataset.mode = activeSidePanel;
displayNameInput.value = currentDisplayName;

function setupEventListeners() {
if (eventListenersReady) return;
eventListenersReady = true;
initializeSideDrawerResize();
displayNameInput.addEventListener("change", () => saveDisplayName());

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveDisplayName();
  if (authMode === "signup") {
    signUpOnline();
  } else {
    signInOnline();
  }
});

authLoginMode.addEventListener("click", () => setAuthMode("login"));
authSignupMode.addEventListener("click", () => setAuthMode("signup"));

document.querySelector("#logout-btn").addEventListener("click", () => {
  signOut();
});
topLogoutBtn.addEventListener("click", () => {
  signOut();
});
inviteBtn.addEventListener("click", () => createInviteLink());
copyInviteBtn.addEventListener("click", () => copyInviteLink());
taskSearch.addEventListener("input", () => renderTasks());
taskFilterPerson.addEventListener("change", () => renderTasks());
taskFilterStatus.addEventListener("change", () => renderTasks());
taskFilterPriority.addEventListener("change", () => renderTasks());
dataActionsToggle.addEventListener("click", () => toggleDataActions());
exportBoardPngBtn.addEventListener("click", () => exportBoardAsPng());
exportBoardPdfBtn.addEventListener("click", () => exportBoardAsPdf());
exportProjectJsonBtn.addEventListener("click", () => exportProjectJson());
exportProjectReportBtn.addEventListener("click", () => exportProjectReportPdf());
exportGddPdfBtn.addEventListener("click", () => exportGameDesignDocumentPdf());
importProjectJsonInput.addEventListener("change", (event) => {
  importProjectJsonFile(event.target.files[0]);
  importProjectJsonInput.value = "";
});
importTasksCsvInput.addEventListener("change", (event) => {
  importTasksCsvFile(event.target.files[0]);
  importTasksCsvInput.value = "";
});

function createProject(name, kind = PROJECT_KIND_GAMEDEV) {
  const cleanName = cleanUserText(name, 80);
  if (!cleanName) return null;
  const projectKindValue = kind === PROJECT_KIND_GAMEJAM ? PROJECT_KIND_GAMEJAM : PROJECT_KIND_GAMEDEV;
  const project = {
    id: crypto.randomUUID(),
    name: cleanName,
    kind: projectKindValue,
    favorite: false,
    modifiedAt: Date.now(),
    totalHours: 40,
    hourPlan: createDefaultHourPlan(),
    tasks: [],
    taskColumns: createDefaultTaskColumns(),
    milestones: createDefaultMilestones(),
    history: [{
      id: crypto.randomUUID(),
      user: getCurrentEventUser(),
      action: "Project created",
      target: cleanName,
      targetId: "",
      at: new Date().toISOString()
    }],
    story: [],
    teamRoles: [],
    items: [],
    connections: []
  };
  state.projects.push(project);
  state.activeProjectId = project.id;
  return project;
}

projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const kind = projectKind?.value === PROJECT_KIND_GAMEJAM ? PROJECT_KIND_GAMEJAM : PROJECT_KIND_GAMEDEV;
  const project = createProject(projectName.value, kind);
  if (!project) return;
  projectName.value = "";
  if (projectKind) projectKind.value = PROJECT_KIND_GAMEDEV;
  saveAndRender();
});

shapeTools.forEach((tool) => {
  tool.addEventListener("click", () => {
    if (drawMode) toggleDrawMode();
    setActiveShapeTool(activeShapeTool === tool.dataset.shapeTool ? null : tool.dataset.shapeTool);
    setShapeMenuOpen(false);
  });
});
shapeMenuToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setShapeMenuOpen(shapeMenu.classList.contains("hidden"));
});
drawTool.addEventListener("click", () => {
  setActiveShapeTool(null);
  setShapeMenuOpen(false);
  toggleDrawMode();
});
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".shape-toolbar")) setShapeMenuOpen(false);
});
templateSelect.addEventListener("change", (event) => {
  const templateId = event.target.value;
  if (templateId) addTemplateLayout(templateId);
  event.target.value = "";
});
boardGridBtn.addEventListener("click", () => toggleBoardGrid());
boardThemeBtn.addEventListener("click", () => toggleBoardTheme());
createColor.addEventListener("input", (event) => {
  createColor.value = normalizeHexColor(event.target.value, ticketColors[0]);
  if (drawMode) renderPropertiesPanel();
});
connectionStylePanel.addEventListener("pointerdown", (event) => event.stopPropagation());
connectionColor.addEventListener("input", (event) => updateSelectedConnections({ color: event.target.value }));
connectionThickness.addEventListener("input", (event) => updateSelectedConnections({ thickness: Number(event.target.value) }));
connectionSnapGrid.addEventListener("change", (event) => updateSelectedConnections({ snapToGrid: event.target.checked }));
propertiesPanel.addEventListener("pointerdown", (event) => event.stopPropagation());
propertiesBoardName.addEventListener("input", (event) => updateSelectedBoardName(event.target.value));
propertiesBoardColor.addEventListener("input", (event) => updateSelectedBoardColor(event.target.value));
propertiesBoardBorderColor.addEventListener("input", (event) => updateSelectedBoardBorder({ borderColor: event.target.value }));
propertiesBoardBorderThickness.addEventListener("input", (event) => updateSelectedBoardBorder({ borderThickness: Number(event.target.value) }));
propertiesBoardSnapGrid.addEventListener("change", (event) => updateSelectedBoardSnapToGrid(event.target.checked));
propertiesTableRows.addEventListener("change", (event) => updateSelectedTableSize({ rows: Number(event.target.value) }));
propertiesTableCols.addEventListener("change", (event) => updateSelectedTableSize({ cols: Number(event.target.value) }));
propertiesBoardHex.addEventListener("input", (event) => updateSelectedBoardColor(normalizeHexInput(event.target.value)));
propertiesBoardText.addEventListener("input", (event) => updateSelectedBoardText(event.target.value));
propertiesFontFamily.addEventListener("change", (event) => updateSelectedBoardTextStyle({ fontFamily: event.target.value }));
propertiesFontSize.addEventListener("input", (event) => updateSelectedBoardTextStyle({ fontSize: Number(event.target.value) }));
propertiesTextColor.addEventListener("input", (event) => updateSelectedBoardTextStyle({ color: event.target.value }));
propertiesBold.addEventListener("click", () => toggleSelectedBoardTextStyle("bold"));
propertiesItalic.addEventListener("click", () => toggleSelectedBoardTextStyle("italic"));
propertiesUnderline.addEventListener("click", () => toggleSelectedBoardTextStyle("underline"));
propertiesLineColor.addEventListener("input", (event) => updateSelectedConnections({ color: event.target.value }));
propertiesLineThickness.addEventListener("input", (event) => updateSelectedConnections({ thickness: Number(event.target.value) }));
propertiesLineBorderColor.addEventListener("input", (event) => updateSelectedConnections({ borderColor: event.target.value }));
propertiesLineBorderThickness.addEventListener("input", (event) => updateSelectedConnections({ borderThickness: Number(event.target.value) }));
propertiesLineSnapGrid.addEventListener("change", (event) => updateSelectedConnections({ snapToGrid: event.target.checked }));

imageInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  addImageFile(file);
  imageInput.value = "";
});

board.addEventListener("wheel", handleBoardWheel, { passive: false });
board.addEventListener("dragover", (event) => {
  event.preventDefault();
  board.classList.add("drag-over");
  lastBoardPoint = getBoardPoint(event);
});
board.addEventListener("dragleave", () => board.classList.remove("drag-over"));
board.addEventListener("drop", (event) => handleBoardDrop(event));
board.addEventListener("pointermove", (event) => {
  queuedBoardMovePoint = { clientX: event.clientX, clientY: event.clientY };
  if (boardMoveFrame) return;
  boardMoveFrame = window.requestAnimationFrame(() => {
    boardMoveFrame = null;
    if (!queuedBoardMovePoint) return;
    lastBoardPoint = getBoardPoint(queuedBoardMovePoint);
    updateNearbyConnectionDots(lastBoardPoint);
    broadcastCursor(lastBoardPoint);
    queuedBoardMovePoint = null;
  });
});
board.addEventListener("pointerleave", () => {
  clearNearbyConnectionDots();
  broadcastCursor(null);
});
board.addEventListener("pointerdown", (event) => startAreaSelection(event), true);
board.addEventListener("pointerdown", (event) => startShapePlacement(event), true);
board.addEventListener("pointerdown", (event) => startFreehandDrawing(event), true);
board.addEventListener("pointerdown", (event) => startBoardPan(event));
document.addEventListener("paste", (event) => handlePaste(event));
document.addEventListener("copy", (event) => handleCopy(event));
document.addEventListener("keydown", (event) => handleGlobalKeydown(event));
document.addEventListener("keyup", (event) => handleGlobalKeyup(event));

document.querySelector("#save-hours-btn").addEventListener("click", () => saveProjectHours());
hoursFinalMode.addEventListener("click", () => setHoursMode("final"));
hoursEditMode.addEventListener("click", () => setHoursMode("edit"));
projectHours.addEventListener("change", () => saveProjectHours());
toggleHours.addEventListener("click", () => togglePanel(hoursPanel, toggleHours));
toggleTasks.addEventListener("click", () => togglePanel(tasksPanel, toggleTasks));
toggleStory.addEventListener("click", () => togglePanel(storyPanel, toggleStory));
toggleLevelDesign.addEventListener("click", () => togglePanel(levelDesignPanel, toggleLevelDesign));
toggleCharacterDesign.addEventListener("click", () => togglePanel(characterDesignPanel, toggleCharacterDesign));
toggleTeam.addEventListener("click", () => togglePanel(teamPanel, toggleTeam));
toggleMilestones.addEventListener("click", () => togglePanel(milestonesPanel, toggleMilestones));
toggleHistory.addEventListener("click", () => togglePanel(historyPanel, toggleHistory));
workspaceDrawerToggle.addEventListener("click", () => toggleDrawer("workspace"));
hoursDrawerToggle.addEventListener("click", () => toggleSidePanel("hours"));
tasksDrawerToggle.addEventListener("click", () => toggleSidePanel("tasks"));
storyDrawerToggle.addEventListener("click", () => toggleSidePanel("story"));
levelDesignDrawerToggle.addEventListener("click", () => toggleSidePanel("level-design"));
characterDesignDrawerToggle.addEventListener("click", () => toggleSidePanel("character-design"));
teamDrawerToggle.addEventListener("click", () => toggleSidePanel("team"));
milestonesDrawerToggle.addEventListener("click", () => toggleSidePanel("milestones"));
historyDrawerToggle.addEventListener("click", () => toggleSidePanel("history"));
closeWorkspaceDrawer.addEventListener("click", () => closeDrawer("workspace"));
closeSideDrawer.addEventListener("click", () => closeDrawer("side"));
addLevelDesignBoard.addEventListener("click", () => addDesignBoardTemplate("level"));
addCharacterDesignBoard.addEventListener("click", () => addDesignBoardTemplate("character"));

milestoneForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addMilestone(milestoneName.value, milestoneDeadline.value);
  milestoneName.value = "";
  milestoneDeadline.value = "";
});

storyRootForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addStoryNode(null, storyRootTitle.value);
  storyRootTitle.value = "";
});
[gddConcept, gddGenre, gddMechanics].forEach((field) => {
  field.addEventListener("change", () => saveGddFields());
});
gddAddCharacter.addEventListener("click", () => addGddCharacter());

teamRoleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTeamRole(teamMemberName.value, teamMemberRole.value);
  teamMemberName.value = "";
  teamMemberRole.value = "";
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = taskTitle.value.trim();
  if (!title) return;
  addTaskColumn(title);
  taskTitle.value = "";
});
}

function toggleDataActions(forceOpen) {
  const isOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : kanbanDataActions.classList.contains("hidden");
  kanbanDataActions.classList.toggle("hidden", !isOpen);
  dataActionsToggle.classList.toggle("active", isOpen);
  dataActionsToggle.setAttribute("aria-expanded", String(isOpen));
}

