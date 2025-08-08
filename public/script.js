<script>
// ==============================
// public/script.js — ÎNLOCUIEȘTE CODUL
// ==============================

(() => {
  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function setText(el, html) {
    if (!el) return;
    el.innerHTML = html;
  }

  function sanitize(str) {
    return String(str || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function makeEl(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v || {});
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) el.setAttribute(k, v);
    });
    if (text) el.textContent = text;
    return el;
  }

  function loading(on = true) {
    const btn = $("#generateBtn") || $("#genBtn") || $('button[data-role="generate"]');
    if (!btn) return;
    btn.disabled = !!on;
    btn.textContent = on ? "Se generează..." : "Generează analiza";
  }

  function toast(msg, type = "info") {
    const box = makeEl("div", { class: `fixed bottom-4 right-4 px-3 py-2 rounded-lg shadow text-sm ${type === "error" ? "bg-red-600 text-white" : "bg-black text-white"}` }, msg);
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3000);
  }

  // ---------- Elemente UI (folosește id-uri flexibile) ----------
  const input = $("#matchInput") || $("#meciInput") || $('input[name="match"]');
  const genBtn = $("#generateBtn") || $("#genBtn") || $('button[data-role="generate"]');
  const resultBox = $("#result") || $("#analysis") || $("#output");
  const srcBtnsWrap = $("#sourceButtons") || $("#sources") || $("#openers");
  const srcSummaryWrap = $("#sourceSummary") || $("#sourcesSummary") || makeEl("div", { id: "sourceSummary" });

  if (!$("#sourceSummary") && resultBox?.parentElement) {
    // dacă nu există container pentru rezumatul surselor, îl adăugăm sub header
    resultBox.parentElement.insertBefore(srcSummaryWrap, resultBox);
  }

  // ---------- Feedback (Bun/Slab) ----------
  function getHistoryKey(match, analysis) {
    return `lucyofm_feedback_${(match || "").toLowerCase()}_${(analysis || "").slice(0, 20)}`;
  }

  function renderFeedback(match, analysis) {
    const wrap = $("#feedbackWrap") || makeEl("div", { id: "feedbackWrap", class: "mt-2 flex gap-2 items-center" });
    const good = makeEl("button", { class: "px-3 py-1 rounded bg-emerald-600 text-white" }, "Bun");
    const bad = makeEl("button", { class: "px-3 py-1 rounded bg-rose-600 text-white" }, "Slab");

    const key = getHistoryKey(match, analysis);
    const prev = localStorage.getItem(key);
    if (prev === "good") good.classList.add("opacity-70");
    if (prev === "bad") bad.classList.add("opacity-70");

    good.addEventListener("click", () => {
      localStorage.setItem(key, "good");
      toast("Mulțumesc pentru feedback ✅");
      good.classList.add("opacity-70");
      bad.classList.remove("opacity-70");
    });
    bad.addEventListener("click", () => {
      localStorage.setItem(key, "bad");
      toast("Feedback înregistrat 👎");
      bad.classList.add("opacity-70");
      good.classList.remove("opacity-70");
    });

    wrap.replaceChildren(good, bad);
    if (resultBox?.parentElement) resultBox.parentElement.appendChild(wrap);
  }

  // ---------- Butoane „Deschide {Sursă}” ----------
  function renderOpenButtons(sources) {
    if (!srcBtnsWrap) return;
    const btnClass = "px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-white text-sm";
    srcBtnsWrap.innerHTML = "";

    const map = [
      ["SportyTrader", sources?.sportytrader?.url],
      ["Forebet", sources?.forebet?.url],
      ["PredictZ", sources?.predictz?.url],
      ["WinDrawWin", sources?.windrawwin?.url],
    ];

    map.forEach(([label, url]) => {
      const btn = makeEl("button", { class: btnClass, disabled: !url }, `Deschide ${label}`);
      btn.addEventListener("click", () => url && window.open(url, "_blank"));
      srcBtnsWrap.appendChild(btn);
    });
  }

  // ---------- Rezumat surse (sub analiză) ----------
  function summarizeSources(sources) {
    const s = sources || {};
    const badges = [];

    if (s.sportytrader?.picks?.length) badges.push("✅ SportyTrader: are predicții");
    else if (s.sportytrader) badges.push("⚠️ SportyTrader: date limitate");

    if (s.predictz?.picks?.length) badges.push("✅ PredictZ: are predicții");
    else if (s.predictz) badges.push("⚠️ PredictZ: date limitate");

    if (s.forebet?.picks?.length || s.forebet?.odds?.length) badges.push("✅ Forebet: predicții/cote");
    else if (s.forebet) badges.push("⚠️ Forebet: date limitate");

    if (s.windrawwin?.picks?.length || s.windrawwin?.form?.length) badges.push("✅ WinDrawWin: predicții/formă");
    else if (s.windrawwin) badges.push("⚠️ WinDrawWin: date limitate");

    if (!badges.length) return "Surse: date indisponibile sau blocate.";
    return badges.join(" · ");
  }

  function renderSourceSummary(sources) {
    if (!srcSummaryWrap) return;
    const line = summarizeSources(sources);
    setText(srcSummaryWrap, `<div class="mt-2 text-xs text-slate-300">📎 ${line}</div>`);
  }

  // ---------- Afișare analiză ----------
  function renderAnalysis(text) {
    if (!resultBox) return;
    const safe = sanitize(text).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // păstrăm liniuțele și listele lizibile
    const html = safe
      .split("\n")
      .map((ln) => (ln.match(/^\s*\d+\)/) ? `<div class="mb-1"><strong>${ln.slice(0, ln.indexOf(")")+1)}</strong>${ln.slice(ln.indexOf(")")+1)}</div>` : `<div>${ln}</div>`))
      .join("");
    resultBox.innerHTML = `<div class="whitespace-pre-wrap leading-relaxed text-slate-200">${html}</div>`;
  }

  // ---------- Cerere către /api/chat ----------
  async function requestAnalysis(match) {
    const payload = { match: match };
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Eroare ${res.status}`);
    }
    return res.json();
  }

  async function onGenerate() {
    const raw = input?.value || "";
    const match = sanitize(raw);
    if (!match) {
      toast("Scrie meciul în format „Gazdă - Oaspeți” sau slug/link.", "error");
      input && input.focus();
      return;
    }

    try {
      loading(true);
      setText(resultBox, "");
      setText(srcSummaryWrap, "");
      if (srcBtnsWrap) srcBtnsWrap.innerHTML = "";

      const data = await requestAnalysis(match);
      const analysis = data?.analysis || "Nu am reușit să generez analiza.";
      renderAnalysis(analysis);
      renderOpenButtons(data?.sources);
      renderSourceSummary(data?.sources);
      renderFeedback(match, analysis);
    } catch (e) {
      toast(e.message || "Eroare la generare", "error");
    } finally {
      loading(false);
    }
  }

  // ---------- Evenimente ----------
  if (genBtn) genBtn.addEventListener("click", onGenerate);
  if (input) {
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") onGenerate();
    });
  }

  // Pre-populare: dacă există un query ?m= în URL, îl folosim
  const urlParams = new URLSearchParams(window.location.search);
  const m = urlParams.get("m");
  if (m && input) {
    input.value = m;
    setTimeout(onGenerate, 100);
  }
})();
</script>
