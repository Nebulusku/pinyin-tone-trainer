/* Cloud login + progress sync via Supabase (REST, no SDK). Active only when supabase-config.js defines SUPABASE.
   Progress lives in one row per user (table `progress`, protected by row-level security).
   Every sync pulls, merges (see mergeState in app.js), then pushes — so two devices never overwrite each other. */
const Sync = (() => {
  const KEY = "ptt-sb-session";
  const cfg = () => window.SUPABASE;
  let session = null, timer = null, busy = false, again = false;
  try { session = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}

  const setStatus = t => { const el = document.getElementById("syncStatus"); if (el) el.textContent = t; };
  function keep(s) {
    session = s;
    try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {}
  }
  const headers = extra => Object.assign({ apikey: cfg().anonKey, "Content-Type": "application/json" }, extra);

  async function authCall(grant, body) {
    const r = await fetch(`${cfg().url}/auth/v1/token?grant_type=${grant}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error_description || j.msg || j.message || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + j.expires_in, user: { id: j.user.id, email: j.user.email } };
  }

  async function signIn(email, password) {
    keep(await authCall("password", { email: email.trim(), password }));
    return session;
  }

  async function token() {
    if (session.expires_at - 60 < Date.now() / 1000) {
      try { keep(await authCall("refresh_token", { refresh_token: session.refresh_token })); }
      catch (e) { if (e.status === 400 || e.status === 401) { keep(null); location.reload(); } throw e; }
    }
    return session.access_token;
  }

  async function rest(path, opts = {}) {
    const r = await fetch(`${cfg().url}/rest/v1/${path}`, Object.assign({}, opts, { headers: headers(Object.assign({ Authorization: `Bearer ${await token()}` }, opts.headers)) }));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.status === 204 || r.status === 201 ? null : r.json();
  }

  async function run() {
    if (!session || !navigator.onLine) { setStatus(session ? "☁️ offline — will sync later" : ""); return; }
    if (busy) { again = true; return; }
    busy = true;
    try {
      setStatus("☁️ syncing…");
      const rows = await rest(`progress?select=data&user_id=eq.${session.user.id}`);
      if (rows && rows[0]) mergeState(rows[0].data);
      await rest("progress", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: session.user.id, data: exportState(), updated_at: new Date().toISOString() }),
      });
      setStatus(`☁️ synced ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    } catch (e) {
      setStatus("☁️ sync failed — will retry");
    }
    busy = false;
    if (again) { again = false; schedule(); }
  }

  function schedule() { if (!session) return; clearTimeout(timer); timer = setTimeout(run, 2500); }

  async function signOut() {
    if (session) fetch(`${cfg().url}/auth/v1/logout`, { method: "POST", headers: headers({ Authorization: `Bearer ${session.access_token}` }) }).catch(() => {});
    keep(null);
    location.reload();
  }

  function start() {
    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", () => (document.hidden ? run() : schedule()));
  }

  return { enabled: () => !!cfg(), signedIn: () => !!session, signIn, signOut, start, schedule };
})();
