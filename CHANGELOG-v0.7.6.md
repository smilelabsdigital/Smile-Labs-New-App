# Smile Labs Digital v0.7.6 — Missing Teeth Prompt Fix

Based on v0.7.5. Only the missing-teeth prompt and associated verification scripts were changed.

Exact missing-teeth prompt sent to the API:

> Correct the smile by adding the missing teeth. Keep existing teeth unchanged.

The three existing whitening shade prompts are unchanged. No additional prompt text is appended to the missing-teeth request.

Note: a prompt cannot guarantee that a generative model will add teeth or preserve the original geometry. Live API generation was not tested.
