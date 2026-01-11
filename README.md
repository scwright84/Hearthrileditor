# HearthRail MVP

End-to-end MVP for the HearthRail pipeline: audio upload → edit → transcript → storyboard → image generation → animation → export.

## Prerequisites

- Node.js (via Homebrew) + pnpm
- PostgreSQL 15
- ffmpeg
- Redis (optional for future BullMQ swap)

## Setup

1) Install dependencies:

```bash
pnpm install
```

2) Create `.env.local` from `.env.example` and fill in values.

3) Start Postgres and create a database:

```bash
brew services start postgresql@15
echo 'export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"' >> ~/.zshrc
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
createdb hearthrail
```

Optional (for BullMQ later):

```bash
brew services start redis
```

4) Run Prisma migrations:

```bash
pnpm prisma migrate dev --name init
```

If the Prisma client is missing, run:

```bash
pnpm prisma generate
```

5) Start the dev server:

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Auth

This MVP uses a dev-only email credential flow (no password). Any email signs in locally.

## Storage

Default is local filesystem (`STORAGE_PROVIDER=local`). Files are stored under `public/uploads` and `public/exports`.

To use S3-compatible storage, set:

```
STORAGE_PROVIDER=s3
S3_ENDPOINT=...
S3_REGION=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

## OpenAI

Set `OPENAI_API_KEY` to enable transcription and storyboard generation. Without it, storyboard uses a deterministic fallback, and transcription returns an error.

## Luma Dream Machine

Storyboard stills and animation use the Luma Dream Machine API.

Required:

```
LUMA_API_KEY=...
```

Public asset URLs are required for style refs, headshots, and animation frame0 images.

Recommended options:
1) Use S3/R2 and set `PUBLIC_ASSET_BASE_URL` to your public bucket base URL.
2) In dev, run a tunnel (ngrok/cloudflared) and set `PUBLIC_ASSET_BASE_URL` to the tunnel URL so `/public/uploads` is reachable.

Optional:
- `PUBLIC_ASSET_BASE_URL` - base URL used to serve uploaded assets publicly.
- `LUMA_CONCURRENCY_LIMIT` - max concurrent Luma create calls (default 3).
- `LUMA_OMNI_VARIANTS` - number of omni variants to generate (clamped 2–4, default 4).

## Background Jobs

Jobs currently execute inline for the MVP with SSE updates. To swap to BullMQ + Redis, implement a queue wrapper and move the job handlers into workers. Redis is already installed via Homebrew.

## Tests

```bash
pnpm test
```
