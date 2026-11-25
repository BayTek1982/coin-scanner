/* Bayazit · gemeinsame Navigationsleiste für alle Scanner-Seiten.
   PC: Reihe aus Knöpfen mit Symbol, die aktuelle Seite hervorgehoben.
   Handy (< 760 px): „← Scanner“, Name der aktuellen Seite und ein Knopf „☰ Menü“, der alle Seiten als Kacheln aufklappt.
   Einbau: <script src="nav.js?v=1" defer></script>; die Leiste ersetzt die alte Zeile „header .label“
   oder füllt ein Element mit id="bnav". Neue Seite? Unten in ITEMS eintragen. */
(function () {
  const ITEMS = [
    ["index", "index.html", "₿", "Scanner"],
    ["golden-zone", "golden-zone.html", "◎", "Golden Zone & SK"],
    ["futures", "futures.html", "📊", "Futures & Lagebild"],
    ["live", "https://chart.kompassapps.de/", "📈", "Live-Chart"],
    ["bubbles", "bubbles.html", "🫧", "Blasen"],
    ["renditen", "renditen.html", "%", "Renditen"],
    ["zyklus", "zyklus.html", "🌀", "Zyklus-Kompass"],
    ["powerlaw", "powerlaw.html", "π", "Power Law + Pi"],
    ["markt", "https://markt.kompassapps.de/", "↗", "Markt"]
  ];
  const page = location.pathname.split("/").pop().replace(".html", "") || "index";
  const CSS = `.bnav{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 6px}
.bnav a,.bnav button{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;border:1px solid var(--line,#253041);background:var(--panel,#151c27);color:var(--fg,#e7ecf3);font:600 .8rem var(--f-body,system-ui),system-ui,sans-serif;text-decoration:none;white-space:nowrap;cursor:pointer;transition:border-color .15s,background .15s,transform .15s;letter-spacing:0;text-transform:none}
.bnav a:hover,.bnav button:hover{border-color:var(--accent,#f0a33a);transform:translateY(-1px)}
.bnav a i,.bnav button i{font-style:normal;display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--chip,#1d2633);font-size:.78rem;line-height:1}
.bnav a.on{background:var(--accent,#f0a33a);border-color:var(--accent,#f0a33a);color:var(--accent-ink,#1a1206)}
.bnav a.on i{background:rgba(0,0,0,.15)}
.bnav .ext{opacity:.55;font-size:.7rem}
.bnav .mb{display:none}
@media (max-width:760px){
  .bnav{flex-wrap:nowrap}
  .bnav .it{display:none}
  .bnav .mb{display:inline-flex}
  .bnav .cur{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font:700 .82rem var(--f-body,system-ui),system-ui,sans-serif;color:var(--muted,#8d99ab)}
  .bnav.open{flex-wrap:wrap}
  .bnav.open .grid{display:grid}
}
.bnav .grid{display:none;grid-template-columns:1fr 1fr;gap:6px;width:100%;margin-top:4px}
.bnav .grid a{justify-content:flex-start;border-radius:12px;padding:10px 12px}
@media (min-width:761px){.bnav .grid,.bnav .cur{display:none!important}}`;

  function build() {
    const cur = ITEMS.find(i => i[0] === page) || ITEMS[0];
    const link = (it, cls) => {
      const ext = /^https?:/.test(it[1]);
      return `<a class="${cls}${it[0] === page ? " on" : ""}" href="${it[1]}"${it[0] === page ? ' aria-current="page"' : ""}><i>${it[2]}</i>${it[3]}${ext ? '<span class="ext">↗</span>' : ""}</a>`;
    };
    const nav = document.createElement("nav");
    nav.className = "bnav";
    nav.setAttribute("aria-label", "Bereiche");
    nav.innerHTML =
      (page !== "index" ? `<a class="mb" href="index.html"><i>←</i>Scanner</a>` : "") +
      `<span class="mb cur">${cur[2]} ${cur[3]}</span>` +
      `<button class="mb" type="button" aria-expanded="false" data-m="1"><i>☰</i>Menü</button>` +
      ITEMS.map(it => link(it, "it")).join("") +
      `<div class="grid">${ITEMS.map(it => link(it, "")).join("")}</div>`;
    nav.querySelector("[data-m]").addEventListener("click", e => {
      const o = nav.classList.toggle("open");
      e.currentTarget.setAttribute("aria-expanded", o ? "true" : "false");
    });
    return nav;
  }
  function mount() {
    if (document.querySelector(".bnav")) return;
    if (!document.getElementById("bnavCss")) { const s = document.createElement("style"); s.id = "bnavCss"; s.textContent = CSS; document.head.appendChild(s); }
    const slot = document.getElementById("bnav"), lab = document.querySelector("header .label");
    const nav = build();
    if (slot) slot.replaceWith(nav);
    else if (lab) { const h = lab.closest("header"); h.parentNode.insertBefore(nav, h); lab.remove(); }
    else { const h = document.querySelector("header"); if (h) h.parentNode.insertBefore(nav, h); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
