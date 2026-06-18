async function fetchFirstWorkspaceForUser(userId) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name, state, updated_at, owner_id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const row = (data || []).find((membership) => membership.workspaces);
  return row?.workspaces ? { ...row.workspaces, currentRole: row.role } : null;
}

async function fetchWorkspaceById(workspaceId) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("workspaces")
    .select("id, name, state, updated_at, owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createWorkspaceRecord(name, ownerId, workspaceState) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("workspaces")
    .insert({
      name,
      owner_id: ownerId,
      state: workspaceState
    })
    .select("id, name, state, updated_at, owner_id")
    .single();
  if (error) throw error;
  return data;
}

async function addWorkspaceOwnerMember(workspaceId, userId) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("workspace_members")
    .insert({ workspace_id: workspaceId, user_id: userId, role: "owner" });
  if (error && error.code !== "23505") throw error;
}

async function fetchWorkspaceMembers(workspaceId) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("workspace_members")
    .select("workspace_id, user_id, role, created_at, profiles(display_name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function updateWorkspaceMemberRoleRecord(workspaceId, userId, role) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw error;
}

async function deleteWorkspaceMemberRecord(workspaceId, userId) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw error;
}

async function acceptWorkspaceInviteToken(token) {
  const client = getSupabaseClient();
  const { data: workspaceId, error } = await client.rpc("accept_workspace_invite", {
    invite_token: token
  });
  if (error) throw error;
  return workspaceId || null;
}

async function createWorkspaceInviteRecord(token, workspaceId, createdBy, expiresAt) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("workspace_invites")
    .insert({
      token,
      workspace_id: workspaceId,
      created_by: createdBy,
      expires_at: expiresAt
    });
  if (error) throw error;
}

async function saveWorkspaceRecordState(workspaceId, workspaceState) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("workspaces")
    .update({ state: workspaceState, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  if (error) throw error;
}

function createWorkspaceRealtimeChannel(workspaceId) {
  const client = getSupabaseClient();
  if (!client || !workspaceId) return null;
  return client.channel(`workspace:${workspaceId}`, {
    config: { broadcast: { self: false } }
  });
}

async function removeWorkspaceRealtimeChannel(channel) {
  const client = getSupabaseClient();
  if (client && channel) await client.removeChannel(channel);
}
