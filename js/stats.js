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

  /* Aggregate every record for one team. */
  function aggregateTeam(config, team, records) {
    const rows = records
      .filter((r) => r.team === team)
      .sort((a, b) => (a.match || 0) - (b.match || 0));

    const scores = rows.map((r) => matchScore(config, r));

    // per-metric average of the numeric interpretation (points-equivalent)
    const perMetric = {};
    config.metrics.forEach((m) => {
      const vals = rows
        .map((r) => r.values[m.id])
        .filter((v) => v !== undefined && v !== null && v !== "");
      if (m.type === "rating") {
        perMetric[m.id] = avg(vals.filter(isNum));
      } else if (m.type === "number") {
        perMetric[m.id] = avg(vals.filter(isNum));
      } else if (m.type === "bool") {
        perMetric[m.id] = vals.length ? avg(vals.map((v) => (v ? 1 : 0))) : 0; // rate 0..1
      } else if (m.type === "select") {
        perMetric[m.id] = avg(vals.map((v) => metricPoints(m, v)));
      } else {
        perMetric[m.id] = null; // text
      }
    });

    return {
      team,
      matches: rows.length,
      records: rows,
      scores,
      avgScore: avg(scores),
      maxScore: scores.length ? Math.max(...scores) : 0,
      minScore: scores.length ? Math.min(...scores) : 0,
      consistency: scores.length > 1 ? stdev(scores) : 0,
      perMetric,
    };
  }

  function stdev(arr) {
    const m = avg(arr);
    return Math.sqrt(avg(arr.map((x) => (x - m) ** 2)));
  }

  /* List of every distinct team seen, aggregated. */
  function allTeams(config, records) {
    const teams = [...new Set(records.map((r) => r.team))].filter(Boolean);
    return teams.map((t) => aggregateTeam(config, t, records));
  }

  /* Weighted "fit for our robot" score, 0..100, using live weights.
   * weights: { metricId: number }  (falls back to the config default weight) */
  function fitScore(config, teamAgg, weights) {
    let total = 0, wsum = 0;
    config.metrics.forEach((m) => {
      const w = weights && weights[m.id] != null ? weights[m.id] : (m.weight || 0);
      if (!w) return;
      // average the per-record normalized value across this team's matches
      const norms = teamAgg.records
        .map((r) => metricNormalized(m, r.values[m.id]))
        .filter((n) => n !== null);
      if (!norms.length) return;
      total += w * avg(norms);
      wsum += w;
    });
    return wsum ? (total / wsum) * 100 : 0;
  }

  /* Rank all teams by fit score, best first. */
  function rankTeams(config, records, weights) {
    return allTeams(config, records)
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
