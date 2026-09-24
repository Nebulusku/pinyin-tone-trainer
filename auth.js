/* Login gate, two modes:
   - Cloud (supabase-config.js present): email + password checked by Supabase; progress syncs (sync.js).
   - Local hash (login.js from tools/set-login.js): salted PBKDF2 hash checked in the browser; no sync. */
const Auth = (() => {
  const REMEMBER = "ptt-remember", SESSION = "ptt-session";
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
  const $ = s => document.querySelector(s);
  const cfg = () => window.LOGIN;
  /* Must match normalize() in tools/set-login.js: phone keyboards turn quotes/dashes "smart". */
  const normalize = s => s.normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");

  async function derive(user, pw, { salt, iterations }) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(normalize(pw)), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(`${salt}|${normalize(user.trim()).toLowerCase()}`), iterations, hash: "SHA-256" }, key, 256);
    return hex(bits);
  }

  /* A remembered sign-in is tied to the current login hash, so changing the password signs every device out. */
  function isUnlocked() {
    const r = get(REMEMBER);
    if (r && r.until > Date.now() && r.hash === cfg().hash) return true;
    try { return sessionStorage.getItem(SESSION) === cfg().hash; } catch (e) { return false; }
  }

  function unlockLocal(remember) {
    try { sessionStorage.setItem(SESSION, cfg().hash); } catch (e) {}
    set(REMEMBER, remember ? { until: Date.now() + 30 * 864e5, hash: cfg().hash } : null);
    $("#lock").hidden = true;
  }

  async function submit(e) {
    e.preventDefault();
    const user = $("#lockUser").value, pw = $("#lockPass").value, msg = $("#lockMsg"), btn = $("#lockBtn");
    msg.textContent = "";
    if (!user.trim() || !pw) { msg.textContent = "Enter your login and password."; return; }
    btn.disabled = true;
    btn.textContent = "Checking…";
    let error = null;
    if (Sync.enabled()) {
      try { await Sync.signIn(user, pw); } catch (err) {
        error = !navigator.onLine ? "You're offline — the first sign-in needs internet."
          : err.status === 400 ? "Wrong email or password." : `Sign-in failed (${err.message}).`;
      }
    } else if ((await derive(user, pw, cfg())) !== cfg().hash) error = "Wrong username or password.";
    btn.disabled = false;
    btn.textContent = "Sign in";
    if (error) { $("#lockPass").value = ""; msg.textContent = error; return; }
    if (Sync.enabled()) { $("#lock").hidden = true; Sync.start(); }
    else unlockLocal($("#lockRemember").checked);
  }

  function signOut() {
    if (Sync.enabled()) return Sync.signOut();
    set(REMEMBER, null);
    try { sessionStorage.removeItem(SESSION); } catch (e) {}
    location.reload();
  }

  function init() {
    $("#signOut").onclick = signOut;
    $("#lockShow").onchange = e => ($("#lockPass").type = e.target.checked ? "text" : "password");
    $("#lockForm").onsubmit = submit;
    if (Sync.enabled()) {
      $("#lockUser").type = "email";
      $("#lockUser").placeholder = "Email";
      $("#lockRemember").parentElement.hidden = true; // cloud sessions renew themselves
      if (Sync.signedIn()) { $("#lock").hidden = true; Sync.start(); }
      return;
    }
    if (!cfg()) {
      $("#lockForm").innerHTML = `<h2>拼音 Tone Trainer</h2><p class="note">No login has been set up yet. On the Mac, run <code>node tools/set-login.js</code> in the app folder.</p>`;
      return;
    }
    if (!(window.crypto && crypto.subtle)) {
      $("#lockMsg").textContent = "This browser can't check the login here — open the app from its https:// address.";
      $("#lockBtn").disabled = true;
      return;
    }
    if (isUnlocked()) $("#lock").hidden = true;
  }

  return { init };
})();
Auth.init();
