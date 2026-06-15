# FlowBoard

FlowBoard is a visual collaborative planning tool for small game-development teams. It combines a freeform board, project tasks, hour planning, game story notes, and team roles in one shared workspace.

## Main Features

- User accounts through Supabase Auth.
- Shared workspaces with invite links.
- Visual boards with cards, shapes, drawings, images, and connections.
- Kanban-style task columns and task issue details.
- Task priorities, deadlines, tags, checklists, filters, and board-element links.
- Project-hour planning by phase and task.
- Game story sections with nested subdivisions.
- Team role notes and task assignees.
- Realtime board updates and live cursors through Supabase.
- Image upload through Supabase Storage when configured.
- Project/task export and import through JSON, CSV, PNG, and printable PDF reports.

## Technologies

- Static HTML, CSS, and JavaScript.
- Supabase Auth, Postgres, Realtime, Row Level Security, and Storage.
- Vercel static hosting.

## Project Structure

- `index.html`: application shell and panels.
- `styles.css`: full visual styling.
- `config.js`: Supabase project URL and publishable key.
- `supabase-schema.sql`: database tables, RLS policies, realtime setup, and Storage bucket.
- `js/app-core.js`: shared state, DOM references, setup, and event wiring.
- `js/auth-realtime.js`: login, signup, profiles, workspaces, invites, saving, and realtime.
- `js/state-history.js`: state normalization, local persistence, undo, and redo.
- `js/render-board.js`: board rendering, project list, items, and property panels.
- `js/board-tools.js`: drawing, selection tools, shapes, and connections.
- `js/items-interactions.js`: item creation, image import/upload, clipboard, drag/drop, zoom, and drawers.
- `js/selection-projects.js`: project actions, selection, deletion, keyboard handling, and resize persistence.
- `js/tasks-hours.js`: task board and hour-planning panels.
- `js/story-team.js`: game story tree and team roles.
- `js/text-utils.js`: text formatting, sanitizing, validation helpers, and small utilities.
- `js/bootstrap.js`: startup.

## Configure Supabase

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run the full contents of `supabase-schema.sql`.
4. In Supabase Auth, configure your site URL and allowed redirect URLs for local and production use.
5. Copy `.env.example` if needed, but the current static app reads values from `config.js`.
6. Update `config.js`:

```js
window.FLOWBOARD_SUPABASE = {
  url: "https://your-project.supabase.co",
  anonKey: "your-publishable-or-anon-key",
  workspaceName: "FlowBoard Team"
};
```

The schema creates these tables:

- `profiles`
- `workspaces`
- `workspace_members`
- `workspace_invites`

It also creates the `flowboard-images` Storage bucket. Imported images are uploaded to Storage when possible and the board keeps the resulting URL. If Storage is not ready, the app keeps a Base64 fallback so the board still works during setup.

## Security Model

Row Level Security is enabled for every public table in the schema.

- Users can only update their own profile.
- Users can only read and update workspaces where they are owner or member.
- Workspace roles are `owner`, `admin`, `editor`, `viewer`, and `guest`.
- Owners control everything.
- Admins manage members, invites, projects, board data, and tasks.
- Editors can edit board data, tasks, images, and project content.
- Viewers and guests can read workspace data but cannot update board state through RLS.
- Workspace membership is restricted to owners/admins and the invite-acceptance function.
- Invite links expire and are tied to a workspace.
- Storage objects are scoped by workspace folder.
- Editable board HTML is sanitized before saving.
- Destructive UI actions ask for confirmation.

## Run Locally

Install dependencies once:

```bash
npm install
```

Start the static server:

```bash
npm start
```

Open:

```text
http://127.0.0.1:5177/
```

For local development with automatic restart:

```bash
npm run dev
```

Run a basic JavaScript lint check:

```bash
npm run lint
```

## Deploy To Vercel

1. Import the repository into Vercel.
2. Keep it as a static project with no build command.
3. Ensure `config.js` contains the correct Supabase project values before deployment, or replace this with your preferred environment-injection workflow.
4. Add the production Vercel URL to Supabase Auth redirect settings.
5. Deploy.

## Current Limitations

- The main board state is still stored as one JSON document in `workspaces.state`. This is acceptable for an MVP, but future collaboration should move tasks, items, drawings, and comments into dedicated tables to reduce conflicts and improve search/permissions.
- Realtime collaboration is state-based, so simultaneous edits can still overwrite each other in some cases.
- Existing Base64 images already saved in old workspaces remain supported, but new imports should use Supabase Storage when the bucket and policies are installed.
- The app is still a static frontend; sensitive privileged actions should stay in Supabase policies/functions rather than frontend code.
