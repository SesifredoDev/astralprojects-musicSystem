import { NextResponse } from "next/server";
import { uploadAsset } from "@/lib/upload-store";

function validateKind(value) {
  if (value !== "cover" && value !== "audio") {
    throw new Error("Upload kind must be cover or audio.");
  }
  return value;
}

function validateMime(kind, type) {
  if (kind === "cover" && !String(type || "").startsWith("image/")) {
    throw new Error("Cover uploads must be image files.");
  }
  if (kind === "audio" && !String(type || "").startsWith("audio/")) {
    throw new Error("Audio uploads must be audio files.");
  }
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = validateKind(String(form.get("kind") || ""));
    if (!(file instanceof File)) {
      throw new Error("Missing file.");
    }

    validateMime(kind, file.type);
    const uploaded = await uploadAsset(file, kind);
    return NextResponse.json({ item: uploaded }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 }
    );
  }
}
