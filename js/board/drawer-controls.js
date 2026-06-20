function initializeSideDrawerResize() {
  if (!sideDrawer) return;
  const storageKey = "flowboard-side-drawer-width";
  const minDrawerWidth = 365;
  const getMaxWidth = () => Math.max(minDrawerWidth, window.innerWidth - 58);
  const clampDrawerWidth = (width) => clamp(Math.round(width), minDrawerWidth, getMaxWidth());
  const applyWidth = (width) => {
    const drawerWidth = `${clampDrawerWidth(width)}px`;
    sideDrawer.style.setProperty("--side-drawer-width", drawerWidth);
    projectsDrawer?.style.setProperty("--side-drawer-width", drawerWidth);
    app.style.setProperty("--side-drawer-width", drawerWidth);
  };

  const savedWidth = Number(localStorage.getItem(storageKey));
  if (Number.isFinite(savedWidth) && savedWidth > 0) {
    applyWidth(savedWidth);
  }

  const startResize = (handle, drawer, event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = drawer.getBoundingClientRect().width;
    document.body.classList.add("resizing-side-drawer");
    try {
      handle.setPointerCapture(event.pointerId);
    } catch (error) {
      // Window listeners below keep resizing reliable without pointer capture.
    }

    const move = (moveEvent) => {
      const nextWidth = startWidth + (moveEvent.clientX - startX);
      applyWidth(nextWidth);
    };

    const end = () => {
      document.body.classList.remove("resizing-side-drawer");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      localStorage.setItem(storageKey, String(clampDrawerWidth(drawer.getBoundingClientRect().width)));
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  [
    { handle: sideDrawerResize, drawer: sideDrawer },
    { handle: workspaceDrawerResize, drawer: projectsDrawer }
  ].forEach(({ handle, drawer }) => {
    if (!handle || !drawer) return;
    handle.addEventListener("pointerdown", (event) => startResize(handle, drawer, event));
  });

  window.addEventListener("resize", () => {
    const currentWidth = (app.classList.contains("workspace-open") ? projectsDrawer : sideDrawer).getBoundingClientRect().width;
    applyWidth(currentWidth);
  });
}

function togglePanel(panel, button) {
  const collapsed = panel.classList.toggle("collapsed");
  button.textContent = collapsed ? ">" : "v";
  button.setAttribute("aria-expanded", String(!collapsed));
}

let sidePanelLayoutSettlesAt = 0;

function toggleDrawer(drawer) {
  deactivateBoardCreationTools();
  clearSelection();
  const className = drawer === "workspace" ? "workspace-open" : "side-open";
  window.clearTimeout(drawerSwitchTimer);
  app.classList.remove("drawer-switching");
  pendingDrawerTarget = null;
  if (app.classList.contains(className)) {
    app.classList.remove(className);
    syncDrawerButtons();
    return;
  }
  if (drawer === "workspace" && app.classList.contains("side-open")) {
    pendingDrawerTarget = "workspace";
    app.classList.add("drawer-switching");
    app.classList.remove("side-open");
    syncDrawerButtons();
    drawerSwitchTimer = window.setTimeout(() => {
      pendingDrawerTarget = null;
      app.classList.add("workspace-open");
      syncDrawerButtons();
      requestAnimationFrame(() => app.classList.remove("drawer-switching"));
    }, DRAWER_SWITCH_MS);
    return;
  }
  app.classList.toggle(className);
  syncDrawerButtons();
}

function closeDrawer(drawer) {
  app.classList.remove(drawer === "workspace" ? "workspace-open" : "side-open");
  syncDrawerButtons();
}

function closeDrawersForBoardSelection() {
  window.clearTimeout(drawerSwitchTimer);
  pendingDrawerTarget = null;
  app.classList.remove("drawer-switching", "workspace-open", "side-open");
  syncDrawerButtons();
}

function syncDrawerButtons() {
  const actualWorkspaceOpen = app.classList.contains("workspace-open");
  const actualSideOpen = app.classList.contains("side-open");
  const workspaceOpen = actualWorkspaceOpen || pendingDrawerTarget === "workspace";
  const sideOpen = actualSideOpen || Boolean(pendingDrawerTarget && pendingDrawerTarget !== "workspace");
  const targetSidePanel = pendingDrawerTarget && pendingDrawerTarget !== "workspace" ? pendingDrawerTarget : activeSidePanel;
  workspaceDrawerToggle.setAttribute("aria-expanded", String(workspaceOpen));
  hoursDrawerToggle.setAttribute("aria-expanded", String(sideOpen && targetSidePanel === "hours"));
  tasksDrawerToggle.setAttribute("aria-expanded", String(sideOpen && targetSidePanel === "tasks"));
  codeDrawerToggle.setAttribute("aria-expanded", String(sideOpen && targetSidePanel === "code"));
  storyDrawerToggle.setAttribute("aria-expanded", String(sideOpen && targetSidePanel === "story"));
  levelDesignDrawerToggle.setAttribute("aria-expanded", String(sideOpen && targetSidePanel === "level-design"));
  characterDesignDrawerToggle.setAttribute("aria-expanded", String(sideOpen && targetSidePanel === "character-design"));
  teamDrawerToggle.setAttribute("aria-expanded", String(sideOpen && targetSidePanel === "team"));
  milestonesDrawerToggle.setAttribute("aria-expanded", String(sideOpen && targetSidePanel === "milestones"));
  historyDrawerToggle.setAttribute("aria-expanded", String(sideOpen && targetSidePanel === "history"));
  workspaceDrawerToggle.classList.toggle("active", workspaceOpen);
  hoursDrawerToggle.classList.toggle("active", sideOpen && targetSidePanel === "hours");
  tasksDrawerToggle.classList.toggle("active", sideOpen && targetSidePanel === "tasks");
  codeDrawerToggle.classList.toggle("active", sideOpen && targetSidePanel === "code");
  storyDrawerToggle.classList.toggle("active", sideOpen && targetSidePanel === "story");
  levelDesignDrawerToggle.classList.toggle("active", sideOpen && targetSidePanel === "level-design");
  characterDesignDrawerToggle.classList.toggle("active", sideOpen && targetSidePanel === "character-design");
  teamDrawerToggle.classList.toggle("active", sideOpen && targetSidePanel === "team");
  milestonesDrawerToggle.classList.toggle("active", sideOpen && targetSidePanel === "milestones");
  historyDrawerToggle.classList.toggle("active", sideOpen && targetSidePanel === "history");
  projectsDrawer.setAttribute("aria-hidden", String(!actualWorkspaceOpen));
  sideDrawer.setAttribute("aria-hidden", String(!actualSideOpen));
}

function getAllowedSidePanel(panelName) {
  if (!isGameJamProject()) return panelName;
  return ["hours", "tasks", "code", "story", "team"].includes(panelName) ? panelName : "hours";
}

function toggleSidePanel(panelName) {
  deactivateBoardCreationTools();
  clearSelection();
  panelName = getAllowedSidePanel(panelName);
  const sideOpen = app.classList.contains("side-open");
  if (sideOpen && activeSidePanel === panelName) {
    closeDrawer("side");
    return;
  }
  window.clearTimeout(drawerSwitchTimer);
  app.classList.remove("drawer-switching");
  pendingDrawerTarget = null;
  if (sideOpen || app.classList.contains("workspace-open")) {
    pendingDrawerTarget = panelName;
    app.classList.add("drawer-switching");
    app.classList.remove("side-open", "workspace-open");
    syncDrawerButtons();
    drawerSwitchTimer = window.setTimeout(() => {
      pendingDrawerTarget = null;
      openSidePanel(panelName);
      requestAnimationFrame(() => app.classList.remove("drawer-switching"));
    }, DRAWER_SWITCH_MS);
    return;
  }
  openSidePanel(panelName);
}

function openSidePanelFromBoardContext(panelName) {
  deactivateBoardCreationTools();
  clearSelection();
  openSidePanel(panelName);
}

function openSidePanel(panelName) {
  panelName = getAllowedSidePanel(panelName);
  const wasSideOpen = app.classList.contains("side-open");
  const previousPanel = activeSidePanel;
  activeSidePanel = panelName;
  sideDrawer.dataset.mode = panelName;
  setPanelOpen(hoursPanel, toggleHours, panelName === "hours");
  setPanelOpen(tasksPanel, toggleTasks, panelName === "tasks");
  setPanelOpen(codePanel, toggleCode, panelName === "code");
  setPanelOpen(storyPanel, toggleStory, panelName === "story");
  setPanelOpen(levelDesignPanel, toggleLevelDesign, panelName === "level-design");
  setPanelOpen(characterDesignPanel, toggleCharacterDesign, panelName === "character-design");
  setPanelOpen(teamPanel, toggleTeam, panelName === "team");
  setPanelOpen(milestonesPanel, toggleMilestones, panelName === "milestones");
  setPanelOpen(historyPanel, toggleHistory, panelName === "history");
  app.classList.remove("workspace-open");
  app.classList.add("side-open");
  if (panelName === "level-design") {
    window.requestAnimationFrame(() => renderLevelWorkspaces());
  } else if (panelName === "character-design") {
    window.requestAnimationFrame(() => renderCharacterWorkspaces());
  }
  if (!wasSideOpen || previousPanel !== panelName) {
    sidePanelLayoutSettlesAt = Date.now() + DRAWER_SWITCH_MS;
  }
  syncDrawerButtons();
}

function setPanelOpen(panel, button, open) {
  panel.classList.toggle("collapsed", !open);
  button.textContent = "";
  button.setAttribute("aria-expanded", String(open));
}
