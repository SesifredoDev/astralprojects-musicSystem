"use client";

import { useEffect, useMemo, useState } from "react";

const BACKEND_API_BASE = (process.env.NEXT_PUBLIC_BACKEND_API_BASE || "http://localhost/api")
  .trim()
  .replace(/\/+$/, "");
const ACCESS_TOKEN_STORAGE_KEY = "music_admin_access_token";

function resolveBackendUrl(path) {
  return `${BACKEND_API_BASE}${path}`;
}

function getStoredAccessToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || "";
}

function persistAccessToken(value) {
  if (typeof window === "undefined") {
    return;
  }
  if (!value) {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, value);
}

function resolveFileUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith("/api/files/")) {
        return resolveBackendUrl(parsed.pathname.replace(/^\/api/, ""));
      }
      return raw;
    } catch (_error) {
      return raw;
    }
  }
  const normalized = raw.startsWith("/api/files/")
    ? raw
    : `/api/files/${raw.replace(/^\/+/, "")}`;
  return resolveBackendUrl(normalized.replace(/^\/api/, ""));
}

function buildErrorMessage(data, fallback) {
  return data?.error || data?.message || fallback;
}

async function parseResponse(response, fallbackError) {
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new Error(buildErrorMessage(data, fallbackError));
  }

  return data || {};
}

async function refreshAccessToken() {
  const response = await fetch(resolveBackendUrl("/auth/refresh"), {
    method: "POST",
    credentials: "include"
  });
  const data = await parseResponse(response, "Session refresh failed.");
  const token = String(data?.accessToken || "");
  if (!token) {
    throw new Error("Session refresh failed.");
  }
  persistAccessToken(token);
  return token;
}

async function api(path, init) {
  const requiresAuth = init?.requiresAuth !== false;
  const performRequest = async (token) => {
    const headers = {
      ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init?.headers || {})
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(resolveBackendUrl(path), {
      ...init,
      credentials: "include",
      headers
    });

    return response;
  };

  let token = getStoredAccessToken();
  if (requiresAuth && !token) {
    throw new Error("Please log in to continue.");
  }

  let response = await performRequest(token);
  if (requiresAuth && response.status === 401) {
    token = await refreshAccessToken();
    response = await performRequest(token);
  }

  return parseResponse(response, "Request failed.");
}

function extractStoredFileKey(uploadUrl) {
  const raw = String(uploadUrl || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("/api/files/")) {
    return raw.slice("/api/files/".length);
  }
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith("/api/files/")) {
      return parsed.pathname.slice("/api/files/".length);
    }
  } catch (_error) {
    return raw;
  }
  return raw;
}

async function uploadFile(file, kind) {
  const form = new FormData();
  form.append("file", file);
  const data = await api("/files/upload", {
    method: "POST",
    body: form
  });
  return {
    url: extractStoredFileKey(data?.url),
    fileName: data?.filename || file.name,
    kind
  };
}

function formatDuration(secondsValue) {
  const totalSeconds = Math.max(0, Math.round(Number(secondsValue) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function readAudioDurationSeconds(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      const duration = Number(audio.duration);
      if (!Number.isFinite(duration) || duration < 0) {
        reject(new Error("Failed to read audio duration."));
        return;
      }
      resolve(Math.round(duration));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to read audio duration."));
    };
    audio.src = objectUrl;
  });
}

export default function HomePage() {
  const [moods, setMoods] = useState([]);
  const [atmospheres, setAtmospheres] = useState([]);
  const [songs, setSongs] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  const [moodForm, setMoodForm] = useState({ name: "", description: "" });
  const [atmosphereForm, setAtmosphereForm] = useState({ name: "", description: "" });
  const [songForm, setSongForm] = useState({
    fileName: "",
    moods: [],
    atmosphere: [],
    attribution: ""
  });
  const [moodCoverFile, setMoodCoverFile] = useState(null);
  const [atmosphereCoverFile, setAtmosphereCoverFile] = useState(null);
  const [songCoverFile, setSongCoverFile] = useState(null);
  const [songAudioFile, setSongAudioFile] = useState(null);

  const moodOptions = useMemo(
    () => moods.map(tag => ({ value: tag.id || tag._id, label: tag.name })),
    [moods]
  );
  const atmosphereOptions = useMemo(
    () => atmospheres.map(tag => ({ value: tag.id || tag._id, label: tag.name })),
    [atmospheres]
  );
  const moodSongCounts = useMemo(() => {
    const counts = new Map();
    songs.forEach(song => {
      (song?.moods || []).forEach(tag => {
        const tagId = String(tag?.id || tag?._id || "");
        if (!tagId) return;
        counts.set(tagId, (counts.get(tagId) || 0) + 1);
      });
    });
    return counts;
  }, [songs]);
  const atmosphereSongCounts = useMemo(() => {
    const counts = new Map();
    songs.forEach(song => {
      (song?.atmosphere || []).forEach(tag => {
        const tagId = String(tag?.id || tag?._id || "");
        if (!tagId) return;
        counts.set(tagId, (counts.get(tagId) || 0) + 1);
      });
    });
    return counts;
  }, [songs]);
  const moodTotalTimes = useMemo(() => {
    const totals = new Map();
    songs.forEach(song => {
      const duration = Math.max(0, Number(song?.durationSeconds) || 0);
      (song?.moods || []).forEach(tag => {
        const tagId = String(tag?.id || tag?._id || "");
        if (!tagId) return;
        totals.set(tagId, (totals.get(tagId) || 0) + duration);
      });
    });
    return totals;
  }, [songs]);

  async function loadAll() {
    setError("");
    try {
      const [moodRes, atmosphereRes, songRes] = await Promise.all([
        api("/music/moods"),
        api("/music/atmospheres"),
        api("/music/songs")
      ]);
      setMoods(moodRes.items || []);
      setAtmospheres(atmosphereRes.items || []);
      setSongs(songRes.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    }
  }

  useEffect(() => {
    const token = getStoredAccessToken();
    if (token) {
      setAccessToken(token);
      void loadAll();
    }
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(loginForm.email || "").trim(),
          password: String(loginForm.password || "")
        }),
        requiresAuth: false
      });
      const token = String(data?.accessToken || "");
      if (!token) {
        throw new Error("Login failed.");
      }
      persistAccessToken(token);
      setAccessToken(token);
      setLoginForm({ email: "", password: "" });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", {
        method: "POST",
        requiresAuth: false
      });
    } catch (_error) {
      // No-op
    } finally {
      persistAccessToken("");
      setAccessToken("");
      setMoods([]);
      setAtmospheres([]);
      setSongs([]);
      setBusy(false);
    }
  }

  async function submitTag(type, form, reset) {
    setBusy(true);
    setError("");
    try {
      const selectedFile = type === "mood" ? moodCoverFile : atmosphereCoverFile;
      if (!selectedFile) {
        throw new Error("Cover image upload is required.");
      }
      const upload = await uploadFile(selectedFile, "cover");
      await api(type === "mood" ? "/music/moods" : "/music/atmospheres", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          cover: upload.url
        })
      });
      reset();
      if (type === "mood") setMoodCoverFile(null);
      if (type === "atmosphere") setAtmosphereCoverFile(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add tag.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSong(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!songCoverFile) {
        throw new Error("Song cover image upload is required.");
      }
      if (!songAudioFile) {
        throw new Error("Song audio file upload is required.");
      }
      const payload = {
        fileName: String(songForm.fileName || "").trim(),
        moods: Array.isArray(songForm.moods) ? songForm.moods : [],
        atmosphere: Array.isArray(songForm.atmosphere) ? songForm.atmosphere : [],
        attribution: String(songForm.attribution || "").trim(),
        durationSeconds: await readAudioDurationSeconds(songAudioFile)
      };

      const [coverUpload, audioUpload] = await Promise.all([
        uploadFile(songCoverFile, "cover"),
        uploadFile(songAudioFile, "audio")
      ]);
      await api("/music/songs", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          cover: coverUpload.url,
          audioUrl: audioUpload.url,
          fileName: payload.fileName
        })
      });
      setSongForm({ fileName: "", moods: [], atmosphere: [], attribution: "" });
      setSongCoverFile(null);
      setSongAudioFile(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add song.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSong(id) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await api(`/music/songs/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete song.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMood(id) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await api(`/music/moods/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete mood.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAtmosphere(id) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await api(`/music/atmospheres/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete atmosphere.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelection(list, value) {
    return list.includes(value)
      ? list.filter(item => item !== value)
      : [...list, value];
  }

  return (
    <main className="page">
      <section className="header">
        <h1>Music Admin</h1>
        <p>Manage songs and tag catalogs used by your custom player service.</p>
      </section>

      {error ? <p className="error">{error}</p> : null}

      {!accessToken ? (
        <section className="panel">
          <h2>Login</h2>
          <form className="songForm" onSubmit={handleLogin}>
            <label className="fieldLabel">Email</label>
            <input
              value={loginForm.email}
              type="email"
              onChange={event =>
                setLoginForm(current => ({
                  ...current,
                  email: event.target.value
                }))
              }
              placeholder="your@email.com"
              required
            />
            <label className="fieldLabel">Password</label>
            <input
              value={loginForm.password}
              type="password"
              onChange={event =>
                setLoginForm(current => ({
                  ...current,
                  password: event.target.value
                }))
              }
              placeholder="Password"
              required
            />
            <button disabled={busy} type="submit">Log In</button>
          </form>
        </section>
      ) : (
        <div className="rowActions">
          <button type="button" disabled={busy} onClick={handleLogout}>Log Out</button>
        </div>
      )}

      {!accessToken ? null : (
        <>

      <section className="grid">
        <article className="panel">
          <h2>Add Mood</h2>
          <label className="fieldLabel">Mood Name</label>
          <input
            value={moodForm.name}
            onChange={event => setMoodForm(current => ({ ...current, name: event.target.value }))}
            placeholder="Mood name"
          />
          <label className="fieldLabel">Description</label>
          <input
            value={moodForm.description}
            onChange={event => setMoodForm(current => ({ ...current, description: event.target.value }))}
            placeholder="Mood description"
          />
          <label className="fieldLabel">Cover Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={event => setMoodCoverFile(event.target.files?.[0] || null)}
          />
          <button
            disabled={busy}
            onClick={() => submitTag("mood", moodForm, () => setMoodForm({ name: "", description: "" }))}
          >
            Add Mood
          </button>
        </article>

        <article className="panel">
          <h2>Add Atmosphere</h2>
          <label className="fieldLabel">Atmosphere Name</label>
          <input
            value={atmosphereForm.name}
            onChange={event => setAtmosphereForm(current => ({ ...current, name: event.target.value }))}
            placeholder="Atmosphere name"
          />
          <label className="fieldLabel">Description</label>
          <input
            value={atmosphereForm.description}
            onChange={event => setAtmosphereForm(current => ({ ...current, description: event.target.value }))}
            placeholder="Atmosphere description"
          />
          <label className="fieldLabel">Cover Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={event => setAtmosphereCoverFile(event.target.files?.[0] || null)}
          />
          <button
            disabled={busy}
            onClick={() =>
              submitTag("atmosphere", atmosphereForm, () =>
                setAtmosphereForm({ name: "", description: "" })
              )
            }
          >
            Add Atmosphere
          </button>
        </article>
      </section>

      <section className="panel">
        <h2>Add Song</h2>
        <form className="songForm" onSubmit={submitSong}>
          <label className="fieldLabel">Song Cover Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={event => setSongCoverFile(event.target.files?.[0] || null)}
            required
          />
          <label className="fieldLabel">Song Audio File</label>
          <input
            type="file"
            accept="audio/*"
            onChange={event => {
              const file = event.target.files?.[0] || null;
              setSongAudioFile(file);
              setSongForm(current => {
                if (!file) {
                  return { ...current, fileName: "" };
                }
                if (current.fileName.trim().length === 0) {
                  return { ...current, fileName: file.name };
                }
                return current;
              });
            }}
            required
          />
          <label className="fieldLabel">Song Name</label>
          <input
            value={songForm.fileName}
            onChange={event =>
              setSongForm(current => ({
                ...current,
                fileName: event.target.value
              }))
            }
            placeholder="Custom song name"
            required
          />
          <label className="fieldLabel">Attribution</label>
          <textarea
            value={songForm.attribution}
            onChange={event =>
              setSongForm(current => ({
                ...current,
                attribution: event.target.value
              }))
            }
            placeholder="Artist/source attribution (links are allowed)"
            rows={3}
          />
          <div>
            <h3>Moods</h3>
            <div className="chips">
              {moodOptions.map(option => (
                <button
                  type="button"
                  key={option.value}
                  className={songForm.moods.includes(option.value) ? "chip chipActive" : "chip"}
                  onClick={() =>
                    setSongForm(current => ({
                      ...current,
                      moods: toggleSelection(current.moods, option.value)
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3>Atmospheres</h3>
            <div className="chips">
              {atmosphereOptions.map(option => (
                <button
                  type="button"
                  key={option.value}
                  className={songForm.atmosphere.includes(option.value) ? "chip chipActive" : "chip"}
                  onClick={() =>
                    setSongForm(current => ({
                      ...current,
                      atmosphere: toggleSelection(current.atmosphere, option.value)
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button disabled={busy} type="submit">Add Song</button>
        </form>
      </section>

      <section className="panel">
        <h2>Stored Songs</h2>
        <ul className="list">
          {songs.map(song => (
            <li key={song.id || song._id} className="songRow">
              <img src={resolveFileUrl(song.cover)} alt={song.fileName} />
              <div>
                <strong>{song.fileName}</strong>
                <p>
                  Audio: <a href={resolveFileUrl(song.audioUrl)} target="_blank" rel="noreferrer">{song.fileName}</a>
                </p>
                {song.attribution ? <p>Attribution: {song.attribution}</p> : null}
                <p>Duration: {formatDuration(song.durationSeconds)}</p>
                <p>
                  Moods: {(song.moods || []).map(tag => tag.name).join(", ") || "None"}
                </p>
                <p>
                  Atmospheres: {(song.atmosphere || []).map(tag => tag.name).join(", ") || "None"}
                </p>
                <div className="rowActions">
                  <button
                    type="button"
                    className="dangerBtn"
                    disabled={busy}
                    onClick={() => deleteSong(song._id || song.id)}
                  >
                    Delete Song
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Stored Moods</h2>
          <ul className="list">
            {moods.map(mood => (
              <li key={mood.id || mood._id} className="songRow">
                <img src={resolveFileUrl(mood.cover)} alt={mood.name} />
                <div>
                  <strong>
                    {mood.name} ({moodSongCounts.get(String(mood.id || mood._id || "")) || 0} songs, {formatDuration(moodTotalTimes.get(String(mood.id || mood._id || "")) || 0)})
                  </strong>
                  <p>{mood.description}</p>
                  <div className="rowActions">
                    <button
                      type="button"
                      className="dangerBtn"
                      disabled={busy}
                      onClick={() => deleteMood(mood._id || mood.id)}
                    >
                      Delete Mood
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Stored Atmospheres</h2>
          <ul className="list">
            {atmospheres.map(atmosphere => (
              <li key={atmosphere.id || atmosphere._id} className="songRow">
                <img src={resolveFileUrl(atmosphere.cover)} alt={atmosphere.name} />
                <div>
                  <strong>
                    {atmosphere.name} ({atmosphereSongCounts.get(String(atmosphere.id || atmosphere._id || "")) || 0})
                  </strong>
                  <p>{atmosphere.description}</p>
                  <div className="rowActions">
                    <button
                      type="button"
                      className="dangerBtn"
                      disabled={busy}
                      onClick={() => deleteAtmosphere(atmosphere._id || atmosphere.id)}
                    >
                      Delete Atmosphere
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
        </>
      )}
    </main>
  );
}
