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
    "spx":    {"name": "S&P 500",       "wiki": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", "suffix": "", "bench": "^GSPC", "cur": "$"},
    "ndx":    {"name": "Nasdaq 100",    "wiki": "https://en.wikipedia.org/wiki/Nasdaq-100", "suffix": "", "bench": "^NDX", "cur": "$"},
    "dow":    {"name": "Dow Jones 30",  "wiki": "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average", "suffix": "", "bench": "^DJI", "cur": "$"},
}

# Euro Stoxx 50 fest hinterlegt (Yahoo-Kürzel), Stand Mitte 2026
SX5E = """ASML.AS|ASML;SAP.DE|SAP;MC.PA|LVMH;SIE.DE|Siemens;TTE.PA|TotalEnergies;ALV.DE|Allianz;SU.PA|Schneider Electric;
SAN.PA|Sanofi;OR.PA|L'Oréal;DTE.DE|Deutsche Telekom;AIR.PA|Airbus;IBE.MC|Iberdrola;SAN.MC|Banco Santander;UCG.MI|UniCredit;
ISP.MI|Intesa Sanpaolo;RMS.PA|Hermès;BNP.PA|BNP Paribas;SAF.PA|Safran;MUV2.DE|Munich Re;EL.PA|EssilorLuxottica;CS.PA|AXA;
PRX.AS|Prosus;ITX.MC|Inditex;AI.PA|Air Liquide;RACE.MI|Ferrari;RHM.DE|Rheinmetall;DB1.DE|Deutsche Börse;ENEL.MI|Enel;
IFX.DE|Infineon;BBVA.MC|BBVA;INGA.AS|ING;MBG.DE|Mercedes-Benz;BMW.DE|BMW;BAS.DE|BASF;DG.PA|Vinci;ADYEN.AS|Adyen;
AD.AS|Ahold Delhaize;BN.PA|Danone;ENI.MI|Eni;STLAM.MI|Stellantis;SGO.PA|Saint-Gobain;NOKIA.HE|Nokia;NDA-FI.HE|Nordea;
WKL.AS|Wolters Kluwer;DHL.DE|DHL Group;VOW3.DE|Volkswagen;BAYN.DE|Bayer;ABI.BR|AB InBev;ENR.DE|Siemens Energy;DBK.DE|Deutsche Bank"""


def clean(x):
    return re.sub(r"\[.*?\]", "", str(x)).strip()


def wiki_members(url, suffix):
    html = requests.get(url, headers=UA, timeout=30).text
    best = None
    for t in pd.read_html(io.StringIO(html)):
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
                members[k] = [{"y": a, "n": b, "sec": ""} for a, b in (p.split("|") for p in SX5E.replace("\n", "").split(";"))]
            else:
                members[k] = wiki_members(ix["wiki"], ix["suffix"])
            print(k, len(members[k]), "Werte")
        except Exception as e:
            print(k, "Wikipedia fehlgeschlagen:", e)
            members[k] = [{"y": s["y"], "n": s["n"], "sec": s.get("sec", "")} for s in old.get("indices", {}).get(k, {}).get("items", [])]

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
                v = yf.Ticker(t).fast_info.get("market_cap")
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


if __name__ == "__main__":
    main()
