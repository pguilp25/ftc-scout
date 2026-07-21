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

// Motif = a pattern of balls on the ramp. Each matching ball is worth 2 PATTERN
// points (Game Manual §10.5.2). This builds the 1..9 buttons (2, 4, … 18 pts).
const motifOptions = (n) =>
  Array.from({ length: n }, (_, i) => ({ label: String(i + 1), score: (i + 1) * 2 }));

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
    { id: "auto_leave",       label: "Left the launch line (LEAVE)", phase: "auto",
      type: "bool",   points: 3,  weight: 1 },
    // Artifacts split by where they land: CLASSIFIED (into the ramp) = 3 pts,
    // OVERFLOW (didn't classify) = 1 pt.
    { id: "auto_classified",  label: "Classified scored (auto)", phase: "auto",
      type: "number", points: 3,  norm: 6,  weight: 3 },
    { id: "auto_overflow",    label: "Overflow scored (auto)", phase: "auto",
      type: "number", points: 1,  norm: 6,  weight: 1 },
    // How many balls matched the motif (1–9). Each matching ball = 2 pts.
    { id: "auto_motif",       label: "Motif balls matched (auto)", phase: "auto",
      type: "select", style: "buttons", weight: 2, options: motifOptions(9) },

    // ---- TELE-OP ----
    // Scored balls split BOTH ways: distance (close/far) AND classified vs overflow.
    // Classified = 3 pts, Overflow = 1 pt. Keeping "close" lets you spot robots that
    // can score up close (useful when picking an alliance partner).
    { id: "tele_close_classified", label: "Close — classified", phase: "teleop",
      type: "number", points: 3, norm: 12, weight: 2 },
    { id: "tele_close_overflow",   label: "Close — overflow", phase: "teleop",
      type: "number", points: 1, norm: 12, weight: 1 },
    { id: "tele_far_classified",   label: "Far — classified", phase: "teleop",
      type: "number", points: 3, norm: 8,  weight: 3 },
    { id: "tele_far_overflow",     label: "Far — overflow", phase: "teleop",
      type: "number", points: 1, norm: 8,  weight: 1 },
    { id: "cycle_speed",           label: "Cycle speed", phase: "teleop",
      type: "rating", max: 5, weight: 2 },

    // ---- ENDGAME (BASE) ----
    { id: "endgame",          label: "Returned to base", phase: "endgame",
      type: "select", weight: 3,
      options: [
        { label: "Nothing",      score: 0  },
        { label: "Partial park", score: 5  },
        { label: "Full park",    score: 10 },
      ] },
    // Can the robot climb/ascend into the base? (capability flag, no direct points)
    { id: "endgame_climb",    label: "Robot climbs into base?", phase: "endgame",
      type: "bool", weight: 2 },
    // End-of-match motif, same idea as auto (1–9 balls, 2 pts each).
    { id: "endgame_motif",    label: "Motif balls matched (endgame)", phase: "endgame",
      type: "select", style: "buttons", weight: 2, options: motifOptions(9) },

    // ---- QUALITATIVE (judgement calls — not part of the point estimate) ----
    // Crashed & penalties are NEGATIVES: "Yes"/high counts AGAINST a team.
    { id: "crashed",      label: "Broke down / crashed?", phase: "qual",
      type: "bool", higherIsBetter: false, weight: 2 },
    { id: "driver_skill", label: "Driver skill", phase: "qual",
      type: "rating", max: 5, weight: 2 },
    { id: "defense",      label: "Defense played", phase: "qual",
      type: "rating", max: 5, weight: 1 },
    { id: "penalties",    label: "Drivers cause penalties?", phase: "qual",
      type: "rating", max: 5, higherIsBetter: false, weight: 1 },
    { id: "notes",        label: "Notes", phase: "qual", type: "text" },
  ],

  /* --------------------------------------------------------------------------
   * SUPABASE (optional — leave blank to run purely on this device's storage).
   * When you're ready for multiple scouts to share data across phones/laptops,
   * see README.md, create a free Supabase project, and paste the two values.
   * ------------------------------------------------------------------------ */
  supabaseUrl: "https://fqpqqyusimqqbhzkilws.supabase.co",
  supabaseAnonKey: "sb_publishable_qs7ASdZ7qn1IiZSXldkysw_BjxolH0Z", // publishable key — safe to be public
};

/* Phase display order + labels for grouping the form and charts. */
FTC.PHASES = [
  { id: "auto",    label: "Autonomous" },
  { id: "teleop",  label: "Tele-Op" },
  { id: "endgame", label: "Endgame" },
  { id: "qual",    label: "Notes & ratings" },
];
