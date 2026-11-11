/* Bayazit · dezente ⓘ-Infos: woher die Daten kommen und wie gerechnet wird.
   - Hängt ein kleines ⓘ an Überschriften, deren Text mit einem Schlüssel unten beginnt.
   - Jedes Element mit data-it="Text" zeigt beim Antippen ebenfalls die Info (z. B. Kästchen auf Karten).
   Texte: einfach unten im passenden Seiten-Block ändern. */
(function () {
  const PAGES = {
    index: {
      "Bayazit Coin-Scanner": "Krypto: Rangliste, Marktkapitalisierung und Umlauf kommen von CoinGecko. Kurse und 24-Std.-Werte kommen live von Binance (Spot), wenn ein Coin dort fehlt von OKX. Kerzen für RSI, Trend usw. ebenfalls von Binance bzw. OKX.\n\nAktien: Kurse von Yahoo Finance. Ein Ablauf auf GitHub holt sie werktags alle 30 Minuten (ca. 7–22 Uhr), den Russell 2000 alle 2 Stunden. Risiko und Hitze werden 1× täglich nachts neu berechnet.\n\nAlles läuft in deinem Browser, ohne Anmeldung. Deine Einstellungen und die Watchlist werden nur auf diesem Gerät gespeichert.",
      "Eigener Filter": "Filtert die Coin-Liste nach deinen Bedingungen (z. B. Kursänderung, RSI, Volumen, Risiko). Alle Werte werden aus den Binance-/OKX-Kerzen in deinem Browser berechnet. Die Einstellungen bleiben auf diesem Gerät gespeichert.",
      "TradingView-Watchlist": "Die Kürzel sind so aufgebaut, dass du sie in TradingView als Watchlist importieren kannst (Börse:Kürzel). Die Liste entsteht aus der aktuell gefilterten Tabelle.",
      "Welt-Überblick": "Die großen Indizes der Welt (USA, Europa, Asien) mit Schlusskursen von Yahoo Finance, alle 30 Min. über GitHub geholt.\n\nTag = Änderung zum Vortag, Woche = zu vor 5 Handelstagen, Monat = zu vor 21 Handelstagen.",
      "Weitere Märkte": "Rohstoffe, Anleihen, Währungen usw. Schlusskurse von Yahoo Finance (über GitHub, alle 30 Min.). Änderungen wie oben: Tag, 5 und 21 Handelstage.",
      "Index im Detail": "Alle Mitglieder des gewählten Index (DAX, MDAX, TecDAX, Euro Stoxx 50, S&P 500, Nasdaq 100, Dow Jones, Russell 2000). Die Mitgliederlisten holt GitHub automatisch von Wikipedia (Ersatz Slickcharts, Russell 2000 aus der iShares-ETF-Liste), die Kurse kommen von Yahoo Finance.\n\nRisiko (0–1): ln(Kurs ÷ 257-Tage-Schnitt). 0,5 = Kurs genau auf dem Schnitt, 0 = tiefster Wert der ganzen Geschichte, 1 = höchster Wert der letzten 10 Jahre.\nHitze: Kurs ÷ 20-Wochen-Schnitt. Die Farbstufen richten sich nach der eigenen Geschichte der Aktie.",
      "TradingView-Watchlist Aktien": "Kürzel im Format Börse:Kürzel zum Import in TradingView, erzeugt aus der aktuellen Aktien-Liste.",
      "Krypto-Stimmung": "Eigener Index von 0 (Angst) bis 100 (Gier) aus 10 Werten. Jeder Wert wird auf 0–100 umgerechnet und gewichtet gemittelt, z. B.:\n• Funding BTC/ETH (Binance)\n• Open-Interest-Änderung 24 Std. (Binance)\n• Long/Short-Verhältnis (Binance)\n• Liquidationen (halbes Gewicht)\n• RSI und Volatilität (1,5-faches Gewicht)\n• ETF-Flüsse BTC (SoSoValue, 1× täglich über GitHub)\n• VIX und Dollar-Index (Yahoo Finance)\n\nTippe auf einen einzelnen Wert für seine genaue Rechnung.",
      "🐋 Wale live": "Live-Verbindung (WebSocket) direkt zu Binance, Coinbase, OKX und Bybit. Gezeigt werden einzelne Trades über der eingestellten Größe in US-Dollar.\n\nKauf/Verkauf = wer zum Marktpreis aggressiv gekauft bzw. verkauft hat. Gezählt wird erst ab dem Öffnen der Seite, es gibt keinen Rückblick.",
      "Spot gegen Futures": "Volumen Spot und Futures (24 Std.) von Binance, Open Interest von Binance Futures.\n\nFutures/Spot = Futures-Volumen ÷ Spot-Volumen. Unter 3× = Spot-getrieben, 3–8× = normal, über 8× = stark von Hebel getrieben.",
      "Hyperliquid": "Daten direkt von der Hyperliquid-Schnittstelle: Kurs, 24-Std.-Änderung, Volumen, Open Interest (in Dollar = Kontrakte × Kurs), Funding und maximaler Hebel.",
      "Liquidationen live": "Live-Verbindung zu Binance Futures (Zwangsschließungen). Long-Liquidation = gehebelte Käufer wurden rausgeworfen (Kurs fiel), Short-Liquidation = gehebelte Verkäufer (Kurs stieg). Gezählt wird ab dem Öffnen der Seite.",
      "Funding Rate": "Funding-Raten aller Binance-Perpetuals (alle 8 Std. fällig). Positiv = Longs zahlen an Shorts, negativ = umgekehrt. Aufs Jahr gerechnet entspricht das der Rate × 3 × 365.",
      "Liquidationskarte": "Eigene Schätzung, keine echten Positionsdaten. Für jede Stunde der letzten ca. 20 Tage: Wie viel Open Interest kam neu dazu (Binance) und zu welchem Kurs? Daraus werden Long- und Short-Positionen mit 10×, 25×, 50× und 100× Hebel angenommen und ihr Liquidationspreis berechnet. Wo sich viele stapeln, ist die Karte heller.",
      "Stablecoins": "Daten von DefiLlama: Umlauf aller an den US-Dollar gekoppelten Stablecoins, Änderung zu gestern, vor 1 Woche und vor 1 Monat. Steigender Umlauf = neues Geld kommt in den Kryptomarkt.",
      "Blockchains": "Wohin fließt das Geld? Die Coins jeder Blockchain im Durchschnitt, gewichtet nach Marktkapitalisierung (CoinGecko). Das gebundene Kapital (TVL) kommt von DefiLlama."
    },
    "golden-zone": {
      "h1": "Krypto: Top 100 nach Marktkapitalisierung (CoinGecko). Kerzen von Binance, Ersatz OKX, ausgewertet in deinem Browser.\nAktien: Ergebnis eines GitHub-Ablaufs, der werktags stündlich alle Aktien mit Kerzen von Yahoo Finance auswertet.\nFutures-Zeile auf den Karten: Binance Futures (Long/Short, Funding, Open Interest).\n\nGenaue Regeln für Golden Zone und SK-System: oben „ⓘ Wie es funktioniert“.",
      "Wie es funktioniert": "Krypto: Kerzen von Binance (bis 1000 Stück, Ersatz OKX mit 300) werden in deinem Browser ausgewertet.\nAktien: Kerzen von Yahoo Finance. Ein Ablauf auf GitHub rechnet werktags stündlich (ca. 7–22 Uhr) alle ca. 780 Aktien durch, die Seite lädt nur das Ergebnis.\n\nHochs und Tiefs (Pivots): Eine Kerze ist ein Hoch, wenn links und rechts davon je X Kerzen tiefer liegen (X je Zeitrahmen).",
      "◎ Golden Zone": "Fibonacci von der letzten gültigen Bewegung (Tief → Hoch bei Long, Hoch → Tief bei Short).\nGolden Zone = 0,618 bis 0,786 der Bewegung. 0,5er = halbe Korrektur. TP1 = 1,272, TP2 = 1,618 der Bewegung (über das Hoch hinaus).\nUngültig, sobald der Kurs unter den Start der Bewegung (1,0) fällt.\n\nKorrektur % = wie weit der Kurs von der Bewegung schon zurückgelaufen ist.",
      "SK-System": "Nach deinen Regeln (Stefan Kassing): Struktur 0-A-B-C. B muss mindestens 50 % von 0→A korrigieren.\nEinstiege E1–E4 bei 50 / 55,9 / 61,8 / 66,7 % von B→C, Stopp bei 78,6 % (88,6 % als zweites Level).\nZiele 161,8 % und 200 % von 0→A, gemessen ab 0.",
      "📈 Aktien": "Aktien aus DAX, MDAX, TecDAX, Euro Stoxx 50, S&P 500, Nasdaq 100, Dow Jones, dazu Indizes und Gold. Kerzen von Yahoo Finance (1h, 4h aus 1h zusammengebaut, 1D, 1W). Die Auswertung macht ein Ablauf auf GitHub, werktags stündlich.\n\nEarnings: nächster Termin laut Yahoo Finance, 1× täglich. „(ca.)“ = noch nicht angekündigt, geschätzt als letzter Termin + 1 Quartal.\n\nIV: erwartete Jahresschwankung, selbst aus Geld/Brief-Kursen der At-the-Money-Optionen mit ca. 30 Tagen Laufzeit berechnet (Black-Scholes), 1× täglich während der US-Börsenzeit.\nIVP: an wie viel % der gesammelten Tage (bis 1 Jahr) die IV niedriger war als heute. Wird seit November 2026 gesammelt, angezeigt ab 20 Tagen."
    },
    futures: {
      "Futures-Positionierung": "Alle Daten direkt von Binance Futures (öffentliche Schnittstelle, live beim Öffnen):\n• Crowd = Long/Short-Verhältnis aller Konten\n• Top-Trader = Long/Short der größten Konten (nach Positionsgröße)\n• Open Interest = offene Kontrakte in Dollar und Änderung\n• Funding = aktuelle Rate je 8 Std.\n• Taker = Verhältnis aggressiver Käufe zu Verkäufen\n\nDazu Stablecoins (DefiLlama), Marktdaten (CoinGecko) und Fear & Greed (alternative.me). Die Signale und das Briefing werden aus diesen Werten in deinem Browser abgeleitet.",
      "So liest du es": "Crowd und Top-Trader gegeneinander: Liegen die großen Konten anders als die Masse, ist das oft das bessere Signal. Steigender Open Interest bei steigendem Kurs = neues Geld bestätigt den Trend. Stark positives Funding = viele gehebelte Longs, Gefahr eines Long-Squeezes."
    },
    chart: {
      "h1": "Kerzen: Krypto live von Binance (Ersatz OKX), Aktien von Yahoo Finance (über GitHub, werktags stündlich aktualisiert).\nAlle Indikatoren, Zonen und die Bot-Analyse werden in deinem Browser aus diesen Kerzen berechnet. Einstellungen, Profile und Zeichnungen bleiben nur auf diesem Gerät.\n\nDie Rechnung jedes Indikators steht bei seinem ⓘ in der Liste.",
      "Indikatoren": "Kerzen: Krypto von Binance (bis 1000 Stück, Ersatz OKX mit 300), Aktien von Yahoo Finance (über GitHub, werktags stündlich).\nEuro-Umrechnung: Kurs von Frankfurter (EZB-Referenzkurse), Ersatz open.er-api.com.\nRisiko und Hitze: wie im Scanner (Risiko = ln(Kurs ÷ Jahresschnitt), Hitze = Kurs ÷ 20-Wochen-Schnitt).\n\nAlle Indikatoren werden in deinem Browser berechnet. Tippe beim einzelnen Indikator auf sein ⓘ für die genaue Rechnung."
    }
  };

  const path = location.pathname.split("/").pop().replace(".html", "") || "index";
  const T = PAGES[path] || {};

  const css = document.createElement("style");
  css.textContent = `.it-b{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;margin-left:7px;padding:0;border:1px solid currentColor;border-radius:50%;background:none;color:inherit;opacity:.38;font:italic 600 10px/1 Georgia,serif;cursor:pointer;vertical-align:middle;letter-spacing:0;text-transform:none}
.it-b:hover,.it-b:focus-visible{opacity:.85;outline:none}
[data-it]:not(.it-b){cursor:help}
.it-pop{position:fixed;z-index:99999;max-width:min(360px,calc(100vw - 20px));padding:11px 13px;border-radius:10px;background:#1c2230;color:#e8ecf3;font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-style:normal;font-weight:400;letter-spacing:0;text-transform:none;white-space:pre-line;box-shadow:0 8px 28px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08)}`;
  document.head.appendChild(css);

  let pop = null, owner = null;
  function close() { if (pop) { pop.remove(); pop = null; owner = null; } }
  function show(el, text) {
    if (owner === el) { close(); return; }
    close();
    pop = document.createElement("div");
    pop.className = "it-pop";
    pop.setAttribute("role", "tooltip");
    pop.textContent = text;
    (el.closest("dialog[open]") || document.body).appendChild(pop);
    owner = el;
    const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let x = Math.min(Math.max(10, r.left + r.width / 2 - w / 2), innerWidth - w - 10);
    let y = r.bottom + 8;
    if (y + h > innerHeight - 10) y = Math.max(10, r.top - h - 8);
    pop.style.left = x + "px";
    pop.style.top = y + "px";
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-it]");
    if (el) { e.preventDefault(); e.stopPropagation(); show(el, el.getAttribute("data-it")); return; }
    if (pop && !e.target.closest(".it-pop")) close();
  }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  addEventListener("scroll", close, { passive: true });

  function apply() {
    const keys = Object.keys(T);
    if (!keys.length) return;
    document.querySelectorAll("h1,h2,h3").forEach(h => {
      if (h.querySelector(".it-b")) return;
      const txt = h.textContent.replace(/\s+/g, " ").trim();
      const k = h.tagName === "H1" && T.h1 ? "h1" : keys.find(k => k !== "h1" && txt.startsWith(k));
      if (!k) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "it-b";
      b.textContent = "i";
      b.setAttribute("aria-label", "Info: Datenquelle und Berechnung");
      b.setAttribute("data-it", T[k]);
      h.appendChild(b);
    });
  }
  window.BayInfo = { apply, texts: T };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply); else apply();
  setTimeout(apply, 1500);
})();
