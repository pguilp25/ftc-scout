/* =============================================================================
 * FTC SCOUTING — CONFIG
 * -----------------------------------------------------------------------------
 * THIS IS THE ONLY FILE YOU NEED TO EDIT to customize what your scouts record.
 * Change a metric here and the scout form, the team list, the charts, and the
 * "Best team for our robot" ranking all update automatically.
 *
 * Defaults below are a reasonable starting point for DECODE (2025-26). Tweak the
 * point values / weights to match how you think about the game and your robot.
 * ===========================================================================*/

window.FTC = window.FTC || {};

FTC.CONFIG = {
  /* Shown in the header. */
  eventName: "FTC Edmonton Premier",
  myTeam: "17070", // your team number — used to label the ranking as "for us"

  /* --------------------------------------------------------------------------
   * METRICS
   * Each metric becomes one field on the scout form and one data column.
   *
   *   id            unique key (no spaces). Used as the storage key.
   *   label         what the scout sees.
   *   phase         "auto" | "teleop" | "endgame" | "qual"  (groups the form + charts)
   *   type          "number" | "bool" | "rating" | "select" | "text"
   *
   *   points        (scoring metrics) how many GAME POINTS one unit is worth.
   *                 Used to estimate a team's match score for the trend chart.
   *   norm          (number type) the "very good" value, used to scale the
   *                 ranking 0..1. e.g. norm:10 means 10 artifacts == full marks.
   *   max           (rating type) top of the scale (default 5).
   *   options       (select type) [{label, score}] — score is the game points.
   *
   *   weight        DEFAULT importance in the "best team for us" ranking.
   *                 You can also change this live with sliders in the app.
   *   higherIsBetter  true = more is better (default). false = less is better.
   * ------------------------------------------------------------------------ */
  // Point values below are the OFFICIAL DECODE values from Game Manual Part 2,
  // Table 10-2 & §10.5:  LEAVE 3 · Artifact CLASSIFIED 3 (auto & teleop) ·
  // OVERFLOW 1 · PATTERN (artifact matches motif) 2 each · BASE partial 5 / full 10.
  metrics: [
    // ---- AUTONOMOUS ----
    { id: "auto_leave",     label: "Left the launch line (LEAVE)", phase: "auto",
      type: "bool",   points: 3,  weight: 1 },
    { id: "auto_artifacts", label: "Artifacts scored (auto)", phase: "auto",
      type: "number", points: 3,  norm: 6,  weight: 3 },
    // Motif = a 3-color pattern; each completed repeat is 3 matching artifacts
    // on the ramp = 6 pts (2 pts × 3). 1 / 2 / 3 = how many repeats they completed.
    { id: "auto_motif",     label: "Motif sets matched", phase: "auto",
      type: "select", style: "buttons", weight: 2,
      options: [
        { label: "1", score: 6  },
        { label: "2", score: 12 },
        { label: "3", score: 18 },
      ] },

    // ---- TELE-OP ----
    { id: "tele_close", label: "Scored from close", phase: "teleop",
      type: "number", points: 3,  norm: 15, weight: 2 },
    { id: "tele_far",   label: "Scored from far", phase: "teleop",
      type: "number", points: 3,  norm: 10, weight: 3 },
    { id: "cycle_speed", label: "Cycle speed", phase: "teleop",
      type: "rating", max: 5, weight: 2 },

    // ---- ENDGAME (BASE) ----
    { id: "endgame",    label: "Returned to base", phase: "endgame",
      type: "select", weight: 3,
      options: [
        { label: "Nothing",      score: 0  },
        { label: "Partial park", score: 5  },
        { label: "Full park",    score: 10 },
      ] },

    // ---- QUALITATIVE (judgement calls — not part of the point estimate) ----
    // Crashed is a NEGATIVE: "Yes" counts against a team in the ranking.
    { id: "crashed",      label: "Broke down / crashed?", phase: "qual",
      type: "bool", higherIsBetter: false, weight: 2 },
    { id: "driver_skill", label: "Driver skill", phase: "qual",
      type: "rating", max: 5, weight: 2 },
    { id: "defense",      label: "Defense played", phase: "qual",
      type: "rating", max: 5, weight: 1 },
    { id: "notes",        label: "Notes", phase: "qual", type: "text" },
  ],

  /* --------------------------------------------------------------------------
   * SUPABASE (optional — leave blank to run purely on this device's storage).
   * When you're ready for multiple scouts to share data across phones/laptops,
   * see README.md, create a free Supabase project, and paste the two values.
   * ------------------------------------------------------------------------ */
  supabaseUrl: "",       // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",   // the "anon public" key from Supabase → Settings → API
};

/* Phase display order + labels for grouping the form and charts. */
FTC.PHASES = [
  { id: "auto",    label: "Autonomous" },
  { id: "teleop",  label: "Tele-Op" },
  { id: "endgame", label: "Endgame" },
  { id: "qual",    label: "Notes & ratings" },
];
