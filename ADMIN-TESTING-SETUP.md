# Smile Labs Digital v0.7.0 — Unlimited admin testing

Admin testing is tied to an **email-verified Studio account**, not solely to the separate admin-dashboard password. This prevents an arbitrary user from claiming the administrator role through the browser.

## Enable for your own account

1. Open your existing private `.env` file. Do not share it or place it in the ZIP.
2. Add `ADMIN_TEST_EMAIL=your-existing-verified-account@example.com` using **your actual Studio account email**. Or use `ADMIN_TEST_EMAILS=email1@example.com,email2@example.com` for multiple authorised testing accounts.
3. Restart the Node server (`Ctrl+C`, then `npm.cmd start`).
4. Sign in to the Studio with that same account and complete email verification. It will display **Admin testing · Unlimited test previews**. Existing account usage does not prevent generation.

Normal public and dental professional limits are unchanged. The administrator bypass is enforced on the server and does not grant access to the admin dashboard; that dashboard still uses its separate `ADMIN_PASSWORD` configuration. No images are saved as permanent server files by this feature.

**Important:** Unlimited means unlimited **app credits**, not free or unlimited OpenAI API calls. Each successful or failed image-editing request may incur provider charges. Failed edits are not counted as completed app generations.

This is a development prototype; never deploy for real patient data until authentication, rate limiting, consent, privacy and broader production security have been independently reviewed and hardened.
