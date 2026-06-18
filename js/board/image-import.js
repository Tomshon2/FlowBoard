const IMPORT_IMAGE_MAX_DIMENSION = 1600;
const IMPORT_IMAGE_QUALITY = 0.84;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImageSource(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

function getImageBoardSize(width, height) {
  const maxWidth = 420;
  const maxHeight = 320;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(160, Math.round(width * scale)),
    height: Math.max(120, Math.round(height * scale))
  };
}

async function prepareImportedImage(file) {
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    const src = await readFileAsDataUrl(file);
    return { src, width: 260, height: 220 };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageSource(objectUrl);
    const naturalWidth = image.naturalWidth || 260;
    const naturalHeight = image.naturalHeight || 220;
    const scale = Math.min(1, IMPORT_IMAGE_MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: true });
    const outputType = file.type === "image/png" && file.size < 800000 ? "image/png" : "image/jpeg";
    if (outputType === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      src: canvas.toDataURL(outputType, IMPORT_IMAGE_QUALITY),
      ...getImageBoardSize(naturalWidth, naturalHeight)
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function addImageFile(file, point = null) {
  if (!file?.type?.startsWith("image/")) {
    window.alert("Choose an image file.");
    return;
  }
  try {
    const imported = await prepareImportedImage(file);
    let imageSrc = imported.src;
    try {
      imageSrc = await uploadImportedImageToStorage(imported, file) || imported.src;
    } catch (storageError) {
      console.warn("FlowBoard image storage upload failed, keeping local image data:", storageError);
    }
    const placement = point ? {
      x: Math.max(0, Math.round(point.x)),
      y: Math.max(0, Math.round(point.y))
    } : {};
    addBoardItem("image", {
      src: imageSrc,
      text: cleanUserText(file.name, 80, "Image"),
      width: imported.width,
      height: imported.height,
      ...placement
    }, { forceHistoryStep: true });
  } catch (error) {
    console.warn("FlowBoard image import failed:", error);
    window.alert("Could not import that image. Try another image file.");
  }
}

function addImageUrl(src, point = null) {
  if (!src) return;
  const placement = point ? {
    x: Math.max(0, Math.round(point.x)),
    y: Math.max(0, Math.round(point.y))
  } : {};
  addBoardItem("image", {
    src,
    text: "Pasted image",
    ...placement
  });
}
