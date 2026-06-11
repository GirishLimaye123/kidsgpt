/* =======================================================================
   KIDSGPT shared app code: login, sessions, and saving answers.
   Honest note: this is a friendly gate, not bank-level security.
   It keeps curriculum off search engines and away from casual copying.
   For real protection later, put the site behind Cloudflare Access.
   ======================================================================= */

const SESSION_KEY = "kidsgpt_session";

/* ---------- hashing ---------- */
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* Teacher helper — run makeHash("newpassword") in the console on login.html */
async function makeHash(pw) {
  const h = await sha256Hex(pw + ":" + KIDSGPT_SALT);
  console.log("Hash for roster file:\n" + h);
  return h;
}

/* ---------- session ---------- */
function currentStudent() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}

function requireLogin() {
  if (!currentStudent()) {
    const here = encodeURIComponent(location.pathname.split("/").pop() || "classes.html");
    location.href = "login.html?next=" + here;
  }
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  location.href = "index.html";
}

/* Fill any element with class .student-name */
function paintStudentName() {
  const s = currentStudent();
  if (!s) return;
  document.querySelectorAll(".student-name").forEach(el => (el.textContent = s.name));
}

/* ---------- login form ---------- */
async function handleLogin(ev) {
  ev.preventDefault();
  const name = document.getElementById("login-name").value;
  const pw = document.getElementById("login-pw").value;
  const err = document.getElementById("login-error");
  err.textContent = "";

  const student = STUDENTS.find(s => s.name === name);
  if (!student) { err.textContent = "Pick your name from the list."; return; }

  const h = await sha256Hex(pw + ":" + KIDSGPT_SALT);
  if (h === student.hash) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ name: student.name, at: Date.now() }));
    const params = new URLSearchParams(location.search);
    location.href = params.get("next") || "classes.html";
  } else {
    err.textContent = "That password didn't match. Try again!";
    document.getElementById("login-pw").value = "";
  }
}

function buildLoginNameOptions() {
  const sel = document.getElementById("login-name");
  if (!sel) return;
  STUDENTS.forEach(s => {
    const o = document.createElement("option");
    o.value = s.name; o.textContent = s.name;
    sel.appendChild(o);
  });
}

/* ---------- saving answers (per student, per page) ---------- */
function answerKey(fieldId) {
  const s = currentStudent();
  const page = location.pathname.split("/").pop().replace(".html", "");
  return `kidsgpt:${s ? s.name : "guest"}:${page}:${fieldId}`;
}

function wireSavedFields() {
  document.querySelectorAll("[data-save]").forEach(el => {
    const key = answerKey(el.id);
    const saved = localStorage.getItem(key);
    if (saved !== null) el.value = saved;

    let t;
    el.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        localStorage.setItem(key, el.value);
        const hint = el.parentElement.querySelector(".savehint");
        if (hint) {
          hint.classList.add("show");
          setTimeout(() => hint.classList.remove("show"), 1200);
        }
      }, 350);
    });
  });
}

/* Download everything this student saved on this page as a text file */
function downloadNotebook(weekLabel) {
  const s = currentStudent();
  const lines = [`KIDSGPT notebook — ${s ? s.name : "guest"} — ${weekLabel}`, ""];
  document.querySelectorAll("[data-save]").forEach(el => {
    const label = el.dataset.label || el.id;
    const val = localStorage.getItem(answerKey(el.id)) || "(blank)";
    lines.push(`Q: ${label}`, `A: ${val}`, "");
  });
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kidsgpt-${weekLabel.toLowerCase().replace(/\s+/g, "-")}-${(s ? s.name : "guest").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  buildLoginNameOptions();
  paintStudentName();
  wireSavedFields();
  const form = document.getElementById("login-form");
  if (form) form.addEventListener("submit", handleLogin);
});
