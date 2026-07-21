/* =============================================================================
 * STORE — where match records live.
 *   • No Supabase configured  → this device's localStorage (works offline).
 *   • Supabase configured      → shared cloud table, with a localStorage cache
 *     so the app still shows data if the network drops.
 * A record: { id, team, match, scout, ts, values: { metricId: value, ... } }
 * ===========================================================================*/
(function (global) {
  const LS_KEY = "ftc_records_v1";
  const cfg = () => (global.FTC && FTC.CONFIG) || {};
  const useCloud = () => !!(cfg().supabaseUrl && cfg().supabaseAnonKey);

  const uid = () =>
    "r_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
  }
  function writeLocal(records) {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  }

  function sbHeaders() {
    return {
      apikey: cfg().supabaseAnonKey,
      Authorization: "Bearer " + cfg().supabaseAnonKey,
      "Content-Type": "application/json",
    };
  }
  const sbUrl = (path) => cfg().supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + path;

  let cache = readLocal();

  const Store = {
    mode: () => (useCloud() ? "cloud" : "local"),

    /* Load all records. Cloud pulls fresh, falls back to cache on failure. */
    async load() {
      if (!useCloud()) { cache = readLocal(); return cache; }
      try {
        const res = await fetch(sbUrl("scouting?select=*"), { headers: sbHeaders() });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const rows = await res.json();
        cache = rows.map((r) => ({
          id: r.id, team: r.team, match: r.match, scout: r.scout,
          ts: r.ts, values: r.values || {},
        }));
        writeLocal(cache);
        return cache;
      } catch (e) {
        console.warn("Cloud load failed, using local cache:", e.message);
        cache = readLocal();
        return cache;
      }
    },

    all() { return cache.slice(); },

    async add(rec) {
      const record = {
        id: uid(),
        team: String(rec.team).trim(),
        match: rec.match || "",
        scout: rec.scout || "",
        ts: new Date().toISOString(),
        values: rec.values || {},
      };
      cache.push(record);
      writeLocal(cache);
      if (useCloud()) {
        try {
          await fetch(sbUrl("scouting"), {
            method: "POST",
            headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify(record),
          });
        } catch (e) { console.warn("Cloud save failed (kept locally):", e.message); }
      }
      return record;
    },

    async remove(id) {
      cache = cache.filter((r) => r.id !== id);
      writeLocal(cache);
      if (useCloud()) {
        try {
          await fetch(sbUrl("scouting?id=eq." + encodeURIComponent(id)), {
            method: "DELETE", headers: sbHeaders(),
          });
        } catch (e) { console.warn("Cloud delete failed:", e.message); }
      }
    },

    /* Export / import for sharing a device's data as a file. */
    exportJSON() { return JSON.stringify(cache, null, 2); },
    async importJSON(text) {
      const rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error("Not a list of records");
      for (const r of rows) {
        if (!cache.find((c) => c.id === r.id)) cache.push(r);
      }
      writeLocal(cache);
      return cache.length;
    },
  };

  global.FTC = global.FTC || {};
  global.FTC.Store = Store;
})(typeof window !== "undefined" ? window : globalThis);
