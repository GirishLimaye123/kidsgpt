# KIDSGPT — The Tuesday Builder Club site

Static site. Deploys anywhere (Vercel recommended). No build step.

## Files
- index.html      — public landing page
- login.html      — student login (name + password)
- classes.html    — locked: full 16-week curriculum hub
- class1.html     — locked: Week 1 full lesson w/ warm-up game + saved answers
- warmups.html    — locked: warm-up arcade (3 mini-games)
- assets/         — styles.css, app.js (login/saving), students.js (roster)

## Add/change students
Edit assets/students.js. To make a password hash: open login.html,
press F12 (console), run  makeHash("their-password")  and paste the result.

Demo logins (CHANGE BEFORE REAL USE): Demo Kid/rocket, Nova/comet,
Pixel/pixel, Teacher/orbit2026.

## Honest security note
The login is client-side: it deters copying and keeps lessons out of
search engines, but it is not bank-grade. Upgrade path: Cloudflare
Access or Supabase auth + Vercel functions.
