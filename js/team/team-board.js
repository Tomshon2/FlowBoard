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
  const role = cleanUserText(rawRole, 80);
  const name = cleanUserText(rawName, 80);
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
  renderTasks();
}

function updateTeamRole(id, patch) {
  const project = getActiveProject();
  if (!project) return;
  const member = (project.teamRoles || []).find((candidate) => candidate.id === id);
  if (!member) return;
  const beforeRoles = structuredClone(project.teamRoles);
  if (Object.prototype.hasOwnProperty.call(patch, "name")) member.name = cleanUserText(patch.name, 80, "Team member");
  if (Object.prototype.hasOwnProperty.call(patch, "role")) member.role = cleanUserText(patch.role, 80, "Role");
  if (Object.prototype.hasOwnProperty.call(patch, "notes")) member.notes = String(patch.notes || "").slice(0, 3000);
  saveTeamChange(project, beforeRoles, `project:${project.id}:teamRole:${id}`);
  renderTasks();
}

async function deleteTeamRole(id) {
  const project = getActiveProject();
  if (!project) return;
  if (!await confirmDangerousAction("Remove this team role?")) return;
  const beforeRoles = structuredClone(project.teamRoles || []);
  project.teamRoles = (project.teamRoles || []).filter((member) => member.id !== id);
  saveTeamChange(project, beforeRoles);
  renderTeamRoles();
  renderTasks();
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
    name.addEventListener("change", () => updateTeamRole(member.id, { name: name.value }));

    const role = document.createElement("input");
    role.value = member.role || "";
    role.placeholder = "Role";
    role.addEventListener("change", () => updateTeamRole(member.id, { role: role.value }));

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

function getOnlineUserIds() {
  const onlineIds = new Set();
  if (currentUser?.id) onlineIds.add(currentUser.id);
  remoteCursors.forEach((cursor) => {
    if (Date.now() - cursor.seenAt <= 9000 && cursor.userId) onlineIds.add(cursor.userId);
  });
  return onlineIds;
}

function renderWorkspaceMembers() {
  if (!workspaceMembersList || !workspaceRoleBadge) return;
  workspaceMembersList.innerHTML = "";
  workspaceRoleBadge.textContent = currentWorkspaceRole || "guest";
  workspaceRoleBadge.className = `workspace-role-badge role-${currentWorkspaceRole || "guest"}`;

  const canManage = canManageWorkspaceMembers();
  workspaceMembersHelp.textContent = canManage
    ? "You can change roles and remove members."
    : "Only owner/admin can manage workspace members.";

  if (!currentWorkspaceId) {
    const empty = document.createElement("p");
    empty.className = "empty-panel-copy";
    empty.textContent = "Sign in to Supabase to see workspace members.";
    workspaceMembersList.append(empty);
    return;
  }

  if (!workspaceMembers.length) {
    const empty = document.createElement("p");
    empty.className = "empty-panel-copy";
    empty.textContent = "Members will appear here after the workspace loads.";
    workspaceMembersList.append(empty);
    return;
  }

  const onlineIds = getOnlineUserIds();
  workspaceMembers.forEach((member) => {
    const row = document.createElement("article");
    row.className = "workspace-member-row";
    const isOnline = onlineIds.has(member.userId);
    const isSelf = member.userId === currentUser?.id;
    const isOwner = member.role === "owner";
    const canEditThisMember = canManage && !isOwner && !isSelf;

    const identity = document.createElement("div");
    identity.className = "workspace-member-identity";
    identity.innerHTML = `
      <span class="presence-dot ${isOnline ? "online" : ""}" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(member.displayName || "Team member")}${isSelf ? " (you)" : ""}</strong>
        <small>${isOnline ? "Online" : "Offline"}</small>
      </div>
    `;

    const roleSelect = document.createElement("select");
    roleSelect.className = "workspace-member-role";
    ["owner", "admin", "editor", "viewer", "guest"].forEach((role) => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role[0].toUpperCase() + role.slice(1);
      option.disabled = role === "owner" && member.role !== "owner";
      roleSelect.append(option);
    });
    roleSelect.value = member.role;
    roleSelect.disabled = !canEditThisMember;
    roleSelect.addEventListener("change", () => updateWorkspaceMemberRole(member.userId, roleSelect.value));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "small delete-task workspace-member-remove";
    removeButton.textContent = "x";
    removeButton.title = "Remove member";
    removeButton.disabled = !canEditThisMember;
    removeButton.addEventListener("click", () => removeWorkspaceMember(member.userId));

    row.append(identity, roleSelect, removeButton);
    workspaceMembersList.append(row);
  });
}
