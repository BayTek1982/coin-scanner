/* Bayazit Zyklus-Kompass · gemeinsame Berechnung für zyklus.html und die Kachel im Scanner.
   Daten: data/zyklus.json (Bitcoin-Tageskurse ab 2010, nachts von risk.py geschrieben).
   Ersatz, solange die Datei fehlt: data/risk/BTC.json (Tageskurse ab Mitte 2012) + Monatsschlusskurse davor.
   Färbung: Näherung des Einstandspreises der Kurzzeit-Anleger = Durchschnitt der letzten 155 Tage.
   z = ln(Kurs / 155-Tage-Schnitt) ÷ übliche Schwankung (Standardabweichung seit 2011). z > 0 = Bulle, z < 0 = Bär. */
window.Zyklus = (function () {
  "use strict";
  var DAY = 864e5, WIN = 155;
  // Monatsschlusskurse in USD (gerundet) – nur als Ersatz für die Zeit vor den Tageskursen
  var MONTHLY = {
    2010: [null, null, null, null, null, null, 0.07, 0.06, 0.06, 0.19, 0.21, 0.30],
    2011: [0.52, 0.86, 0.78, 3.5, 8.7, 16.1, 13.4, 8.2, 5.1, 3.2, 2.97, 4.7],
    2012: [5.5, 4.9, 4.9, 5.0, 5.2, 6.7, 9.3, 10.2, 12.4, 11.2, 12.6, 13.5]
  };
  var HALVINGS = [Date.UTC(2012, 10, 28), Date.UTC(2016, 6, 9), Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20)];
  var NEXT_HALVING = Date.UTC(2028, 3, 15); // Schätzung, hängt von der Blockzeit ab
  var PHASES = [
    ["Glaube", "„Zeit, voll zu investieren.“"],
    ["Pause", "„Vielleicht war das schon das Hoch.“"],
    ["Nervenkitzel", "„Muss ich allen erzählen!“"],
    ["Euphorie", "„Ich bin ein Genie.“"],
    ["Sorglosigkeit", "„Nur kurz abkühlen vor der nächsten Rallye.“"],
    ["Verleugnung", "„Warum bekomme ich Margin Calls?“"],
    ["Panik", "„Alle verkaufen!“"],
    ["Kapitulation", "„Ich kann mir keine Verluste mehr leisten.“"],
    ["Depression", "„Ich bin ein Idiot.“"],
    ["Durchhalten", "„Das geht nirgendwo hin.“"],
    ["Stagnation", "„Das ist eine Bullenfalle.“"],
    ["Unglaube", "„Die Rallye scheitert wie die letzte.“"],
    ["Zweifel", "„Ist das Halving schon eingepreist?“"],
    ["Hoffnung", "„Eine Erholung ist möglich.“"],
    ["Ruhe", "„Warten wir auf eine Bestätigung.“"],
    ["Optimismus", "„Diese Rallye ist echt.“"]
  ];

  function cycleStartYear(t) { var y = new Date(t).getUTCFullYear(); return y - ((y - 2009) % 4 + 4) % 4; }
  function cycleInfo(t) {
    var sy = cycleStartYear(t), s = Date.UTC(sy, 0, 1), e = Date.UTC(sy + 4, 0, 1);
    return { sy: sy, s: s, e: e, f: (t - s) / (e - s) };
  }
  function phaseIdx(t) { return Math.min(15, Math.floor(cycleInfo(t).f * 16)); }

  function monthlyBefore(t0) {
    var pts = [];
    Object.keys(MONTHLY).forEach(function (y) {
      MONTHLY[y].forEach(function (p, m) {
        var t = Date.UTC(+y, m + 1, 0);
        if (p != null && t < t0 - 5 * DAY) pts.push({ t: t, p: p });
      });
    });
    return pts;
  }

  var cache = null;
  function load() {
    if (cache) return cache;
    function get(u) { return fetch(u + "?t=" + Math.floor(Date.now() / 36e5)).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }
    cache = get("data/zyklus.json").then(function (j) {
      return { rows: j.d, src: "zyklus", updated: j.updated };
    }).catch(function () {
      return get("data/risk/BTC.json").then(function (j) { return { rows: j.d, src: "risk" }; });
    }).then(function (o) {
      var daily = o.rows.filter(function (r) { return r[1] > 0; }).map(function (r) { return { t: r[0] * DAY, p: r[1] }; });
      var pts = monthlyBefore(daily[0].t).concat(daily);
      return { pts: pts, src: o.src, updated: o.updated, firstDaily: daily[0].t };
    });
    cache.catch(function () { cache = null; });
    return cache;
  }

  /* Fügt den aktuellen Kurs als heutigen Punkt an (ersetzt eine Kerze vom selben Tag). */
  function withLive(pts, price) {
    if (!(price > 0)) return pts;
    var now = Date.now(), out = pts.slice();
    var last = out[out.length - 1];
    if (Math.floor(last.t / DAY) >= Math.floor(now / DAY)) out.pop();
    out.push({ t: now, p: price, live: true });
    return out;
  }

  function computeZ(pts) {
    var sum = 0, j = 0;
    for (var i = 0; i < pts.length; i++) {
      sum += pts[i].p;
      while (pts[i].t - pts[j].t > WIN * DAY) { sum -= pts[j].p; j++; }
      pts[i].sma = sum / (i - j + 1);
      pts[i].ratio = Math.log(pts[i].p / pts[i].sma);
    }
    var sq = 0, c = 0, t0 = Date.UTC(2011, 0, 1);
    for (var k = 0; k < pts.length; k++) if (pts[k].t > t0) { sq += pts[k].ratio * pts[k].ratio; c++; }
    var sd = Math.sqrt(sq / Math.max(c, 1)) || 1;
    for (var m = 0; m < pts.length; m++) pts[m].z = pts[m].ratio / sd;
    return pts;
  }

  var STOPS = [[-1.6, [155, 28, 28]], [-0.6, [224, 102, 42]], [0, [232, 180, 58]], [0.6, [184, 210, 74]], [1.6, [47, 158, 68]]];
  function zColor(z) {
    if (z <= STOPS[0][0]) return "rgb(" + STOPS[0][1] + ")";
    for (var i = 1; i < STOPS.length; i++) {
      if (z <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], f = (z - a[0]) / (b[0] - a[0]);
        return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(a[1][k] + (b[1][k] - a[1][k]) * f); }).join(",") + ")";
      }
    }
    return "rgb(" + STOPS[STOPS.length - 1][1] + ")";
  }

  /* Zyklus-Hoch = höchster Kurs in den ersten 3 Jahren der Runde, Tief = tiefster Kurs danach bis Rundenende. */
  function cycles(pts) {
    var out = [];
    for (var sy = 2009; sy <= 2033; sy += 4) {
      var s = Date.UTC(sy, 0, 1), e = Date.UTC(sy + 4, 0, 1), he = Date.UTC(sy + 3, 0, 1), hi = null, lo = null;
      for (var i = 0; i < pts.length; i++) { var p = pts[i]; if (p.t >= s && p.t < he && (!hi || p.p > hi.p)) hi = { p: p.p, t: p.t, i: i }; }
      if (!hi) continue;
      for (var k = hi.i + 1; k < pts.length; k++) { var q = pts[k]; if (q.t < e && (!lo || q.p < lo.p)) lo = { p: q.p, t: q.t, i: k }; }
      out.push({ sy: sy, hi: hi, lo: lo, running: Date.now() < e });
    }
    return out;
  }

  function summary(pts) {
    var last = pts[pts.length - 1], ci = cycleInfo(last.t), ph = phaseIdx(last.t);
    return {
      t: last.t, p: last.p, z: last.z, sma: last.sma, bull: last.z >= 0,
      phase: ph, phaseName: PHASES[ph][0], quote: PHASES[ph][1],
      day: Math.floor((last.t - ci.s) / DAY) + 1, len: Math.round((ci.e - ci.s) / DAY), f: ci.f, sy: ci.sy,
      halvingDays: Math.ceil((NEXT_HALVING - last.t) / DAY)
    };
  }

  return {
    DAY: DAY, PHASES: PHASES, HALVINGS: HALVINGS, NEXT_HALVING: NEXT_HALVING,
    load: load, withLive: withLive, computeZ: computeZ, zColor: zColor, cycles: cycles, summary: summary,
    cycleInfo: cycleInfo, cycleStartYear: cycleStartYear, phaseIdx: phaseIdx
  };
})();
