import { kv } from "@vercel/kv";

const SONGS_KEY = "music:songs";
const MOODS_KEY = "music:moods";
const ATMOSPHERES_KEY = "music:atmospheres";

const memory = {
  songs: [],
  moods: [],
  atmospheres: []
};

function hasKvConfig() {
  return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
}

async function getArray(key, fallbackKey) {
  if (!hasKvConfig()) {
    return [...memory[fallbackKey]];
  }
  const value = await kv.get(key);
  return Array.isArray(value) ? value : [];
}

async function setArray(key, fallbackKey, value) {
  if (!hasKvConfig()) {
    memory[fallbackKey] = [...value];
    return;
  }
  await kv.set(key, value);
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTag(tag, type) {
  const name = cleanString(tag?.name);
  const description = cleanString(tag?.description);
  const cover = cleanString(tag?.cover);
  if (!name || !description || !cover) {
    throw new Error(`Invalid ${type} tag payload.`);
  }
  return {
    id: cleanString(tag?.id) || randomId(type),
    name,
    description,
    cover
  };
}

function normalizeSong(song) {
  const cover = cleanString(song?.cover);
  const fileName = cleanString(song?.fileName);
  const audioUrl = cleanString(song?.audioUrl);
  const moods = Array.isArray(song?.moods) ? song.moods : [];
  const atmosphere = Array.isArray(song?.atmosphere) ? song.atmosphere : [];

  if (!cover || !fileName || !audioUrl) {
    throw new Error("Song must include cover, fileName, and audioUrl.");
  }

  return {
    id: cleanString(song?.id) || randomId("song"),
    cover,
    fileName,
    audioUrl,
    moods,
    atmosphere,
    createdAt: song?.createdAt || new Date().toISOString()
  };
}

export async function listTags(type) {
  if (type === "mood") {
    return getArray(MOODS_KEY, "moods");
  }
  if (type === "atmosphere") {
    return getArray(ATMOSPHERES_KEY, "atmospheres");
  }
  throw new Error("Unknown tag type.");
}

export async function createTag(type, payload) {
  const nextTag = normalizeTag(payload, type);
  const current = await listTags(type);
  if (current.some(tag => tag.name.toLowerCase() === nextTag.name.toLowerCase())) {
    throw new Error(`${type} tag already exists.`);
  }
  const next = [...current, nextTag];
  if (type === "mood") {
    await setArray(MOODS_KEY, "moods", next);
  } else {
    await setArray(ATMOSPHERES_KEY, "atmospheres", next);
  }
  return nextTag;
}

export async function listSongs() {
  return getArray(SONGS_KEY, "songs");
}

export async function createSong(payload) {
  const nextSong = normalizeSong(payload);
  const songs = await listSongs();
  if (songs.some(song => song.fileName.toLowerCase() === nextSong.fileName.toLowerCase())) {
    throw new Error("Song fileName already exists.");
  }
  const moods = await listTags("mood");
  const atmospheres = await listTags("atmosphere");
  const moodIds = new Set(moods.map(tag => tag.id));
  const atmosphereIds = new Set(atmospheres.map(tag => tag.id));

  if (!nextSong.moods.every(id => moodIds.has(id))) {
    throw new Error("Song references unknown mood tags.");
  }
  if (!nextSong.atmosphere.every(id => atmosphereIds.has(id))) {
    throw new Error("Song references unknown atmosphere tags.");
  }

  const moodById = new Map(moods.map(tag => [tag.id, tag]));
  const atmosphereById = new Map(atmospheres.map(tag => [tag.id, tag]));
  const persistedSong = {
    ...nextSong,
    moods: nextSong.moods.map(id => moodById.get(id)),
    atmosphere: nextSong.atmosphere.map(id => atmosphereById.get(id))
  };

  await setArray(SONGS_KEY, "songs", [...songs, persistedSong]);
  return persistedSong;
}
