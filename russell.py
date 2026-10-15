"""Holt alle Werte des Russell 2000 (über die Bestandsliste des iShares-ETF IWM) und deren Kurse.
Schreibt data/russell.json für den Bayazit Coin-Scanner. Läuft über .github/workflows/russell.yml."""
import datetime as dt
import io
import json
import math
import os
import time

import pandas as pd
import requests
import yfinance as yf

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept": "text/csv,application/json,text/html,*/*", "Accept-Language": "en-US,en;q=0.9"}
IWM_URLS = ["https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/latest-holdings.csv",
            "https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/1467271812596.ajax"
            "?fileType=csv&fileName=IWM_holdings&dataType=fund"]
VTWO = "https://investor.vanguard.com/investment-products/etfs/profile/api/VTWO/portfolio-holding/stock"
OUT = "data/russell.json"
CACHE = "data/russell_members.json"


def num(x, d=2):
    return None if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))) else round(float(x), d)


def clean(t):
    t = str(t or "").strip().strip('"').replace(".", "-").replace(" ", "-").replace("/", "-")
    return "" if t in ("", "-", "nan", "None") else t


def from_ishares():
    for url in IWM_URLS:
        try:
            out = ishares_csv(url)
            if len(out) >= 1000:
                return out
        except Exception as e:
            print("iShares-Variante fehlgeschlagen:", repr(e)[:200])
    return []


def ishares_csv(url):
    r = requests.get(url, headers=UA, timeout=60)
    txt = r.content.decode("utf-8-sig", "replace")
    print("iShares: Status", r.status_code, "Länge", len(txt), "Anfang:", txt[:120].replace("\n", " | "))
    lines = txt.splitlines()
    start = next(i for i, l in enumerate(lines) if l.lstrip('\ufeff"').startswith("Ticker"))
    df = pd.read_csv(io.StringIO("\n".join(lines[start:])), on_bad_lines="skip")
    if "Asset Class" in df.columns:
        df = df[df["Asset Class"].astype(str).str.contains("Equity", na=False)]
    return [{"y": clean(r.get("Ticker")), "n": str(r.get("Name", "")).strip().title(), "sec": str(r.get("Sector", "")).strip()}
            for _, r in df.iterrows()]


def from_vanguard():
    out, start = [], 1
    while True:
        r = requests.get(VTWO, params={"start": start, "count": 500}, headers=UA, timeout=60)
        print("Vanguard: Status", r.status_code, "Start", start)
        j = r.json()
        rows = j.get("fund", {}).get("entity", []) if isinstance(j, dict) else []
        if not rows:
            break
        for e in rows:
            out.append({"y": clean(e.get("ticker")), "n": str(e.get("longName") or e.get("shortName") or "").strip().title(),
                        "sec": str(e.get("sectorName") or "").strip()})
        if len(rows) < 500:
            break
        start += 500
    return out


def members():
    for name, fn in (("iShares IWM", from_ishares), ("Vanguard VTWO", from_vanguard)):
        try:
            raw = fn()
        except Exception as e:
            print(name, "nicht abrufbar:", repr(e)[:300])
            continue
        out, seen = [], set()
        for m in raw:
            if m["y"] and m["y"] not in seen:
                seen.add(m["y"])
                m["n"] = m["n"] or m["y"]
                out.append(m)
        print(name, "liefert", len(out), "Werte")
        if len(out) >= 1000:
            os.makedirs("data", exist_ok=True)
            with open(CACHE, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
            return out
    if os.path.exists(CACHE):
        print("Nutze gespeicherte Bestandsliste.")
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    return []


def main():
    try:
        mem = members()
        print("Russell 2000:", len(mem), "Werte")
    except Exception as e:
        print("Bestandsliste nicht abrufbar:", e)
        return
    if len(mem) < 1000:
        print("Zu wenige Werte, Abbruch.")
        return
    tickers = [m["y"] for m in mem] + ["^RUT"]
    closes, vols = {}, {}
    for i in range(0, len(tickers), 200):
        chunk = tickers[i:i + 200]
        try:
            df = yf.download(chunk, period="45d", interval="1d", group_by="ticker", auto_adjust=False, threads=True, progress=False)
        except Exception as e:
            print("Download-Fehler:", e)
            continue
        for t in chunk:
            try:
                sub = df[t] if len(chunk) > 1 else df
                c = sub["Close"].dropna()
                if len(c) >= 2:
                    closes[t] = c
                    vols[t] = sub["Volume"].reindex(c.index)
            except Exception:
                pass
        time.sleep(2)

    def perf(c, back):
        return (c.iloc[-1] / c.iloc[-1 - back] - 1) * 100 if len(c) > back else (c.iloc[-1] / c.iloc[0] - 1) * 100

    b = closes.get("^RUT")
    bench = {"d": num(perf(b, 1)), "w": num(perf(b, 5)), "m": num(perf(b, 21))} if b is not None else {}
    items = []
    for m in mem:
        c = closes.get(m["y"])
        if c is None:
            continue
        p, v = c.iloc[-1], vols[m["y"]].iloc[-1]
        items.append({"y": m["y"], "n": m["n"], "sec": m["sec"], "p": num(p, 4), "d": num(perf(c, 1)), "w": num(perf(c, 5)),
                      "m": num(perf(c, 21)), "mc": None, "v": num(p * v if v == v else None, 0),
                      "spark": [num(x, 3) for x in c.iloc[-22::2].tolist()]})
    print("mit Kursen:", len(items))
    if len(items) < 1000:
        print("Zu wenige Kurse, alte Datei bleibt bestehen.")
        return
    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
                   "indices": {"rut": {"name": "Russell 2000", "cur": "$", "bench": bench, "items": items}}},
                  f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
