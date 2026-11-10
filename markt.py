"""Daten für die Markt-Seite (markt.html) des Bayazit Coin-Scanners.

  python markt.py intraday     5-Minuten-Kurse des letzten Handelstags aller Aktien, Indizes und Rohstoffe
                               -> markt_out/i/<Kürzel>.json (der Workflow legt sie im Zweig "markt-data" ab,
                               ohne Verlauf, damit das Repo nicht wächst)
  python markt.py kennzahlen   Unternehmenszahlen (KGV, Dividende, Umsatz ...) -> data/kennzahlen.json

Quelle: Yahoo Finance über yfinance. Läuft über GitHub Actions (.github/workflows/markt.yml und kennzahlen.yml).
Rückgängig: diese Datei, die beiden Workflows, markt.html und data/kennzahlen.json löschen."""
import datetime as dt
import json
import math
import os
import sys
import time

import pandas as pd
import yfinance as yf

EXTRA = ["^GSPC", "^NDX", "^DJI", "^RUT", "^GDAXI", "^MDAXI", "^TECDAX", "^STOXX50E", "^HSI", "^N225", "^KS11",
         "GC=F", "SI=F", "CL=F", "BZ=F", "NG=F", "HG=F", "PL=F", "PA=F"]
OUT = "markt_out"
KZ = "data/kennzahlen.json"
GAP = 3 * 3600 * 1000  # Pause > 3 Stunden = neuer Handelstag

# Feld in der Datei -> Feld bei Yahoo
FIELDS = {
    "pe": "trailingPE", "fpe": "forwardPE", "eps": "trailingEps", "dps": "dividendRate", "pb": "priceToBook",
    "ps": "priceToSalesTrailing12Months", "beta": "beta", "rev": "totalRevenue", "ni": "netIncomeToCommon",
    "mar": "profitMargins", "roe": "returnOnEquity", "de": "debtToEquity", "emp": "fullTimeEmployees",
    "tgt": "targetMeanPrice", "na": "numberOfAnalystOpinions",
}
TEXT = {"fc": "financialCurrency", "rec": "recommendationKey", "bra": "industry", "land": "country"}
CUR = {"USD": "$", "EUR": "€", "JPY": "¥", "HKD": "HK$", "KRW": "₩", "GBP": "£", "CNY": "CN¥", "CHF": "CHF", "TWD": "NT$"}


def fname(t):
    return "".join(ch if ch.isalnum() or ch in ".-" else "_" for ch in t)


def stocks():
    with open("data/stocks.json", encoding="utf-8") as f:
        d = json.load(f)
    seen = []
    for ix in d.get("indices", {}).values():
        for it in ix.get("items", []):
            if it["y"] not in seen:
                seen.append(it["y"])
    return seen


def r6(v):
    v = float(v)
    if not math.isfinite(v):
        return None
    if v == 0:
        return 0
    return round(v, max(0, 6 - int(math.floor(math.log10(abs(v)))) - 1))


def intraday():
    tickers = stocks() + EXTRA
    os.makedirs(f"{OUT}/i", exist_ok=True)
    n = 0
    for i in range(0, len(tickers), 60):
        chunk = tickers[i:i + 60]
        df = None
        for attempt in range(3):
            try:
                df = yf.download(chunk, period="5d", interval="5m", group_by="ticker",
                                 auto_adjust=False, threads=True, progress=False)
                break
            except Exception as e:
                print("Fehler:", e)
                time.sleep(5 * (attempt + 1))
        if df is None or df.empty:
            continue
        for t in chunk:
            try:
                x = df[t] if isinstance(df.columns, pd.MultiIndex) else df
                x = x[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])
                x = x[x["Close"] > 0]
                if len(x) < 4:
                    continue
                ts = [int(pd.Timestamp(s).timestamp() * 1000) for s in x.index]
                start = len(ts) - 1
                gap = 45 * 60 * 1000 if "=F" in t else GAP  # Rohstoffe handeln fast rund um die Uhr
                while start > 0 and ts[start] - ts[start - 1] < gap:
                    start -= 1
                day = x.iloc[start:]
                if len(day) < 2:
                    continue
                k = [[ts[start + j], r6(c)] for j, c in enumerate(day["Close"].tolist())]
                rec = {"pc": r6(x["Close"].iloc[start - 1]) if start > 0 else None,
                       "o": r6(day["Open"].dropna().iloc[0]) if day["Open"].notna().any() else None,
                       "h": r6(day["High"].max()), "l": r6(day["Low"].min()),
                       "v": int(day["Volume"].fillna(0).sum()), "k": k}
                with open(f"{OUT}/i/{fname(t)}.json", "w", encoding="utf-8") as f:
                    json.dump(rec, f, separators=(",", ":"))
                n += 1
            except Exception as e:
                print(t, "übersprungen:", e)
        time.sleep(1)
    print(n, "von", len(tickers))
    with open(f"{OUT}/stand.json", "w", encoding="utf-8") as f:
        json.dump({"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M+00:00"), "n": n}, f)
    with open(f"{OUT}/README.md", "w", encoding="utf-8") as f:
        f.write("5-Minuten-Kurse für markt.html. Wird automatisch überschrieben, bitte nichts von Hand ändern.\n")
    if n < len(tickers) * 0.5:
        print("Zu wenige Werte erhalten, alte Daten bleiben stehen.")
        sys.exit(1)


def num(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def kennzahlen():
    try:
        with open(KZ, encoding="utf-8") as f:
            old = json.load(f).get("s", {})
    except Exception:
        old = {}
    today = (dt.date.today() - dt.date(1970, 1, 1)).days
    tickers = stocks()
    # zuerst die Werte, deren Zahlen am ältesten sind
    tickers.sort(key=lambda t: old.get(t, {}).get("u", 0))
    out = {t: old[t] for t in tickers if t in old}
    t0, fails, got = time.time(), 0, 0
    for t in tickers:
        if time.time() - t0 > 45 * 60:
            print("Zeitlimit erreicht, Rest folgt beim nächsten Lauf.")
            break
        if fails >= 15:
            print("Yahoo blockt gerade, Rest folgt beim nächsten Lauf.")
            break
        try:
            info = yf.Ticker(t).info or {}
        except Exception as e:
            print(t, "Fehler:", e)
            fails += 1
            time.sleep(3)
            continue
        if not (info.get("marketCap") or info.get("trailingPE") or info.get("totalRevenue")):
            fails += 1
            time.sleep(1)
            continue
        fails = 0
        rec = {"u": today}
        for k, y in FIELDS.items():
            v = num(info.get(y))
            if v is not None:
                rec[k] = int(v) if k in ("emp", "na", "rev", "ni") else float(f"{v:.6g}")
        for k, y in TEXT.items():
            v = info.get(y)
            if isinstance(v, str) and v and v != "none":
                rec[k] = CUR.get(v, v) if k == "fc" else v
        out[t] = rec
        got += 1
        time.sleep(0.35)
    print(got, "aktualisiert,", len(out), "gesamt")
    if got == 0 and not old:
        sys.exit(1)
    os.makedirs("data", exist_ok=True)
    with open(KZ, "w", encoding="utf-8") as f:
        json.dump({"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M+00:00"), "s": out},
                  f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "intraday":
        intraday()
    elif mode == "kennzahlen":
        kennzahlen()
    else:
        print("Aufruf: python markt.py intraday | kennzahlen")
        sys.exit(2)
