# Smile Labs Digital v0.7.5 — Prompt routing verification

Based on the user's preferred v0.7.0 Admin application, preserving its premium purple/gold design, privacy flow, admin testing and comparison UI.

- **Missing Teeth:** exactly `correct the smile, keep current teeth the same`
- **Whitening A2, B1 and 0M1:** three separate prompts that say to whiten existing teeth only, never add or remove teeth, and preserve size/shape/position/spacing.
- Both routes use the OpenAI image-edits API; no local whitening filter or missing-tooth mask is applied.

## Run

Copy your own `.env` and optional `private-data` folder from the previous app. Do not share or upload secrets.

`npm install` → `npm test` → `npm start`

**Limitation:** The app can control which prompt it sends but cannot guarantee that a generative AI will obey it or preserve all teeth. No live OpenAI edit has been performed in packaging. This prototype is not cleared for use with real patient information.
