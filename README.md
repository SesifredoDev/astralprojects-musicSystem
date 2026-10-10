# Astral Projects Music System

Vercel-ready admin/API service to manage:

- `song`
  - `cover` (1:1 image URL)
  - `fileName: string`
  - `audioUrl: string`
  - `moods: MTag[]`
  - `atmosphere: ATag[]`
- `Tag`
  - `name: string`
  - `description: string`
  - `cover` (1:1 image URL)

## Stack

- Next.js App Router
- Vercel Functions (`/api/*`)
- Vercel KV for persistence (optional for local dev)
- Vercel Blob for uploaded media (optional for local dev)

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Without KV env vars, the app uses in-memory storage (resets on restart).
Without Blob env vars, uploads are written to local `public/uploads/*`.
The admin UI is upload-only for covers and audio files (no direct URL inputs).

The admin reads/writes moods, atmospheres, and songs directly to your backend `app.js` music routes.
Set:

- `NEXT_PUBLIC_BACKEND_API_BASE` (example: `https://your-api.example.com/api`)

## Vercel Deploy

1. Import this repo into Vercel.
2. Add KV integration in the Vercel dashboard.
3. Ensure these env vars are present:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `BLOB_READ_WRITE_TOKEN`
4. Deploy.

## API

### Tags

- `GET /api/tags?type=mood`
- `GET /api/tags?type=atmosphere`
- `POST /api/tags?type=mood`
- `POST /api/tags?type=atmosphere`

Tag payload:

```json
{
  "name": "Calm",
  "description": "Low-intensity emotional tag",
  "cover": "https://example.com/calm.jpg"
}
```

### Songs

- `GET /api/songs`
- `POST /api/songs`

Song payload:

```json
{
  "cover": "https://example.com/song-cover.jpg",
  "audioUrl": "https://example.com/song.mp3",
  "fileName": "forest-theme.mp3",
  "moods": ["mood_ab12cd34"],
  "atmosphere": ["atmosphere_zx98vt12"]
}
```

### Uploads

- `POST /api/uploads` (`multipart/form-data`)
  - `kind`: `cover` | `audio`
  - `file`: binary payload

Note: the admin upload flow is configured to use backend `app.js` endpoint:

- `POST {NEXT_PUBLIC_BACKEND_API_BASE}/files/upload`
