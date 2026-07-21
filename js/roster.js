/* =============================================================================
 * ROSTER — hardcoded team number → name for the teams at YOUR event.
 * Names listed here show INSTANTLY, with no network call (fast + works offline).
 * Any team number NOT listed here still works — it falls back to a one-time
 * ftcscout.org lookup that gets cached. So this list is purely a speed boost.
 *
 * To add teams: one line each, "number": "Name",
 * (Paste the event roster here — see README. Trailing commas are fine.)
 * ===========================================================================*/
window.FTC = window.FTC || {};

FTC.ROSTER = {
  "17070": "EVOLUTION",
  // "14584": "Pioneer 327",
  // "8813":  "The Winter Soldiers",
};
