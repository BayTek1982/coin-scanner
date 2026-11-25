/* Bayazit · Anzeige & Farben für alle Scanner-Seiten (wie im Live-Chart):
   Grundthema (Auto, Hell, Dunkel, Mitternacht, Grau, Schwarz, Sepia), Helligkeit und einzelne Farben.
   Gilt für alle Seiten gleich, gespeichert nur auf diesem Gerät (localStorage "bayTheme").
   Im <head> laden (ohne defer), damit nichts aufblitzt. Knopf: Element mit id="themeBtn".
   Seiten hören auf das Ereignis "baytheme" (z. B. TradingView-Fenster, Canvas neu zeichnen). */
(function () {
  const KEY = "bayTheme";
  const PRESETS = {
    mitternacht: { dark: 1, bg: "#0a1230", panel: "#111b40", line: "#22305e", chip: "#18234d", fg: "#e3e9ff", muted: "#8f9cc8" },
    grau: { dark: 1, bg: "#1c1d20", panel: "#26282c", line: "#36383d", chip: "#2e3035", fg: "#e9e9ea", muted: "#9a9ca3" },
    schwarz: { dark: 1, bg: "#000000", panel: "#0f0f12", line: "#222228", chip: "#18181c", fg: "#f2f2f2", muted: "#8c8c94" },
    sepia: { dark: 0, bg: "#f5eedf", panel: "#fbf6ea", line: "#ddd2bb", chip: "#e9dfc9", fg: "#2b2418", muted: "#6f6450" }
  };
  const BASE = {
    dark: { bg: "#0e131b", panel: "#151c27", line: "#253041", chip: "#1d2633" },
    light: { bg: "#f3f5f8", panel: "#ffffff", line: "#dde2ea", chip: "#e8ecf2" }
  };
  const THEMES = [["auto", "Auto"], ["hell", "Hell"], ["dunkel", "Dunkel"], ["mitternacht", "Mitternacht"], ["grau", "Grau"], ["schwarz", "Schwarz"], ["sepia", "Sepia"]];
  const COLORS = [["bg", "Hintergrund"], ["panel", "Kästen"], ["fg", "Schrift"], ["muted", "Schrift blass"], ["accent", "Akzent"], ["up", "Steigend"], ["down", "Fallend"]];

  let st;
  try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { st = null; }
  if (!st || typeof st !== "object") st = {};
  // alter Hell/Dunkel-Knopf der Startseite
  try { const o = localStorage.getItem("bcsTheme"); if (o && !st.t) st.t = o === "dark" ? "dunkel" : "hell"; } catch (e) {}
  st.t = st.t || "auto"; st.br = +st.br || 0; st.c = st.c || {};

  const sysDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
  const baseDark = () => PRESETS[st.t] ? !!PRESETS[st.t].dark : st.t === "dunkel" || (st.t === "auto" && sysDark());
  const hx = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHx = a => "#" + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const shade = (h, f) => { const c = hx(h); if (!c || !f) return h; return toHx(c.map(v => f > 0 ? v + (255 - v) * f : v * (1 + f))); };
  const lum = h => { const c = hx(h); return c ? (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 : 0; };

  function vars() {
    const bd = baseDark(), p = PRESETS[st.t] || {}, b = BASE[bd ? "dark" : "light"], f = st.br / 100, c = st.c;
    const any = p.bg || f;
    const v = {};
    if (any) { v.bg = shade(p.bg || b.bg, f); v.panel = shade(p.panel || b.panel, f); v.line = shade(p.line || b.line, f); v.chip = shade(p.chip || b.chip, f); }
    if (p.fg) { v.fg = p.fg; v.muted = p.muted; }
    for (const k of Object.keys(c)) if (hx(c[k])) v[k] = c[k];
    return v;
  }
  function isDark() { const v = vars(); return v.bg ? lum(v.bg) < .5 : baseDark(); }

  function apply() {
    const h = document.documentElement, bd = baseDark(), v = vars(), s = h.style;
    h.classList.toggle("dk", bd && st.t !== "auto");
    h.classList.toggle("lt", !bd && st.t !== "auto");
    const set = (k, val) => val ? s.setProperty(k, val) : s.removeProperty(k);
    set("--bg", v.bg); set("--panel", v.panel); set("--line", v.line); set("--chip", v.chip);
    set("--fg", v.fg); set("--muted", v.muted); set("--up", v.up); set("--down", v.down);
    set("--accent", v.accent); set("--gold", v.accent);
    s.colorScheme = isDark() ? "dark" : "light";
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = v.bg || (bd ? "#0e131b" : "#f3f5f8");
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); localStorage.removeItem("bcsTheme"); } catch (e) {}
    apply();
    dispatchEvent(new CustomEvent("baytheme", { detail: { dark: isDark() } }));
  }
  apply();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (st.t === "auto") save(); });

  const CSS = `#bayThMenu{position:fixed;z-index:99998;width:min(320px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;background:var(--panel,#151c27);color:var(--fg,#e7ecf3);border:1px solid var(--line,#253041);border-radius:12px;padding:12px 14px;box-shadow:0 12px 36px rgba(0,0,0,.35);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
#bayThMenu .ch{display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:6px}
#bayThMenu .ch button{background:none;border:0;color:inherit;font-size:16px;cursor:pointer}
#bayThMenu .cs{margin:10px 0 6px;font-size:12px;color:var(--muted,#8d99ab);text-transform:uppercase;letter-spacing:.06em}
#bayThMenu .cs b{color:var(--fg)}
#bayThMenu .cp{display:flex;flex-wrap:wrap;gap:6px}
#bayThMenu .cp button{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:8px;border:1px solid var(--line,#253041);background:var(--chip,#1d2633);color:inherit;font:inherit;font-size:13px;cursor:pointer}
#bayThMenu .cp button.on{border-color:var(--accent,#f0a33a);box-shadow:0 0 0 1px var(--accent,#f0a33a) inset}
#bayThMenu .cp i{width:14px;height:14px;border-radius:50%;border:1px solid rgba(128,128,128,.5);display:inline-block}
#bayThMenu .cr{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
#bayThMenu .cr input{flex:1}
#bayThMenu .cg{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#bayThMenu .cg label{display:flex;align-items:center;gap:6px;font-size:13px;padding:4px 6px;border-radius:8px;background:var(--chip,#1d2633);cursor:pointer}
#bayThMenu .cg label.set{box-shadow:0 0 0 1px var(--accent,#f0a33a) inset}
#bayThMenu .cg input[type=color]{width:26px;height:22px;border:0;padding:0;background:none;cursor:pointer}
#bayThMenu .cg button{margin-left:auto;background:none;border:0;color:var(--muted);cursor:pointer}
#bayThMenu .crs{margin-top:12px;width:100%;padding:8px;border-radius:8px;border:1px solid var(--line);background:none;color:inherit;font:inherit;cursor:pointer}
#bayThMenu .nt{margin-top:8px;font-size:11.5px;color:var(--muted)}`;

  function cur(k) {
    const v = vars(); if (v[k]) return v[k];
    const g = getComputedStyle(document.documentElement).getPropertyValue("--" + k).trim();
    return hx(g) ? g : (isDark() ? "#8d99ab" : "#5d6878");
  }
  function menu(btn) {
    let m = document.getElementById("bayThMenu");
    if (m) { m.remove(); return; }
    if (!document.getElementById("bayThCss")) { const s = document.createElement("style"); s.id = "bayThCss"; s.textContent = CSS; document.head.appendChild(s); }
    m = document.createElement("div"); m.id = "bayThMenu"; document.body.appendChild(m);
    const sw = k => PRESETS[k] ? PRESETS[k].bg : k === "hell" ? "#fff" : k === "dunkel" ? "#0e131b" : "linear-gradient(90deg,#fff 50%,#0e131b 50%)";
    const draw = () => {
      m.innerHTML = `<div class="ch">Anzeige &amp; Farben <button data-x="1" title="Schließen">✕</button></div>
<div class="cs">Grundthema</div><div class="cp">${THEMES.map(([k, t]) => `<button data-th="${k}" class="${st.t === k ? "on" : ""}"><i style="background:${sw(k)}"></i>${t}</button>`).join("")}</div>
<div class="cs">Helligkeit <b>${st.br > 0 ? "+" : ""}${st.br}</b></div><div class="cr"><span>dunkler</span><input type="range" min="-60" max="60" step="5" value="${st.br}" data-br="1"><span>heller</span></div>
<div class="cs">Einzelne Farben</div><div class="cg">${COLORS.map(([k, t]) => `<label class="${st.c[k] ? "set" : ""}"><input type="color" data-c="${k}" value="${cur(k)}"><span>${t}</span>${st.c[k] ? `<button data-r="${k}" title="Zurück auf Standard">↺</button>` : ""}</label>`).join("")}</div>
<button class="crs" data-reset="1">Alles zurücksetzen</button>
<div class="nt">Gilt für Scanner, Golden Zone, Futures und die anderen Scanner-Seiten. Wird nur auf diesem Gerät gespeichert. Auto = wie dein Handy/PC.</div>`;
    };
    draw();
    const r = btn.getBoundingClientRect();
    if (innerWidth < 600) { m.style.left = "8px"; m.style.right = "8px"; m.style.bottom = "8px"; }
    else { m.style.top = Math.min(r.bottom + 8, innerHeight - m.offsetHeight - 8) + "px"; m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + "px"; }
    m.addEventListener("click", e => {
      e.stopPropagation(); const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.x) { m.remove(); return; }
      if (t.dataset.th) { st.t = t.dataset.th; save(); draw(); return; }
      if (t.dataset.r) { e.preventDefault(); delete st.c[t.dataset.r]; save(); draw(); return; }
      if (t.dataset.reset) { st = { t: "auto", br: 0, c: {} }; save(); draw(); }
    });
    m.addEventListener("input", e => {
      const t = e.target;
      if (t.dataset.br) { st.br = +t.value; save(); m.querySelector(".cs b").textContent = (st.br > 0 ? "+" : "") + st.br; return; }
      if (t.dataset.c) { st.c[t.dataset.c] = t.value; save(); t.closest("label").classList.add("set"); }
    });
    m.addEventListener("change", e => { if (e.target.dataset.c) draw(); });
    setTimeout(() => document.addEventListener("pointerdown", function cl(e) {
      if (!m.isConnected) { document.removeEventListener("pointerdown", cl); return; }
      if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { m.remove(); document.removeEventListener("pointerdown", cl); }
    }), 0);
  }
  function wire() { const b = document.getElementById("themeBtn"); if (b && !b._bt) { b._bt = 1; b.addEventListener("click", e => { e.preventDefault(); menu(b); }); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();

  window.BayTheme = { isDark, apply, vars };
})();
