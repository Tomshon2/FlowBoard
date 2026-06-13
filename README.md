# FlowBoard

FlowBoard is a private visual planning app for small game teams.

It includes:

- separate projects per user/workspace;
- boards, shapes, images, drawings, and connections;
- task lists;
- project-hour planning;
- game story sections with unlimited sub-sections;
- team role management;
- invite links for shared boards;
- live cursor/realtime updates through Supabase.

## Stack

- Frontend: static HTML/CSS/JS
- Hosting: Vercel
- Auth: Supabase Auth
- Database: Supabase Postgres
- Realtime: Supabase Realtime

Docker is no longer required for the online version.

## Supabase

The app is configured in `config.js`:

```js
window.FLOWBOARD_SUPABASE = {
  url: "https://pzovavwlwmzecjwipchu.supabase.co",
  anonKey: "sb_publishable_...",
  workspaceName: "FlowBoard Team"
};
```

The Supabase project needs these public tables:

- `profiles`
- `workspaces`
- `workspace_members`
- `workspace_invites`

The database stores the full board state as JSON in `workspaces.state`, including tasks, hours, story, team roles, images, drawings, shapes, and connections.

## Run Locally

Open `index.html` in the browser, or serve the folder with any static server.

Example:

```text
python -m http.server 5177 --bind 127.0.0.1
```

Then open:

```text
http://localhost:5177/
```

## Deploy

Deploy the repository to Vercel as a static site. No build step is required.

## Frontend Structure

- `js/app-core.js`: shared constants, DOM references, and event wiring
- `js/auth-realtime.js`: Supabase login, workspaces, invites, saving, and realtime
- `js/state-history.js`: local state, persistence, undo, and redo
- `js/render-board.js`: rendering, project list, board items, and connection style controls
- `js/board-tools.js`: drawing, selection boxes, shape placement, and connection editing
- `js/tasks-hours.js`: task list and project-hour planning
- `js/story-team.js`: game story tree and team role manager
- `js/items-interactions.js`: item creation, images, drag/drop, zoom, pan, and drawers
- `js/selection-projects.js`: project actions, selection, deletion, keyboard handling, and resize persistence
- `js/text-utils.js`: rich-text commands, sanitizing, colors, and small utilities
- `js/bootstrap.js`: startup
