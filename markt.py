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


def is_us(t):
    return "." not in t and not t.startswith("^") and "=" not in t


def ms(index):
    idx = pd.DatetimeIndex(index)
    if idx.tz is None:
        idx = idx.tz_localize("UTC")
    return idx, [int(v.timestamp() * 1000) for v in idx]


def download(chunk, prepost):
    for attempt in range(3):
        try:
            return yf.download(chunk, period="5d", interval="5m", group_by="ticker", prepost=prepost,
                               auto_adjust=False, threads=True, progress=False)
        except Exception as e:
            print("Fehler:", e)
            time.sleep(5 * (attempt + 1))
    return None


def one(t, df):
    x = df[t] if isinstance(df.columns, pd.MultiIndex) else df
    x = x[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])
    x = x[x["Close"] > 0]
    ext = None
    if is_us(t) and len(x):
        # US-Aktien: reguläre Handelszeit 9:30-16:00 New York, Rest ist Vor-/Nachbörse
        idx, _ = ms(x.index)
        ny = idx.tz_convert("America/New_York")
        mins = ny.hour * 60 + ny.minute
        reg = (mins >= 570) & (mins < 960) & (ny.weekday < 5)
        ext, x = x[~reg], x[reg]
    if len(x) < 4:
        return None
    _, ts = ms(x.index)
    start = len(ts) - 1
    gap = 45 * 60 * 1000 if "=F" in t else GAP  # Rohstoffe handeln fast rund um die Uhr
    while start > 0 and ts[start] - ts[start - 1] < gap:
        start -= 1
    day = x.iloc[start:]
    if len(day) < 2:
        return None
    k = [[ts[start + j], r6(c)] for j, c in enumerate(day["Close"].tolist())]
    rec = {"pc": r6(x["Close"].iloc[start - 1]) if start > 0 else None,
           "o": r6(day["Open"].dropna().iloc[0]) if day["Open"].notna().any() else None,
           "h": r6(day["High"].max()), "l": r6(day["Low"].min()),
           "v": int(day["Volume"].fillna(0).sum()), "k": k}
    if ext is not None and len(ext):
        eidx, ets = ms(ext.index)
        after = [j for j, v in enumerate(ets) if v > ts[-1]]
        if after:
            last_reg_day = pd.Timestamp(ts[-1], unit="ms", tz="UTC").tz_convert("America/New_York").date()
            last_ext_day = eidx[after[-1]].tz_convert("America/New_York").date()
            rec["xk"] = "post" if last_ext_day == last_reg_day else "pre"
            if rec["xk"] == "pre":  # nur die heutige Vorbörse, nicht die Nachbörse vom Vortag
                after = [j for j in after if eidx[j].tz_convert("America/New_York").date() == last_ext_day
                         and eidx[j].tz_convert("America/New_York").hour >= 4]
            closes = ext["Close"].tolist()
            rec["xs"] = [[ets[j], r6(closes[j])] for j in after]
            rec["xp"], rec["xt"] = rec["xs"][-1][1], rec["xs"][-1][0]
    return rec


def intraday():
    tickers = stocks() + EXTRA
    os.makedirs(f"{OUT}/i", exist_ok=True)
    n = 0
    us = [t for t in tickers if is_us(t)]
    rest = [t for t in tickers if not is_us(t)]
    for group, prepost in ((us, True), (rest, False)):
        for i in range(0, len(group), 60):
            chunk = group[i:i + 60]
            df = download(chunk, prepost)
            if df is None or df.empty:
                continue
            for t in chunk:
                try:
                    rec = one(t, df)
                    if rec is None:
                        continue
                    with open(f"{OUT}/i/{fname(t)}.json", "w", encoding="utf-8") as f:
                        json.dump(rec, f, separators=(",", ":"))
                    n += 1
                except Exception as e:
                    print(t, "übersprungen:", e)
            time.sleep(1)
    print(n, "von", len(tickers), "· mit Vor-/Nachbörse:",
          sum(1 for t in us if os.path.exists(f"{OUT}/i/{fname(t)}.json")
              and "xp" in open(f"{OUT}/i/{fname(t)}.json").read()))
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


def earnings(tk, info, old_e, today):
    """Quartalszahlen: nächster Termin (aus info), Schätzungen (calendar), letzte 4 Quartale (earnings_history)."""
    e = {}
    now = time.time()
    nxt = num(info.get("earningsTimestampStart")) or num(info.get("earningsTimestamp"))
    if nxt and nxt > now - 86400:
        e["n"] = int(nxt)
        e["nx"] = bool(info.get("isEarningsDateEstimate"))
    # Schätzungen und Verlauf nur alle 14 Tage oder kurz nach einem Termin neu holen (spart Abrufe)
    last_n = (old_e or {}).get("n", 0)
    fresh = old_e and today - old_e.get("eu", 0) < 14 and not (last_n and last_n < now and old_e.get("eu", 0) * 86400 < last_n + 86400)
    if fresh:
        for k in ("ee", "re", "h", "eu"):
            if k in old_e:
                e[k] = old_e[k]
        return e
    try:
        cal = tk.calendar or {}
        v = num(cal.get("Earnings Average"))
        if v is not None:
            e["ee"] = float(f"{v:.4g}")
        v = num(cal.get("Revenue Average"))
        if v is not None:
            e["re"] = int(v)
        if "n" not in e:
            ds = [d for d in (cal.get("Earnings Date") or []) if d]
            if ds:
                d0 = pd.Timestamp(ds[0])
                if d0.tzinfo is None:
                    d0 = d0.tz_localize("America/New_York")
                if d0.timestamp() > now - 86400:
                    e["n"], e["nx"] = int(d0.timestamp()), True
    except Exception as ex:
        print("calendar", ex)
    try:
        h = tk.earnings_history
        if h is not None and len(h):
            rows = []
            for q, r in h.sort_index().tail(4).iterrows():
                est, act = num(r.get("epsEstimate")), num(r.get("epsActual"))
                if act is None:
                    continue
                rows.append([int(pd.Timestamp(q).timestamp() // 86400),
                             None if est is None else float(f"{est:.4g}"), float(f"{act:.4g}")])
            if rows:
                e["h"] = rows
    except Exception as ex:
        print("earnings_history", ex)
    e["eu"] = today
    return e


def kennzahlen():
    try:
        with open(KZ, encoding="utf-8") as f:
            old = json.load(f).get("s", {})
    except Exception:
        old = {}
    today = (dt.date.today() - dt.date(1970, 1, 1)).days
    tickers = stocks()
    # zuerst Werte ohne Quartalszahlen, dann die, deren Zahlen am ältesten sind
    tickers.sort(key=lambda t: ("e" in old.get(t, {}) and "eu" in old[t]["e"], old.get(t, {}).get("u", 0)))
    limit = int(os.environ.get("KZ_LIMIT") or 0)
    if limit:
        tickers = tickers[:limit]
    out = dict(old)
    out = {t: v for t, v in out.items() if t in set(stocks())}
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
        try:
            e = earnings(yf.Ticker(t), info, old.get(t, {}).get("e"), today)
            if e:
                rec["e"] = e
        except Exception as ex:
            print(t, "Earnings:", ex)
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
