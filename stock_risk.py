"""Risiko (0 bis 1) und Hitze (Kurs / 20-Wochen-Schnitt) für alle Aktien und Indizes des Coin-Scanners
(ohne Russell 2000). Gleiches Prinzip wie risk.py für Krypto, angepasst an Aktien:
  Risiko: x = ln(Kurs / 257-Handelstage-Schnitt) (≈ 374 Kalendertage)
          0,5 = Kurs auf dem Schnitt, 0 = tiefstes x der ganzen Historie, 1 = höchstes x der letzten 10 Jahre
          (Aktien haben keinen 4-Jahres-Zyklus wie Krypto)
  Hitze:  Kurs / 20-Wochen-Schnitt; die Farbstufen richten sich nach der eigenen Geschichte der Aktie
          (über 1: Median, 75 %, 90 %, 97 % aller Wochen über dem Schnitt; unter 1: Median und 15 %)
Kurse: Yahoo Finance, bereinigt um Splits und Dividenden.
Ausgabe: data/srisk.json (täglich, Werte für die Live-Berechnung) und data/srisk/<Kürzel>.json
(Verlauf: letzte 5 Jahre täglich, davor wöchentlich; nur samstags neu, damit das Repo klein bleibt).
Läuft über GitHub Actions (.github/workflows/stock-risk.yml). Rückgängig: diese Datei, den Workflow und
data/srisk* löschen, die Seite zeigt dann bei Aktien wieder "–"."""
import datetime as dt
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd
import yfinance as yf

L = 257          # Handelstage für den Schnitt (≈ 374 Kalendertage)
W = 2520         # Normierungsfenster oben: 10 Jahre Handelstage
WARM = 252       # Anlaufzeit: erstes Jahr nach Beginn der Berechnung nicht zeigen
DAILY_DAYS = 5 * 365
OUT = "data/srisk.json"
DIR = "data/srisk"


def fname(t):
    return "".join(ch if ch.isalnum() or ch in ".-" else "_" for ch in t)


def scale(x, mn, mx):
    if x is None or not math.isfinite(x):
        return None
    if x >= 0:
        r = 0.5 + 0.5 * x / mx if mx > 0 else 1.0
    else:
        r = 0.5 - 0.5 * x / mn if mn < 0 else 0.0
    return max(0.0, min(1.0, r))


def sig(v, n=6):
    return float(f"{v:.{n}g}")


def compute(close):
    """close: pandas Series (Datum → bereinigter Schlusskurs)."""
    close = close.dropna()
    close = close[close > 0]
    if len(close) < 140:  # unter ~28 Wochen: keine sinnvollen Werte
        return None
    days = np.array([(d.date() - dt.date(1970, 1, 1)).days for d in close.index])
    P = close.to_numpy(dtype=float)
    n = len(P)
    # ---- Hitze (täglich): Kurs / Schnitt aus 19 abgeschlossenen Wochen + aktuellem Kurs
    wk = days - ((days + 3) % 7)  # Montag der Woche
    wclose = pd.Series(P, index=wk).groupby(level=0).last()
    wkeys = wclose.index.to_numpy()
    wvals = wclose.to_numpy()
    csum = np.concatenate([[0.0], np.cumsum(wvals)])
    pos = np.searchsorted(wkeys, wk)  # Index der eigenen Woche
    heat = np.full(n, np.nan)
    ok = pos >= 19
    s19 = csum[pos[ok]] - csum[pos[ok] - 19]
    heat[ok] = P[ok] / ((s19 + P[ok]) / 20)
    # ---- Risiko
    risk = np.full(n, np.nan)
    live_r = None
    if n >= L + WARM:
        sma = pd.Series(P).rolling(L).mean().to_numpy()
        x = np.log(P / sma)
        gmin = pd.Series(x).cummin().to_numpy()
        rmax = pd.Series(x).rolling(W, min_periods=1).max().to_numpy()
        for i in range(L - 1 + WARM, n):
            r = scale(x[i], gmin[i], rmax[i])
            risk[i] = r if r is not None else np.nan
        i = n - 1
        live_r = {"s": round(float(P[i - L + 1:i].sum()), 8),
                  "mn": float(gmin[i - 1]), "mx": float(np.nanmax(x[max(L - 1, i - W + 1):i]))}
    # ---- eigene Hitze-Stufen aus den Wochenwerten
    hw = pd.Series(heat, index=wk).groupby(level=0).last().dropna().to_numpy()
    th = None
    if len(hw) >= 52:
        up, dn = hw[hw > 1], hw[hw < 1]
        if len(up) >= 10 and len(dn) >= 10:
            th = [round(float(v), 4) for v in (np.quantile(dn, 0.15), np.quantile(dn, 0.5), 1.0,
                                               np.quantile(up, 0.5), np.quantile(up, 0.75), np.quantile(up, 0.9), np.quantile(up, 0.97))]
    # ---- Verlauf: letzte 5 Jahre täglich, davor wöchentlich (letzter Handelstag der Woche)
    cut = days[-1] - DAILY_DAYS
    keep = np.zeros(n, dtype=bool)
    keep[days >= cut] = True
    last_of_week = np.r_[wk[1:] != wk[:-1], True]
    keep |= last_of_week
    rows = []
    for i in np.nonzero(keep)[0]:
        if math.isnan(heat[i]) and math.isnan(risk[i]):
            continue
        rows.append([int(days[i]), sig(P[i]), None if math.isnan(risk[i]) else round(float(risk[i]), 4),
                     None if math.isnan(heat[i]) else round(float(heat[i]), 4)])
    info = {"ld": int(days[-1]), "days": n,
            "wc": [[int(k), sig(v)] for k, v in zip(wkeys[-21:], wvals[-21:])],
            "th": th, "rk": None if math.isnan(risk[-1]) else round(float(risk[-1]), 4),
            "ht": None if math.isnan(heat[-1]) else round(float(heat[-1]), 4)}
    if live_r:
        info.update(live_r)
    return info, rows


def main():
    with open("data/stocks.json") as f:
        stk = json.load(f)
    tickers = set()
    for ix in stk["indices"].values():
        tickers.update(c["y"] for c in ix["items"])
    benches = {"^GDAXI", "^MDAXI", "^TECDAX", "^STOXX50E", "^HSI", "^N225", "^KS11", "^GSPC", "^NDX", "^DJI"}
    tickers = sorted(tickers | benches)
    print(len(tickers), "Kürzel")
    full = os.environ.get("FULL") == "1" or dt.datetime.utcnow().weekday() == 5
    os.makedirs(DIR, exist_ok=True)
    out = {"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
           "model": {"L": L, "w": W, "v": 1}, "s": {}}
    for i in range(0, len(tickers), 40):
        chunk = tickers[i:i + 40]
        try:
            df = yf.download(chunk, period="max", interval="1d", group_by="ticker", auto_adjust=True,
                             threads=True, progress=False)
        except Exception as e:
            print("Download-Fehler:", e)
            continue
        for t in chunk:
            try:
                sub = df[t] if len(chunk) > 1 else df
                res = compute(sub["Close"])
            except Exception as e:
                print(t, "Fehler:", e)
                continue
            if not res:
                continue
            info, rows = res
            out["s"][t] = info
            path = os.path.join(DIR, fname(t) + ".json")
            if full or not os.path.exists(path):
                with open(path, "w") as f:
                    json.dump({"y": t, "d": rows}, f, separators=(",", ":"))
        print(f"{min(i + 40, len(tickers))}/{len(tickers)} geladen, {len(out['s'])} berechnet")
        time.sleep(1)
    if len(out["s"]) < 50:
        print("Zu wenige Werte – Datei bleibt unverändert")
        sys.exit(1)
    for fn in os.listdir(DIR):
        if fn.endswith(".json") and fn[:-5] not in {fname(t) for t in out["s"]}:
            os.remove(os.path.join(DIR, fn))
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(DIR, f)) for f in os.listdir(DIR))
    print(f"Fertig: {len(out['s'])} Werte, Verlauf {size / 1e6:.1f} MB, Übersicht {os.path.getsize(OUT) / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
