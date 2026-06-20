# FlowBoard Developer Guide

This file is the maintenance map for future work on FlowBoard. Read it before changing state, rendering, board interactions, themes, or project-mode behavior.

## Product Model

FlowBoard is a static browser application for collaborative game planning. It has two project modes:

- **Game Dev**: the complete long-form project workspace.
- **Game Jam**: a reduced workspace for short events and smaller scope.

Game Jam uses a restricted Shapes menu that includes Square, Rectangle, Circle, and Diamond. Its creation-color control exposes exactly ten saturated swatches: red, orange, yellow, green, blue, purple, black, white, cyan, and pink. Game Dev keeps the unrestricted color picker. The Game Jam product scope described in this guide is complete; future work in that mode should be treated as maintenance or a newly approved feature rather than unfinished baseline work.

The main product surfaces are:

- Freeform visual board with tickets, shapes, tables, images, drawings, connections, selection, resizing, and zoom/pan.
- Tasks and customizable Kanban columns.
- Hours and phase planning.
- Code workspace.
- Story and game-design document fields.
- Level Design workspaces.
- Character Design workspaces.
- Team roles and workspace members.
- Milestones and project history.
- Complete project JSON import/export, task CSV import, board PNG export, and printable project reports.
- Supabase authentication, shared workspace persistence, Storage images, Realtime state updates, and live cursors.

## Runtime Architecture

The app uses classic browser scripts, not ES modules or a framework. All functions and variables share the global scope. Script order in `index.html` is therefore an API contract.

High-level load order:

1. `js/core/project-defaults.js` defines constants, modes, defaults, and starter state.
2. `js/core/app-core.js` defines shared runtime variables, DOM references, project creation, and event setup.
3. Services and authentication define Supabase access and collaboration.
4. `js/core/state-history.js` defines state normalization, persistence, undo, and redo.
5. Board, task, code, story, level, character, and team files define feature behavior.
6. `js/core/bootstrap.js` loads state, attaches listeners, and starts the app after every function exists.

Do not move a script earlier unless all globals it reads already exist. A function may refer to a later script as long as it is only called after bootstrap.

## Source Map

### Application shell

- `index.html`: authentication screen, toolbar, canvas, drawers, property panel, dialogs, and script order.
- `Flow_Board.png`: current shared FlowBoard logo used for the favicon, authentication screen, Projects drawer, and main top bar.
- `styles.css`: CSS import order.
- `styles/base.css`: tokens, base controls, and shared light/dark input behavior.
- `styles/layout.css`: app shell, drawers, top bar, property panel, and project-mode visibility.
- `styles/selects.css`: final shared native-dropdown appearance, including rounded opened pickers, toolbar styling, and dark-mode variants. Keep dropdown styling centralized here instead of adding new feature-specific select skins.
- `styles/responsive.css`: small-screen behavior.
- `styles/modals.css`: dialogs and many dark-mode overrides.

### Core state

- `js/core/project-defaults.js`: project kinds, allowed Game Jam shapes, starter columns, hour plan, milestones, and `defaultState`.
- `js/core/app-core.js`: global UI/runtime state, DOM references, project creation, the project-library JSON import entry point, and shared event listeners.
- `js/core/state-history.js`: `normalizeState()`, local/remote saves, timestamps, history commands, undo/redo, and `getActiveProject()`.
- `js/core/bootstrap.js`: startup sequence.

### Main board

- `js/board/render-board.js`: top-level `render()`, properties, board text styles, text measurement, minimum sizes, tables, and drawings.
- `js/board/projects-workspace.js`: project list and DOM creation for every main-board item.
- `js/board/items-interactions.js`: item creation, templates, paste/drop, item resizing, zoom, and pan.
- `js/board/board-tools.js`: shape placement, area selection, main-board drawing, text editing, resize handles, and connection dots.
- `js/board/selection-projects.js`: deletion, drag/multi-select, keyboard behavior, project switching, and board focus.
- `js/board/board-connections.js`: connection routing, rendering, obstacles, handles, and editing.
- `js/board/shape-definitions.js`: shape geometry, labels, SVG, and text boxes.
- `js/board/image-import.js`: image compression and board-image creation.
- `js/board/drawer-controls.js`: drawer switching and Game Jam panel gating.
- `js/board/milestones-history.js`: milestones, activity history, and GDD PDF export.

### Feature workspaces

- `js/tasks/tasks-board.js`: Kanban columns, task cards, filters, issue dialog, links, dependencies, progress, priority, deadline, and people. Status appears at the top of the issue sidebar. Tags and checklist controls are intentionally absent from the current issue UI, although legacy normalized data remains compatible. Game Dev has separate top-level **Add task** and **Add status** forms. Game Jam hides both top-level forms and creates tasks only from each column's **Add item** control.
- `js/tasks/hours-board.js`: hour phases, tasks, percentages, and final/edit displays.
- `js/code/code-workspace.js`: project code files, split saved/draft comparison, syntax highlighting, Git-style line diff, import/download, and local analysis. Applying changes updates the draft code and filename together after confirmation. Blank-only diff rows are not highlighted as changes, and the analysis summary intentionally omits the old TODO metric and verbose findings block. Code mode uses reduced drawer top padding so the workspace starts near the top.
- `js/story/story-board.js`: GDD fields, shared character summary cards, and nested story nodes.
- `js/story/character-workspace.js`: rich character profiles, images, story, personality, abilities, notes, and main-board links.
- `js/story/level-workspace.js`: multiple levels, level document, embedded note/image/paint canvas, and main-board snapshot creation.
- `js/team/team-board.js`: project team roles and shared workspace member UI. Team roles are available to both Game Dev and Game Jam projects.

### Persistence and exports

- `js/auth/auth-realtime.js`: sign-in flow, workspace loading, member management, invites, Realtime state, and cursors.
- `js/services/workspaceService.js`: workspace/member database calls.
- `js/services/storageService.js`: image upload and public URL creation.
- `js/services/export-import.js`: complete project JSON backup/restore, task CSV import, board PNG rendering, and printable project reports. The project-file chooser exposes Board PNG, Project report, and Project JSON.
- `supabase-schema.sql`: tables, policies, functions, Realtime, and Storage rules.

## State Contract

`state` is one shared JSON document. Its main shape is:

```text
state
  activeProjectId
  boardGrid
  updatedAt
  projects[]
```

Each project owns:

```text
id, name, kind, favorite, modifiedAt
totalHours, hourPlan[]
tasks[], taskColumns[]
milestones[], history[]
gdd, story[]
levelWorkspaces[], activeLevelWorkspaceId
teamRoles[]
codeFiles[], activeCodeFileId
items[], drawings[], connections[]
```

Important rules:

- Every persistent collection entry needs a stable `id`.
- Add new project fields to both `createProject()` and `normalizeState()`.
- Add nested normalizers for complex feature data. Normalizers must accept legacy or missing data.
- Never discard unknown valid fields when migrating a record. Spread or copy existing rich records before changing a subset.
- Character records are shared by Story and Character Design. The full record uses `story`, not the legacy `description`, while exports accept both for compatibility.
- Main-board level snapshots use `levelWorkspaceId` to identify their source level. A ticket with this field is a level-document board. Preview images also use `boardRole: "level-preview"` and `levelPreviewTitle`.
- Workspace state is saved locally and, when signed in, as `workspaces.state` through Supabase.
- Invite and logout actions live in the main top bar. The invite form is a popover anchored below the Invite button; do not place account actions back inside the Projects drawer.

## Project Library And Export Contract

The Projects drawer owns project creation, project switching, favorites, rename/delete actions, and file operations.

- New project name, project type, and Create remain on one row.
- **Import project** is a separate visible action below that row. It accepts a complete FlowBoard JSON backup, assigns a new project id, normalizes legacy or missing fields, selects the imported project, and preserves its boards, drawings, connections, tasks, statuses, team roles, hours, GDD, characters, story, levels, code, milestones, and history.
- Each project row has an **Export** action. Its dialog exposes only **Board PNG**, **Project report**, and **Project JSON**. Task CSV remains an import utility inside that dialog rather than a primary project export.
- Project JSON is the canonical restorable backup. Keep it lossless when new project-owned fields are introduced, and keep the importer backward compatible.
- Project reports keep the project name, project type, and generation date at the top. Game Dev section order is: Game Design Document, Story, Characters, Board, Levels, Tasks, Hours, Team Roles, Milestones, Code Files, then Project History last. Game Jam keeps Concept and Genre in the Game Design Document, then Board, Tasks, Hours, Team Roles, and Project History; it omits Mechanics, Story, Characters, Levels, Milestones, and Code Files.
- Printable reports use page margins on every page, suppress the browser URL/header text, and show a clean centered page number in the bottom margin.
- Board PNG includes board items, imported/pasted images, regenerated Level Design previews and their note images, connections, freehand drawings, current light/dark canvas background, current grid visibility, borders, automatic level titles, and computed board text styling. Remote Storage images are embedded before rasterization. Text must wrap and remain inside each shape. Wait for browser fonts before rasterizing the SVG.

Theme preference and Supabase workspace membership are user/workspace concerns, not project-owned JSON fields. Project team-role records are included in the backup.

## Save And History Contract

Use these patterns:

- `saveState(...)`: record a completed state change, persist locally, and queue the remote save.
- `commitState(...)`: use during interaction completion when the UI has already rendered intermediate changes.
- `saveAndRender()`: simple mutations that need a full render.
- `createHistoryCommand(...)`: one reversible target.
- `createBatchHistoryCommand(...)`: one user action that changes multiple records.

Capture `before` with `structuredClone()` before mutation. Use a stable `groupKey` for repeated edits to the same field. Set `forceStep` for actions that must be a distinct undo step.

Do not call `saveState()` on every pointer movement. Render the live preview in the DOM, then save once on pointer release.

Code comparison drafts are intentionally transient. Typing or pasting into **Paste new code** updates only `codeCompareDrafts`; it must not mutate `project.codeFiles`. **Apply** and `Ctrl+S` first show the shared confirmation dialog, then apply both the candidate filename and draft contents in one undoable history step. Switching files preserves each draft for the current browser session, while reloading discards unapplied drafts.

## Render Contract

`render()` in `js/board/render-board.js` is the full application render pipeline. It renders:

1. Board surface and project mode.
2. Project list and main board.
3. Remote cursors.
4. Tasks, hours, story, levels, characters, team, code, members, milestones, and history.
5. Zoom, properties, and drawer button state.

Feature renderers must be safe when their drawer is hidden. Anything that depends on measured layout must render again after its drawer opens. Level Design does this in `openSidePanel()` because a collapsed canvas has zero dimensions.

The Code workspace shows current saved code on the left and an editable candidate on the right. Syntax coloring is a lightweight, escaped HTML renderer behind the transparent candidate textarea; keep their font, padding, line height, and scroll positions synchronized. The diff uses a line-based LCS for normal files and a bounded fast fallback for large files. The code surface intentionally keeps a VS Code-like dark palette in both application themes, while its surrounding controls use the shared light/dark tokens.

Avoid calling full `render()` during pointer movement or text input unless necessary. Prefer targeted DOM updates and save at the end of the interaction.

## Board Sizing Contract

Board geometry lives on each item as `x`, `y`, `width`, and `height` in a `6400 x 4200` logical canvas.

- Minimum and text-required sizes are calculated by `getMinimumItemSize()` and `ensureItemFitsText()`.
- Text font size is explicit in `item.textStyle.fontSize`; resizing a board must not scale the font.
- Normal board text uses `flex: 1` so the editable region fills the card.
- Level-document boards are different: `.level-document-board .item-text` is content-sized. Resizing the outer document must not stretch a short text region.
- Level preview boards are styleable image boards. Their Fill Color, Border Color, and Border Thickness controls are enabled in Properties; ordinary imported images remain non-styleable there.
- A board may grow to prevent text clipping, but it should not grow merely because another nearby board is larger.
- Imported images use their full board area and do not have editable captions or image-text controls in either project mode.
- Connections must re-render after item position or size changes.

When adding a specialized board type, add an explicit class or field instead of changing the behavior of every ticket.

## Level Design Contract

A level contains:

```text
id, name, document
notes[]: id, type, x, y, text, src
drawings[]: id, color, thickness, points[]
```

The embedded canvas supports notes, images, and live freehand painting. Live strokes are DOM-only until pointer release.

Current Level Design drawer layout:

1. Level name and delete action.
2. Note, Paint, Image, paint color, paint size, and Clear Board tools.
3. Full-width design canvas.
4. Full-width Level Document below the canvas.
5. Add this level to the main board.

The embedded canvas and pasted preview intentionally have no grid. **Clear Board** removes level notes, level images, and level painting, but it does not delete the level or its document. Level-note textareas must remain transparent in dark mode; the global dark input background must not create a black rectangle inside each note.

**Add this level to the main board** creates two main-board objects:

- An image snapshot of the level design.
- A content-sized editable level-document ticket placed beside it.

Level preview images use `.level-preview-board`. They have a compact, always-visible automatic `.level-preview-title` and a design image that fills the remaining area. They do not have an editable caption or text strip. The preview SVG is transparent so the Properties Fill Color controls the board background. Notes, images, and drawings must remain inside the image area and never overlap the title.

Tasks and characters connect directly to main-board elements, including pasted level previews:

- A task selects a board element in its issue editor.
- A character selects boards in Character Design.
- Connected main-board items show compact task and character badges.
- Clicking a task badge opens the Actions board and shows the link.
- Clicking a character badge opens Character Design and highlights the profile.

There is no separate task/character connection section inside the Level Design drawer.

## Character Design Contract

A character contains:

```text
id, name, image, story, personality, abilities, notes, linkedItemIds[]
```

Story and Character Design edit the same `project.gdd.characters` array. A change in either surface must preserve all fields and update the other surface. Connected board choices must have visible checked, hover, and focus states in both themes.

Character board choices include ordinary boards/notes and pasted level-preview images. A linked main-board item displays a character badge alongside any linked-task badge.

## Project Modes

The canonical constants and helpers are in `js/core/project-defaults.js`.

| Surface | Game Dev | Game Jam |
| --- | --- | --- |
| Main board | Full tools | Reduced shape set |
| Allowed shape tools | All registered tools | Square, rectangle, circle, diamond |
| Hours | Full, edit/final modes | Visible, simplified UI |
| Tasks | Custom columns and top-level creation | Fixed To do, In progress, Done; create inside columns |
| Code | Visible | Visible |
| Story/GDD | Full GDD, characters, and story tree | Concept and Genre only |
| Level Design | Visible | Hidden |
| Character Design | Visible | Hidden |
| Team roles | Visible | Visible |
| Milestones | Visible | Hidden |
| History | Visible | Hidden |
| Templates | Visible | Hidden |
| Project report | Complete report including code and milestones | Report without code and milestones |

Mode enforcement exists in two layers:

- JavaScript: `renderProjectModeUi()`, `getAllowedSidePanel()`, and `isShapeToolAllowedForProject()`.
- CSS: `.app.gamejam-mode ...` hides unavailable controls.

Do not rely only on CSS. Hidden features must also be blocked or redirected in JavaScript.

## Game Jam Completion Status

**Status: complete as of 20 June 2026.**

The completed Game Jam baseline is:

- Restricted Square, Rectangle, Circle, and Diamond shape menu.
- Ten-color creation palette plus drawing, image import, connections, selection, properties, zoom/pan, and light/dark board modes.
- Fixed Actions columns: To do, In progress, and Done. Columns cannot be added, renamed, recolored, or deleted in Game Jam. Tasks are added from the **Add item** control inside a column; the top-level task/status creation row is hidden.
- Simplified Hours view.
- Game Story panel available with Concept and Genre only. Character creation, Mechanics, the story-division form/tree, and the story counter are hidden and their mutation paths are blocked.
- Code and Team roles available.
- Level Design, Character Design, Milestones, History, Templates, and their direct access paths hidden or redirected.
- Complete JSON backup/restore and Board PNG export available, including ordinary images and Level Design preview images.
- Game Jam project report contains Concept and Genre but excludes Mechanics, Story, Characters, Levels, Code files, and Milestones while retaining all other relevant project sections.

“Complete” describes the agreed feature scope, not an exemption from the theme, responsive, persistence, undo/redo, import/export, accessibility, or regression checks in this guide.

## Theme Contract

Theme is a personal preference stored with `flowboard-ui-theme:<user key>`. It is not shared workspace content.

- `renderBoardSurface()` toggles `.app-dark` on `.app` and `.board-dark` on the canvas.
- Light tokens live in `:root`.
- Dark tokens live in `.app.app-dark` in `styles/layout.css`.
- General dark controls are in `styles/base.css`, `styles/modals.css`, and `styles/team.css`.
- Feature-specific dark rules stay with the feature stylesheet, such as `styles/code.css`, `styles/level-workspace.css`, and `styles/character-workspace.css`.

Prefer theme variables: `--bg`, `--panel`, `--panel-soft`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-dark`, and the dark panel variables. Hardcoded light colors require a matching `.app.app-dark` override unless the surface intentionally remains light, such as a white imported-image canvas.

Every interactive state must be visible in both themes:

- Default
- Hover
- Focus
- Active/selected
- Disabled
- Error/danger
- Empty state

## Required Four-Way UI Check

Every user-facing feature change must be checked in:

1. Game Dev + light mode.
2. Game Dev + dark mode.
3. Game Jam + light mode.
4. Game Jam + dark mode.

For a Game Dev-only feature, Game Jam checks confirm that the control is hidden and direct programmatic access is redirected or blocked.

Also check:

- Drawer closed and open.
- Empty and populated data.
- Narrow drawer/mobile breakpoint.
- Selected, hover, and keyboard-focus states.
- Undo/redo after creation, edit, move, resize, and deletion.
- Reload/local normalization and remote-state normalization.
- Export paths that consume the changed data.

## Adding Or Changing A Feature

Use this sequence:

1. Identify the owner module and existing pattern.
2. Define or update the persistent data shape.
3. Add project defaults for newly created projects.
4. Add backward-compatible normalization for loaded projects.
5. Implement mutation with history and persistence.
6. Add the renderer to `render()` only if it needs full-render participation.
7. Add drawer initialization/listeners in the established startup path.
8. Add light styles and explicit dark styles.
9. Decide Game Dev/Game Jam availability and enforce it in both JavaScript and CSS.
10. Update import/export/report code that reads the changed data.
11. Run `npm run lint` and `git diff --check`.
12. Perform the four-way UI check above.

## Known Architectural Limits

- The application relies on shared globals and script order.
- The entire workspace state is one JSON document, so concurrent edits can conflict.
- Remote updates are last-write based, with timestamp/conflict warnings rather than record-level merging.
- Undo/redo is a hybrid of command and full-state snapshots.
- Board PNG export uses a generated SVG rather than a screenshot. It reproduces canvas theme/grid state, drawings, connections, item geometry, imported and level-preview images, borders, automatic level titles, and computed board text typography, but specialized DOM-only controls and editing chrome are intentionally excluded. Cross-origin image URLs must be fetched and embedded before the SVG is rasterized.
- A pasted level preview keeps a stored SVG fallback, but its displayed image is regenerated from the source level during main-board rendering when `levelWorkspaceId` still resolves.
- Base64 image fallbacks can increase local state size when Storage is unavailable.

Keep changes local to the owning feature, but always follow the shared state, render, history, mode, theme, and export contracts above.
