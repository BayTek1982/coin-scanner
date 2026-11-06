"""Morgenroutine – holt jeden Morgen die Marktdaten für die Seite morgenroutine.html
und speichert sie in data/morgenroutine.json (plus Verlauf in data/morgenroutine_verlauf.json).
Läuft automatisch über GitHub Actions (.github/workflows/morgenroutine.yml).

Quellen (alle kostenlos): Yahoo Finance (yfinance), CNN Fear & Greed, Forex-Factory-Wirtschaftskalender.
Hinweis: Die O4W-Signale gibt es nur in TradingView – hier steht eine eigene Berechnung über den 21er Durchschnitt."""
import datetime as dt
import json
import math
import os
import traceback
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import yfinance as yf

OUT = "data/morgenroutine.json"
VERLAUF = "data/morgenroutine_verlauf.json"
BERLIN = ZoneInfo("Europe/Berlin")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}

MAERKTE = [  # Schlüssel, Anzeige, Yahoo-Kürzel, Gruppe, TradingView-Symbol
    ("spy", "SPY", "SPY", "USA", "AMEX:SPY"),
    ("spx", "S&P 500", "^GSPC", "USA", "SP:SPX"),
    ("qqq", "QQQ", "QQQ", "USA", "NASDAQ:QQQ"),
    ("iwm", "IWM (Russell)", "IWM", "USA", "AMEX:IWM"),
    ("ndx", "NDX (Tech)", "^NDX", "USA", "NASDAQ:NDX"),
    ("dax", "DAX", "^GDAXI", "Europa", "XETR:DAX"),
    ("sx5e", "Euro Stoxx 50", "^STOXX50E", "Europa", "TVC:SX5E"),
    ("nky", "Nikkei 225", "^N225", "Asien", "TVC:NI225"),
    ("gold", "Gold", "GC=F", "Rohstoffe", "COMEX:GC1!"),
    ("silber", "Silber", "SI=F", "Rohstoffe", "COMEX:SI1!"),
    ("oel", "Öl (WTI)", "CL=F", "Rohstoffe", "NYMEX:CL1!"),
    ("btc", "Bitcoin", "BTC-USD", "Krypto", "BITSTAMP:BTCUSD"),
]
SEKTOREN = [
    ("XLE", "Energie"), ("XLU", "Versorger (Utilities)"), ("XLV", "Gesundheit (Health Care)"),
    ("XLB", "Rohstoffe (Materials)"), ("XLK", "Technologie"), ("XLC", "Kommunikation"),
    ("XLRE", "Immobilien (Real Estate)"), ("XLF", "Finanzen"), ("XLI", "Industrie"),
    ("XLY", "Zyklischer Konsum"), ("XLP", "Basiskonsum (Staples)"),
]
VOLA = ["^VIX", "^VVIX", "^VIX3M", "^VIX9D"]
WATCHLIST = ["WMT", "BABA", "WDC", "MU", "COIN", "VST", "BAC", "GCT"]

KALENDER_DE = {  # häufige Termine auf Deutsch
    "CPI": "Verbraucherpreise (CPI)", "Core CPI": "Kern-Verbraucherpreise (Core CPI)", "PPI": "Erzeugerpreise (PPI)",
    "Core PPI": "Kern-Erzeugerpreise (Core PPI)", "Non-Farm Employment Change": "Arbeitsmarktbericht (NFP)",
    "Unemployment Rate": "Arbeitslosenquote", "Unemployment Claims": "Erstanträge Arbeitslosenhilfe",
    "Federal Funds Rate": "Fed-Zinsentscheid", "FOMC Statement": "Fed-Statement", "FOMC Press Conference": "Fed-Pressekonferenz",
    "FOMC Meeting Minutes": "Fed-Protokoll", "Main Refinancing Rate": "EZB-Zinsentscheid", "Monetary Policy Statement": "EZB-Statement",
    "ECB Press Conference": "EZB-Pressekonferenz", "Advance GDP q/q": "BIP (erste Schätzung)", "Prelim GDP q/q": "BIP (vorläufig)",
    "Final GDP q/q": "BIP (endgültig)", "Retail Sales m/m": "Einzelhandelsumsätze", "Core Retail Sales m/m": "Kern-Einzelhandelsumsätze",
    "Core PCE Price Index m/m": "Kern-PCE-Preisindex", "ISM Manufacturing PMI": "ISM Industrie", "ISM Services PMI": "ISM Dienstleistung",
    "JOLTS Job Openings": "Offene Stellen (JOLTS)", "ADP Non-Farm Employment Change": "ADP Arbeitsmarkt",
    "Crude Oil Inventories": "Rohöllagerbestände", "CB Consumer Confidence": "Verbrauchervertrauen (Conference Board)",
    "Prelim UoM Consumer Sentiment": "Uni Michigan Verbraucherstimmung", "German Prelim CPI m/m": "Verbraucherpreise Deutschland",
    "German ifo Business Climate": "ifo-Geschäftsklima", "German ZEW Economic Sentiment": "ZEW-Konjunkturerwartungen",
    "Flash Manufacturing PMI": "Einkaufsmanager Industrie (vorläufig)", "Flash Services PMI": "Einkaufsmanager Dienstleistung (vorläufig)",
    "CPI Flash Estimate y/y": "Verbraucherpreise Eurozone (Schnellschätzung)", "Bank Holiday": "Feiertag (Börse)",
}

fehler = []


def r(x, d=2):
    try:
        x = float(x)
        return None if math.isnan(x) or math.isinf(x) else round(x, d)
    except Exception:
        return None


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def laden(tickers, period="2y"):
    """Tageskurse als dict Kürzel -> DataFrame (Open, High, Low, Close, Volume)."""
    df = yf.download(tickers, period=period, interval="1d", group_by="ticker", auto_adjust=False,
                     progress=False, threads=True)
    out = {}
    for t in tickers:
        try:
            d = df[t] if isinstance(df.columns, pd.MultiIndex) else df
            d = d.dropna(subset=["Close"])
            if len(d):
                out[t] = d
        except Exception:
            pass
    return out


def serie_streak(close, ma):
    """Wie viele Kerzen in Folge über (+) bzw. unter (−) dem Durchschnitt."""
    above = (close > ma).dropna()
    above = above[ma.dropna().index]
    if not len(above):
        return None
    last = bool(above.iloc[-1])
    n = 0
    for v in reversed(above.tolist()):
        if bool(v) != last:
            break
        n += 1
    return n if last else -n


def ma21(d):
    """Kurs, Veränderungen und Lage zum 21er Durchschnitt (Tag und Woche)."""
    c = d["Close"]
    m = c.rolling(21).mean()
    w = c.resample("W-FRI").last().dropna()
    wm = w.rolling(21).mean()
    p = float(c.iloc[-1])

    def chg(n):
        return r((p / float(c.iloc[-1 - n]) - 1) * 100) if len(c) > n else None

    sd = serie_streak(c, m)
    sw = serie_streak(w, wm)
    if sd is None or sw is None:
        trend = "–"
    elif sd > 0 and sw > 0:
        trend = "Aufwärts"
    elif sd < 0 and sw < 0:
        trend = "Abwärts"
    else:
        trend = "Gemischt"
    o = float(d["Open"].iloc[-1]) if "Open" in d else None
    return {
        "p": r(p, 2), "d": chg(1), "w": chg(5), "m": chg(21), "t": c.index[-1].strftime("%Y-%m-%d"),
        "ma": r(m.iloc[-1], 2), "abst": r((p / float(m.iloc[-1]) - 1) * 100) if not math.isnan(m.iloc[-1]) else None,
        "tage": sd, "wochen": sw, "trend": trend,
        "kerze": None if o is None or math.isnan(o) else ("grün" if p >= o else "rot"),
    }


def adx(d, n=14):
    h, l, c = d["High"], d["Low"], d["Close"]
    up, dn = h.diff(), -l.diff()
    plus = ((up > dn) & (up > 0)) * up
    minus = ((dn > up) & (dn > 0)) * dn
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / n, adjust=False).mean()
    pdi = 100 * plus.ewm(alpha=1 / n, adjust=False).mean() / atr
    mdi = 100 * minus.ewm(alpha=1 / n, adjust=False).mean() / atr
    dx = 100 * (pdi - mdi).abs() / (pdi + mdi)
    a = dx.ewm(alpha=1 / n, adjust=False).mean()
    return {"adx": r(a.iloc[-1], 1), "dip": r(pdi.iloc[-1], 1), "dim": r(mdi.iloc[-1], 1), "adx_vortag": r(a.iloc[-2], 1)}


def distribution(d, fenster=25):
    """Distribution Day: Schluss mind. 0,2 % im Minus bei höherem Volumen als am Vortag (letzte 25 Sitzungen)."""
    c, v = d["Close"], d["Volume"]
    pct = c.pct_change() * 100
    tage = [i.strftime("%Y-%m-%d") for i in d.index[-fenster:]
            if pct.loc[i] <= -0.2 and v.loc[i] > v.shift().loc[i]]
    return {"anzahl": len(tage), "tage": tage}


def fear_greed():
    j = requests.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", headers=UA, timeout=30).json()
    fg = j["fear_and_greed"]
    de = {"extreme fear": "Extreme Angst", "fear": "Angst", "neutral": "Neutral", "greed": "Gier", "extreme greed": "Extreme Gier"}
    out = {"wert": r(fg["score"], 0), "stimmung": de.get(fg["rating"], fg["rating"]),
           "vortag": r(fg.get("previous_close"), 0), "woche": r(fg.get("previous_1_week"), 0),
           "monat": r(fg.get("previous_1_month"), 0), "stand": fg.get("timestamp")}
    try:  # CNN liefert auch das Put/Call-Verhältnis (5-Tage-Schnitt)
        pc = j["put_call_options"]["data"]
        out["pcr"] = r(pc[-1]["y"], 2)
        out["pcr_vortag"] = r(pc[-2]["y"], 2)
    except Exception:
        pass
    try:
        hist = j["fear_and_greed_historical"]["data"][-30:]
        out["verlauf"] = [r(x["y"], 0) for x in hist]
    except Exception:
        pass
    return out


def mmfi():
    """Anteil der S&P-500-Aktien über ihrem 50-Tage-Durchschnitt (wie MMFI, eigene Berechnung)."""
    st = load("data/stocks.json", {})
    tickers = [x["y"] for x in st.get("indices", {}).get("spx", {}).get("items", [])]
    if len(tickers) < 400:
        raise ValueError("S&P-500-Liste fehlt")
    df = yf.download(tickers, period="9mo", interval="1d", auto_adjust=False, progress=False, threads=True)["Close"]
    df = df.dropna(how="all")
    ma = df.rolling(50).mean()
    ok = ma.notna() & df.notna()
    anteil = ((df > ma) & ok).sum(axis=1) / ok.sum(axis=1) * 100
    anteil = anteil.dropna().iloc[-30:]
    return {"wert": r(anteil.iloc[-1], 1), "vortag": r(anteil.iloc[-2], 1), "anzahl": int(ok.iloc[-1].sum()),
            "verlauf": [r(x, 1) for x in anteil.tolist()], "t": anteil.index[-1].strftime("%Y-%m-%d")}


def kalender():
    j = requests.get("https://nfs.faireconomy.media/ff_calendar_thisweek.json", headers=UA, timeout=30).json()
    heute = dt.datetime.now(BERLIN).date()
    out = []
    for e in j:
        if e.get("country") not in ("USD", "EUR") or e.get("impact") not in ("High", "Medium", "Holiday"):
            continue
        try:
            zeit = dt.datetime.fromisoformat(e["date"]).astimezone(BERLIN)
        except Exception:
            continue
        titel = e.get("title", "")
        if "Daylight Saving" in titel:
            continue
        out.append({
            "zeit": zeit.strftime("%Y-%m-%dT%H:%M"), "land": "USA" if e["country"] == "USD" else "Eurozone",
            "titel": KALENDER_DE.get(titel, titel), "wichtig": e.get("impact") == "High",
            "prognose": e.get("forecast") or "", "vorher": e.get("previous") or "",
            "heute": zeit.date() == heute,
        })
    out.sort(key=lambda x: x["zeit"])
    return out


def earnings():
    heute = dt.date.today()
    out = []
    for t in WATCHLIST:
        try:
            cal = yf.Ticker(t).calendar
            ed = cal.get("Earnings Date") if isinstance(cal, dict) else None
            if ed:
                d = ed[0] if isinstance(ed, (list, tuple)) else ed
                d = pd.Timestamp(d).date()
                if d >= heute - dt.timedelta(days=1):
                    out.append({"y": t, "datum": d.isoformat(), "tage": (d - heute).days})
        except Exception:
            pass
    out.sort(key=lambda x: x["datum"])
    return out


def main():
    alt = load(OUT, {})
    res = {"stand": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M+00:00")}

    def schritt(name, fn):
        try:
            res[name] = fn()
        except Exception as e:
            fehler.append(f"{name}: {e}")
            traceback.print_exc()
            if name in alt:  # bei Ausfall alten Stand behalten
                res[name] = alt[name]
                res.setdefault("alt", []).append(name)

    kurse = {}

    def kurse_laden():
        kurse.update(laden([m[2] for m in MAERKTE] + [s[0] for s in SEKTOREN] + VOLA))
        if "SPY" not in kurse:
            raise ValueError("keine Kurse von Yahoo")
        return True

    schritt("_kurse", kurse_laden)
    res.pop("_kurse", None)

    def maerkte():
        out = []
        for k, n, y, g, tv in MAERKTE:
            if y in kurse:
                out.append({"k": k, "n": n, "y": y, "g": g, "tv": tv, **ma21(kurse[y])})
        return out

    def sektoren():
        out = []
        for y, n in SEKTOREN:
            if y in kurse:
                out.append({"y": y, "n": n, "tv": "AMEX:" + y, **ma21(kurse[y])})
        return out

    def vola():
        v = kurse["^VIX"]
        c, h = float(v["Close"].iloc[-1]), float(v["High"].iloc[-1])
        out = {"vix": r(c), "vix_vortag": r(v["Close"].iloc[-2]), "vix_hoch": r(h), "t": v.index[-1].strftime("%Y-%m-%d"),
               "vix_verlauf": [r(x) for x in v["Close"].iloc[-30:].tolist()]}
        # Rang des VIX im 52-Wochen-Bereich (0 = Tief, 100 = Hoch)
        y1 = v["Close"].iloc[-252:]
        lo, hi = float(y1.min()), float(y1.max())
        out["vix_rang"] = r((c - lo) / (hi - lo) * 100, 0) if hi > lo else None
        if "^VVIX" in kurse:
            vv = kurse["^VVIX"]["Close"]
            out.update(vvix=r(vv.iloc[-1]), vvix_vortag=r(vv.iloc[-2]))
        if "^VIX3M" in kurse:
            v3 = float(kurse["^VIX3M"]["Close"].iloc[-1])
            out.update(vix3m=r(v3), kurve="Contango" if c < v3 else "Backwardation", kurve_ratio=r(c / v3, 3))
        if "^VIX9D" in kurse:
            out["vix9d"] = r(kurse["^VIX9D"]["Close"].iloc[-1])
        out["umkehr"] = bool(h >= 20 and h - c >= 3)
        return out

    def spy_extra():
        d = kurse["SPY"]
        hoch = float(d["High"].iloc[-252:].max())
        p = float(d["Close"].iloc[-1])
        return {"vom_hoch": r((p / hoch - 1) * 100), "hoch52": r(hoch), **adx(d),
                "dist_spy": distribution(d), "dist_qqq": distribution(kurse["QQQ"]) if "QQQ" in kurse else None}

    schritt("maerkte", maerkte)
    schritt("sektoren", sektoren)
    schritt("vola", vola)
    schritt("spy", spy_extra)
    schritt("fg", fear_greed)
    schritt("mmfi", mmfi)
    schritt("kalender", kalender)
    schritt("earnings", earnings)

    # ---- Checks wie in der Excel-Morgenroutine
    v, fg, spy = res.get("vola", {}), res.get("fg", {}), res.get("spy", {})
    mk = {m["k"]: m for m in res.get("maerkte", [])}
    spx, spym = mk.get("spx", {}), mk.get("spy", {})
    vix_steigt = v.get("vix") is not None and v.get("vix_vortag") is not None and v["vix"] > v["vix_vortag"]
    panik = [
        {"n": "VIX über 20: 3-Punkte-Umkehr", "ja": bool(v.get("umkehr"))},
        {"n": "Fear & Greed unter 10", "ja": fg.get("wert") is not None and fg["wert"] < 10},
        {"n": "Put/Call größer als 1,30", "ja": fg.get("pcr") is not None and fg["pcr"] > 1.30},
    ]
    dist = (spy.get("dist_spy") or {}).get("anzahl", 0)
    hedging = [
        {"n": "SPY steigt und VIX steigt", "ja": (spym.get("d") or 0) > 0 and vix_steigt},
        {"n": "Fear & Greed über 80", "ja": fg.get("wert") is not None and fg["wert"] > 80},
        {"n": "Distribution Days SPY ab 5 (letzte 25 Tage)", "ja": dist >= 5},
    ]
    contango = v.get("kurve") == "Contango"
    bub = spx.get("trend") == "Aufwärts" and contango and spym.get("kerze") == "grün"
    res["checks"] = {
        "panik": panik, "hedging": hedging,
        "ampel": [
            {"n": "S&P 500 Trend (21er Tag + Woche)", "wert": spx.get("trend", "–"),
             "farbe": {"Aufwärts": "gruen", "Abwärts": "rot"}.get(spx.get("trend"), "gelb")},
            {"n": "VIX-Kurve", "wert": v.get("kurve", "–"), "farbe": "gruen" if contango else "rot"},
            {"n": "Brot & Butter (SPY grüne Kerze, Aufwärtstrend, Contango)", "wert": "ja" if bub else "nein",
             "farbe": "gruen" if bub else "rot"},
            {"n": "Hedging prüfen", "wert": "ja" if spx.get("trend") == "Abwärts" or (v.get("vix") or 0) > 20 else "nein",
             "farbe": "rot" if spx.get("trend") == "Abwärts" or (v.get("vix") or 0) > 20 else "gruen"},
            {"n": "Panikzeichen", "wert": f"{sum(x['ja'] for x in panik)}/3",
             "farbe": "rot" if sum(x["ja"] for x in panik) >= 2 else ("gelb" if any(x["ja"] for x in panik) else "gruen")},
            {"n": "Hedgingzeichen", "wert": f"{sum(x['ja'] for x in hedging)}/3",
             "farbe": "rot" if sum(x["ja"] for x in hedging) >= 2 else ("gelb" if any(x["ja"] for x in hedging) else "gruen")},
        ],
    }
    sek = res.get("sektoren", [])
    if sek:
        res["beste_sektoren"] = {z: max(sek, key=lambda s: s.get(z) if s.get(z) is not None else -1e9)["n"] for z in ("d", "w", "m")}
    res["fehler"] = fehler

    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, separators=(",", ":"))

    # ---- Verlauf (ein Eintrag pro Tag, letzter Stand des Tages)
    verlauf = load(VERLAUF, [])
    tag = dt.datetime.now(BERLIN).strftime("%Y-%m-%d")
    eintrag = {"tag": tag, "vix": v.get("vix"), "vvix": v.get("vvix"), "fg": fg.get("wert"),
               "mmfi": (res.get("mmfi") or {}).get("wert"), "pcr": fg.get("pcr"), "kurve": v.get("kurve"),
               "spx": spx.get("trend"), "spy_hoch": spy.get("vom_hoch"),
               "panik": sum(x["ja"] for x in panik), "hedging": sum(x["ja"] for x in hedging)}
    verlauf = [e for e in verlauf if e.get("tag") != tag] + [eintrag]
    with open(VERLAUF, "w", encoding="utf-8") as f:
        json.dump(verlauf[-260:], f, ensure_ascii=False, separators=(",", ":"))
    print("fertig, Fehler:", fehler)


if __name__ == "__main__":
    main()
