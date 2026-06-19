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
const GAMEJAM_SHAPE_TOOLS = new Set(["square", "rectangle", "circle", "diamond"]);

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
      codeFiles: [],
      activeCodeFileId: "",
      items: [
        { id: "item-1", type: "ticket", x: 72, y: 70, width: 230, height: 140, text: "Board: create first wireframe", color: "#fff1b8" },
        { id: "item-2", type: "ticket", x: 330, y: 150, width: 260, height: 150, text: "Board: split work into focus blocks", color: "#71d694" }
      ],
      connections: [{ id: "conn-1", from: "item-1", to: "item-2", fromSide: "bottom", toSide: "top", axis: "y", bend: 220 }]
    }
  ]
};
