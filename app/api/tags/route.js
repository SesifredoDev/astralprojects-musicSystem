import { NextResponse } from "next/server";
import { createTag, listTags } from "@/lib/music-store";

function parseType(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (type !== "mood" && type !== "atmosphere") {
    throw new Error("Query parameter type must be mood or atmosphere.");
  }
  return type;
}

export async function GET(request) {
  try {
    const type = parseType(request);
    const tags = await listTags(type);
    return NextResponse.json({ items: tags });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load tags." },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  try {
    const type = parseType(request);
    const payload = await request.json();
    const tag = await createTag(type, payload);
    return NextResponse.json({ item: tag }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create tag." },
      { status: 400 }
    );
  }
}
