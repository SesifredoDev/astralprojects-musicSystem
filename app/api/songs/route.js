import { NextResponse } from "next/server";
import { createSong, listSongs } from "@/lib/music-store";

export async function GET() {
  try {
    const songs = await listSongs();
    return NextResponse.json({ items: songs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load songs." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const song = await createSong(payload);
    return NextResponse.json({ item: song }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create song." },
      { status: 400 }
    );
  }
}
