"""Bayazit Risiko-Indikator (0 = historisch billig, 1 = historisch teuer) für die größten Coins.
Eigenes Modell nach dem Prinzip der Risk Metric von Into The Cryptoverse:
  x = ln(Kurs / 374-Tage-Durchschnitt)
  Risiko = Lage von x zwischen dem tiefsten x der gesamten Historie und dem höchsten x der letzten 4 Jahre, 0 bis 1
Die Tiefs (gemessen am Durchschnitt) bleiben über die Zyklen ähnlich tief, die Hochs werden kleiner:
deshalb unten die ganze Historie als Maßstab, oben nur der letzte Zyklus (4 Jahre).
Kurse: Coin Metrics Community-Daten (lange Historie, z. B. BTC ab 2010), ergänzt um Binance bzw. OKX Tageskerzen.
Ergebnis: data/risk.json (Werte für die Live-Berechnung im Scanner) und data/risk/<SYMBOL>.json (Verlauf).
Läuft automatisch über GitHub Actions (.github/workflows/risk.yml)."""
import csv
import datetime as dt
import io
import json
import math
import os
import sys
import time

import requests

L = 374            # Tage für den gleitenden Durchschnitt
A = 0.0            # Gewichtung der Zeit (0 = keine; die frühere 0.395 drückte spätere Tiefs immer wieder auf 0)
W = 1460           # Normierungsfenster in Tagen (4 Jahre)
MIN_DAYS = L + 365  # mindestens gut 2 Jahre Kursdaten
TOP = 100          # so viele Coins nach Marktkapitalisierung
UA = {"User-Agent": "Mozilla/5.0 (compatible; bayazit-coin-scanner/1.0)"}
SKIP = set("""USDT USDC DAI FDUSD TUSD USDE USDS PYUSD USD1 RLUSD USDD BUSD USDP GUSD FRAX LUSD EURC EURT XAUT PAXG KAU USDG USDF
USD0 USDTB BFUSD GHO USYC USDY OUSG USTB BUIDL USDX USDB SUSDE SUSDS SDAI WBTC WETH STETH WSTETH WEETH EETH CBBTC CBETH RETH
BETH LBTC SOLVBTC JITOSOL MSOL BNSOL JUPSOL EZETH RSETH METH OSETH SFRXETH TBTC BTCB CLBTC WBETH BSC-USD WBNB WSOL WTRX WHYPE JLP""".split())
DAY = 86400000


def get(url, tries=3, **kw):
    for i in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=30, **kw)
            if r.status_code == 429:
                time.sleep(20)
                continue
            r.raise_for_status()
            return r
        except Exception as e:
            if i == tries - 1:
                print("  Fehler", url[:90], e)
                return None
            time.sleep(3)


def day(t_ms):
    return int(t_ms // DAY)


def coinmetrics(sym):
    r = get(f"https://raw.githubusercontent.com/coinmetrics/data/master/csv/{sym.lower()}.csv", tries=2)
    if not r:
        return {}
    out = {}
    for row in csv.DictReader(io.StringIO(r.text)):
        p = row.get("PriceUSD")
        if p:
            try:
                out[(dt.date.fromisoformat(row["time"]) - dt.date(1970, 1, 1)).days] = float(p)
            except ValueError:
                pass
    return out


def binance(sym):
    out, start = {}, 0
    for _ in range(12):
        r = get(f"https://data-api.binance.vision/api/v3/klines?symbol={sym}USDT&interval=1d&limit=1000&startTime={start}", tries=2)
        if not r:
            break
        j = r.json()
        if not isinstance(j, list) or not j:
            break
        for k in j:
            out[day(k[0])] = float(k[4])
        if len(j) < 1000:
            break
        start = j[-1][0] + 1
        time.sleep(0.2)
    return out


def okx(sym):
    out, after = {}, ""
    for _ in range(40):
        r = get(f"https://www.okx.com/api/v5/market/history-candles?instId={sym}-USDT&bar=1Dutc&limit=100" + (f"&after={after}" if after else ""), tries=2)
        if not r:
            break
        d = r.json().get("data") or []
        if not d:
            break
        for k in d:
            out[day(int(k[0]))] = float(k[4])
        after = d[-1][0]
        if len(d) < 100:
            break
        time.sleep(0.12)
    return out


def coingecko(cid):
    """Tageskurse des letzten Jahres (Ersatz, wenn keine Börse aktuelle Kerzen liefert)."""
    time.sleep(8)
    r = get(f"https://api.coingecko.com/api/v3/coins/{cid}/market_chart?vs_currency=usd&days=365&interval=daily", tries=2)
    if not r:
        return {}
    out = {}
    for t, p in r.json().get("prices") or []:
        if p:
            out[day(t)] = float(p)
    return out


TODAY = day(time.time() * 1000)


def fresh(d):
    return bool(d) and max(d) >= TODAY - 3


def merge(*sources):
    """Quellen nach Vorrang (wichtigste zuerst) zusammenführen. Eine Quelle wird nur genommen,
    wenn ihre Kurse in der Überlappung zu den bisherigen passen (gleicher Coin, kein falscher Ticker)."""
    allp = {}
    for src in sources:
        if not src:
            continue
        if allp:
            both = [d for d in src if d in allp][-60:]
            if both:
                dev = sorted(abs(src[d] / allp[d] - 1) for d in both)[len(both) // 2]
                if dev > 0.05:
                    continue
            elif min(abs(d - e) for d in (min(src), max(src)) for e in (min(allp), max(allp))) > 3:
                continue
        for d, p in src.items():
            allp.setdefault(d, p)
    if not allp:
        return []
    days = sorted(allp)
    # nur die zusammenhängende Strecke bis heute (Lücken über 5 Tage abschneiden)
    start = 0
    for i in range(1, len(days)):
        if days[i] - days[i - 1] > 5:
            start = i
    return [(d, allp[d]) for d in days[start:] if allp[d] > 0]


def compute(rows):
    """Liefert Verlauf [(tag, kurs, risiko)] und die Werte für die Live-Berechnung."""
    P = [p for _, p in rows]
    xs, s = [], 0.0
    for i, p in enumerate(P):
        s += p
        if i >= L:
            s -= P[i - L]
        xs.append((math.log(p) - math.log(s / L)) * (i + 1) ** A if i >= L - 1 else None)
    hist, gmin, mins = [], float("inf"), []
    for i in range(len(P)):
        if xs[i] is not None:
            gmin = min(gmin, xs[i])
        mins.append(gmin)
    # erstes Jahr nach Beginn der Berechnung auslassen: zu wenig Vergleichswerte, die Werte springen dort zwischen 0 und 1
    for i in range(L - 1 + 365, len(P)):
        mx = max(xs[max(L - 1, i - W + 1):i + 1])
        mn = mins[i]
        r = (xs[i] - mn) / (mx - mn) if mx > mn else 0.5
        hist.append((rows[i][0], P[i], max(0.0, min(1.0, r))))
    # Werte für "heute" (letzte Kerze = laufender Tag, wird live durch den aktuellen Kurs ersetzt)
    i = len(P) - 1
    win = xs[max(L - 1, i - W + 1):i]  # Fenster ohne den laufenden Tag
    live = {
        "n": i + 1,                       # Zeitindex des laufenden Tages
        "s": round(sum(P[i - L + 1:i]), 10),  # Summe der 373 Schlusskurse davor
        "mn": mins[i - 1], "mx": max(win),
        "days": len(P), "start": rows[0][0], "last_day": rows[-1][0],
    }
    return hist, live


def sig(v, n=6):
    return float(f"{v:.{n}g}")


def main():
    os.makedirs("data/risk", exist_ok=True)
    mk = get("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1")
    coins = []
    for c in (mk.json() if mk else []):
        s = str(c.get("symbol", "")).upper()
        if s in SKIP or any(x["sym"] == s for x in coins):
            continue
        p = c.get("current_price") or 0
        if 0.97 < p < 1.03 and abs(c.get("price_change_percentage_24h") or 9) < 1:
            continue
        coins.append({"sym": s, "id": c["id"], "name": c["name"]})
        if len(coins) >= TOP:
            break
    if not coins:
        coins = [{"sym": "BTC", "id": "bitcoin", "name": "Bitcoin"}, {"sym": "ETH", "id": "ethereum", "name": "Ethereum"}]
    out = {"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
           "model": {"L": L, "a": A, "w": W}, "coins": {}}
    for c in coins:
        sym = c["sym"]
        bn = binance(sym)
        ox = {} if fresh(bn) else okx(sym)
        ex, src = (bn, "Binance") if fresh(bn) else (ox, "OKX") if fresh(ox) else ({}, "")
        cm = coinmetrics(sym)
        cg = {} if ex else coingecko(c["id"])
        if not ex and fresh(cg):
            src = "CoinGecko"
        stale = bn if len(bn) >= len(ox) else ox  # veraltete Börsenkerzen (z. B. nach Delisting) nur als alte Historie
        rows = merge(ex, cg, stale, cm)
        if not rows or rows[-1][0] < TODAY - 3:
            print(f"{sym}: keine aktuellen Kurse (Börse delistet?)")
            continue
        if len(rows) < MIN_DAYS:
            print(f"{sym}: zu wenig Historie ({len(rows)} Tage)")
            continue
        if cm and rows[0][0] < min(ex or cg or {TODAY: 0}):
            src = "Coin Metrics + " + src
        hist, live = compute(rows)
        live.update({"id": c["id"], "name": c["name"], "src": src, "risk": round(hist[-1][2], 4)})
        out["coins"][sym] = live
        with open(f"data/risk/{sym}.json", "w") as f:
            json.dump({"sym": sym, "src": src, "d": [[d, sig(p), round(r, 4)] for d, p, r in hist]}, f, separators=(",", ":"))
        print(f"{sym}: {len(rows)} Tage ab {dt.date(1970,1,1)+dt.timedelta(rows[0][0])} · Risiko {hist[-1][2]:.3f} · {src}")
    if not out["coins"]:
        print("Keine Daten – Datei bleibt unverändert")
        sys.exit(1)
    for fn in os.listdir("data/risk"):
        if fn.endswith(".json") and fn[:-5] not in out["coins"]:
            os.remove(os.path.join("data/risk", fn))
    with open("data/risk.json", "w") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
