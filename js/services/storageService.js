const IMAGE_STORAGE_BUCKET = "flowboard-images";

function dataUrlToBlob(dataUrl) {
  const [header, data] = String(dataUrl).split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = atob(data || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function getImageFileExtension(type, fallbackName = "") {
  const fromName = fallbackName.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName && ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(fromName)) return fromName;
  return {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg"
  }[type] || "jpg";
}

async function uploadImportedImageToStorage(imported, file) {
  const client = getSupabaseClient();
  if (!client || !currentWorkspaceId || !currentUser?.id || !imported?.src?.startsWith("data:image/")) {
    return null;
  }
  const blob = dataUrlToBlob(imported.src);
  const extension = getImageFileExtension(blob.type, file?.name);
  const path = `${currentWorkspaceId}/${currentUser.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage
    .from(IMAGE_STORAGE_BUCKET)
    .upload(path, blob, {
      cacheControl: "31536000",
      contentType: blob.type,
      upsert: false
    });
  if (error) throw error;
  const { data } = client.storage.from(IMAGE_STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}
