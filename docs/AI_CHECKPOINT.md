# AI Checkpoint

Status:
- Repo: Hearthrileditor
- Next.js app scaffolded with Prisma + NextAuth + OpenAI + Luma Dream Machine.
- Prisma v6.5.0 with standard schema datasource.
- Postgres migrations applied locally.
- Current focus: fix transcription end-to-end and UI errors.

Next Tasks:
1) Task 1 - Fix transcription end-to-end.
2) Iteration 2 - Editor layout polish, EDL audio editing, character refs.

Updates (Task 1):
- Transcription now logs correlation ID, audio info, and OpenAI start/finish.
- Word-level quantization with segment fallback into 1-second buckets.
- UI shows loading + error banner with copyable debug details.
- Fixed Next.js async params in project editor + SSE + transcription routes.
- OpenAI transcription uses whisper-1 verbose_json to return timestamps.

Layout Updates:
- Split into two pages: `/projects/[id]/storyboard` (transcript + storyboard + images) and `/projects/[id]/edit` (audio/video editor + timeline).
- Editor timeline auto-places images by scene timestamps.
- Added Image Review panel + Animate Winners action in editor.
- Added sequence preview panel with play/pause and scene-based playback.

Cast/Omni Updates:
- Added CharacterOmniRef model (unique per character + style preset).
- Cast Strip + Characters panel with headshot upload and omni previews.
- Bulk and per-character omni generation APIs.
- Gated storyboard/image generation on style + omni readiness.

Logs/Errors:
- Server logs include `[transcribe:<id>]` for tracing.
- UI error banner exposes correlation id.

Next Tasks (Iteration 2):
- Editor layout refactor (single timeline-first layout).
- EDL audio editing and clip controls.
- Character reference uploads + selector integration.
- Improve omni ref generation UX (progress + retries + stronger prompts).
- Gate storyboard prompts with character-specific omni refs.
