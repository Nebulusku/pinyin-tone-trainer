/* Device login. The username + password are created on each device and stored there only as a
   salted PBKDF2 hash (never in the published code). It locks the app on that device; it is not server security. */
const Auth = (() => {
  const KEY = "ptt-auth", REMEMBER = "ptt-remember", SESSION = "ptt-session", DATA = "pinyin-tone-trainer-v1";
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
  const $ = s => document.querySelector(s);

  async function derive(user, pw, salt) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(salt + "|" + user.trim().toLowerCase()), iterations: 150000, hash: "SHA-256" }, key, 256);
    return hex(bits);
  }

  function isUnlocked() {
    const r = get(REMEMBER);
    if (r && r.until > Date.now()) return true;
    try { return sessionStorage.getItem(SESSION) === "1"; } catch (e) { return false; }
  }

  function unlock(remember) {
    try { sessionStorage.setItem(SESSION, "1"); } catch (e) {}
    set(REMEMBER, remember ? { until: Date.now() + 30 * 864e5 } : null);
    $("#lock").hidden = true;
  }

  function show() {
    const setup = !get(KEY);
    $("#lock").hidden = false;
    $("#lockTitle").textContent = setup ? "Create your login for this device" : "Sign in";
    $("#lockPass2").hidden = !setup;
    $("#lockPass").autocomplete = setup ? "new-password" : "current-password";
    $("#lockBtn").textContent = setup ? "Create login" : "Sign in";
    $("#lockHint").textContent = setup
      ? "Stored only on this device (as a scrambled hash). You'll set it once per phone or computer."
      : "";
    $("#lockUser").focus();
  }

  async function submit(e) {
    e.preventDefault();
    const user = $("#lockUser").value.trim(), pw = $("#lockPass").value, msg = $("#lockMsg");
    const stored = get(KEY), remember = $("#lockRemember").checked;
    msg.textContent = "";
    if (!user || pw.length < 4) { msg.textContent = "Enter a username and a password of at least 4 characters."; return; }
    if (!stored) {
      if (pw !== $("#lockPass2").value) { msg.textContent = "The two passwords don't match."; return; }
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      set(KEY, { salt, hash: await derive(user, pw, salt) });
      return unlock(remember);
    }
    if ((await derive(user, pw, stored.salt)) === stored.hash) return unlock(remember);
    await new Promise(r => setTimeout(r, 600));
    msg.textContent = "Wrong username or password.";
  }

  function reset() {
    if (!confirm("This removes the login AND all learning progress on this device. Continue?")) return;
    [KEY, REMEMBER, DATA].forEach(k => set(k, null));
    location.reload();
  }

  function signOut() {
    set(REMEMBER, null);
    try { sessionStorage.removeItem(SESSION); } catch (e) {}
    location.reload();
  }

  function init() {
    $("#lockForm").onsubmit = submit;
    $("#lockReset").onclick = reset;
    $("#signOut").onclick = signOut;
    if (!(window.crypto && crypto.subtle)) { $("#lock").hidden = true; $("#signOut").hidden = true; return; }
    if (isUnlocked()) $("#lock").hidden = true; else show();
  }

  return { init };
})();
Auth.init();
