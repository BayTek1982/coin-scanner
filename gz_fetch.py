"""Holt die Kerzen (1H, 4H, 1D, 1W) aller Aktien aus data/stocks.json plus der wichtigsten Indizes
für die Golden-Zone-/SK-Seite. Ergebnis: gz_tmp/candles.json und gz_tmp/meta.json (werden NICHT ins Repo
übernommen, sondern von gz_stocks.js ausgewertet). Läuft über GitHub Actions (.github/workflows/gz-stocks.yml)."""
import json
import math
import os
import time

import pandas as pd
import yfinance as yf

OUT = "gz_tmp"
KEEP = 300

BENCH = {
    "^GSPC": ("S&P 500", "$"), "^NDX": ("Nasdaq 100", "$"), "^DJI": ("Dow Jones", "$"), "^RUT": ("Russell 2000", "$"),
    "^GDAXI": ("DAX", "€"), "^MDAXI": ("MDAX", "€"), "^TECDAX": ("TecDAX", "€"), "^STOXX50E": ("Euro Stoxx 50", "€"),
    "^HSI": ("Hang Seng", "HK$"), "^N225": ("Nikkei 225", "¥"), "^KS11": ("KOSPI", "₩"),
    "GC=F": ("Gold", "$"), "SI=F": ("Silber", "$"), "CL=F": ("Öl (WTI)", "$"), "BZ=F": ("Öl (Brent)", "$"),
    "NG=F": ("Erdgas", "$"), "HG=F": ("Kupfer", "$"), "PL=F": ("Platin", "$"), "PA=F": ("Palladium", "$"),
    "DX-Y.NYB": ("US-Dollar-Index", ""),
}


def members():
    with open("data/stocks.json", encoding="utf-8") as f:
        d = json.load(f)
    syms, groups = {}, {"idx": "Indizes & Rohstoffe"}
    for k, ix in d.get("indices", {}).items():
        groups[k] = ix.get("name", k)
        for it in ix.get("items", []):
            s = syms.setdefault(it["y"], {"n": it.get("n", it["y"]), "g": [], "c": ix.get("cur", "$"), "mc": it.get("mc") or 0})
            if k not in s["g"]:
                s["g"].append(k)
    for y, (n, c) in BENCH.items():
        syms[y] = {"n": n, "g": ["idx"], "c": c, "mc": 1e16}
    return syms, groups


def r6(v):
    v = float(v)
    if not math.isfinite(v) or v == 0:
        return v if math.isfinite(v) else None
    return round(v, max(0, 6 - int(math.floor(math.log10(abs(v)))) - 1))


def rows(df):
    out = []
    for ts, r in df.iterrows():
        o, h, l, c = r["Open"], r["High"], r["Low"], r["Close"]
        if any(pd.isna(x) for x in (o, h, l, c)) or c <= 0:
            continue
        v = r.get("Volume", 0)
        v = 0 if pd.isna(v) else int(v)
        out.append([int(pd.Timestamp(ts).timestamp() * 1000), r6(o), r6(h), r6(l), r6(c), v])
    return out


def download(tickers, period, interval):
    got = {}
    for i in range(0, len(tickers), 60):
        chunk = tickers[i:i + 60]
        df = None
        for attempt in range(3):
            try:
                df = yf.download(chunk, period=period, interval=interval, group_by="ticker",
                                 auto_adjust=False, threads=True, progress=False)
                break
            except Exception as e:
                print(interval, "Fehler:", e)
                time.sleep(5 * (attempt + 1))
        if df is None or df.empty:
            continue
        for t in chunk:
            try:
                x = df[t] if isinstance(df.columns, pd.MultiIndex) else df
                x = x[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Open", "High", "Low", "Close"])
            except Exception:
                continue
            if len(x) >= 40:
                got[t] = x
        time.sleep(1)
    print(interval, len(got), "von", len(tickers))
    return got


def four_hours(df):
    """4H-Kerzen aus 1H-Kerzen: pro Handelstag ab Sitzungsbeginn je 4 Stunden zusammenfassen."""
    idx = df.index.tz_convert("UTC") if df.index.tz is not None else df.index
    x = df.copy()
    x.index = idx
    out = []
    for _, day in x.groupby(x.index.date):
        for j in range(0, len(day), 4):
            b = day.iloc[j:j + 4]
            out.append([int(b.index[0].timestamp() * 1000), r6(b["Open"].iloc[0]), r6(b["High"].max()),
                        r6(b["Low"].min()), r6(b["Close"].iloc[-1]), int(b["Volume"].fillna(0).sum())])
    return out


def main():
    syms, groups = members()
    tickers = list(syms)
    print(len(tickers), "Werte")
    data = {t: {} for t in tickers}
    for t, x in download(tickers, "2y", "1d").items():
        data[t]["1d"] = rows(x)[-KEEP:]
    for t, x in download(tickers, "10y", "1wk").items():
        data[t]["1w"] = rows(x)[-KEEP:]
    for t, x in download(tickers, "1y", "1h").items():
        data[t]["1h"] = rows(x)[-KEEP:]
        data[t]["4h"] = four_hours(x)[-KEEP:]
    os.makedirs(OUT, exist_ok=True)
    with open(f"{OUT}/candles.json", "w", encoding="utf-8") as f:
        json.dump({t: v for t, v in data.items() if v}, f, separators=(",", ":"))
    with open(f"{OUT}/meta.json", "w", encoding="utf-8") as f:
        json.dump({"syms": syms, "groups": groups}, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
