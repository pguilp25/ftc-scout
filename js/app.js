/* =============================================================================
 * APP — all the UI. Reads FTC.CONFIG, uses FTC.Store / FTC.Stats / FTC.Charts.
 * Plain DOM, event-delegated. Rendered as HTML strings for clarity.
 * ===========================================================================*/
(function () {
  const C = FTC.CONFIG, S = FTC.Stats, CH = FTC.Charts, DB = FTC.Store, T = FTC.Teams;
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const round = (n) => (Math.abs(n % 1) < 0.05 ? Math.round(n) : n.toFixed(1));

  // "17070 — EVOLUTION" when the name is known, otherwise just the number.
  const teamLabel = (num) => {
    const nm = T.nameOf(num);
    return nm ? esc(num) + " — " + esc(nm) : esc(num);
  };

  // Load records only. Names resolve instantly from the hardcoded roster / cache;
  // any missing ones are fetched in the BACKGROUND (see fillNames) so the UI
  // never waits on the network.
  async function loadData() {
    await DB.load();
  }

  // Fetch any not-yet-known team names in the background, then re-render.
  function fillNames() {
    const missing = DB.all().map((r) => r.team).filter((t) => t && !T.nameOf(t));
    if (!missing.length) return;
    T.ensure(missing).then(() => render());
  }

  /* ---- state ---- */
  const GROUPS = C.groups && C.groups.length ? C.groups : ["Group A"];
  const DEFAULT_GROUP = C.defaultGroup || GROUPS[GROUPS.length - 1];
  const state = {
    view: "scout",
    team: null,
    form: {},                 // in-progress scout values
    weightsByGroup: initWeights(),   // { "sec 2": {id:w}, "sec 5": {id:w} }
    sort: { col: "fit", dir: -1 },
    search: "",
    leaderStat: "total",
    group: localStorage.getItem("ftc_group") || DEFAULT_GROUP,   // active scouting group
    adminLevel: localStorage.getItem("ftc_admin_level") || "none", // "none" | "sec2" | "main"
    filterGroup: "all",       // results filter: "all" | a group name
    filterScouts: [],         // results filter: [] = all, else selected scouter names
    outlierSD: 0,             // 0 = keep all; else drop matches beyond N σ from a team's mean
  };
  if (!GROUPS.includes(state.group)) state.group = DEFAULT_GROUP;

  /* ---- permissions ---- */
  const isMain = () => state.adminLevel === "main";
  const canEditWeights = (g) => state.adminLevel === "main" || (state.adminLevel === "sec2" && g === "sec 2");
  // Weights the results/ranking use: the filtered group's set (default group for "both").
  const rankWeights = () => state.weightsByGroup[state.filterGroup === "all" ? DEFAULT_GROUP : state.filterGroup] || {};

  // Admin login/logout. 2626 = main (edit everything); 27402 = sec 2 weights only.
  function setAdminLevel(lvl) {
    state.adminLevel = lvl;
    localStorage.setItem("ftc_admin_level", lvl);
    render();
  }
  function adminAction() {
    if (state.adminLevel !== "none") { setAdminLevel("none"); return; } // logged in → log out
    openAdminModal();
  }
  function openAdminModal() {
    closeAdminModal();
    const ov = document.createElement("div");
    ov.className = "overlay"; ov.id = "adminOverlay";
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3 style="margin:0 0 6px">Admin login</h3>
      <p class="muted" style="margin:0 0 12px">Enter the admin password.</p>
      <input type="password" id="adminPw" inputmode="numeric" placeholder="password" autocomplete="off">
      <div id="adminErr" class="modal-err"></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn" data-action="admin-cancel">Cancel</button>
        <button class="btn primary" data-action="admin-submit">Log in</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const inp = document.getElementById("adminPw");
    if (inp) {
      inp.focus();
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); submitAdmin(); }
        else if (e.key === "Escape") closeAdminModal();
      });
    }
  }
  function closeAdminModal() { const ov = document.getElementById("adminOverlay"); if (ov) ov.remove(); }
  function submitAdmin() {
    const inp = document.getElementById("adminPw");
    const pw = ((inp && inp.value) || "").trim();
    const lvl = pw === "2626" ? "main" : pw === "27402" ? "sec2" : null;
    if (!lvl) {
      const er = document.getElementById("adminErr");
      if (er) er.textContent = "Wrong password.";
      if (inp) { inp.value = ""; inp.focus(); }
      return;
    }
    closeAdminModal();
    setAdminLevel(lvl);
  }

  // Which group a record belongs to. Untagged (existing) records → default group.
  const groupOf = (r) => (r.values && r.values.__group) || DEFAULT_GROUP;

  // Records feeding the results views, after the group + scouter filters.
  function filteredRecords() {
    return DB.all().filter((r) => {
      if (state.filterGroup !== "all" && groupOf(r) !== state.filterGroup) return false;
      if (state.filterScouts.length && !state.filterScouts.includes((r.scout || "").trim())) return false;
      return true;
    });
  }

  // Outlier-exclusion options passed into the stats functions.
  const oOpts = () => ({ outlierSD: state.outlierSD });

  // Preset outlier levels (± standard deviations from a team's average).
  const OUTLIER_LEVELS = [
    { v: 0,   label: "Keep all matches" },
    { v: 2,   label: "Drop way-off (±2σ)" },
    { v: 1.5, label: "Drop unusual (±1.5σ)" },
    { v: 1,   label: "Strict (±1σ)" },
  ];

  // The group + scouter + outlier filter bar shown atop the results views.
  function filterBarHTML() {
    const scouts = [...new Set(DB.all().map((r) => (r.scout || "").trim()).filter(Boolean))].sort();
    const gopt = (v, label) => `<option value="${esc(v)}"${state.filterGroup === v ? " selected" : ""}>${esc(label)}</option>`;
    const oopt = (o) => `<option value="${o.v}"${state.outlierSD === o.v ? " selected" : ""}>${esc(o.label)}</option>`;
    const chips = scouts.length ? `
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px">
        <span class="muted">Scouters:</span>
        <button class="chip ${state.filterScouts.length === 0 ? "on" : ""}" data-scout="__all">All</button>
        ${scouts.map((s) => `<button class="chip ${state.filterScouts.includes(s) ? "on" : ""}" data-scout="${esc(s)}">${esc(s)}</button>`).join("")}
      </div>` : "";
    return `<div class="card">
      <div class="row">
        <label class="muted">Group&nbsp;
          <select data-filter="group">
            ${gopt("all", "Both groups")}
            ${GROUPS.map((g) => gopt(g, g)).join("")}
          </select></label>
        <label class="muted">Outliers&nbsp;
          <select data-filter="outlier">${OUTLIER_LEVELS.map(oopt).join("")}</select></label>
      </div>
      ${chips}
    </div>`;
  }

  function defaultWeights() {
    const w = {};
    C.metrics.forEach((m) => { if (m.type !== "text") w[m.id] = m.weight || 0; });
    return w;
  }
  // One weight set per group, seeded from localStorage (DB overlays later on boot).
  function initWeights() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("ftc_weights_by_group")) || {}; } catch {}
    const out = {};
    GROUPS.forEach((g) => {
      out[g] = defaultWeights();
      if (saved[g]) C.metrics.forEach((m) => { if (m.type !== "text" && saved[g][m.id] != null) out[g][m.id] = saved[g][m.id]; });
    });
    return out;
  }
  // Persist locally now, and to the shared DB (debounced) so all devices sync.
  function persistWeights() {
    localStorage.setItem("ftc_weights_by_group", JSON.stringify(state.weightsByGroup));
    clearTimeout(persistWeights._t);
    persistWeights._t = setTimeout(() => { if (DB.saveSetting) DB.saveSetting("weightsByGroup", state.weightsByGroup); }, 600);
  }
  // Pull shared weights from the DB and overlay onto local state.
  async function loadSettings() {
    if (!DB.loadSettings) return;
    let s = {}; try { s = await DB.loadSettings(); } catch { return; }
    const wbg = s && s.weightsByGroup;
    if (!wbg) return;
    GROUPS.forEach((g) => {
      if (!wbg[g]) return;
      C.metrics.forEach((m) => { if (m.type !== "text" && wbg[g][m.id] != null) state.weightsByGroup[g][m.id] = wbg[g][m.id]; });
    });
  }

  const metric = (id) => C.metrics.find((m) => m.id === id);
  const phaseLabel = (id) => (FTC.PHASES.find((p) => p.id === id) || {}).label || id;

  /* ============================ RENDER ==================================== */
  // The header: group switch, admin toggle, tab visibility, mode badge.
  function renderHeader() {
    const gs = $("#groupSwitch");
    if (gs) gs.innerHTML = GROUPS.map((g) =>
      `<button data-group="${esc(g)}" class="${state.group === g ? "on" : ""}">${esc(g)}</button>`).join("");
    const ab = $("#adminBtn");
    if (ab) {
      ab.classList.toggle("on", state.adminLevel !== "none");
      ab.textContent = state.adminLevel === "main" ? "Admin ✓"
                     : state.adminLevel === "sec2" ? "Sec 2 admin ✓" : "Admin";
      ab.title = state.adminLevel === "none" ? "Log in to edit" : "Logged in — click to log out";
    }
    const mb = $("#modeBadge");
    if (mb) mb.textContent = DB.mode() === "cloud" ? "☁ shared" : "◐ this device";
  }

  function render() {
    renderHeader();
    setActiveTab();
    const main = $("#main");
    if (state.view === "scout")   main.innerHTML = viewScout();
    else if (state.view === "ranking") main.innerHTML = viewRanking();
    else if (state.view === "leaders") main.innerHTML = viewLeaders();
    else if (state.view === "teams")   main.innerHTML = viewTeams();
    else if (state.view === "team")    main.innerHTML = viewTeam(state.team);
    // restore scout widget state after (re)render
    if (state.view === "teams" && state.search) {
      const s = $("#f_search"); if (s) { s.focus(); s.value = state.search; }
    }
  }

  function setActiveTab() {
    document.querySelectorAll("nav button").forEach((b) =>
      b.classList.toggle("active", b.dataset.nav === (state.view === "team" ? "teams" : state.view)));
  }

  /* ---------------------------- SCOUT ------------------------------------ */
  function viewScout() {
    const groups = FTC.PHASES.map((ph) => {
      const fields = C.metrics.filter((m) => m.phase === ph.id).map(fieldHTML).join("");
      if (!fields) return "";
      return `<div class="phase-group"><h3>${esc(ph.label)}</h3><div class="grid2">${fields}</div></div>`;
    }).join("");

    return `<div class="card">
      <h2>Scout a match</h2>
      <p class="muted">Fill this in while you watch the team you're scouting, then Save. Each save is one match.
        Saving to group <strong>${esc(state.group)}</strong> — change it with the switch up top.</p>
      <div class="grid2">
        <div class="field"><label>Team # you're scouting</label>
          <input id="f_team" inputmode="numeric" placeholder="e.g. 14584" autocomplete="off">
          <div id="teamNameHint" class="muted" style="font-size:13px;margin-top:4px;min-height:18px"></div></div>
        <div class="field"><label>Match (optional)</label>
          <input id="f_match" placeholder="e.g. Q12" autocomplete="off"></div>
      </div>
      <div class="field"><label>Your name (scout)</label>
        <input id="f_scout" placeholder="who's filling this in" autocomplete="off"></div>
      ${groups}
      <div class="row" style="margin-top:16px">
        <button class="btn primary" data-action="save">Save match</button>
        <span id="toast" class="muted"></span>
      </div>
    </div>`;
  }

  function fieldHTML(m) {
    const v = state.form[m.id];
    if (m.type === "number") {
      const val = v || 0;
      return `<div class="field"><label>${esc(m.label)}</label>
        <div class="stepper">
          <button data-step="${m.id}" data-dir="-1">−</button>
          <span class="v" id="v_${m.id}">${val}</span>
          <button data-step="${m.id}" data-dir="1">+</button>
        </div></div>`;
    }
    if (m.type === "rating") {
      const max = m.max || 5;
      const btns = Array.from({ length: max }, (_, i) => i + 1).map((n) =>
        `<button data-rate="${m.id}" data-val="${n}" class="${v === n ? "on" : ""}">${n}</button>`).join("");
      return `<div class="field"><label>${esc(m.label)} <span class="muted">(1–${max})</span></label>
        <div class="rating" id="r_${m.id}">${btns}</div></div>`;
    }
    if (m.type === "bool") {
      const yes = v === true, no = v === false;
      return `<div class="field"><label>${esc(m.label)}</label>
        <div class="segmented" id="t_${m.id}">
          <button data-boolval="${m.id}" data-v="0" class="${no ? "on" : ""}">No</button>
          <button data-boolval="${m.id}" data-v="1" class="${yes ? "on" : ""}">Yes</button>
        </div></div>`;
    }
    if (m.type === "select") {
      if (m.style === "buttons") {
        const btns = (m.options || []).map((o) =>
          `<button data-choice="${m.id}" data-val="${esc(o.label)}" class="${v === o.label ? "on" : ""}">${esc(o.label)}</button>`).join("");
        return `<div class="field"><label>${esc(m.label)}</label>
          <div class="rating" id="c_${m.id}">${btns}</div></div>`;
      }
      const opts = (m.options || []).map((o) =>
        `<option value="${esc(o.label)}"${v === o.label ? " selected" : ""}>${esc(o.label)}</option>`).join("");
      return `<div class="field"><label>${esc(m.label)}</label>
        <select id="s_${m.id}" data-select="${m.id}">${opts}</select></div>`;
    }
    if (m.type === "text") {
      return `<div class="field" style="grid-column:1/-1"><label>${esc(m.label)}</label>
        <textarea id="x_${m.id}">${esc(v || "")}</textarea></div>`;
    }
    return "";
  }

  async function saveMatch() {
    const team = ($("#f_team").value || "").trim();
    if (!team) { toast("Enter a team number first."); $("#f_team").focus(); return; }
    const values = {};
    C.metrics.forEach((m) => {
      if (m.type === "number" || m.type === "rating") values[m.id] = state.form[m.id] || (m.type === "number" ? 0 : null);
      else if (m.type === "bool") values[m.id] = !!state.form[m.id];
      else if (m.type === "select") { const el = $("#s_" + m.id); values[m.id] = el ? el.value : (state.form[m.id] != null ? state.form[m.id] : null); }
      else if (m.type === "text") { const el = $("#x_" + m.id); values[m.id] = el ? el.value.trim() : ""; }
    });
    values.__group = state.group;   // tag the record with the active scouting group
    const match = ($("#f_match").value || "").trim();
    const scout = ($("#f_scout").value || "").trim();
    const rec = await DB.add({ team, match, scout, values });
    // reset numeric fields for the next match, keep scout name
    state.form = {};
    render();
    $("#f_scout").value = scout;
    toast(`Saved ${rec.team}${match ? " · " + match : ""}. ${DB.all().filter(r=>r.team===team).length} match(es) for this team.`);
  }

  function toast(msg) { const t = $("#toast"); if (t) t.textContent = msg; }

  async function doRefresh() {
    const btn = $("#refreshBtn");
    const old = btn ? btn.textContent : "";
    if (btn) { btn.textContent = "…"; btn.disabled = true; }
    await loadData();
    await loadSettings();
    render();
    fillNames();
    if (btn) { btn.textContent = old; btn.disabled = false; }
  }

  /* ---------------------------- RANKING ---------------------------------- */
  function viewRanking() {
    const rankGroup = state.filterGroup === "all" ? DEFAULT_GROUP : state.filterGroup;
    const ranked = S.rankTeams(C, filteredRecords(), state.weightsByGroup[rankGroup], oOpts());

    const rows = ranked.length ? ranked.map((t, i) => `
      <tr data-team="${esc(t.team)}">
        <td><span class="rank-badge">${i + 1}</span></td>
        <td><strong>${teamLabel(t.team)}</strong></td>
        <td>${fitBar(t.fit)}</td>
        <td class="num">${round(t.avgScore)}</td>
        <td class="num">${t.matches}</td>
      </tr>`).join("") :
      `<tr><td colspan="5" class="empty-state">No teams scouted yet — go to <strong>Scout</strong> and add a match.</td></tr>`;

    return `${filterBarHTML()}
    <div class="card">
      <h2>Best teams for us <span class="muted">(team ${esc(C.myTeam)})</span></h2>
      <p class="muted">Ranked with the <strong>${esc(rankGroup)}</strong> weights (set by the group filter above).</p>
      <div class="table-scroll"><table><thead><tr>
        <th>#</th><th>Team</th><th>Fit for us</th><th class="num">Avg pts</th><th class="num">Matches</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    </div>
    ${GROUPS.filter(canEditWeights).map(weightPanel).join("")}
    ${saveLoadCard()}`;
  }

  // One editable (or read-only) slider panel per group.
  function weightPanel(g) {
    const editable = canEditWeights(g);
    const sliders = C.metrics.filter((m) => m.type !== "text").map((m) => `
      <div class="weight-row">
        <label>${esc(m.label)} <span class="muted">· ${esc(phaseLabel(m.phase))}</span></label>
        <input type="range" min="0" max="5" step="1" value="${state.weightsByGroup[g][m.id]}"
               data-weight="${m.id}" data-wgroup="${esc(g)}"${editable ? "" : " disabled"}>
        <span class="wv">${state.weightsByGroup[g][m.id]}</span>
      </div>`).join("");
    return `<div class="card">
      <h2>${esc(g)} — best-for-us weights ${editable ? "" : '<span class="pill">read-only</span>'}</h2>
      <p class="muted">${editable
        ? "Drag to tune what you want in an alliance partner. Saved to the shared database for everyone."
        : "Only an admin for this section can change these."}</p>
      ${sliders}
      ${editable ? `<div class="row"><button class="btn" data-action="reset-weights" data-wgroup="${esc(g)}">Reset ${esc(g)} to defaults</button></div>` : ""}
    </div>`;
  }

  // Backup / transfer the weights as a code or file (import needs edit rights).
  function saveLoadCard() {
    const canImport = state.adminLevel !== "none";
    return `<div class="card">
      <h2>Back up / transfer these settings</h2>
      <p class="muted">Weights already sync through the database. This is for backups or moving them
        to a different event. Only the sections you can edit are affected on import.</p>
      <div class="row">
        <button class="btn" data-action="copy-weights">Copy settings code</button>
        <button class="btn" data-action="download-weights">Download file</button>
        ${canImport ? `<button class="btn" data-action="import-file-weights">Load from file</button>
        <input type="file" id="weightsfile" accept="application/json" style="display:none">` : ""}
      </div>
      ${canImport ? `<div class="field" style="margin-top:12px">
        <label>Paste a settings code (or a file's contents) to load it</label>
        <textarea id="cfgIn" placeholder="paste code here…"></textarea>
      </div>
      <div class="row">
        <button class="btn primary" data-action="apply-weights">Apply pasted settings</button>
        <span id="weightsMsg" class="muted"></span>
      </div>` : `<div id="weightsMsg" class="muted" style="margin-top:8px">Log in as admin to import settings.</div>`}
    </div>`;
  }

  /* ---- save / load the "best for us" weights (both groups) ---- */
  const weightsPayload = () => ({ app: "ftc-scout", type: "best-for-us", myTeam: C.myTeam, weightsByGroup: state.weightsByGroup });
  const encodeWeights = () => btoa(unescape(encodeURIComponent(JSON.stringify(weightsPayload()))));
  const setWeightsMsg = (t) => { const m = $("#weightsMsg"); if (m) m.textContent = t; };

  function copyWeightsCode() {
    const code = encodeWeights();
    const fallback = () => { const i = $("#cfgIn"); if (i) { i.value = code; i.focus(); i.select(); } setWeightsMsg("Copy the code shown in the box above."); };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(code).then(() => setWeightsMsg("Copied! Send this code to your team.")).catch(fallback);
    else fallback();
  }
  function downloadWeights() {
    const blob = new Blob([JSON.stringify(weightsPayload(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ftc-best-for-us-" + C.myTeam + ".json";
    a.click(); URL.revokeObjectURL(a.href);
    setWeightsMsg("Downloaded settings file.");
  }
  // Applies weights for the groups the current admin may edit, clamped 0..5.
  function applyWeightsObject(obj) {
    // accept new {weightsByGroup} or legacy {weights} (→ default group)
    const wbg = obj && (obj.weightsByGroup || (obj.weights ? { [DEFAULT_GROUP]: obj.weights } : null));
    if (!wbg || typeof wbg !== "object") throw new Error("no weights");
    let n = 0;
    GROUPS.forEach((g) => {
      if (!wbg[g] || !canEditWeights(g)) return;
      C.metrics.forEach((m) => {
        if (m.type === "text") return;
        if (wbg[g][m.id] != null) { state.weightsByGroup[g][m.id] = Math.max(0, Math.min(5, +wbg[g][m.id] || 0)); n++; }
      });
    });
    if (!n) throw new Error("no editable settings in that code");
    persistWeights();
    return n;
  }
  function applyWeightsText(raw) {
    let obj;
    try { obj = JSON.parse(raw); }                                   // raw JSON (a file's contents)
    catch { obj = JSON.parse(decodeURIComponent(escape(atob(raw)))); } // or a base64 code
    return applyWeightsObject(obj);
  }
  function applyWeightsFromInput() {
    const raw = (($("#cfgIn") || {}).value || "").trim();
    if (!raw) { setWeightsMsg("Paste a code first."); return; }
    try { const n = applyWeightsText(raw); render(); setWeightsMsg(`Loaded ${n} settings.`); }
    catch (e) { setWeightsMsg("That code didn't work — make sure you copied all of it."); }
  }

  function fitBar(fit) {
    const w = Math.max(2, Math.round(fit));
    return `<div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;height:8px;background:var(--plane);border-radius:999px;overflow:hidden;min-width:80px">
        <div style="width:${w}%;height:100%;background:var(--accent)"></div></div>
      <span style="font-variant-numeric:tabular-nums;color:var(--ink2);min-width:34px;text-align:right">${Math.round(fit)}</span>
    </div>`;
  }

  /* ---------------------------- LEADERS ---------------------------------- */
  // Which stats you can rank teams by: total points + every numeric metric.
  function statOptions() {
    const opts = [{ key: "total", label: "Total points (avg)", suffix: "" }];
    C.metrics.forEach((m) => {
      if (m.type === "text") return;
      const suffix = m.type === "bool" ? "%" : m.type === "rating" ? "/" + (m.max || 5) : "";
      opts.push({ key: m.id, label: m.label, suffix });
    });
    return opts;
  }
  function statValue(agg, key) {
    if (key === "total") return agg.avgScore;
    const m = metric(key);
    const val = agg.perMetric[key] || 0;
    return m && m.type === "bool" ? val * 100 : val; // bool → % of matches
  }

  function viewLeaders() {
    const teams = S.allTeams(C, filteredRecords(), oOpts());
    const opts = statOptions();
    const cur = opts.find((o) => o.key === state.leaderStat) || opts[0];
    const ranked = teams
      .map((t) => ({ team: t.team, matches: t.matches, value: statValue(t, cur.key) }))
      .sort((a, b) => b.value - a.value);

    // Chart shows EVERY team (only teams with a value), in a scroll box so it
    // stays on-screen even with 50 teams.
    const barTeams = ranked.filter((t) => t.value > 0);
    const bars = barTeams.map((t, i) =>
      ({ label: t.team, value: t.value, suffix: cur.suffix, color: `var(--series-${(i % 8) + 1})` }));

    const select = `<select id="leaderStat">${opts.map((o) =>
      `<option value="${o.key}"${o.key === cur.key ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;

    const rows = ranked.length ? ranked.map((t, i) => `
      <tr data-team="${esc(t.team)}">
        <td><span class="rank-badge">${i + 1}</span></td>
        <td><strong>${teamLabel(t.team)}</strong></td>
        <td class="num">${round(t.value)}${esc(cur.suffix)}</td>
        <td class="num">${t.matches}</td>
      </tr>`).join("") :
      `<tr><td colspan="4" class="empty-state">No teams scouted yet — add a match under <strong>Scout</strong>.</td></tr>`;

    return `${filterBarHTML()}
    <div class="card">
      <div class="row">
        <h2 style="margin:0">Leaders</h2>
        <span style="margin-left:auto">${select}</span>
      </div>
      <p class="muted">Pick a stat to rank teams by it — the chart and list both update. Scroll to see all teams; tap a team for its breakdown.</p>
      <div class="chart-scroll">${CH.bars(bars, { title: cur.label })}</div>
    </div>
    <div class="card">
      <div class="table-scroll"><table><thead><tr>
        <th>#</th><th>Team</th><th class="num">${esc(cur.label)}</th><th class="num">Matches</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  }

  /* ---------------------------- TEAMS LIST ------------------------------- */
  function viewTeams() {
    let teams = S.allTeams(C, filteredRecords(), oOpts());
    if (state.search) {
      const q = state.search.toLowerCase();
      teams = teams.filter((t) => t.team.toLowerCase().includes(q));
    }
    const col = state.sort.col, dir = state.sort.dir;
    const keyOf = (t) => col === "team" ? t.team : col === "matches" ? t.matches
      : col === "fit" ? S.fitScore(C, t, rankWeights()) : t.avgScore;
    teams.sort((a, b) => {
      const ka = keyOf(a), kb = keyOf(b);
      if (typeof ka === "string") return dir * ka.localeCompare(kb);
      return dir * (ka - kb);
    });

    const arrow = (c) => state.sort.col === c ? (dir < 0 ? " ▾" : " ▴") : "";
    const rows = teams.length ? teams.map((t) => `
      <tr data-team="${esc(t.team)}">
        <td><strong>${teamLabel(t.team)}</strong></td>
        <td class="num">${t.matches}</td>
        <td class="num">${round(t.avgScore)}</td>
        <td class="num">${round(t.maxScore)}</td>
        <td class="num">${round(S.fitScore(C, t, rankWeights()))}</td>
      </tr>`).join("") :
      `<tr><td colspan="5" class="empty-state">No teams match.</td></tr>`;

    return `${filterBarHTML()}
    <div class="card">
      <div class="row">
        <h2 style="margin:0">All teams</h2>
        <input id="f_search" placeholder="filter team #" style="max-width:180px;margin-left:auto" value="${esc(state.search)}">
      </div>
      <p class="muted">Tap a column to sort. Tap a team to open its full breakdown.</p>
      <div class="table-scroll"><table><thead><tr>
        <th data-sort="team">Team${arrow("team")}</th>
        <th class="num" data-sort="matches">Matches${arrow("matches")}</th>
        <th class="num" data-sort="avgScore">Avg pts${arrow("avgScore")}</th>
        <th class="num" data-sort="avgScore">Best${arrow("best")}</th>
        <th class="num" data-sort="fit">Fit${arrow("fit")}</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    </div>
    <div class="card">
      <h2>Data</h2>
      <p class="muted">Mode: <span class="pill">${DB.mode() === "cloud" ? "☁ Shared (Supabase)" : "This device only"}</span>
        ${DB.mode() === "local" ? " — set up Supabase (see README) to share across scouts." : ""}</p>
      <div class="row">
        <button class="btn" data-action="export">Export data (.json)</button>
        ${isMain() ? `<button class="btn" data-action="import">Import data</button>
        <input type="file" id="importfile" accept="application/json" style="display:none">` : ""}
      </div>
    </div>`;
  }

  /* ---------------------------- TEAM DETAIL ------------------------------ */
  function viewTeam(team) {
    const agg = S.aggregateTeam(C, team, filteredRecords(), oOpts());
    if (!agg.matches) return `<div class="card empty-state">No data for ${esc(team)}.</div>`;

    // trend
    const trend = agg.records.map((r, i) => ({ label: r.match || "M" + (i + 1), y: Math.round(S.matchScore(C, r)) }));
    // phase breakdown (avg points per phase)
    const phaseBars = ["auto", "teleop", "endgame"].map((p, i) => ({
      label: phaseLabel(p),
      value: S.avg(agg.records.map((r) => S.phaseScore(C, r, p))),
      color: `var(--series-${i + 1})`,
    })).filter((b) => C.metrics.some((m) => m.phase === b0(b)));

    // ratings & rates profile
    // Each bar carries its own `max` so lengths are comparable: a 5/5 rating and
    // an 80% rate both fill (or nearly fill) the bar instead of one dwarfing the other.
    const profile = C.metrics.filter((m) => m.type === "rating" || m.type === "bool").map((m) => {
      const val = agg.perMetric[m.id] || 0;
      return m.type === "rating"
        ? { label: m.label, value: val, suffix: "/" + (m.max || 5), max: (m.max || 5) }
        : { label: m.label, value: Math.round(val * 100), suffix: "%", max: 100 };
    });

    const fit = S.fitScore(C, agg, rankWeights());
    const log = agg.records.slice().reverse().map((r) => `
      <tr>
        <td>${esc(r.match || "—")}</td>
        <td class="num">${Math.round(S.matchScore(C, r))}</td>
        <td class="muted">${esc(r.scout || "")}</td>
        <td>${esc((r.values.notes || "").slice(0, 60))}</td>
        <td class="num">${isMain() ? `<button class="btn danger" data-del="${esc(r.id)}" style="padding:4px 10px">Delete</button>` : ""}</td>
      </tr>`).join("");

    return `<div class="card">
      <div class="row">
        <button class="btn" data-action="back">← Back</button>
        <h2 style="margin:0">Team ${teamLabel(team)}</h2>
      </div>
      <div class="kpis" style="margin-top:14px">
        <div class="kpi"><div class="n">${round(agg.avgScore)}</div><div class="l">Avg points</div></div>
        <div class="kpi"><div class="n">${round(agg.maxScore)}</div><div class="l">Best game</div></div>
        <div class="kpi"><div class="n">±${round(agg.consistency)}</div><div class="l">Consistency (σ)</div></div>
        <div class="kpi"><div class="n">${Math.round(fit)}</div><div class="l">Fit for us</div></div>
      </div>
      ${agg.excluded ? `<p class="muted" style="margin:10px 0 0">${agg.excluded} match(es) excluded as outliers (${state.outlierSD}σ). These stats use the remaining ${agg.matches}.</p>` : ""}
    </div>
    <div class="card"><h2>Score by match</h2>${CH.line(trend)}</div>
    <div class="card"><h2>Where the points come from</h2>${CH.bars(phaseBars, { title: "Phase breakdown" })}</div>
    ${profile.length ? `<div class="card"><h2>Ratings & rates</h2>${CH.bars(profile, { title: "Profile" })}</div>` : ""}
    <div class="card"><h2>Match log</h2>
      <table><thead><tr><th>Match</th><th class="num">Pts</th><th>Scout</th><th>Notes</th><th></th></tr></thead>
      <tbody>${log}</tbody></table>
    </div>`;
  }
  const b0 = (b) => ({ "Autonomous": "auto", "Tele-Op": "teleop", "Endgame": "endgame" }[b.label] || b.label);

  /* ============================ EVENTS ==================================== */
  function onClick(e) {
    if (e.target.id === "adminOverlay") { closeAdminModal(); return; } // click backdrop to close
    const t = e.target.closest("[data-nav],[data-action],[data-step],[data-rate],[data-boolval],[data-choice],[data-team],[data-sort],[data-del],[data-group],[data-scout]");
    if (!t) return;
    const d = t.dataset;

    if (d.group) { state.group = d.group; localStorage.setItem("ftc_group", d.group); render(); return; }
    if (d.scout) {
      if (d.scout === "__all") state.filterScouts = [];
      else {
        const i = state.filterScouts.indexOf(d.scout);
        if (i >= 0) state.filterScouts.splice(i, 1); else state.filterScouts.push(d.scout);
      }
      render(); return;
    }

    if (d.nav) {
      state.view = d.nav; render();
      // pull everyone's latest when opening a data view (collaborative)
      if (DB.mode() === "cloud" && d.nav !== "scout")
        loadData().then(() => { if (state.view === d.nav) { render(); fillNames(); } });
      return;
    }
    if (d.action === "admin") { adminAction(); return; }
    if (d.action === "admin-submit") { submitAdmin(); return; }
    if (d.action === "admin-cancel") { closeAdminModal(); return; }
    if (d.action === "refresh") { doRefresh(); return; }
    if (d.action === "save") { saveMatch(); return; }
    if (d.action === "back") { state.view = "teams"; render(); return; }
    if (d.action === "reset-weights") {
      const g = d.wgroup;
      if (!canEditWeights(g)) return;
      C.metrics.forEach((m) => { if (m.type !== "text") state.weightsByGroup[g][m.id] = m.weight || 0; });
      persistWeights(); render(); return;
    }
    if (d.action === "copy-weights") { copyWeightsCode(); return; }
    if (d.action === "download-weights") { downloadWeights(); return; }
    if (d.action === "import-file-weights") { const el = $("#weightsfile"); if (el) el.click(); return; }
    if (d.action === "apply-weights") { applyWeightsFromInput(); return; }
    if (d.action === "theme") { toggleTheme(); return; }
    if (d.action === "export") { doExport(); return; }
    if (d.action === "import") { $("#importfile").click(); return; }

    if (d.step) {
      const m = metric(d.step);
      const cur = state.form[d.step] || 0;
      const next = Math.max(0, cur + (d.dir === "1" ? 1 : -1));
      state.form[d.step] = next;
      $("#v_" + d.step).textContent = next;
      return;
    }
    if (d.rate) {
      const id = d.rate, val = +d.val;
      state.form[id] = state.form[id] === val ? null : val; // tap again to clear
      document.querySelectorAll(`#r_${id} button`).forEach((b) =>
        b.classList.toggle("on", +b.dataset.val === state.form[id]));
      return;
    }
    if (d.boolval) {
      const id = d.boolval; state.form[id] = d.v === "1";
      document.querySelectorAll(`#t_${id} button`).forEach((b) =>
        b.classList.toggle("on", b.dataset.v === d.v));
      return;
    }
    if (d.choice) {
      const id = d.choice, val = d.val;
      state.form[id] = state.form[id] === val ? null : val; // tap again to clear
      document.querySelectorAll(`#c_${id} button`).forEach((b) =>
        b.classList.toggle("on", b.dataset.val === state.form[id]));
      return;
    }
    if (d.del) {
      if (!isMain()) return; // only the main admin can delete
      if (confirm("Delete this match record?")) DB.remove(d.del).then(render);
      return;
    }
    if (d.sort) {
      state.sort = state.sort.col === d.sort
        ? { col: d.sort, dir: -state.sort.dir } : { col: d.sort, dir: -1 };
      render(); return;
    }
    if (d.team) { state.team = d.team; state.view = "team"; render(); return; }
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset.weight) {
      const g = t.dataset.wgroup;
      if (!canEditWeights(g)) return;
      state.weightsByGroup[g][t.dataset.weight] = +t.value;
      const lab = t.parentNode.querySelector(".wv"); if (lab) lab.textContent = t.value;
      persistWeights();
      clearTimeout(onInput._t);
      onInput._t = setTimeout(() => { if (state.view === "ranking") render(); }, 250);
      return;
    }
    if (t.id === "f_search") { state.search = t.value; render(); return; }
    if (t.id === "f_team") { scheduleTeamLookup(t.value); return; }
  }

  // Look up the team name as the scout types the number (debounced), and show it.
  function scheduleTeamLookup(num) {
    clearTimeout(scheduleTeamLookup._t);
    const hint = $("#teamNameHint");
    const n = (num || "").trim();
    if (!n) { if (hint) hint.textContent = ""; return; }
    const cached = T.nameOf(n);
    if (cached) { if (hint) hint.textContent = "✓ " + cached; return; }
    if (hint) hint.textContent = "looking up…";
    scheduleTeamLookup._t = setTimeout(async () => {
      const nm = await T.fetchOne(n);
      const h = $("#teamNameHint");
      if (!h) return;
      h.textContent = nm ? "✓ " + nm : "team not found — you can still save";
    }, 400);
  }

  function onChange(e) {
    if (e.target.dataset.filter === "group") { state.filterGroup = e.target.value; render(); return; }
    if (e.target.dataset.filter === "outlier") { state.outlierSD = +e.target.value || 0; render(); return; }
    if (e.target.id === "leaderStat") { state.leaderStat = e.target.value; render(); return; }
    if (e.target.id === "weightsfile" && e.target.files[0]) {
      const rd = new FileReader();
      rd.onload = () => {
        try { const n = applyWeightsText(rd.result); render(); setWeightsMsg(`Loaded ${n} settings.`); }
        catch (err) { setWeightsMsg("Couldn't read that settings file."); }
      };
      rd.readAsText(e.target.files[0]);
      return;
    }
    if (e.target.id === "importfile" && e.target.files[0]) {
      const rd = new FileReader();
      rd.onload = () => DB.importJSON(rd.result).then((n) => { alert("Imported. Total records: " + n); render(); })
        .catch((err) => alert("Import failed: " + err.message));
      rd.readAsText(e.target.files[0]);
    }
  }

  function doExport() {
    const blob = new Blob([DB.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ftc-scouting-" + C.myTeam + ".json";
    a.click(); URL.revokeObjectURL(a.href);
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
    if (next) document.documentElement.setAttribute("data-theme", next);
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("ftc_theme", next);
  }

  /* ============================ BOOT ===================================== */
  async function boot() {
    const saved = localStorage.getItem("ftc_theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);

    $("#eventName").textContent = C.eventName;
    $("#modeBadge").textContent = DB.mode() === "cloud" ? "☁ shared" : "◐ this device";

    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);

    await loadData();
    render();
    fillNames();
    loadSettings().then(render);   // overlay shared weight sliders from the DB
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
