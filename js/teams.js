/* =============================================================================
 * TEAMS — resolves a team NUMBER to its official NAME via the free ftcscout.org
 * API, so scouts never type names (no typos). Names are cached in localStorage,
 * so once seen they show up even offline. If a lookup fails (offline / unknown
 * team) the app just shows the number — never blocks.
 * ===========================================================================*/
(function (global) {
  const LS = "ftc_team_names_v1";
  const API = "https://api.ftcscout.org/rest/v1/teams/";
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(LS)) || {}; } catch {}
  const inflight = {};
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(cache)); } catch {} };

  // Synchronous: name from cache, or null if not looked up / not found.
  function nameOf(num) {
    const n = String(num == null ? "" : num).trim();
    return cache[n] || null;
  }

  async function fetchOne(num) {
    const n = String(num == null ? "" : num).trim();
    if (!n) return null;
    if (cache[n] !== undefined) return cache[n];       // already resolved (name or null)
    if (inflight[n]) return inflight[n];
    inflight[n] = (async () => {
      try {
        const res = await fetch(API + encodeURIComponent(n));
        const txt = await res.text();
        let t = null; try { t = JSON.parse(txt); } catch {}
        cache[n] = (t && t.name) ? t.name : null;       // null = looked up, no name
        save();
      } catch (e) {
        // network error: leave UNSET so we retry next time (don't cache a miss)
      }
      delete inflight[n];
      return cache[n] || null;
    })();
    return inflight[n];
  }

  // Warm the cache for a batch of numbers (only the ones we haven't resolved).
  async function ensure(nums) {
    const uniq = [...new Set((nums || []).map((x) => String(x).trim()).filter(Boolean))];
    await Promise.all(uniq.filter((n) => cache[n] === undefined).map(fetchOne));
  }

  global.FTC = global.FTC || {};
  global.FTC.Teams = { nameOf, fetchOne, ensure };
})(typeof window !== "undefined" ? window : globalThis);
