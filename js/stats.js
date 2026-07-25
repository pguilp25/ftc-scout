/* =============================================================================
 * STATS — turns raw match records into per-team aggregates, a match-score
 * estimate, and the weighted "best team for our robot" ranking.
 * Pure functions, no DOM. Works in the browser and in Node (for tests).
 * ===========================================================================*/
(function (global) {
  const isNum = (v) => typeof v === "number" && !isNaN(v);

  /* The numeric value a single metric contributes to a MATCH-POINT estimate. */
  function metricPoints(metric, value) {
    if (metric.noPoints) return 0; // counts in the ranking, but not as game points
    switch (metric.type) {
      case "number": return isNum(value) ? value * (metric.points || 0) : 0;
      case "bool":   return value ? (metric.points || 0) : 0;
      case "select": {
        const opt = (metric.options || []).find((o) => o.label === value);
        return opt ? opt.score : 0;
      }
      default:       return 0; // ratings/text/notes are not game points
    }
  }

  /* A metric's value normalized to 0..1 for the ranking (before weighting). */
  function metricNormalized(metric, value) {
    let n;
    switch (metric.type) {
      case "number": n = isNum(value) ? value / (metric.norm || 1) : 0; break;
      case "bool":   n = value ? 1 : 0; break;
      case "rating": n = isNum(value) ? value / (metric.max || 5) : 0; break;
      case "select": {
        const opts = metric.options || [];
        const max = Math.max(1, ...opts.map((o) => o.score));
        const opt = opts.find((o) => o.label === value);
        n = opt ? opt.score / max : 0;
        break;
      }
      default: return null; // text has no numeric meaning
    }
    n = Math.max(0, Math.min(1, n));
    return metric.higherIsBetter === false ? 1 - n : n;
  }

  /* Estimated total game points for one match record. */
  function matchScore(config, record) {
    return config.metrics.reduce(
      (sum, m) => sum + metricPoints(m, record.values[m.id]), 0);
  }

  /* Points scored in a given phase for one record (for the breakdown chart). */
  function phaseScore(config, record, phaseId) {
    return config.metrics
      .filter((m) => m.phase === phaseId)
      .reduce((s, m) => s + metricPoints(m, record.values[m.id]), 0);
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  // Numeric interpretation used for the perMetric display averages.
  // null = not recorded (excluded from the average).
  function metricDisplay(m, value) {
    if (value === undefined || value === null || value === "") return null;
    if (m.type === "rating" || m.type === "number") return isNum(value) ? value : null;
    if (m.type === "bool") return value ? 1 : 0;      // rate 0..1
    if (m.type === "select") return metricPoints(m, value);
    return null; // text
  }

  // Collapse several scoutings of ONE (team, match) into a single averaged match.
  function combinedMatch(config, match, recs) {
    const score = avg(recs.map((r) => matchScore(config, r)));
    const points = {}, pm = {}, norm = {};
    config.metrics.forEach((m) => {
      points[m.id] = avg(recs.map((r) => metricPoints(m, r.values[m.id])));       // avg game points
      const disp = recs.map((r) => metricDisplay(m, r.values[m.id])).filter((v) => v !== null);
      pm[m.id] = disp.length ? avg(disp) : null;                                   // avg display value
      const nr = recs.map((r) => metricNormalized(m, r.values[m.id])).filter((v) => v !== null);
      norm[m.id] = nr.length ? avg(nr) : null;                                     // avg normalized (for fit)
    });
    return { match, records: recs, score, points, pm, norm };
  }

  /* Aggregate every record for one team.
   * Duplicate scoutings of the same team+match are AVERAGED into one match first,
   * then matches are averaged — so scouting a match twice doesn't skew the result.
   * opts.outlierSD (>0): drop matches whose total score is more than that many
   * standard deviations from the team's mean (needs >= 3 matches to apply). */
  function aggregateTeam(config, team, records, opts) {
    const teamRecs = records.filter((r) => r.team === team);

    // group scoutings by match (blank match number → its own unique match)
    const groups = {}, order = [];
    teamRecs.forEach((r) => {
      const mk = (r.match != null && String(r.match).trim())
        ? "m:" + String(r.match).trim().toLowerCase() : "u:" + r.id;
      if (!groups[mk]) { groups[mk] = { match: r.match || "", recs: [] }; order.push(mk); }
      groups[mk].recs.push(r);
    });
    let matches = order.map((k) => combinedMatch(config, groups[k].match, groups[k].recs));
    matches.sort((a, b) => String(a.match).localeCompare(String(b.match), undefined, { numeric: true }));

    let excluded = 0;
    const sd = opts && opts.outlierSD;
    if (sd && matches.length >= 3) {
      const s0 = matches.map((mm) => mm.score);
      const mean = avg(s0), spread = stdev(s0);
      if (spread > 0) {
        const kept = matches.filter((mm) => Math.abs(mm.score - mean) <= sd * spread);
        excluded = matches.length - kept.length;
        matches = kept;
      }
    }

    const scores = matches.map((mm) => mm.score);
    const perMetric = {};
    config.metrics.forEach((m) => {
      const vals = matches.map((mm) => mm.pm[m.id]).filter((v) => v !== null && v !== undefined);
      perMetric[m.id] = vals.length ? avg(vals) : (m.type === "text" ? null : 0);
    });

    return {
      team,
      matches: matches.length,
      scoutings: teamRecs.length,
      records: teamRecs,        // raw scoutings (for the editable match log)
      combinedMatches: matches,
      scores,
      avgScore: avg(scores),
      maxScore: scores.length ? Math.max(...scores) : 0,
      minScore: scores.length ? Math.min(...scores) : 0,
      consistency: scores.length > 1 ? stdev(scores) : 0,
      excluded,
      perMetric,
    };
  }

  function stdev(arr) {
    const m = avg(arr);
    return Math.sqrt(avg(arr.map((x) => (x - m) ** 2)));
  }

  /* List of every distinct team seen, aggregated. */
  function allTeams(config, records, opts) {
    const teams = [...new Set(records.map((r) => r.team))].filter(Boolean);
    return teams.map((t) => aggregateTeam(config, t, records, opts));
  }

  /* Weighted "fit for our robot" score, 0..100, using live weights.
   * weights: { metricId: number }  (falls back to the config default weight) */
  function fitScore(config, teamAgg, weights) {
    const matches = teamAgg.combinedMatches || [];
    let total = 0, wsum = 0;
    config.metrics.forEach((m) => {
      const w = weights && weights[m.id] != null ? weights[m.id] : (m.weight || 0);
      if (!w) return;
      // average the per-MATCH normalized value (duplicates already averaged in)
      const norms = matches.map((mm) => mm.norm[m.id]).filter((n) => n !== null && n !== undefined);
      if (!norms.length) return;
      total += w * avg(norms);
      wsum += w;
    });
    return wsum ? (total / wsum) * 100 : 0;
  }

  /* Rank all teams by fit score, best first. */
  function rankTeams(config, records, weights, opts) {
    return allTeams(config, records, opts)
      .map((t) => ({ ...t, fit: fitScore(config, t, weights) }))
      .sort((a, b) => b.fit - a.fit);
  }

  const api = {
    metricPoints, metricNormalized, matchScore, phaseScore,
    aggregateTeam, allTeams, fitScore, rankTeams, stdev, avg,
  };

  global.FTC = global.FTC || {};
  global.FTC.Stats = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
