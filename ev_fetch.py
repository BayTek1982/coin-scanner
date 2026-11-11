"""Earnings-Termine und implizite Volatilität (IV) für alle Aktien aus data/stocks.json.
Läuft 1x täglich über GitHub Actions (.github/workflows/earnings-iv.yml).
- Earnings: nächster Termin laut Yahoo Finance
- IV: Mittelwert der At-the-Money-Optionen (Call + Put) mit ca. 30 Tagen Restlaufzeit
- IV-Historie wird Tag für Tag gesammelt (iv_hist.json); daraus das IVP = Anteil der Tage
  im letzten Jahr, an denen die IV niedriger war als heute.
Aufruf: python ev_fetch.py <alter Datenordner> <Ausgabeordner>"""
import datetime as dt
import json
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import yfinance as yf

PREV = sys.argv[1] if len(sys.argv) > 1 else "prev"
OUT = sys.argv[2] if len(sys.argv) > 2 else "ev_out"
KEEP = 260          # ca. 1 Börsenjahr
MIN_IVP = 20        # ab so vielen gesammelten Tagen wird ein IVP angezeigt
TODAY = dt.datetime.now(dt.timezone.utc).date()


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def symbols():
    d = load("data/stocks.json", {})
    out = {}
    for ix in d.get("indices", {}).values():
        for it in ix.get("items", []):
            out[it["y"]] = 1
    return list(out)


def has_options(y):
    # Optionen gibt es bei Yahoo praktisch nur für US-Werte (ohne Börsen-Endung wie .DE)
    return "." not in y and not y.startswith("^") and "=" not in y


def retry(fn, tries=3):
    for a in range(tries):
        try:
            return fn()
        except Exception as e:
            msg = str(e)
            if a == tries - 1 or "404" in msg or "No data" in msg:
                return None
            time.sleep(2 * (a + 1))
    return None


def earnings(t):
    cal = retry(lambda: t.calendar)
    if not isinstance(cal, dict):
        return None
    ds = cal.get("Earnings Date") or []
    if not isinstance(ds, (list, tuple)):
        ds = [ds]
    days = []
    for d in ds:
        try:
            d = d.date() if hasattr(d, "date") and callable(d.date) else d
            if isinstance(d, dt.date) and d >= TODAY - dt.timedelta(days=1):
                days.append(d)
        except Exception:
            pass
    if not days:
        return None
    return {"d": min(days).isoformat(), "r": len(ds) > 1}   # r = noch nicht bestätigt (Zeitraum)


def atm_iv(t):
    exps = retry(lambda: t.options) or ()
    best = None
    for e in exps:
        try:
            dte = (dt.date.fromisoformat(e) - TODAY).days
        except Exception:
            continue
        if dte < 7:
            continue
        score = abs(dte - 30) if 20 <= dte <= 60 else 100 + abs(dte - 30)
        if best is None or score < best[0]:
            best = (score, e, dte)
    if not best:
        return None
    ch = retry(lambda: t.option_chain(best[1]))
    if ch is None:
        return None
    spot = None
    und = getattr(ch, "underlying", None)
    if isinstance(und, dict):
        spot = und.get("regularMarketPrice")
    if not spot:
        fi = retry(lambda: t.fast_info)
        try:
            spot = float(fi["last_price"]) if fi is not None else None
        except Exception:
            spot = None
    if not spot or not math.isfinite(spot):
        return None
    ivs = []
    for df in (ch.calls, ch.puts):
        try:
            x = df[(df["impliedVolatility"] > 0.03) & (df["impliedVolatility"] < 5)]
            x = x[(x["bid"].fillna(0) > 0) | (x["openInterest"].fillna(0) > 0)]
            x = x.assign(dist=(x["strike"] - spot).abs()).sort_values("dist").head(2)
            ivs += [float(v) for v in x["impliedVolatility"]]
        except Exception:
            pass
    if len(ivs) < 2:
        return None
    return {"iv": round(sum(ivs) / len(ivs), 4), "dte": best[2]}


def one(y):
    t = yf.Ticker(y)
    r = {}
    e = earnings(t)
    if e:
        r["e"] = e
    if has_options(y):
        v = atm_iv(t)
        if v:
            r.update(v)
    return y, r


def main():
    syms = symbols()
    print(len(syms), "Aktien")
    hist = load(os.path.join(PREV, "iv_hist.json"), {})
    old = load(os.path.join(PREV, "ev.json"), {}).get("s", {})
    res = {}
    with ThreadPoolExecutor(6) as ex:
        for i, (y, r) in enumerate(ex.map(one, syms)):
            res[y] = r
            if i % 100 == 0:
                print(i, "fertig")
    day = TODAY.isoformat()
    out = {}
    n_e = n_iv = 0
    for y in syms:
        r = res.get(y) or {}
        o = {}
        e = r.get("e") or (old.get(y) or {}).get("e")       # bei Fehler alten Termin behalten
        if e and e.get("d") and e["d"] >= (TODAY - dt.timedelta(days=1)).isoformat():
            o["e"] = e
            n_e += 1
        h = [p for p in hist.get(y, []) if p[0] != day]
        if r.get("iv"):
            h.append([day, r["iv"]])
            n_iv += 1
        h = h[-KEEP:]
        if h:
            hist[y] = h
        if h and h[-1][0] == day:
            cur = h[-1][1]
            o["iv"] = cur
            o["dte"] = r.get("dte")
            o["n"] = len(h)
            if len(h) >= MIN_IVP:
                past = [v for _, v in h[:-1]]
                o["ivp"] = round(100 * sum(1 for v in past if v < cur) / len(past))
        if o:
            out[y] = o
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "ev.json"), "w", encoding="utf-8") as f:
        json.dump({"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "s": out}, f,
                  separators=(",", ":"))
    with open(os.path.join(OUT, "iv_hist.json"), "w", encoding="utf-8") as f:
        json.dump(hist, f, separators=(",", ":"))
    print("Earnings:", n_e, "· IV heute:", n_iv)


if __name__ == "__main__":
    main()
