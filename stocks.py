"""Holt Kurse aller Aktien aus DAX, MDAX, TecDAX, Euro Stoxx 50, S&P 500, Nasdaq 100 und Dow Jones
und speichert sie in data/stocks.json für den Bayazit Coin-Scanner.
Läuft automatisch über GitHub Actions (.github/workflows/stocks.yml)."""
import datetime as dt
import io
import json
import math
import os
import re
import time

import pandas as pd
import requests
import yfinance as yf

UA = {"User-Agent": "Mozilla/5.0 (compatible; bayazit-coin-scanner/1.0)"}
OUT = "data/stocks.json"
MCAP = "data/mcap.json"

INDICES = {
    "dax":    {"name": "DAX 40",        "wiki": "https://en.wikipedia.org/wiki/DAX",    "suffix": ".DE", "bench": "^GDAXI",   "cur": "€"},
    "mdax":   {"name": "MDAX",          "wiki": "https://en.wikipedia.org/wiki/MDAX",   "suffix": ".DE", "bench": "^MDAXI",   "cur": "€"},
    "tecdax": {"name": "TecDAX",        "wiki": "https://en.wikipedia.org/wiki/TecDAX", "suffix": ".DE", "bench": "^TECDAX",  "cur": "€"},
    "sx5e":   {"name": "Euro Stoxx 50", "wiki": None,                                   "suffix": None,  "bench": "^STOXX50E", "cur": "€"},
    "hsi":    {"name": "Hang Seng · Top 50", "wiki": None, "suffix": None, "bench": "^HSI",  "cur": "HK$", "static": "HSI"},
    "nky":    {"name": "Nikkei 225 · Top 50", "wiki": None, "suffix": None, "bench": "^N225", "cur": "¥",   "static": "NKY"},
    "kospi":  {"name": "KOSPI · Top 30",  "wiki": None, "suffix": None, "bench": "^KS11", "cur": "₩",   "static": "KOSPI"},
    "spx":    {"name": "S&P 500",       "wiki": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", "alt": "https://www.slickcharts.com/sp500", "suffix": "", "bench": "^GSPC", "cur": "$"},
    "ndx":    {"name": "Nasdaq 100",    "wiki": "https://en.wikipedia.org/wiki/Nasdaq-100", "alt": "https://www.slickcharts.com/nasdaq100", "suffix": "", "bench": "^NDX", "cur": "$"},
    "dow":    {"name": "Dow Jones 30",  "wiki": "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average", "alt": "https://www.slickcharts.com/dowjones", "suffix": "", "bench": "^DJI", "cur": "$"},
}

# Euro Stoxx 50 fest hinterlegt (Yahoo-Kürzel), Stand Mitte 2026
SX5E = """ASML.AS|ASML;SAP.DE|SAP;MC.PA|LVMH;SIE.DE|Siemens;TTE.PA|TotalEnergies;ALV.DE|Allianz;SU.PA|Schneider Electric;
SAN.PA|Sanofi;OR.PA|L'Oréal;DTE.DE|Deutsche Telekom;AIR.PA|Airbus;IBE.MC|Iberdrola;SAN.MC|Banco Santander;UCG.MI|UniCredit;
ISP.MI|Intesa Sanpaolo;RMS.PA|Hermès;BNP.PA|BNP Paribas;SAF.PA|Safran;MUV2.DE|Munich Re;EL.PA|EssilorLuxottica;CS.PA|AXA;
PRX.AS|Prosus;ITX.MC|Inditex;AI.PA|Air Liquide;RACE.MI|Ferrari;RHM.DE|Rheinmetall;DB1.DE|Deutsche Börse;ENEL.MI|Enel;
IFX.DE|Infineon;BBVA.MC|BBVA;INGA.AS|ING;MBG.DE|Mercedes-Benz;BMW.DE|BMW;BAS.DE|BASF;DG.PA|Vinci;ADYEN.AS|Adyen;
AD.AS|Ahold Delhaize;BN.PA|Danone;ENI.MI|Eni;STLAM.MI|Stellantis;SGO.PA|Saint-Gobain;NOKIA.HE|Nokia;NDA-FI.HE|Nordea;
WKL.AS|Wolters Kluwer;DHL.DE|DHL Group;VOW3.DE|Volkswagen;BAYN.DE|Bayer;ABI.BR|AB InBev;ENR.DE|Siemens Energy;DBK.DE|Deutsche Bank"""


# Dow Jones als Ersatz, falls Wikipedia keine Liste liefert
DOW = """AAPL|Apple;AMGN|Amgen;AMZN|Amazon;AXP|American Express;BA|Boeing;CAT|Caterpillar;CRM|Salesforce;CSCO|Cisco;CVX|Chevron;
DIS|Disney;GS|Goldman Sachs;HD|Home Depot;HON|Honeywell;IBM|IBM;JNJ|Johnson & Johnson;JPM|JPMorgan Chase;KO|Coca-Cola;
MCD|McDonald's;MMM|3M;MRK|Merck & Co.;MSFT|Microsoft;NKE|Nike;NVDA|Nvidia;PG|Procter & Gamble;SHW|Sherwin-Williams;
TRV|Travelers;UNH|UnitedHealth;V|Visa;VZ|Verizon;WMT|Walmart"""

# TecDAX als Ersatz, falls Wikipedia keine Liste liefert (Stand Mitte 2026, ohne Gewähr)
TECDAX = """AIXA.DE|Aixtron;BC8.DE|Bechtle;AFX.DE|Carl Zeiss Meditec;DTE.DE|Deutsche Telekom;EUZ.DE|Eckert & Ziegler;ELG.DE|Elmos;
EVT.DE|Evotec;FNTN.DE|Freenet;HAG.DE|Hensoldt;IFX.DE|Infineon;IOS.DE|Ionos;JEN.DE|Jenoptik;KTN.DE|Kontron;NEM.DE|Nemetschek;
NDX1.DE|Nordex;QIA.DE|Qiagen;SAP.DE|SAP;SRT3.DE|Sartorius;SHL.DE|Siemens Healthineers;S92.DE|SMA Solar;WAF.DE|Siltronic;
SMHN.DE|Suss MicroTec;TMV.DE|TeamViewer;UTDI.DE|United Internet;1U1.DE|1&1;AOF.DE|Atoss Software;COK.DE|Cancom;
DRW3.DE|Drägerwerk;GFT.DE|GFT Technologies"""


# Asien: größte Werte fest hinterlegt (Yahoo-Kürzel), Stand Mitte 2026, ohne Gewähr
HSI = """0700.HK|Tencent;9988.HK|Alibaba;3690.HK|Meituan;1299.HK|AIA;0005.HK|HSBC;0939.HK|China Construction Bank;1398.HK|ICBC;
3988.HK|Bank of China;0941.HK|China Mobile;1810.HK|Xiaomi;9618.HK|JD.com;2318.HK|Ping An;0388.HK|HKEX;1211.HK|BYD;0883.HK|CNOOC;
0857.HK|PetroChina;0386.HK|Sinopec;9999.HK|NetEase;9888.HK|Baidu;1024.HK|Kuaishou;2020.HK|Anta Sports;0027.HK|Galaxy Entertainment;
1928.HK|Sands China;0016.HK|Sun Hung Kai Properties;1113.HK|CK Asset;0001.HK|CK Hutchison;0002.HK|CLP;0003.HK|HK & China Gas;
0006.HK|Power Assets;0066.HK|MTR;0823.HK|Link REIT;2628.HK|China Life;2382.HK|Sunny Optical;0981.HK|SMIC;1088.HK|China Shenhua;
0688.HK|China Overseas Land;1109.HK|China Resources Land;2331.HK|Li Ning;0291.HK|China Resources Beer;2319.HK|Mengniu;
0669.HK|Techtronic;0175.HK|Geely;2015.HK|Li Auto;9868.HK|XPeng;9961.HK|Trip.com;1876.HK|Budweiser APAC;0267.HK|CITIC;
0762.HK|China Unicom;2269.HK|WuXi Biologics;0012.HK|Henderson Land"""
NKY = """7203.T|Toyota;6758.T|Sony;8306.T|Mitsubishi UFJ;6861.T|Keyence;9984.T|SoftBank Group;8035.T|Tokyo Electron;9983.T|Fast Retailing;
6098.T|Recruit;4063.T|Shin-Etsu Chemical;8316.T|Sumitomo Mitsui;6501.T|Hitachi;9432.T|NTT;9433.T|KDDI;4502.T|Takeda;
8058.T|Mitsubishi Corp;8001.T|Itochu;8031.T|Mitsui & Co;7974.T|Nintendo;6367.T|Daikin;6857.T|Advantest;6954.T|Fanuc;7267.T|Honda;
6902.T|Denso;4568.T|Daiichi Sankyo;4519.T|Chugai Pharma;8766.T|Tokio Marine;8411.T|Mizuho;6981.T|Murata;7741.T|Hoya;6594.T|Nidec;
6273.T|SMC;4661.T|Oriental Land;7011.T|Mitsubishi Heavy;6503.T|Mitsubishi Electric;6702.T|Fujitsu;6752.T|Panasonic;4543.T|Terumo;
2914.T|Japan Tobacco;3382.T|Seven & i;8801.T|Mitsui Fudosan;8802.T|Mitsubishi Estate;9020.T|JR East;9022.T|JR Central;
5108.T|Bridgestone;7751.T|Canon;6971.T|Kyocera;6762.T|TDK;4503.T|Astellas;8053.T|Sumitomo Corp;7733.T|Olympus"""
KOSPI = """005930.KS|Samsung Electronics;000660.KS|SK Hynix;373220.KS|LG Energy Solution;207940.KS|Samsung Biologics;
005380.KS|Hyundai Motor;000270.KS|Kia;068270.KS|Celltrion;035420.KS|Naver;105560.KS|KB Financial;055550.KS|Shinhan Financial;
005490.KS|POSCO Holdings;012330.KS|Hyundai Mobis;035720.KS|Kakao;006400.KS|Samsung SDI;051910.KS|LG Chem;028260.KS|Samsung C&T;
032830.KS|Samsung Life;012450.KS|Hanwha Aerospace;329180.KS|HD Hyundai Heavy;086790.KS|Hana Financial;015760.KS|KEPCO;
066570.KS|LG Electronics;017670.KS|SK Telecom;034020.KS|Doosan Enerbility;009540.KS|HD Korea Shipbuilding;138040.KS|Meritz Financial;
316140.KS|Woori Financial;003550.KS|LG Corp;034730.KS|SK Inc;010130.KS|Korea Zinc"""


def parse_static(txt):
    return [{"y": a.strip(), "n": b.strip(), "sec": ""} for a, b in (p.split("|") for p in txt.replace("\n", "").split(";"))]


def clean(x):
    return re.sub(r"\[.*?\]", "", str(x)).strip()


def wiki_members(url, suffix):
    html = requests.get(url, headers=UA, timeout=30).text
    best = None
    try:  # Wikipedia markiert die aktuelle Zusammensetzung meist mit id="constituents"
        tables = pd.read_html(io.StringIO(html), attrs={"id": "constituents"})
    except Exception:
        tables = pd.read_html(io.StringIO(html))
    for t in tables:
        cols = {c: " ".join(map(str, c)).lower() if isinstance(c, tuple) else str(c).lower() for c in t.columns}
        tc = next((c for c, l in cols.items() if "ticker" in l or l.startswith("symbol")), None)
        nc = next((c for c, l in cols.items() if any(k in l for k in ("company", "security", "name"))), None)
        sc = next((c for c, l in cols.items() if "sector" in l or "industry" in l), None)
        if tc is not None and nc is not None and len(t) >= 20 and (best is None or len(t) > len(best[0])):
            best = (t, tc, nc, sc)
    if best is None:
        raise ValueError("keine passende Tabelle")
    t, tc, nc, sc = best
    out, seen = [], set()
    for _, r in t.iterrows():
        tk = clean(r[tc]).split()[0] if clean(r[tc]) else ""
        if not tk:
            continue
        if suffix == "":
            tk = tk.replace(".", "-")
        elif suffix and "." not in tk:
            tk = tk + suffix
        if tk not in seen:
            seen.add(tk)
            out.append({"y": tk, "n": clean(r[nc]), "sec": clean(r[sc]) if sc is not None else ""})
    return out


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def num(x, d=2):
    return None if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))) else round(float(x), d)


def main():
    old = load_json(OUT, {"indices": {}})
    members = {}
    for k, ix in INDICES.items():
        try:
            if k == "sx5e":
                members[k] = parse_static(SX5E)
            elif ix.get("static"):
                members[k] = parse_static(globals()[ix["static"]])
            else:
                try:
                    members[k] = wiki_members(ix["wiki"], ix["suffix"])
                except Exception as e:
                    print(k, "Wikipedia:", e)
                    members[k] = []
                need0 = {"dow": 28, "ndx": 90, "spx": 450}.get(k)
                if need0 and len(members[k]) < need0 and ix.get("alt"):
                    print(k, "Wikipedia lieferte", len(members[k]), "Werte, versuche Ersatzquelle")
                    members[k] = wiki_members(ix["alt"], ix["suffix"])
            need = {"tecdax": 25, "dow": 28, "ndx": 90, "spx": 450, "dax": 38, "mdax": 45}.get(k, 10)
            if len(members[k]) < need:
                raise ValueError(f"nur {len(members[k])} Werte")
            print(k, len(members[k]), "Werte")
        except Exception as e:
            print(k, "Wikipedia fehlgeschlagen:", e)
            members[k] = [{"y": s["y"], "n": s["n"], "sec": s.get("sec", "")} for s in old.get("indices", {}).get(k, {}).get("items", [])]
            fb = {"tecdax": TECDAX, "dow": DOW}.get(k)
            if fb and len(members[k]) < 10:
                members[k] = [{"y": a, "n": b, "sec": ""} for a, b in (p.split("|") for p in fb.replace("\n", "").split(";"))]

    tickers = sorted({m["y"] for v in members.values() for m in v} | {ix["bench"] for ix in INDICES.values()})
    closes, vols = {}, {}
    for i in range(0, len(tickers), 150):
        chunk = tickers[i:i + 150]
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
        time.sleep(1)

    # Börsenwert einmal täglich
    today = dt.date.today().isoformat()
    mc = load_json(MCAP, {"date": "", "v": {}})
    if mc.get("date") != today:
        vals = {}
        for t in tickers:
            if t.startswith("^"):
                continue
            try:
                fi = yf.Ticker(t).fast_info
                v = getattr(fi, "market_cap", None)
                if not v:
                    try:
                        v = fi["marketCap"]
                    except Exception:
                        v = None
                if v:
                    vals[t] = float(v)
            except Exception:
                pass
        if len(vals) > len(mc.get("v", {})) * 0.5:
            mc = {"date": today, "v": vals}
            os.makedirs("data", exist_ok=True)
            with open(MCAP, "w", encoding="utf-8") as f:
                json.dump(mc, f)

    def perf(c, back):
        return (c.iloc[-1] / c.iloc[-1 - back] - 1) * 100 if len(c) > back else (c.iloc[-1] / c.iloc[0] - 1) * 100

    result = {"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "indices": {}}
    for k, ix in INDICES.items():
        b = closes.get(ix["bench"])
        bench = {"d": num(perf(b, 1)), "w": num(perf(b, 5)), "m": num(perf(b, 21))} if b is not None else {}
        items = []
        for m in members[k]:
            c = closes.get(m["y"])
            if c is None:
                continue
            p = c.iloc[-1]
            v = vols[m["y"]].iloc[-1]
            items.append({"y": m["y"], "n": m["n"], "sec": m["sec"], "p": num(p, 4), "d": num(perf(c, 1)), "w": num(perf(c, 5)),
                          "m": num(perf(c, 21)), "mc": num(mc["v"].get(m["y"]), 0), "v": num(p * v if v == v else None, 0),
                          "spark": [num(x, 4) for x in c.iloc[-22:].tolist()]})
        result["indices"][k] = {"name": ix["name"], "cur": ix["cur"], "bench": bench, "items": items}
        print(k, len(items), "mit Kursen")

    if sum(len(v["items"]) for v in result["indices"].values()) < 50:
        print("Zu wenige Kurse, alte Datei bleibt bestehen.")
        return
    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))


WORLD = [  # Indizes, die TradingView auf fremden Seiten nicht anzeigen darf -> eigene Kurse von Yahoo
    {"k": "kospi", "n": "KOSPI", "r": "Südkorea", "y": "^KS11", "tv": "KRX:KOSPI"},
    {"k": "hsi", "n": "Hang Seng", "r": "Hongkong", "y": "^HSI", "tv": "HSI:HSI"},
    {"k": "nifty", "n": "Nifty 50", "r": "Indien", "y": "^NSEI", "tv": "NSE:NIFTY"},
    {"k": "asx", "n": "ASX 200", "r": "Australien", "y": "^AXJO", "tv": "ASX:XJO"},
    {"k": "bist", "n": "BIST 100", "r": "Türkei", "y": "XU100.IS", "tv": "BIST:XU100"},
]


def world():
    df = yf.download([w["y"] for w in WORLD], period="45d", interval="1d", group_by="ticker",
                     auto_adjust=False, threads=True, progress=False)
    items = []
    for w in WORLD:
        try:
            c = df[w["y"]]["Close"].dropna()
        except Exception:
            continue
        if len(c) < 2:
            continue
        perf = lambda back: (c.iloc[-1] / c.iloc[-1 - back] - 1) * 100 if len(c) > back else None
        items.append({**w, "p": num(c.iloc[-1]), "d": num(perf(1)), "w": num(perf(5)), "m": num(perf(21)),
                      "t": c.index[-1].strftime("%Y-%m-%d")})
    print("Welt-Indizes:", len(items))
    if items:
        os.makedirs("data", exist_ok=True)
        with open("data/world.json", "w", encoding="utf-8") as f:
            json.dump({"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "items": items},
                      f, ensure_ascii=False, separators=(",", ":"))


def etf_flows():
    """Tägliche Netto-Zuflüsse der US-Bitcoin-Spot-ETFs (Mio. $) von SoSoValue.
    Braucht den kostenlosen API-Schlüssel als GitHub-Secret SOSO_API_KEY."""
    key = os.environ.get("SOSO_API_KEY", "").strip()
    if not key:
        print("ETF: kein SOSO_API_KEY hinterlegt")
        return []
    hdr = {"x-soso-api-key": key, "Content-Type": "application/json", "User-Agent": "bayazit-coin-scanner"}
    tries = [
        ("GET", "https://openapi.sosovalue.com/openapi/v1/etfs/summary-history", {"symbol": "BTC", "country_code": "US", "limit": 60}),
        ("POST", "https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart", {"type": "us-btc-spot"}),
    ]
    for method, url, args in tries:
        try:
            r = requests.get(url, headers=hdr, params=args, timeout=40) if method == "GET" else \
                requests.post(url, headers=hdr, json=args, timeout=40)
            j = r.json()
        except Exception as e:
            print("ETF", url, "Fehler:", repr(e)[:150])
            continue
        data = j.get("data") if isinstance(j, dict) else j
        if isinstance(data, dict):
            data = next((v for v in data.values() if isinstance(v, list)), data.get("list"))
        print("ETF", url, "Status", r.status_code, "Antwort:", str(j)[:300])
        if not isinstance(data, list) or not data:
            continue
        out = {}
        for it in data:
            if not isinstance(it, dict):
                continue
            dk = next((k for k in it if k.lower() in ("date", "data_date", "datadate", "trade_date", "tradedate")), None)
            fk = next((k for k in it if "inflow" in k.lower() and "net" in k.lower() and "cum" not in k.lower()), None)
            if not dk or not fk or it[fk] is None:
                continue
            d = str(it[dk])
            if d.isdigit() and len(d) >= 10:  # Zeitstempel
                d = dt.datetime.fromtimestamp(int(d[:10]), dt.timezone.utc).strftime("%Y-%m-%d")
            d = d[:10]
            try:
                out[d] = round(float(it[fk]) / 1e6, 1)  # in Mio. $
            except (TypeError, ValueError):
                continue
        if out:
            return sorted(out.items())[-90:]
    return []


def macro():
    """VIX, Dollar-Index und ETF-Flüsse für den Krypto-Stimmungsindex."""
    res = {"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")}
    df = yf.download(["^VIX", "DX-Y.NYB"], period="200d", interval="1d", group_by="ticker",
                     auto_adjust=False, threads=True, progress=False)
    for key, t in (("vix", "^VIX"), ("dxy", "DX-Y.NYB")):
        try:
            c = df[t]["Close"].dropna()
            res[key] = [[i.strftime("%Y-%m-%d"), num(v)] for i, v in c.items()]
        except Exception as e:
            print(key, "fehlgeschlagen:", e)
    old = load_json("data/macro.json", {})
    last = old.get("etf_at")
    fresh = last and (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(last)).total_seconds() < 20 * 3600
    if fresh and old.get("etf"):
        res["etf"], res["etf_at"] = old["etf"], last
        print("ETF: Stand von", last, "noch aktuell, kein neuer Abruf")
    else:
        try:
            res["etf"] = [list(x) for x in etf_flows()]
            print("ETF-Tage:", len(res["etf"]))
            if res["etf"]:
                res["etf_at"] = res["updated"]
        except Exception as e:
            print("ETF-Flüsse fehlgeschlagen:", e)
    for k in ("vix", "dxy", "etf", "etf_at"):  # bei Ausfall alten Stand behalten
        if not res.get(k) and old.get(k):
            res[k] = old[k]
    os.makedirs("data", exist_ok=True)
    with open("data/macro.json", "w", encoding="utf-8") as f:
        json.dump(res, f, separators=(",", ":"))


def perps():
    """Aktien-Perpetuals auf OKX, BingX und Bitunix (für das ⚡ in den Aktien-Tabellen)."""
    import re
    ua = {"User-Agent": "Mozilla/5.0"}
    res = {"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "okx": {}, "bingx": {}, "bitunix": {}}
    crypto = set()
    # OKX kennzeichnet Aktien sauber (instCategory 3)
    try:
        j = requests.get("https://www.okx.com/api/v5/public/instruments?instType=SWAP", headers=ua, timeout=30).json()
        for x in j.get("data", []):
            b = x["instId"].split("-")[0].upper()
            if str(x.get("instCategory")) == "3":
                res["okx"][b] = x["instId"]
            else:
                crypto.add(b)
        print("OKX Aktien-Perps:", len(res["okx"]), "z. B.", list(res["okx"].items())[:8])
    except Exception as e:
        print("OKX fehlgeschlagen:", repr(e)[:200])
    try:  # Krypto-Kürzel von Binance zum Aussortieren
        j = requests.get("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=1", headers=ua, timeout=30).json()
        crypto |= {str(c.get("symbol", "")).upper() for c in j if isinstance(c, dict)}
    except Exception:
        pass

    def norm(b):
        b = b.upper()
        b = re.sub(r"^(NCSK|NCSI|NCCO|NCFX|NCS)", "", b)
        b = re.sub(r"\d*USDT?$", "", b) if len(b) > 5 else b
        return b

    # Nur Kürzel zulassen, die zu einer Aktie aus den Index-Listen gehören (oder OKX als Aktie führt)
    stockset = set(res["okx"])
    st = load_json(OUT, {})
    for ix in (st.get("indices") or {}).values():
        for it in ix.get("items", []):
            y = str(it.get("y", "")).upper()
            if "." not in y:
                stockset.add(y.replace("-", ""))
            first = re.split(r"[\s.,&]+", str(it.get("n", "")))[0].upper()
            if len(first) >= 4:
                stockset.add(first)

    def keep(b, raw):
        stocky = raw != b or bool(re.search(r"(STOCK|XSTOCK)$", raw))
        return b in stockset and (stocky or b not in crypto)

    try:
        j = requests.get("https://open-api.bingx.com/openApi/swap/v2/quote/contracts", headers=ua, timeout=30).json()
        data = j.get("data", []) if isinstance(j, dict) else []
        odd = []
        for x in data:
            sym = str(x.get("symbol", ""))
            raw = sym.split("-")[0].upper()
            b = norm(raw)
            if keep(b, raw):
                res["bingx"][b] = sym
            if b in stockset or any(t in raw for t in ("TSLA", "NVDA", "AAPL", "SOFTBANK", "SFTB")):
                odd.append(sym + ("" if keep(b, raw) else " (Krypto?)"))
        print("BingX Kontrakte:", len(data), "als Aktie erkannt:", len(res["bingx"]), "Treffer:", odd[:40])
    except Exception as e:
        print("BingX fehlgeschlagen:", repr(e)[:200])
    try:
        j = requests.get("https://fapi.bitunix.com/api/v1/futures/market/trading_pairs", headers=ua, timeout=30).json()
        data = j.get("data", []) if isinstance(j, dict) else []
        odd = []
        for x in data:
            sym = str(x.get("symbol", ""))
            raw = str(x.get("base") or re.sub(r"USDT$", "", sym)).upper()
            b = norm(raw)
            if keep(b, raw):
                res["bitunix"][b] = sym
            if b in stockset or any(t in raw for t in ("TSLA", "NVDA", "AAPL", "SOFTBANK", "SFTB")):
                odd.append(sym + ("" if keep(b, raw) else " (Krypto?)"))
        print("Bitunix Kontrakte:", len(data), "als Aktie erkannt:", len(res["bitunix"]), "Treffer:", odd[:40])
    except Exception as e:
        print("Bitunix fehlgeschlagen:", repr(e)[:200])
    old = load_json("data/perps.json", {})
    for k in ("okx",):
        if not res[k] and old.get(k):
            res[k] = old[k]
    os.makedirs("data", exist_ok=True)
    with open("data/perps.json", "w", encoding="utf-8") as f:
        json.dump(res, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
    for fn in (world, macro, perps):
        try:
            fn()
        except Exception as e:
            print(fn.__name__, "fehlgeschlagen:", e)
