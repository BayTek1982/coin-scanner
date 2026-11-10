"""Morgenroutine – holt jeden Morgen die Marktdaten für die Seite morgenroutine.html
und speichert sie in data/morgenroutine.json (plus Verlauf in data/morgenroutine_verlauf.json).
Läuft automatisch über GitHub Actions (.github/workflows/morgenroutine.yml).

Quellen (alle kostenlos): Yahoo Finance (yfinance), CNN Fear & Greed, Forex-Factory-Wirtschaftskalender.
Den MMFI holt das Skript direkt aus dem TradingView-Chart (wie die TradingView-Webseite selbst, ohne Anmeldung).
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
    ("ndx", "Nasdaq 100 (Tech)", "^NDX", "USA", "NASDAQ:NDX"),
    ("ixic", "Nasdaq Composite", "^IXIC", "USA", "NASDAQ:IXIC"),
    ("dji", "Dow Jones", "^DJI", "USA", "DJ:DJI"),
    ("iwm", "IWM (Russell)", "IWM", "USA", "AMEX:IWM"),
    ("rut", "Russell 2000", "^RUT", "USA", "TVC:RUT"),
    ("dax", "DAX", "^GDAXI", "Europa", "XETR:DAX"),
    ("mdax", "MDAX", "^MDAXI", "Europa", "XETR:MDAX"),
    ("tecdax", "TecDAX", "^TECDAX", "Europa", "XETR:TDXP"),
    ("sx5e", "Euro Stoxx 50", "^STOXX50E", "Europa", "TVC:SX5E"),
    ("ftse", "FTSE 100 (London)", "^FTSE", "Europa", "TVC:UKX"),
    ("cac", "CAC 40 (Paris)", "^FCHI", "Europa", "EURONEXT:PX1"),
    ("smi", "SMI (Schweiz)", "^SSMI", "Europa", "SIX:SMI"),
    ("nky", "Nikkei 225", "^N225", "Asien", "TVC:NI225"),
    ("hsi", "Hang Seng", "^HSI", "Asien", "TVC:HSI"),
    ("sse", "Shanghai Composite", "000001.SS", "Asien", "SSE:000001"),
    ("kospi", "KOSPI (Korea)", "^KS11", "Asien", "TVC:KOSPI"),
    ("nifty", "Nifty 50 (Indien)", "^NSEI", "Asien", "NSE:NIFTY"),
    ("gold", "Gold", "GC=F", "Rohstoffe", "COMEX:GC1!"),
    ("silber", "Silber", "SI=F", "Rohstoffe", "COMEX:SI1!"),
    ("platin", "Platin", "PL=F", "Rohstoffe", "NYMEX:PL1!"),
    ("kupfer", "Kupfer", "HG=F", "Rohstoffe", "COMEX:HG1!"),
    ("oel", "Öl (WTI)", "CL=F", "Rohstoffe", "NYMEX:CL1!"),
    ("brent", "Öl (Brent)", "BZ=F", "Rohstoffe", "NYMEX:BB1!"),
    ("gas", "Erdgas", "NG=F", "Rohstoffe", "NYMEX:NG1!"),
    ("dxy", "US-Dollar-Index", "DX-Y.NYB", "Dollar & Zinsen", "TVC:DXY"),
    ("eurusd", "EUR/USD", "EURUSD=X", "Dollar & Zinsen", "FX:EURUSD"),
    ("tnx", "US-Zins 10 Jahre", "^TNX", "Dollar & Zinsen", "TVC:US10Y"),
    ("btc", "Bitcoin", "BTC-USD", "Krypto", "BITSTAMP:BTCUSD"),
    ("eth", "Ethereum", "ETH-USD", "Krypto", "BITSTAMP:ETHUSD"),
]
SEKTOREN = [
    ("XLE", "Energie"), ("XLU", "Versorger (Utilities)"), ("XLV", "Gesundheit (Health Care)"),
    ("XLB", "Rohstoffe (Materials)"), ("XLK", "Technologie"), ("XLC", "Kommunikation"),
    ("XLRE", "Immobilien (Real Estate)"), ("XLF", "Finanzen"), ("XLI", "Industrie"),
    ("XLY", "Zyklischer Konsum"), ("XLP", "Basiskonsum (Staples)"),
]
VOLA = ["^VIX", "^VVIX", "^VIX3M", "^VIX9D", "^IXIC"]
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
    "CPI Flash Estimate y/y": "Verbraucherpreise Eurozone (Schnellschätzung)",
    "Average Hourly Earnings m/m": "Stundenlöhne", "Prelim UoM Inflation Expectations": "Uni Michigan Inflationserwartung",
    "ISM Manufacturing Prices": "ISM Industrie Preise", "ISM Services Prices": "ISM Dienstleistung Preise",
    "Empire State Manufacturing Index": "Empire State Industrie", "Philly Fed Manufacturing Index": "Philly Fed Industrie",
    "Building Permits": "Baugenehmigungen", "Housing Starts": "Baubeginne", "Existing Home Sales": "Hausverkäufe (bestehend)",
    "New Home Sales": "Neubauverkäufe", "Pending Home Sales m/m": "Schwebende Hausverkäufe", "Durable Goods Orders m/m": "Auftragseingang langlebige Güter",
    "Core Durable Goods Orders m/m": "Kern-Auftragseingang langlebige Güter", "Trade Balance": "Handelsbilanz", "Industrial Production m/m": "Industrieproduktion",
    "Final Manufacturing PMI": "Einkaufsmanager Industrie (endgültig)", "Final Services PMI": "Einkaufsmanager Dienstleistung (endgültig)",
    "Revised UoM Consumer Sentiment": "Uni Michigan Verbraucherstimmung (revidiert)", "Revised UoM Inflation Expectations": "Uni Michigan Inflationserwartung (revidiert)",
    "Employment Cost Index q/q": "Arbeitskostenindex", "Natural Gas Storage": "Erdgas-Lagerbestände", "Treasury Currency Report": "Währungsbericht US-Finanzministerium",
    "Core CPI Flash Estimate y/y": "Kern-Verbraucherpreise Eurozone (Schnellschätzung)", "German Prelim GDP q/q": "BIP Deutschland (vorläufig)",
    "Fed Chair Speaks": "Rede Fed-Chef", "ECB President Speaks": "Rede EZB-Präsidentin", "FOMC Member Speaks": "Rede Fed-Mitglied",
    "German Factory Orders m/m": "Auftragseingang Industrie Deutschland", "German Industrial Production m/m": "Industrieproduktion Deutschland", "Bank Holiday": "Feiertag (Börse)",
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


def laden(tickers, period="5y"):
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


# Börsenschluss (deutsche Zeit) je Gruppe – vorher ist die heutige Tageskerze noch nicht geschlossen
SCHLUSS = {"USA": (22, 15), "Europa": (17, 45), "Asien": (8, 0), "Rohstoffe": (23, 15), "Sektoren": (22, 15),
           "Dollar & Zinsen": (23, 15)}
SCHLUSS_TICKER = {"^HSI": (9, 30), "^NSEI": (11, 15), "000001.SS": (8, 15)}  # Börsen mit späterem Schluss


def geschlossen(d, gruppe, ticker=None):
    """Nur geschlossene Tageskerzen behalten (zählt wie TradingView die Schlusskerzen)."""
    jetzt = dt.datetime.now(BERLIN)
    letzte = d.index[-1].date()
    if gruppe == "Krypto":  # Krypto-Tageskerze schließt um 0 Uhr UTC
        if letzte >= dt.datetime.now(dt.timezone.utc).date():
            return d.iloc[:-1]
        return d
    h, m = SCHLUSS_TICKER.get(ticker) or SCHLUSS.get(gruppe, (22, 15))
    if letzte == jetzt.date() and (jetzt.hour, jetzt.minute) < (h, m):
        return d.iloc[:-1]
    return d


def wochen(c, gruppe):
    """Wochenkerzen; die laufende Woche zählt erst, wenn sie geschlossen ist."""
    regel = "W-SUN" if gruppe == "Krypto" else "W-FRI"
    w = c.resample(regel).last().dropna()
    ende = w.index[-1].date()  # Freitag bzw. Sonntag der letzten Woche
    letzte = c.index[-1].date()
    if letzte < ende:  # Woche noch nicht fertig
        w = w.iloc[:-1]
    return w


def ma21(d, gruppe="USA", ticker=None):
    """Kurs, Veränderungen und Lage zum 21er EMA (Tag und Woche), nur geschlossene Kerzen."""
    roh = d
    d = geschlossen(d, gruppe, ticker)
    c = d["Close"]
    m = c.ewm(span=21, adjust=False).mean()
    w = wochen(c, gruppe)
    wm = w.ewm(span=21, adjust=False).mean()
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
        "ma": r(m.iloc[-1], 2), "abst": r((p / float(m.iloc[-1]) - 1) * 100),
        "tage": sd, "wochen": sw, "trend": trend, "dd": distribution(roh, gruppe=gruppe, ticker=ticker),
        "kerze": None if o is None or math.isnan(o) else ("grün" if p >= o else "rot"),
    }


def distribution(d, fenster=25, gruppe="USA", ticker=None):
    """D-Days genau wie im Indikator „Jens Rabe Academy – Indicator 1“:
    1. Schluss mind. 0,2 % unter dem Vortag, 2. Volumen höher als am Vortag, 3. Tageskerzen,
    4. die letzte geschlossene Wochenkerze liegt über dem 21er EMA (Woche) – sonst zählt nichts und die Anzeige ist 0.
    Gezählt werden die D-Days der letzten 25 Tageskerzen."""
    d = geschlossen(d, gruppe, ticker)
    c, v = d["Close"], d["Volume"]
    if float(v.iloc[-30:].fillna(0).sum()) <= 0:
        return None  # kein Volumen (z. B. Zinsen, Devisen) -> keine D-Days möglich
    w = c.resample("W-SUN" if gruppe == "Krypto" else "W-FRI").last().dropna()
    wema = w.ewm(span=21, adjust=False).mean()
    # wie im Indikator: Schluss der Vorwoche gegen den 21er EMA der laufenden Woche
    erlaubt_w = w.shift(1) > wema
    erlaubt = erlaubt_w.reindex(c.index, method="bfill").fillna(False).astype(bool)
    dday = (c < c.shift(1) * 0.998) & (v > v.shift(1)) & (v > 0) & erlaubt
    letzte = dday.iloc[-fenster:]
    tage = [i.strftime("%Y-%m-%d") for i, x in letzte.items() if x]
    jetzt_erlaubt = bool(erlaubt.iloc[-1])
    # Wie TradingView: Ab Montag beginnt eine neue Woche, auch wenn die erste Tageskerze noch läuft.
    # Dann entscheidet die zuletzt geschlossene Wochenkerze (Freitag) über dem 21er EMA.
    heute = dt.datetime.now(BERLIN).date()
    if (gruppe == "Krypto" or heute.weekday() < 5) and heute > w.index[-1].date():
        jetzt_erlaubt = bool(w.iloc[-1] > wema.iloc[-1])
    return {"anzahl": len(tage) if jetzt_erlaubt else 0, "tage": tage if jetzt_erlaubt else [],
            "erlaubt": jetzt_erlaubt}


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


def tv_chart(symbol, balken=5):
    """Letzte Tageskerzen eines Symbols direkt aus dem TradingView-Chart (Websocket, ohne Anmeldung)."""
    import random
    import string
    import websocket  # Paket websocket-client

    def rnd(prefix):
        return prefix + "".join(random.choice(string.ascii_lowercase) for _ in range(12))

    def paket(m, p):
        t = json.dumps({"m": m, "p": p}, separators=(",", ":"))
        return f"~m~{len(t)}~m~{t}"

    ws = websocket.create_connection(
        "wss://data.tradingview.com/socket.io/websocket?from=chart%2F&type=chart",
        header=[f"User-Agent: {UA['User-Agent']}"], origin="https://www.tradingview.com", timeout=20)
    cs = rnd("cs_")
    for m, p in [("set_auth_token", ["unauthorized_user_token"]),
                 ("chart_create_session", [cs, ""]),
                 ("resolve_symbol", [cs, "sds_sym_1", "=" + json.dumps({"symbol": symbol, "adjustment": "splits"})]),
                 ("create_series", [cs, "sds_1", "s1", "sds_sym_1", "1D", balken, ""])]:
        ws.send(paket(m, p))
    kerzen, ende = [], dt.datetime.now() + dt.timedelta(seconds=25)
    try:
        while dt.datetime.now() < ende:
            roh = ws.recv()
            for teil in roh.split("~m~"):
                if teil.startswith("~h~"):  # Herzschlag zurückschicken
                    ws.send(f"~m~{len(teil)}~m~{teil}")
                    continue
                if not teil.startswith("{"):
                    continue
                msg = json.loads(teil)
                if msg.get("m") in ("timescale_update", "du"):
                    pp = msg.get("p") or []
                    s1 = (pp[1] if len(pp) > 1 and isinstance(pp[1], dict) else {}).get("sds_1", {}).get("s", [])
                    for k in s1:
                        kerzen.append(k["v"])  # [Zeit, Open, High, Low, Close, Volumen]
                if msg.get("m") == "series_completed" and kerzen:
                    ende = dt.datetime.now()
                if msg.get("m") in ("symbol_error", "critical_error", "series_error"):
                    raise ValueError(f"TradingView: {msg.get('p')}")
    finally:
        ws.close()
    if not kerzen:
        raise ValueError("TradingView lieferte keine Kerzen")
    kerzen = sorted({k[0]: k for k in kerzen}.values())
    return kerzen


def mmfi():
    """MMFI = Percent of Stocks Above 50-Day Average (TradingView INDEX:MMFI), letzte geschlossene Tageskerze."""
    k = tv_chart("INDEX:MMFI", 130)
    heute_utc = dt.datetime.now(dt.timezone.utc).date()
    jetzt = dt.datetime.now(BERLIN)
    # laufende Tageskerze erst nach US-Schluss werten
    if len(k) > 1 and dt.datetime.fromtimestamp(k[-1][0], dt.timezone.utc).date() >= heute_utc and (jetzt.hour, jetzt.minute) < (22, 15):
        k = k[:-1]
    t = dt.datetime.fromtimestamp(k[-1][0], dt.timezone.utc).strftime("%Y-%m-%d")
    return {"wert": r(k[-1][4], 2), "vortag": r(k[-2][4], 2) if len(k) > 1 else None, "t": t,
            "verlauf": [r(x[4], 2) for x in k[-120:]],
            "tage": [dt.datetime.fromtimestamp(x[0], dt.timezone.utc).strftime("%Y-%m-%d") for x in k[-120:]],
            "quelle": "TradingView (INDEX:MMFI)"}


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


def termin(t):
    cal = yf.Ticker(t).calendar
    ed = cal.get("Earnings Date") if isinstance(cal, dict) else None
    if not ed:
        return None
    d = ed[0] if isinstance(ed, (list, tuple)) else ed
    return pd.Timestamp(d).date()


def earnings_gross(anzahl_us=60, anzahl_dax=15, tage=35):
    """Earnings der wichtigsten Werte (größte S&P-500- und DAX-Firmen nach Börsenwert) für diese Woche und die nächsten ~5 Wochen."""
    st = load("data/stocks.json", {}).get("indices", {})
    def groesste(idx, n):
        it = [x for x in st.get(idx, {}).get("items", []) if x.get("mc")]
        return sorted(it, key=lambda x: -x["mc"])[:n]
    liste = [(x, "USA") for x in groesste("spx", anzahl_us)] + [(x, "DAX") for x in groesste("dax", anzahl_dax)]
    heute = dt.date.today()
    out = []
    for x, markt in liste:
        try:
            d = termin(x["y"])
        except Exception:
            continue
        if d and heute - dt.timedelta(days=1) <= d <= heute + dt.timedelta(days=tage):
            out.append({"y": x["y"], "n": x.get("n") or x["y"], "markt": markt, "mc": r(x["mc"] / 1e9, 0),
                        "datum": d.isoformat(), "tage": (d - heute).days})
    out.sort(key=lambda e: (e["datum"], -(e["mc"] or 0)))
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
                try:
                    out.append({"k": k, "n": n, "y": y, "g": g, "tv": tv, **ma21(kurse[y], g, y)})
                except Exception as e:
                    fehler.append(f"{n}: {e}")
        return out

    def sektoren():
        out = []
        for y, n in SEKTOREN:
            if y in kurse:
                out.append({"y": y, "n": n, "tv": "AMEX:" + y, **ma21(kurse[y], "Sektoren")})
        return out

    def vola():
        v = geschlossen(kurse["^VIX"], "USA")
        c, h = float(v["Close"].iloc[-1]), float(v["High"].iloc[-1])
        out = {"vix": r(c), "vix_vortag": r(v["Close"].iloc[-2]), "vix_hoch": r(h), "t": v.index[-1].strftime("%Y-%m-%d"),
               "vix_verlauf": [r(x) for x in v["Close"].iloc[-30:].tolist()]}
        if "^VVIX" in kurse:
            vv = geschlossen(kurse["^VVIX"], "USA")["Close"]
            out.update(vvix=r(vv.iloc[-1]), vvix_vortag=r(vv.iloc[-2]))
        if "^VIX3M" in kurse:
            v3 = float(geschlossen(kurse["^VIX3M"], "USA")["Close"].iloc[-1])
            out.update(vix3m=r(v3), kurve="Contango" if c < v3 else "Backwardation", kurve_ratio=r(c / v3, 3))
        if "^VIX9D" in kurse:
            out["vix9d"] = r(geschlossen(kurse["^VIX9D"], "USA")["Close"].iloc[-1])
        out["umkehr"] = bool(h >= 20 and h - c >= 3)
        try:
            m = ma21(kurse["^VIX"], "USA", "^VIX")
            out["ma"] = {"tage": m["tage"], "wochen": m["wochen"], "abst": m["abst"]}
        except Exception as e:
            fehler.append(f"VIX 21er: {e}")
        return out

    def spy_extra():
        d = geschlossen(kurse["SPY"], "USA")
        hoch = float(d["High"].iloc[-252:].max())
        p = float(d["Close"].iloc[-1])
        return {"vom_hoch": r((p / hoch - 1) * 100), "hoch52": r(hoch),
                "dist_spx": distribution(kurse["^GSPC"]) if "^GSPC" in kurse else None,
                "dist_ndq": distribution(kurse["^IXIC"]) if "^IXIC" in kurse else None,
                "dist_spy": distribution(kurse["SPY"]),
                "dist_qqq": distribution(kurse["QQQ"]) if "QQQ" in kurse else None,
                "dist_dax": distribution(kurse["^GDAXI"], gruppe="Europa", ticker="^GDAXI") if "^GDAXI" in kurse else None}

    schritt("maerkte", maerkte)
    schritt("sektoren", sektoren)
    schritt("vola", vola)
    schritt("spy", spy_extra)
    schritt("fg", fear_greed)
    schritt("mmfi", mmfi)
    schritt("kalender", kalender)
    schritt("earnings", earnings)
    schritt("earnings_gross", earnings_gross)

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
    dist = (spy.get("dist_spx") or {}).get("anzahl", 0)
    hedging = [
        {"n": "SPY steigt und VIX steigt", "ja": (spym.get("d") or 0) > 0 and vix_steigt},
        {"n": "Fear & Greed über 80", "ja": fg.get("wert") is not None and fg["wert"] > 80},
        {"n": "Distribution Days S&P 500 ab 5", "ja": dist >= 5},
    ]
    contango = v.get("kurve") == "Contango"
    bub = spx.get("trend") == "Aufwärts" and contango and spym.get("kerze") == "grün"
    res["strategien"] = [
        {"n": "Brot & Butter", "info": "Short Put (Basiswert unter 100 $) bzw. Bull Put Spread (über 100 $), Delta 7–12 (variabel bis 20), hohe IV wenn möglich",
         "bedingungen": [
             {"n": "SPY grüne Tageskerze", "ok": spym.get("kerze") == "grün", "wert": spym.get("kerze") or "–"},
             {"n": "S&P 500 im Aufwärtstrend (21er Tag + Woche)", "ok": spx.get("trend") == "Aufwärts", "wert": spx.get("trend", "–")},
             {"n": "VIX-Kurve in Contango", "ok": contango, "wert": v.get("kurve", "–")},
         ]},
    ]
    for st in res["strategien"]:
        st["ok"] = all(b["ok"] for b in st["bedingungen"])
    res["checks"] = {
        "panik": panik, "hedging": hedging,
        "ampel": [
            {"n": "S&P 500 Trend (21er Tag + Woche)", "wert": spx.get("trend", "–"),
             "farbe": {"Aufwärts": "gruen", "Abwärts": "rot"}.get(spx.get("trend"), "gelb")},
            {"n": "VIX-Kurve", "wert": v.get("kurve", "–"), "farbe": "gruen" if contango else "rot"},
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
        def beste(z):
            b = max(sek, key=lambda s: s.get(z) if s.get(z) is not None else -1e9)
            sch = min(sek, key=lambda s: s.get(z) if s.get(z) is not None else 1e9)
            return {"n": b["n"], "y": b["y"], "wert": b.get(z), "schwach": sch["n"], "schwach_wert": sch.get(z)}
        res["beste_sektoren"] = {z: beste(z) for z in ("d", "w", "m")}
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
