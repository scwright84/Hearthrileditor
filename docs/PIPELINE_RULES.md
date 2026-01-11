# Pipeline Rules

- Transcription uses OpenAI verbose JSON with timestamps.
- Quantize word timestamps into 1-second buckets.
- Storyboard scenes are 5.2s by default with strict prompt rules.
- Luma Dream Machine generates 4 image variants per scene (photon-flash-1).
- Image-to-video uses ray-flash-2, 720p, 5s with frame0 from the selected still.
- Omni refs must exist per character + style before storyboarding or image generation.
