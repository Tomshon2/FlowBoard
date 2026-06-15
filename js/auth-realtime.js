function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase || !SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) return null;
  supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return supabaseClient;
}

function showApp() {
  authScreen.classList.add("hidden");
  app.classList.remove("hidden");
  normalizeState();
  initializeHistory();
  render();
}

async function initializeApp() {
  setupAuthUi();
  normalizeState();
  initializeHistory();

  const client = getSupabaseClient();
  if (!client) {
    authScreen.classList.remove("hidden");
    app.classList.add("hidden");
    renderBoardTheme();
    loginError.textContent = "Supabase is not configured. Check config.js.";
    return;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    loginError.textContent = error.message;
    return;
  }

  currentUser = normalizeSupabaseUser(data.session?.user);
  ensureDisplayName();
  if (!currentUser) {
    authScreen.classList.remove("hidden");
    app.classList.add("hidden");
    renderBoardTheme();
    if (pendingInviteToken) {
      loginError.textContent = "Sign in or create an account to join this board.";
    }
    return;
  }

  await upsertProfile();
  if (pendingInviteToken && await joinWorkspaceByInvite(pendingInviteToken)) {
    showApp();
    return;
  }
  if (await loadOnlineWorkspace()) showApp();
}

function setupAuthUi() {
  displayNameInput.placeholder = "Visible name";
  loginLabel.textContent = "Email";
  loginEmail.classList.remove("hidden");
  document.querySelector("#access-code").placeholder = "Password";
  showAuthForm();
  setAuthMode("login");
}

function showAuthForm() {
  authLoginMode.classList.remove("hidden");
  authSignupMode.classList.remove("hidden");
  loginForm.classList.remove("hidden");
  authFormTitle.classList.remove("hidden");
  authFormCopy.classList.remove("hidden");
}

function setAuthMode(mode) {
  showAuthForm();
  authMode = mode === "signup" ? "signup" : "login";
  const isSignup = authMode === "signup";
  authPanel.classList.toggle("signup-mode", isSignup);
  authLoginMode.classList.toggle("active", !isSignup);
  authSignupMode.classList.toggle("active", isSignup);
  passwordRules.classList.toggle("hidden", !isSignup);
  authSubmitBtn.textContent = isSignup ? "Sign up" : "Log in";
  authFormTitle.textContent = isSignup ? "Create your account" : "Log in";
  authFormCopy.textContent = isSignup ? "Create your account and start building your board." : "Enter your account and keep building your boards.";
  authBrandCopy.textContent = isSignup ? "Already have an account? Move back to the login side." : "New here? Create an account and start your own board.";
  document.querySelector("#access-code").autocomplete = isSignup ? "new-password" : "current-password";
  loginError.textContent = "";
}

async function signInOnline() {
  const client = getSupabaseClient();
  saveDisplayName();
  loginError.textContent = "";
  if (!client) {
    loginError.textContent = "Supabase is not configured. Check config.js.";
    return;
  }
  if (!currentDisplayName) {
    loginError.textContent = "Enter a visible name so other people know who you are.";
    return;
  }

  const email = loginEmail.value.trim();
  const password = document.querySelector("#access-code").value;
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error("Invalid email or password.");
    setAuthSession(data.session);
    await upsertProfile();
    if (pendingInviteToken && await joinWorkspaceByInvite(pendingInviteToken)) {
      showApp();
      return;
    }
    if (await loadOnlineWorkspace()) showApp();
  } catch (error) {
    loginError.textContent = error.message;
  }
}

async function signUpOnline() {
  const client = getSupabaseClient();
  saveDisplayName();
  loginError.textContent = "";
  if (!client) {
    loginError.textContent = "Supabase is not configured. Check config.js.";
    return;
  }
  if (!currentDisplayName) {
    loginError.textContent = "Enter a visible name so other people know who you are.";
    return;
  }

  const email = loginEmail.value.trim();
  const password = document.querySelector("#access-code").value;
  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    loginError.textContent = passwordError;
    return;
  }

  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: currentDisplayName }
      }
    });
    if (error) throw normalizeAuthError(error);
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("Email already in use.");
    }

    let session = data.session;
    if (!session) {
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error) {
        throw new Error("Account created, but Supabase still requires email confirmation. Disable Confirm email in Supabase Auth settings.");
      }
      session = login.data.session;
    }

    setAuthSession(session);
    await upsertProfile();
    if (pendingInviteToken && await joinWorkspaceByInvite(pendingInviteToken)) {
      showApp();
      return;
    }
    if (await loadOnlineWorkspace(state)) showApp();
  } catch (error) {
    loginError.textContent = error.message;
  }
}

async function signOut() {
  broadcastCursor(null, true);
  clearRemoteCursors();
  await saveStateRemoteNow();
  await unsubscribeFromWorkspace();
  const client = getSupabaseClient();
  await client?.auth.signOut();
  cursorChannelReady = false;
  currentWorkspaceId = null;
  currentUser = null;
  authScreen.classList.remove("hidden");
  app.classList.add("hidden");
}

function normalizeAuthError(error) {
  if (/already|registered|exists/i.test(error.message || "")) return new Error("Email already in use.");
  return error;
}

function normalizeSupabaseUser(user) {
  if (!user) return null;
  const displayName = user.user_metadata?.display_name || user.user_metadata?.name || "";
  return { id: user.id, email: user.email, displayName };
}

function getAuthToken() {
  return "";
}

function setAuthSession(session) {
  currentUser = normalizeSupabaseUser(session?.user);
  if (currentDisplayName) {
    currentUser.displayName = currentDisplayName;
  } else if (currentUser?.displayName) {
    currentDisplayName = currentUser.displayName;
    localStorage.setItem("flowboard-display-name", currentDisplayName);
  }
  ensureDisplayName();
}

function parseJwtUser() {
  return null;
}

async function apiRequest() {
  throw new Error("This build uses Supabase directly instead of the old backend API.");
}

function saveDisplayName() {
  const value = cleanUserText(displayNameInput.value, 32);
  if (!value) return;
  currentDisplayName = value;
  localStorage.setItem("flowboard-display-name", currentDisplayName);
  displayNameInput.value = currentDisplayName;
  if (currentUser) currentUser.displayName = currentDisplayName;
}

function ensureDisplayName() {
  if (!currentDisplayName && currentUser?.displayName) {
    currentDisplayName = currentUser.displayName;
    localStorage.setItem("flowboard-display-name", currentDisplayName);
  }
  if (!currentDisplayName && currentUser?.email) {
    currentDisplayName = currentUser.email.split("@")[0] || "Guest";
    localStorage.setItem("flowboard-display-name", currentDisplayName);
  }
  displayNameInput.value = currentDisplayName;
}

async function upsertProfile() {
  const client = getSupabaseClient();
  if (!client || !currentUser?.id) return;
  const displayName = currentDisplayName || currentUser.displayName || currentUser.email?.split("@")[0] || "Guest";
  currentDisplayName = displayName.slice(0, 32);
  currentUser.displayName = currentDisplayName;
  localStorage.setItem("flowboard-display-name", currentDisplayName);
  displayNameInput.value = currentDisplayName;

  await client.auth.updateUser({ data: { display_name: currentDisplayName } });
  const { error } = await client
    .from("profiles")
    .upsert({ id: currentUser.id, display_name: currentDisplayName, updated_at: new Date().toISOString() });
  if (error) console.warn("FlowBoard profile save failed:", error.message);
}

function getCursorColor() {
  let hash = 0;
  for (const char of clientId) hash = (hash + char.charCodeAt(0)) % cursorColors.length;
  return cursorColors[hash];
}

function broadcastCursor(point, immediate = false) {
  if (!cursorChannelReady || !workspaceChannel) return;
  pendingCursorPoint = point ? { x: Math.round(point.x), y: Math.round(point.y) } : null;
  if (immediate) {
    sendPendingCursor();
    return;
  }
  if (cursorSendTimer) return;
  cursorSendTimer = window.setTimeout(sendPendingCursor, 55);
}

function sendPendingCursor() {
  window.clearTimeout(cursorSendTimer);
  cursorSendTimer = null;
  if (!cursorChannelReady || !workspaceChannel) return;
  const point = pendingCursorPoint;
  workspaceChannel.send({
    type: "broadcast",
    event: "cursor",
    payload: {
      clientId,
      projectId: state.activeProjectId,
      name: currentDisplayName || currentUser?.email?.split("@")[0] || "Guest",
      color: getCursorColor(),
      visible: Boolean(point),
      x: point?.x ?? 0,
      y: point?.y ?? 0,
      sentAt: Date.now()
    }
  });
}

function handleRemoteCursor(message) {
  const payload = message?.payload || {};
  if (!payload.clientId || payload.clientId === clientId) return;

  if (!payload.visible || payload.projectId !== state.activeProjectId) {
    remoteCursors.delete(payload.clientId);
    renderRemoteCursors();
    return;
  }

  remoteCursors.set(payload.clientId, {
    projectId: payload.projectId,
    name: String(payload.name || "Guest").slice(0, 32),
    color: normalizeHexColor(payload.color, "#126c83"),
    x: clamp(Number(payload.x) || 0, 0, 6400),
    y: clamp(Number(payload.y) || 0, 0, 4200),
    seenAt: Date.now()
  });
  renderRemoteCursors();
}

function renderRemoteCursors() {
  if (!cursorLayer) return;
  const now = Date.now();
  cursorLayer.innerHTML = "";
  remoteCursors.forEach((cursor, id) => {
    if (now - cursor.seenAt > 8000) {
      remoteCursors.delete(id);
      return;
    }
    if (cursor.projectId !== state.activeProjectId) return;
    const node = document.createElement("div");
    node.className = "remote-cursor";
    node.style.left = `${cursor.x}px`;
    node.style.top = `${cursor.y}px`;
    node.style.setProperty("--cursor-color", cursor.color);

    const pointer = document.createElement("span");
    pointer.className = "remote-cursor-pointer";
    const name = document.createElement("span");
    name.className = "remote-cursor-name";
    name.textContent = cursor.name;
    node.append(pointer, name);
    cursorLayer.append(node);
  });
}

function clearRemoteCursors() {
  remoteCursors.clear();
  if (cursorLayer) cursorLayer.innerHTML = "";
}

async function loadOnlineWorkspace(initialState = {}) {
  try {
    let workspace = await getFirstAvailableWorkspace();
    if (!workspace) workspace = await createOnlineWorkspace(initialState);
    applyLoadedWorkspace(workspace);
    return true;
  } catch (error) {
    loginError.textContent = error.message;
    currentUser = null;
    return false;
  }
}

async function getFirstAvailableWorkspace() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name, state, updated_at, owner_id)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const row = (data || []).find((membership) => membership.workspaces);
  return row?.workspaces || null;
}

async function getWorkspaceById(workspaceId) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("workspaces")
    .select("id, name, state, updated_at, owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function joinWorkspaceByInvite(inviteToken) {
  try {
    const workspaceId = await acceptWorkspaceInvite(inviteToken);
    if (!workspaceId) {
      loginError.textContent = "Invite link is invalid or expired.";
      return false;
    }
    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace) {
      loginError.textContent = "Invite link is invalid or expired.";
      return false;
    }
    applyLoadedWorkspace(workspace);
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  } catch (error) {
    loginError.textContent = error.message;
    return false;
  }
}

function getPasswordValidationError(password) {
  if (password.length < 8) return "Password must have at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  if (!/[.!?@#$%^&*()_\-+=\[\]{};:'\",<>/\\|`~]/.test(password)) {
    return "Password must include at least one special character like . ! or ?";
  }
  return "";
}

function applyLoadedWorkspace(workspace) {
  currentWorkspaceId = workspace.id;
  applyingRemoteState = true;
  state = workspace.state?.projects ? workspace.state : structuredClone(defaultState);
  normalizeState();
  initializeHistory();
  applyingRemoteState = false;
  subscribeToWorkspace();
}

async function createOnlineWorkspace(initialState = {}) {
  const client = getSupabaseClient();
  const { data: workspace, error: workspaceError } = await client
    .from("workspaces")
    .insert({
      name: SUPABASE_CONFIG.workspaceName || "FlowBoard Team",
      owner_id: currentUser.id,
      state: initialState?.projects ? initialState : state
    })
    .select("id, name, state, updated_at, owner_id")
    .single();
  if (workspaceError) throw workspaceError;

  const { error: memberError } = await client
    .from("workspace_members")
    .insert({ workspace_id: workspace.id, user_id: currentUser.id, role: "owner" });
  if (memberError && memberError.code !== "23505") throw memberError;

  currentWorkspaceId = workspace.id;
  return workspace;
}

async function acceptWorkspaceInvite(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken || !currentUser?.id) return null;
  const client = getSupabaseClient();
  const { data: workspaceId, error } = await client.rpc("accept_workspace_invite", {
    invite_token: normalizedToken
  });
  if (error) throw error;
  return workspaceId || null;
}

async function createInviteLink() {
  inviteStatus.textContent = "";
  invitePanel.classList.remove("hidden");
  inviteLink.value = "Creating link...";
  try {
    if (!currentWorkspaceId) throw new Error("Open a workspace before creating an invite.");
    const client = getSupabaseClient();
    const token = createInviteToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await client
      .from("workspace_invites")
      .insert({
        token,
        workspace_id: currentWorkspaceId,
        created_by: currentUser.id,
        expires_at: expiresAt
      });
    if (error) throw error;

    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("invite", token);
    inviteLink.value = url.toString();
    await copyInviteLink();
  } catch (error) {
    inviteLink.value = "";
    inviteStatus.textContent = error.message;
  }
}

function createInviteToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function copyInviteLink() {
  if (!inviteLink.value || inviteLink.value === "Creating link...") return;
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    inviteStatus.textContent = "Invite link copied.";
  } catch {
    inviteLink.select();
    inviteStatus.textContent = "Link ready. Select and copy it.";
  }
}

async function saveWorkspaceState() {
  if (!currentWorkspaceId || applyingRemoteState) return;
  const client = getSupabaseClient();
  const { error } = await client
    .from("workspaces")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", currentWorkspaceId);
  if (error) throw error;
}

async function subscribeToWorkspace() {
  const client = getSupabaseClient();
  await unsubscribeFromWorkspace();
  if (!client || !currentWorkspaceId) return;

  cursorChannelReady = false;
  clearRemoteCursors();
  workspaceChannel = client.channel(`workspace:${currentWorkspaceId}`, {
    config: { broadcast: { self: false } }
  });

  workspaceChannel
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "workspaces",
      filter: `id=eq.${currentWorkspaceId}`
    }, (payload) => {
      if (!payload?.new?.state || applyingRemoteState) return;
      if (interactionLock) return;
      const remoteStamp = Number(payload.new.state.updatedAt) || 0;
      if (remoteStamp < latestLocalStateStamp) return;
      applyingRemoteState = true;
      state = payload.new.state;
      latestLocalStateStamp = Math.max(latestLocalStateStamp, remoteStamp);
      normalizeState();
      initializeHistory();
      render();
      applyingRemoteState = false;
    })
    .on("broadcast", { event: "cursor" }, (payload) => handleRemoteCursor(payload))
    .subscribe((status) => {
      cursorChannelReady = status === "SUBSCRIBED";
      if (cursorChannelReady) broadcastCursor(lastBoardPoint, true);
    });
}

async function unsubscribeFromWorkspace() {
  const client = getSupabaseClient();
  if (client && workspaceChannel) {
    await client.removeChannel(workspaceChannel);
  }
  workspaceChannel = null;
  cursorChannelReady = false;
}
