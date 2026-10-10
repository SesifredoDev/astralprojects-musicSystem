import { put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

function sanitizeFilename(name) {
  return String(name || "file")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function randomPrefix() {
  return Math.random().toString(36).slice(2, 10);
}

function getPublicUploadDir(kind) {
  if (kind === "cover") return "covers";
  if (kind === "audio") return "audio";
  throw new Error("Invalid upload kind.");
}

async function uploadToLocal(file, kind) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const safeName = sanitizeFilename(file.name);
  const filename = `${randomPrefix()}-${safeName}`;
  const subdir = getPublicUploadDir(kind);
  const diskDir = path.join(process.cwd(), "public", "uploads", subdir);
  await mkdir(diskDir, { recursive: true });
  const diskPath = path.join(diskDir, filename);
  await writeFile(diskPath, buffer);
  return {
    url: `/uploads/${subdir}/${filename}`,
    fileName: filename
  };
}

export async function uploadAsset(file, kind) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Missing file upload payload.");
  }

  const safeName = `${randomPrefix()}-${sanitizeFilename(file.name)}`;
  const subdir = getPublicUploadDir(kind);
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!blobToken) {
    return uploadToLocal(file, kind);
  }

  const blob = await put(`uploads/${subdir}/${safeName}`, file, {
    access: "public"
  });
  return {
    url: blob.url,
    fileName: safeName
  };
}
