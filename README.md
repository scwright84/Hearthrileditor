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

## Midjourney Adapter

Default provider is `mock` (no external dependency).

- `MJ_PROVIDER=mock` uses placeholder images + sample video.
- `MJ_PROVIDER=discord` is a stub; see `lib/midjourney.ts` for TODOs on Discord automation.
- `MJ_PROVIDER=third-party` uses `MJ_THIRD_PARTY_API_URL` and `MJ_THIRD_PARTY_API_KEY`.

## Background Jobs

Jobs currently execute inline for the MVP with SSE updates. To swap to BullMQ + Redis, implement a queue wrapper and move the job handlers into workers. Redis is already installed via Homebrew.

## Tests

```bash
pnpm test
```
