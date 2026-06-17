# KIDSGPT — The Tuesday Builder Club site

Static site with a few Vercel API routes for private-ish student uploads.

## Files
- index.html      — public landing page
- login.html      — student login (name + password)
- classes.html    — locked: full 16-week curriculum hub
- class1.html     — locked: Week 1 full lesson w/ warm-up game + saved answers
- class3.html     — locked: Week 3 "The Story of You" lesson + story upload
- warmups.html    — locked: warm-up arcade (3 mini-games)
- api/            — Vercel functions for teacher notes and unlisted story pages
- styles.css, app.js, students.js — shared UI, login/saving, roster

## Add/change students
Edit assets/students.js. To make a password hash: open login.html,
press F12 (console), run  makeHash("their-password")  and paste the result.

Demo logins (CHANGE BEFORE REAL USE): Demo Kid/rocket, Nova/comet,
Pixel/pixel, Teacher/orbit2026.

## Vercel storage
Connect a Vercel Blob store to the project so Vercel creates
`BLOB_READ_WRITE_TOKEN`. Choose **Private** access for the store. Without it, the static lessons still work, but
"Save to Teacher Notebook" and story uploads will show a friendly storage
message instead of saving.

## Honest security note
The login is client-side: it deters copying and keeps lessons out of
search engines, but it is not bank-grade. Uploaded story pages are served
with a sandboxing Content Security Policy and `noindex`; anyone with a
story link can still open it.
