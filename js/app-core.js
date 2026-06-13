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
let cursorChannelReady = false;
let cursorSendTimer = null;
let pendingCursorPoint = null;
let remoteCursors = new Map();

const ticketColors = [
  "#fff1b8", "#f6b7d8", "#b987f4", "#7dc7ff", "#71d694", "#ffb15f",
  "#ffffff", "#d9f99d", "#a7f3d0", "#bae6fd", "#c7d2fe", "#fecaca",
  "#fef3c7", "#e5e7eb", "#1d2733"
];
const DEFAULT_CONNECTION_COLOR = "#172033";
const DEFAULT_CONNECTION_THICKNESS = 3;
const DEFAULT_DRAWING_THICKNESS = 4;

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
  boardTheme: "light",
  updatedAt: 0,
  projects: [
    {
      id: "project-1",
      name: "Example project",
      totalHours: 40,
      tasks: [
        { id: "task-1", title: "Define sprint goal", done: false },
        { id: "task-2", title: "Review images and references", done: true }
      ],
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
const imageInput = document.querySelector("#image-input");
const drawTool = document.querySelector("#draw-tool");
const createColor = document.querySelector("#create-color");
const shapeTools = document.querySelectorAll("[data-shape-tool]");
const boardThemeBtn = document.querySelector("#board-theme-btn");
const projectHours = document.querySelector("#project-hours");
const hoursTotalLabel = document.querySelector("#hours-total-label");
const hoursTable = document.querySelector("#hours-table");
const connectionStylePanel = document.querySelector("#connection-style-panel");
const connectionColor = document.querySelector("#connection-color");
const connectionThickness = document.querySelector("#connection-thickness");
const connectionThicknessLabel = document.querySelector("#connection-thickness-label");
const propertiesPanel = document.querySelector("#properties-panel");
const propertiesTitle = document.querySelector("#properties-title");
const boardProperties = document.querySelector("#board-properties");
const lineProperties = document.querySelector("#line-properties");
const propertiesBoardColor = document.querySelector("#properties-board-color");
const propertiesBoardHex = document.querySelector("#properties-board-hex");
const propertiesBoardText = document.querySelector("#properties-board-text");
const propertiesFontFamily = document.querySelector("#properties-font-family");
const propertiesFontSize = document.querySelector("#properties-font-size");
const propertiesTextColor = document.querySelector("#properties-text-color");
const propertiesBold = document.querySelector("#properties-bold");
const propertiesItalic = document.querySelector("#properties-italic");
const propertiesUnderline = document.querySelector("#properties-underline");
const propertiesLineColor = document.querySelector("#properties-line-color");
const propertiesLineThickness = document.querySelector("#properties-line-thickness");
const propertiesLineThicknessLabel = document.querySelector("#properties-line-thickness-label");
const hoursPanel = document.querySelector("#hours-panel");
const tasksPanel = document.querySelector("#tasks-panel");
const storyPanel = document.querySelector("#story-panel");
const teamPanel = document.querySelector("#team-panel");
const toggleHours = document.querySelector("#toggle-hours");
const toggleTasks = document.querySelector("#toggle-tasks");
const toggleStory = document.querySelector("#toggle-story");
const toggleTeam = document.querySelector("#toggle-team");
const workspaceDrawerToggle = document.querySelector("#workspace-drawer-toggle");
const hoursDrawerToggle = document.querySelector("#hours-drawer-toggle");
const tasksDrawerToggle = document.querySelector("#tasks-drawer-toggle");
const storyDrawerToggle = document.querySelector("#story-drawer-toggle");
const teamDrawerToggle = document.querySelector("#team-drawer-toggle");
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
const storyRootForm = document.querySelector("#story-root-form");
const storyRootTitle = document.querySelector("#story-root-title");
const storyTree = document.querySelector("#story-tree");
const storyCount = document.querySelector("#story-count");
const teamRoleForm = document.querySelector("#team-role-form");
const teamMemberName = document.querySelector("#team-member-name");
const teamMemberRole = document.querySelector("#team-member-role");
const teamRoleList = document.querySelector("#team-role-list");
const teamCount = document.querySelector("#team-count");
let activeSidePanel = "hours";
let authMode = "login";
let eventListenersReady = false;
sideDrawer.dataset.mode = activeSidePanel;
displayNameInput.value = currentDisplayName;

function setupEventListeners() {
if (eventListenersReady) return;
eventListenersReady = true;
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

projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = projectName.value.trim();
  if (!name) return;
  const project = {
    id: crypto.randomUUID(),
    name,
    totalHours: 40,
    tasks: [],
    story: [],
    teamRoles: [],
    items: [],
    connections: []
  };
  state.projects.push(project);
  state.activeProjectId = project.id;
  projectName.value = "";
  saveAndRender();
});

shapeTools.forEach((tool) => {
  tool.addEventListener("click", () => {
    if (drawMode) toggleDrawMode();
    setActiveShapeTool(activeShapeTool === tool.dataset.shapeTool ? null : tool.dataset.shapeTool);
  });
});
drawTool.addEventListener("click", () => {
  setActiveShapeTool(null);
  toggleDrawMode();
});
boardThemeBtn.addEventListener("click", () => toggleBoardTheme());
createColor.addEventListener("input", (event) => {
  createColor.value = normalizeHexColor(event.target.value, ticketColors[0]);
  if (drawMode) renderPropertiesPanel();
});
connectionStylePanel.addEventListener("pointerdown", (event) => event.stopPropagation());
connectionColor.addEventListener("input", (event) => updateSelectedConnections({ color: event.target.value }));
connectionThickness.addEventListener("input", (event) => updateSelectedConnections({ thickness: Number(event.target.value) }));
propertiesPanel.addEventListener("pointerdown", (event) => event.stopPropagation());
propertiesBoardColor.addEventListener("input", (event) => updateSelectedBoardColor(event.target.value));
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
  lastBoardPoint = getBoardPoint(event);
  updateNearbyConnectionDots(lastBoardPoint);
  broadcastCursor(lastBoardPoint);
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
projectHours.addEventListener("change", () => saveProjectHours());
toggleHours.addEventListener("click", () => togglePanel(hoursPanel, toggleHours));
toggleTasks.addEventListener("click", () => togglePanel(tasksPanel, toggleTasks));
toggleStory.addEventListener("click", () => togglePanel(storyPanel, toggleStory));
toggleTeam.addEventListener("click", () => togglePanel(teamPanel, toggleTeam));
workspaceDrawerToggle.addEventListener("click", () => toggleDrawer("workspace"));
hoursDrawerToggle.addEventListener("click", () => toggleSidePanel("hours"));
tasksDrawerToggle.addEventListener("click", () => toggleSidePanel("tasks"));
storyDrawerToggle.addEventListener("click", () => toggleSidePanel("story"));
teamDrawerToggle.addEventListener("click", () => toggleSidePanel("team"));
closeWorkspaceDrawer.addEventListener("click", () => closeDrawer("workspace"));
closeSideDrawer.addEventListener("click", () => closeDrawer("side"));

storyRootForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addStoryNode(null, storyRootTitle.value);
  storyRootTitle.value = "";
});

teamRoleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTeamRole(teamMemberName.value, teamMemberRole.value);
  teamMemberName.value = "";
  teamMemberRole.value = "";
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const project = getActiveProject();
  const title = taskTitle.value.trim();
  if (!project || !title) return;
  const beforeTasks = structuredClone(project.tasks);
  project.tasks.push({ id: crypto.randomUUID(), title, done: false });
  const afterTasks = structuredClone(project.tasks);
  taskTitle.value = "";
  saveState({
    historyEntry: createHistoryCommand(
      "updateProject",
      project.id,
      { tasks: beforeTasks },
      { tasks: afterTasks },
      { projectId: project.id, groupKey: `project:${project.id}:tasks` }
    ),
    forceStep: true
  });
  render();
});
}

