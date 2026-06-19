const codePanel = document.querySelector("#code-panel");
const toggleCode = document.querySelector("#toggle-code");
const codeDrawerToggle = document.querySelector("#code-drawer-toggle");
const codeFileCount = document.querySelector("#code-file-count");
const codeFileForm = document.querySelector("#code-file-form");
const codeNewFileName = document.querySelector("#code-new-file-name");
const codeImportInput = document.querySelector("#code-import-input");
const codeFileSearch = document.querySelector("#code-file-search");
const codeFileList = document.querySelector("#code-file-list");
const codeActiveFileName = document.querySelector("#code-active-file-name");
const codeLanguage = document.querySelector("#code-language");
const codeCopyButton = document.querySelector("#code-copy-button");
const codeDownloadButton = document.querySelector("#code-download-button");
const codeDeleteButton = document.querySelector("#code-delete-button");
const codeEditorShell = document.querySelector("#code-editor-shell");
const codeEditor = document.querySelector("#code-editor");
const codeLineNumbers = document.querySelector("#code-line-numbers");
const codeCurrentHighlight = document.querySelector("#code-current-highlight");
const codeDraftHighlight = document.querySelector("#code-draft-highlight");
const codeClearDraftButton = document.querySelector("#code-clear-draft-button");
const codeApplyDraftButton = document.querySelector("#code-apply-draft-button");
const codeDiffSummary = document.querySelector("#code-diff-summary");
const codeDiffView = document.querySelector("#code-diff-view");
const codeLanguageLabel = document.querySelector("#code-language-label");
const codeCursorPosition = document.querySelector("#code-cursor-position");
const codeSaveStatus = document.querySelector("#code-save-status");
const codeAnalyzeButton = document.querySelector("#code-analyze-button");
const codeAnalysisMetrics = document.querySelector("#code-analysis-metrics");
const codeAnalysisFindings = document.querySelector("#code-analysis-findings");

const CODE_FILE_MAX_BYTES = 1024 * 1024;
const CODE_FILE_LIMIT = 60;
const CODE_LANGUAGES = {
  plaintext: { label: "Plain text", color: "#64748b", extensions: [] },
  javascript: { label: "JavaScript", color: "#f1e05a", extensions: ["js", "mjs", "cjs", "jsx"] },
  typescript: { label: "TypeScript", color: "#3178c6", extensions: ["ts", "tsx"] },
  json: { label: "JSON", color: "#8a8a8a", extensions: ["json", "jsonc"] },
  html: { label: "HTML", color: "#e34c26", extensions: ["html", "htm"] },
  css: { label: "CSS", color: "#563d7c", extensions: ["css", "scss", "sass", "less"] },
  python: { label: "Python", color: "#3572a5", extensions: ["py"] },
  csharp: { label: "C#", color: "#178600", extensions: ["cs"] },
  cpp: { label: "C/C++", color: "#f34b7d", extensions: ["c", "cc", "cpp", "cxx", "h", "hpp"] },
  java: { label: "Java", color: "#b07219", extensions: ["java"] },
  gdscript: { label: "GDScript", color: "#355570", extensions: ["gd"] },
  sql: { label: "SQL", color: "#e38c00", extensions: ["sql"] },
  markdown: { label: "Markdown", color: "#083fa1", extensions: ["md", "markdown"] }
};

let codeWorkspaceListenersReady = false;
const codeCompareDrafts = new Map();

function initializeCodeWorkspace() {
  if (codeWorkspaceListenersReady || !codePanel) return;
  codeWorkspaceListenersReady = true;

  codeDrawerToggle.addEventListener("click", () => toggleSidePanel("code"));
  toggleCode.addEventListener("click", () => togglePanel(codePanel, toggleCode));
  codeFileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createCodeFile(codeNewFileName.value);
  });
  codeImportInput.addEventListener("change", async (event) => {
    await importCodeFiles(event.target.files);
    codeImportInput.value = "";
  });
  codeFileSearch.addEventListener("input", () => renderCodeFileList(getActiveProject()));
  codeActiveFileName.addEventListener("change", () => renameActiveCodeFile(codeActiveFileName.value));
  codeLanguage.addEventListener("change", () => updateActiveCodeLanguage(codeLanguage.value));
  codeCopyButton.addEventListener("click", () => copyActiveCodeFile());
  codeDownloadButton.addEventListener("click", () => downloadActiveCodeFile());
  codeDeleteButton.addEventListener("click", () => deleteActiveCodeFile());
  codeClearDraftButton.addEventListener("click", () => clearCodeComparisonDraft());
  codeApplyDraftButton.addEventListener("click", () => applyCodeComparisonDraft());
  codeAnalyzeButton.addEventListener("click", () => renderCodeAnalysis(getActiveCodeFile()));
  codeEditor.addEventListener("input", handleCodeEditorInput);
  codeEditor.addEventListener("scroll", () => {
    codeLineNumbers.scrollTop = codeEditor.scrollTop;
    codeDraftHighlight.scrollTop = codeEditor.scrollTop;
    codeDraftHighlight.scrollLeft = codeEditor.scrollLeft;
  });
  codeEditor.addEventListener("click", updateCodeCursorPosition);
  codeEditor.addEventListener("keyup", updateCodeCursorPosition);
  codeEditor.addEventListener("keydown", handleCodeEditorKeydown);
  codeEditorShell.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    codeEditorShell.classList.add("drag-over");
  });
  codeEditorShell.addEventListener("dragleave", () => codeEditorShell.classList.remove("drag-over"));
  codeEditorShell.addEventListener("drop", async (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    codeEditorShell.classList.remove("drag-over");
    await importCodeFiles(event.dataTransfer.files);
  });
}

function renderCodeWorkspace() {
  const project = getActiveProject();
  if (!project || !codePanel) return;
  project.codeFiles ??= [];
  const activeFile = getActiveCodeFile(project);
  codeFileCount.textContent = String(project.codeFiles.length);
  renderCodeFileList(project);

  const hasFile = Boolean(activeFile);
  [codeActiveFileName, codeLanguage, codeEditor, codeCopyButton, codeDownloadButton, codeDeleteButton, codeAnalyzeButton, codeClearDraftButton, codeApplyDraftButton]
    .forEach((control) => { control.disabled = !hasFile; });

  if (!activeFile) {
    codeActiveFileName.value = "";
    codeLanguage.value = "plaintext";
    codeEditor.value = "";
    codeEditor.dataset.fileId = "";
    codeEditor.placeholder = "Create or import a file to compare code.";
    codeCurrentHighlight.innerHTML = '<span class="code-empty-preview">Create or import a file to begin.</span>';
    codeDraftHighlight.textContent = "";
    codeLanguageLabel.textContent = "Plain text";
    updateCodeLineNumbers();
    updateCodeCursorPosition();
    renderCodeDiff(null, "");
    renderCodeAnalysis(null);
    return;
  }

  codeEditor.placeholder = "Paste the proposed code here...";
  if (document.activeElement !== codeActiveFileName) codeActiveFileName.value = activeFile.name;
  codeLanguage.value = CODE_LANGUAGES[activeFile.language] ? activeFile.language : "plaintext";
  if (codeEditor.dataset.fileId !== activeFile.id || document.activeElement !== codeEditor) {
    codeEditor.value = codeCompareDrafts.get(activeFile.id) || "";
    codeEditor.dataset.fileId = activeFile.id;
  }
  codeLanguageLabel.textContent = CODE_LANGUAGES[activeFile.language]?.label || "Plain text";
  renderCodeComparison(activeFile);
  updateCodeLineNumbers();
  updateCodeCursorPosition();
  renderCodeAnalysis(activeFile);
}

function renderCodeFileList(project) {
  if (!codeFileList) return;
  codeFileList.innerHTML = "";
  if (!project) return;
  const search = codeFileSearch.value.trim().toLowerCase();
  const files = (project.codeFiles || []).filter((file) => !search || file.name.toLowerCase().includes(search));
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "code-file-empty";
    empty.textContent = project.codeFiles?.length ? "No matching files." : "No code files yet.";
    codeFileList.append(empty);
    return;
  }

  files.forEach((file) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-file-tab";
    button.classList.toggle("active", file.id === project.activeCodeFileId);
    button.title = file.name;
    button.style.setProperty("--code-language-color", CODE_LANGUAGES[file.language]?.color || CODE_LANGUAGES.plaintext.color);
    const dot = document.createElement("span");
    dot.className = "code-file-dot";
    const name = document.createElement("span");
    name.className = "code-file-tab-name";
    name.textContent = file.name;
    button.append(dot, name);
    button.addEventListener("click", () => selectCodeFile(file.id));
    codeFileList.append(button);
  });
}

function getActiveCodeFile(project = getActiveProject()) {
  if (!project) return null;
  project.codeFiles ??= [];
  let activeFile = project.codeFiles.find((file) => file.id === project.activeCodeFileId) || null;
  if (!activeFile && project.codeFiles.length) {
    activeFile = project.codeFiles[0];
    project.activeCodeFileId = activeFile.id;
  }
  return activeFile;
}

function selectCodeFile(fileId) {
  const project = getActiveProject();
  if (!project?.codeFiles?.some((file) => file.id === fileId)) return;
  project.activeCodeFileId = fileId;
  renderCodeWorkspace();
  codeEditor.focus();
}

function createCodeFile(rawName, content = "", requestedLanguage = "") {
  const project = getActiveProject();
  if (!project) return null;
  project.codeFiles ??= [];
  if (project.codeFiles.length >= CODE_FILE_LIMIT) {
    codeSaveStatus.textContent = `Limit: ${CODE_FILE_LIMIT} files`;
    return null;
  }
  const name = getUniqueCodeFileName(project, sanitizeCodeFileName(rawName, "untitled.txt"));
  const language = CODE_LANGUAGES[requestedLanguage] ? requestedLanguage : detectCodeLanguage(name);
  const before = {
    codeFiles: structuredClone(project.codeFiles),
    activeCodeFileId: project.activeCodeFileId || "",
    history: structuredClone(project.history || [])
  };
  const file = {
    id: crypto.randomUUID(),
    name,
    language,
    content: String(content || ""),
    modifiedAt: Date.now()
  };
  project.codeFiles.push(file);
  project.activeCodeFileId = file.id;
  codeNewFileName.value = "";
  saveCodeFileCollectionChange(project, before, "Code file created", file.name);
  renderCodeWorkspace();
  codeEditor.focus();
  return file;
}

async function importCodeFiles(fileList) {
  const project = getActiveProject();
  if (!project || !fileList?.length) return;
  const files = Array.from(fileList);
  let imported = 0;
  let rejected = 0;
  for (const file of files) {
    if ((project.codeFiles?.length || 0) >= CODE_FILE_LIMIT || file.size > CODE_FILE_MAX_BYTES) {
      rejected += 1;
      continue;
    }
    const content = await file.text();
    createCodeFile(file.webkitRelativePath || file.name, content);
    imported += 1;
  }
  codeSaveStatus.textContent = rejected
    ? `${imported} imported, ${rejected} skipped`
    : `${imported} file${imported === 1 ? "" : "s"} imported`;
}

function renameActiveCodeFile(rawName) {
  const project = getActiveProject();
  const file = getActiveCodeFile(project);
  if (!project || !file) return;
  const nextName = getUniqueCodeFileName(project, sanitizeCodeFileName(rawName, file.name), file.id);
  if (nextName === file.name) return;
  const before = structuredClone(file);
  file.name = nextName;
  file.language = detectCodeLanguage(nextName, file.language);
  file.modifiedAt = Date.now();
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, { codeFiles: project.codeFiles.map((candidate) => candidate.id === file.id ? before : candidate) }, { codeFiles: structuredClone(project.codeFiles) }, {
      groupKey: `project:${project.id}:code:${file.id}:rename`
    })
  });
  renderCodeWorkspace();
}

function updateActiveCodeLanguage(language) {
  const project = getActiveProject();
  const file = getActiveCodeFile(project);
  if (!project || !file || !CODE_LANGUAGES[language]) return;
  file.language = language;
  file.modifiedAt = Date.now();
  saveState({ skipHistory: true });
  renderCodeWorkspace();
}

function handleCodeEditorInput() {
  const file = getActiveCodeFile();
  if (!file) return;
  codeCompareDrafts.set(file.id, codeEditor.value);
  renderCodeComparison(file);
  updateCodeLineNumbers();
  updateCodeCursorPosition();
  codeSaveStatus.textContent = "Draft not applied";
}

function handleCodeEditorKeydown(event) {
  if (event.key === "Tab") {
    event.preventDefault();
    const start = codeEditor.selectionStart;
    const end = codeEditor.selectionEnd;
    codeEditor.setRangeText("  ", start, end, "end");
    codeEditor.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    applyCodeComparisonDraft();
  }
}

function clearCodeComparisonDraft() {
  const file = getActiveCodeFile();
  if (!file) return;
  codeCompareDrafts.delete(file.id);
  codeEditor.value = "";
  renderCodeComparison(file);
  updateCodeLineNumbers();
  updateCodeCursorPosition();
  codeSaveStatus.textContent = "Draft cleared";
  codeEditor.focus();
}

function applyCodeComparisonDraft() {
  const project = getActiveProject();
  const file = getActiveCodeFile(project);
  if (!project || !file || !codeCompareDrafts.has(file.id)) return;
  const before = {
    codeFiles: structuredClone(project.codeFiles),
    history: structuredClone(project.history || [])
  };
  file.content = codeCompareDrafts.get(file.id) || "";
  file.modifiedAt = Date.now();
  codeCompareDrafts.delete(file.id);
  logProjectEvent("Code comparison applied", file.name, file.id);
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, before, {
      codeFiles: structuredClone(project.codeFiles),
      history: structuredClone(project.history || [])
    }, { projectId: project.id, groupKey: `project:${project.id}:code:${file.id}:apply-diff` }),
    forceStep: true
  });
  codeSaveStatus.textContent = "New code applied";
  renderCodeWorkspace();
}

function renderCodeComparison(file = getActiveCodeFile()) {
  if (!file) return;
  const draft = codeEditor.value;
  const hasDraft = codeCompareDrafts.has(file.id);
  codeCurrentHighlight.innerHTML = renderHighlightedCodeLines(file.content || "", file.language, true);
  codeDraftHighlight.innerHTML = renderHighlightedCodeLines(draft, file.language, false);
  codeClearDraftButton.disabled = !hasDraft;
  codeApplyDraftButton.disabled = !hasDraft || draft === file.content;
  renderCodeDiff(file, draft);
}

function renderHighlightedCodeLines(content, language, showNumbers) {
  return String(content || "").split("\n").map((line, index) => {
    const number = showNumbers ? ` data-line="${index + 1}"` : "";
    return `<span class="code-render-line"${number}>${highlightCode(line, language) || " "}</span>`;
  }).join("");
}

function highlightCode(content, language = "plaintext") {
  const keywordSets = {
    javascript: "async await break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield",
    typescript: "abstract any as async await boolean break case catch class const constructor continue declare default delete do else enum export extends finally for from function if implements import in infer interface keyof let namespace never new null number object of private protected public readonly return static string super switch symbol this throw true try type typeof undefined unknown var void while yield",
    python: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield",
    gdscript: "and as assert await break breakpoint class class_name const continue elif else enum extends for func if in is match not null or pass preload return self signal static super true false var void while yield",
    csharp: "abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while",
    cpp: "alignas alignof auto bool break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend if inline int long namespace new nullptr operator private protected public register reinterpret_cast return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while",
    java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new null package private protected public return short static strictfp super switch synchronized this throw throws transient true try void volatile while",
    sql: "all alter and as asc begin between by case check column constraint create database default delete desc distinct drop else end exists foreign from full group having in index inner insert into is join key left like limit not null on or order outer primary references right row select set table then union unique update values view when where",
    css: "important inherit initial none auto block flex grid absolute relative fixed sticky",
    json: "true false null"
  };
  const keywords = new Set(String(keywordSets[language] || "").split(" ").filter(Boolean));
  const commentBranch = ["python", "gdscript", "markdown"].includes(language)
    ? "#[^\\n]*"
    : language === "sql" ? "--[^\\n]*" : "\\/\\*[^]*?\\*\\/|\\/\\/[^\\n]*";
  const tagBranch = language === "html" ? "<\\/?[A-Za-z][^>]*>" : "(?!)";
  const tokenPattern = new RegExp(`${tagBranch}|${commentBranch}|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`|\\b\\d+(?:\\.\\d+)?\\b|[A-Za-z_$][\\w$]*`, "g");
  let output = "";
  let cursor = 0;
  for (const match of String(content || "").matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index || 0;
    output += escapeHtml(content.slice(cursor, index));
    let kind = "identifier";
    if (/^(?:\/\/|\/\*|#|--)/.test(token)) kind = "comment";
    else if (/^<\/?/.test(token)) kind = "tag";
    else if (/^["'`]/.test(token)) kind = "string";
    else if (/^\d/.test(token)) kind = "number";
    else if (keywords.has(token)) kind = "keyword";
    else if (/^(?:true|false|null|None|undefined)$/.test(token)) kind = "constant";
    else if (/^(?:const|let|var|def|func|class|interface|type)\s+$/.test(content.slice(0, index).match(/\S+\s*$/)?.[0] || "")) kind = "variable";
    else if (/^\s*\(/.test(content.slice(index + token.length))) kind = "function";
    else if (["css", "json"].includes(language) && /^\s*:/.test(content.slice(index + token.length))) kind = "property";
    else if (/^[A-Z]/.test(token)) kind = "type";
    output += `<span class="syntax-${kind}">${escapeHtml(token)}</span>`;
    cursor = index + token.length;
  }
  output += escapeHtml(content.slice(cursor));
  return output;
}

function renderCodeDiff(file, draft) {
  codeDiffView.innerHTML = "";
  if (!file || !codeCompareDrafts.has(file.id)) {
    codeDiffSummary.textContent = "Paste new code to compare";
    codeDiffView.innerHTML = '<p class="code-diff-empty">The Git-style diff will appear here.</p>';
    return;
  }
  const diff = buildCodeLineDiff(file.content || "", draft);
  const additions = diff.filter((row) => row.type === "add").length;
  const removals = diff.filter((row) => row.type === "remove").length;
  codeDiffSummary.textContent = `+${additions} -${removals}`;
  diff.slice(0, 1200).forEach((row) => {
    const line = document.createElement("div");
    line.className = `code-diff-row ${row.type}`;
    line.innerHTML = `
      <span class="code-diff-marker">${row.type === "add" ? "+" : row.type === "remove" ? "-" : " "}</span>
      <span class="code-diff-number">${row.oldNumber || ""}</span>
      <span class="code-diff-number">${row.newNumber || ""}</span>
      <code class="code-diff-code">${highlightCode(row.text, file.language) || " "}</code>`;
    codeDiffView.append(line);
  });
  if (diff.length > 1200) {
    const note = document.createElement("p");
    note.className = "code-diff-empty";
    note.textContent = `${diff.length - 1200} more diff lines hidden for performance.`;
    codeDiffView.append(note);
  }
}

function buildCodeLineDiff(previous, next) {
  const oldLines = String(previous).split("\n");
  const newLines = String(next).split("\n");
  if (oldLines.length * newLines.length > 160000) return buildFastCodeLineDiff(oldLines, newLines);
  const table = Array.from({ length: oldLines.length + 1 }, () => new Uint16Array(newLines.length + 1));
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? table[oldIndex + 1][newIndex + 1] + 1
        : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }
  const rows = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      rows.push({ type: "context", text: oldLines[oldIndex], oldNumber: oldIndex + 1, newNumber: newIndex + 1 });
      oldIndex += 1;
      newIndex += 1;
    } else if (newIndex < newLines.length && (oldIndex >= oldLines.length || table[oldIndex][newIndex + 1] >= table[oldIndex + 1][newIndex])) {
      rows.push({ type: "add", text: newLines[newIndex], oldNumber: "", newNumber: newIndex + 1 });
      newIndex += 1;
    } else {
      rows.push({ type: "remove", text: oldLines[oldIndex], oldNumber: oldIndex + 1, newNumber: "" });
      oldIndex += 1;
    }
  }
  return rows;
}

function buildFastCodeLineDiff(oldLines, newLines) {
  const rows = [];
  const length = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < length; index += 1) {
    if (oldLines[index] === newLines[index]) {
      rows.push({ type: "context", text: oldLines[index] || "", oldNumber: index + 1, newNumber: index + 1 });
    } else {
      if (index < oldLines.length) rows.push({ type: "remove", text: oldLines[index], oldNumber: index + 1, newNumber: "" });
      if (index < newLines.length) rows.push({ type: "add", text: newLines[index], oldNumber: "", newNumber: index + 1 });
    }
  }
  return rows;
}

async function copyActiveCodeFile() {
  const file = getActiveCodeFile();
  if (!file) return;
  try {
    await navigator.clipboard.writeText(file.content);
    codeSaveStatus.textContent = "Copied";
  } catch {
    codeEditor.select();
    codeSaveStatus.textContent = "Code selected";
  }
}

function downloadActiveCodeFile() {
  const file = getActiveCodeFile();
  if (!file) return;
  const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name.split("/").pop() || "code.txt";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function deleteActiveCodeFile() {
  const project = getActiveProject();
  const file = getActiveCodeFile(project);
  if (!project || !file) return;
  if (!await confirmDangerousAction(`Delete ${file.name}?`)) return;
  const before = {
    codeFiles: structuredClone(project.codeFiles),
    activeCodeFileId: project.activeCodeFileId,
    history: structuredClone(project.history || [])
  };
  project.codeFiles = project.codeFiles.filter((candidate) => candidate.id !== file.id);
  project.activeCodeFileId = project.codeFiles[0]?.id || "";
  saveCodeFileCollectionChange(project, before, "Code file deleted", file.name);
  renderCodeWorkspace();
}

function saveCodeFileCollectionChange(project, before, action, target) {
  logProjectEvent(action, target);
  saveState({
    historyEntry: createHistoryCommand("updateProject", project.id, before, {
      codeFiles: structuredClone(project.codeFiles),
      activeCodeFileId: project.activeCodeFileId,
      history: structuredClone(project.history || [])
    }, {
      groupKey: `project:${project.id}:codeFiles`
    }),
    forceStep: true
  });
}

function updateCodeLineNumbers() {
  const lineCount = Math.max(1, codeEditor.value.split("\n").length);
  codeLineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join("\n");
  codeLineNumbers.scrollTop = codeEditor.scrollTop;
}

function updateCodeCursorPosition() {
  const cursor = codeEditor.selectionStart || 0;
  const beforeCursor = codeEditor.value.slice(0, cursor);
  const lines = beforeCursor.split("\n");
  codeCursorPosition.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
}

function renderCodeAnalysis(file = getActiveCodeFile()) {
  codeAnalysisMetrics.innerHTML = "";
  codeAnalysisFindings.innerHTML = "";
  const content = file?.content || "";
  const lines = content ? content.split("\n") : [""];
  const todoCount = (content.match(/\b(?:TODO|FIXME|HACK)\b/gi) || []).length;
  const functionCount = countCodeFunctions(content, file?.language);
  [
    [lines.length, "Lines"],
    [content.length, "Characters"],
    [functionCount, "Functions"],
    [todoCount, "TODOs"]
  ].forEach(([value, label]) => {
    const metric = document.createElement("div");
    metric.className = "code-metric";
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = label;
    metric.append(strong, span);
    codeAnalysisMetrics.append(metric);
  });

  const findings = analyzeCodeContent(file);
  findings.forEach((finding) => {
    const row = document.createElement("p");
    row.className = `code-finding ${finding.level}`;
    row.textContent = finding.message;
    codeAnalysisFindings.append(row);
  });
}

function analyzeCodeContent(file) {
  if (!file || !file.content.trim()) return [{ level: "warning", message: "This file is empty." }];
  const content = file.content;
  const findings = [];
  const longLines = content.split("\n").filter((line) => line.length > 120).length;
  const trailingWhitespace = content.split("\n").filter((line) => /\s+$/.test(line)).length;
  const todoCount = (content.match(/\b(?:TODO|FIXME|HACK)\b/gi) || []).length;

  if (file.language === "json") {
    try {
      JSON.parse(content);
      findings.push({ level: "ok", message: "Valid JSON syntax." });
    } catch (error) {
      findings.push({ level: "error", message: `JSON syntax: ${error.message}` });
    }
  } else if (file.language === "javascript") {
    if (/^\s*(?:import|export)\s/m.test(content)) {
      findings.push({ level: "warning", message: "ES module syntax detected. Static browser parsing is limited for this file." });
    } else {
      try {
        new Function(content);
        findings.push({ level: "ok", message: "JavaScript syntax parsed successfully. The code was not executed." });
      } catch (error) {
        findings.push({ level: "error", message: `JavaScript syntax: ${error.message}` });
      }
    }
  } else if (["css", "cpp", "csharp", "java", "gdscript"].includes(file.language)) {
    const balance = countCharacter(content, "{") - countCharacter(content, "}");
    findings.push(balance === 0
      ? { level: "ok", message: "Opening and closing braces are balanced." }
      : { level: "error", message: `Brace balance is ${balance > 0 ? `${balance} opening` : `${Math.abs(balance)} closing`} brace(s) off.` });
  } else {
    findings.push({ level: "ok", message: `${CODE_LANGUAGES[file.language]?.label || "Text"} file loaded for review.` });
  }

  if (todoCount) findings.push({ level: "warning", message: `${todoCount} TODO/FIXME/HACK marker(s) found.` });
  if (longLines) findings.push({ level: "warning", message: `${longLines} line(s) are longer than 120 characters.` });
  if (trailingWhitespace) findings.push({ level: "warning", message: `${trailingWhitespace} line(s) contain trailing whitespace.` });
  if (!todoCount && !longLines && !trailingWhitespace && !findings.some((finding) => finding.level === "error")) {
    findings.push({ level: "ok", message: "No basic formatting warnings found." });
  }
  return findings;
}

function countCodeFunctions(content, language = "plaintext") {
  const patterns = {
    javascript: /\bfunction\b|(?:^|\s)(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm,
    typescript: /\bfunction\b|(?:^|\s)(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm,
    python: /^\s*(?:async\s+)?def\s+\w+/gm,
    gdscript: /^\s*func\s+\w+/gm,
    csharp: /\b(?:public|private|protected|internal|static|async)\s+[\w<>,?\[\]]+\s+\w+\s*\(/g,
    java: /\b(?:public|private|protected|static|final|synchronized)\s+[\w<>,?\[\]]+\s+\w+\s*\(/g
  };
  return (content.match(patterns[language] || /$a/g) || []).length;
}

function detectCodeLanguage(fileName, fallback = "plaintext") {
  const extension = String(fileName || "").split(".").pop().toLowerCase();
  const match = Object.entries(CODE_LANGUAGES).find(([, config]) => config.extensions.includes(extension));
  return match?.[0] || (CODE_LANGUAGES[fallback] ? fallback : "plaintext");
}

function sanitizeCodeFileName(value, fallback = "untitled.txt") {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+/, "")
    .replace(/[<>:"|?*\u0000-\u001f]/g, "-")
    .slice(0, 180);
  return normalized || fallback;
}

function getUniqueCodeFileName(project, requestedName, ignoredFileId = "") {
  const usedNames = new Set((project.codeFiles || [])
    .filter((file) => file.id !== ignoredFileId)
    .map((file) => file.name.toLowerCase()));
  if (!usedNames.has(requestedName.toLowerCase())) return requestedName;
  const slashIndex = requestedName.lastIndexOf("/");
  const directory = slashIndex >= 0 ? requestedName.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? requestedName.slice(slashIndex + 1) : requestedName;
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";
  let suffix = 2;
  let candidate = `${directory}${base} (${suffix})${extension}`;
  while (usedNames.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${directory}${base} (${suffix})${extension}`;
  }
  return candidate;
}

function countCharacter(value, character) {
  return value.split(character).length - 1;
}
