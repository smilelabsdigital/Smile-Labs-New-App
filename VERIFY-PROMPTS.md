# Smile Labs Digital v0.7.4 — prompt verification

This release is based on the preferred v0.7.0 Admin version, retaining the existing interface and features. The active image-editing call in `server.js` sends exactly one prompt according to the selected style/shade:

- Missing Teeth: `correct the smile, keep current teeth the same`
- Natural White A2: `Whiten existing teeth only to a subtle, warm, natural A2-inspired ivory shade. Do not add or remove teeth. Keep all existing tooth shapes, sizes, positions and spacing the same.`
- Bright White B1: `Whiten existing teeth only to a noticeably brighter, neutral B1-inspired white shade. Do not add or remove teeth. Keep all existing tooth shapes, sizes, positions and spacing the same.`
- Hollywood White 0M1: `Whiten existing teeth only to a distinctly ultra-bright 0M1-inspired bleached-white shade. Do not add or remove teeth. Keep all existing tooth shapes, sizes, positions and spacing the same.`

The API request sends the selected one with `form.append('prompt', ...)`, and there is no additional instruction appended at that call site.

These are prompt/code checks, **not a guarantee** that a generative model will refrain from adding or modifying teeth during whitening. Live paid OpenAI edits have not been run as part of this package verification.

To verify locally: `node --check server.js`, `node --check public/app.js`, and `node verify-prompts.js`.
