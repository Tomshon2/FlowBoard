const FLOW_SHAPE_DEFINITIONS = {
  rectangle: { label: "Rectangle", path: "M4 4H96V96H4Z", textBox: { width: 0.86, height: 0.78 } },
  "rounded-rectangle": { label: "Rounded rectangle", rect: { x: 4, y: 4, width: 92, height: 92, rx: 11 }, textBox: { width: 0.84, height: 0.76 } },
  circle: { label: "Circle", ellipse: { cx: 50, cy: 50, rx: 47, ry: 47 }, textBox: { width: 0.66, height: 0.58 } },
  triangle: { label: "Triangle", path: "M50 4 96 96H4Z", textBox: { width: 0.54, height: 0.4, top: 0.46, bottom: 0.12 } },
  diamond: { label: "Diamond", path: "M50 3 97 50 50 97 3 50Z", textBox: { width: 0.48, height: 0.48 } },
  parallelogram: { label: "Parallelogram", path: "M22 4H96L78 96H4Z", textBox: { width: 0.62, height: 0.66 } },
  star: { label: "Star", path: "M50 4 62 36 96 36 69 56 79 91 50 70 21 91 31 56 4 36 38 36Z", textBox: { width: 0.42, height: 0.34 } },
  "arrow-right": { label: "Right arrow", path: "M4 32H56V14L98 50 56 86V68H4Z", textBox: { width: 0.54, height: 0.34 } },
  "arrow-left": { label: "Left arrow", path: "M96 32H44V14L2 50 44 86V68H96Z", textBox: { width: 0.54, height: 0.34 } },
  "double-arrow": { label: "Double arrow", path: "M2 50 32 16V34H68V16L98 50 68 84V66H32V84Z", textBox: { width: 0.38, height: 0.3 } },
  pentagon: { label: "Pentagon", path: "M50 4 96 38 78 96H22L4 38Z", textBox: { width: 0.56, height: 0.52 } },
  octagon: { label: "Octagon", path: "M28 4H72L96 28V72L72 96H28L4 72V28Z", textBox: { width: 0.64, height: 0.64 } },
  hexagon: { label: "Hexagon", path: "M25 4H75L98 50 75 96H25L2 50Z", textBox: { width: 0.7, height: 0.54 } },
  trapezoid: { label: "Trapezoid", path: "M20 4H80L96 96H4Z", textBox: { width: 0.62, height: 0.58 } },
  cylinder: {
    label: "Cylinder",
    path: "M10 20C10 7 90 7 90 20V80C90 93 10 93 10 80Z",
    inner: [{ path: "M10 20C10 33 90 33 90 20" }],
    textBox: { width: 0.62, height: 0.5, top: 0.34, bottom: 0.12 }
  },
  cloud: {
    label: "Cloud",
    path: "M28 82C13 82 4 70 4 56C4 44 14 34 27 34C32 18 47 10 62 18C73 16 84 25 86 38C94 42 98 50 98 60C98 73 88 82 72 82Z",
    textBox: { width: 0.52, height: 0.34 }
  },
  plus: { label: "Plus", path: "M38 4H62V38H96V62H62V96H38V62H4V38H38Z", textBox: { width: 0.34, height: 0.34 } },
  speech: {
    label: "Speech bubble",
    path: "M14 6H86C93 6 98 12 98 20V64C98 72 92 78 84 78H50L28 97V78H14C6 78 2 72 2 64V20C2 12 7 6 14 6Z",
    textBox: { width: 0.68, height: 0.48, top: 0.2, bottom: 0.26 }
  },
  "brace-left": { label: "Left brace", path: "M68 4C42 4 39 21 39 34V41C39 47 29 48 22 50C29 52 39 53 39 59V66C39 79 42 96 68 96", open: true, textBox: { width: 0.32, height: 0.68 } },
  "brace-right": { label: "Right brace", path: "M32 4C58 4 61 21 61 34V41C61 47 71 48 78 50C71 52 61 53 61 59V66C61 79 58 96 32 96", open: true, textBox: { width: 0.32, height: 0.68 } },
  "chevron-right": { label: "Chevron right", path: "M4 24H62L96 50 62 76H4L26 50Z", textBox: { width: 0.5, height: 0.32 } },
  "chevron-left": { label: "Chevron left", path: "M96 24H38L4 50 38 76H96L74 50Z", textBox: { width: 0.5, height: 0.32 } }
};

function getFlowShapeDefinition(shape) {
  return FLOW_SHAPE_DEFINITIONS[shape] || FLOW_SHAPE_DEFINITIONS.circle;
}

function getShapeLabel(shape) {
  return getFlowShapeDefinition(shape).label;
}

function getShapeToolLabel(tool) {
  return tool === "ticket" ? "Board" : tool === "table" ? "Table" : tool === "folder" ? "Folder" : getShapeLabel(tool);
}

function createShapeSvgNode(shape) {
  const definition = getFlowShapeDefinition(shape);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("shape-svg");
  const main = createShapeSvgElement(definition);
  main.classList.add(definition.open ? "shape-svg-line" : "shape-svg-fill");
  svg.append(main);
  (definition.inner || []).forEach((part) => {
    const node = createShapeSvgElement(part);
    node.classList.add("shape-svg-line");
    svg.append(node);
  });
  return svg;
}

function createShapeSvgElement(part) {
  if (part.rect) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    Object.entries(part.rect).forEach(([key, value]) => rect.setAttribute(key, String(value)));
    return rect;
  }
  if (part.ellipse) {
    const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    Object.entries(part.ellipse).forEach(([key, value]) => ellipse.setAttribute(key, String(value)));
    return ellipse;
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", part.path);
  return path;
}

function createShapeVisual(shape, color = ticketColors?.[0] || "#fff1b8") {
  const visual = document.createElement("div");
  visual.className = `shape-visual shape-${shape} has-svg`;
  visual.style.setProperty("--shape-color", color);
  visual.append(createShapeSvgNode(shape));
  return visual;
}

function getShapeTextBox(shape) {
  const box = getFlowShapeDefinition(shape).textBox || {};
  return {
    width: box.width ?? 0.78,
    height: box.height ?? 0.72,
    top: box.top,
    bottom: box.bottom
  };
}

function getShapeTextInsets(shape) {
  const box = getShapeTextBox(shape);
  const left = Math.max(0, (1 - box.width) / 2);
  const top = box.top ?? Math.max(0, (1 - box.height) / 2);
  const bottom = box.bottom ?? Math.max(0, (1 - box.height) / 2);
  return {
    left,
    right: left,
    top,
    bottom
  };
}

function applyShapeTextBoxStyles(node, shape) {
  const insets = getShapeTextInsets(shape);
  node.style.setProperty("--shape-text-left", `${Math.round(insets.left * 100)}%`);
  node.style.setProperty("--shape-text-right", `${Math.round(insets.right * 100)}%`);
  node.style.setProperty("--shape-text-top", `${Math.round(insets.top * 100)}%`);
  node.style.setProperty("--shape-text-bottom", `${Math.round(insets.bottom * 100)}%`);
}

function getShapeSvgMarkup(shape, fill, stroke, strokeWidth) {
  const definition = getFlowShapeDefinition(shape);
  if (definition.open) {
    return getShapeSvgPartMarkup(definition, `fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`);
  }
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke"`;
  const parts = [getShapeSvgPartMarkup(definition, common)];
  (definition.inner || []).forEach((part) => {
    parts.push(getShapeSvgPartMarkup(part, `fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" vector-effect="non-scaling-stroke"`));
  });
  return parts.join("");
}

function getShapeSvgPartMarkup(part, attrs) {
  if (part.rect) {
    const rectAttrs = Object.entries(part.rect).map(([key, value]) => `${key}="${value}"`).join(" ");
    return `<rect ${rectAttrs} ${attrs} />`;
  }
  if (part.ellipse) {
    const ellipseAttrs = Object.entries(part.ellipse).map(([key, value]) => `${key}="${value}"`).join(" ");
    return `<ellipse ${ellipseAttrs} ${attrs} />`;
  }
  return `<path d="${part.path}" ${attrs} />`;
}
