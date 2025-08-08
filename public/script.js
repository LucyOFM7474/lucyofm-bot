// public/script.js
// Front-end: parsează meciul, deschide SportyTrader, apelează /api/chat și afișează rezultatul.

(function () {
  // === Helpers ===
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Caută elementele existente; dacă lipsesc, le creez (ca să nu depindem strict de IDs).
  let input = $("#matchInput") || $("input[name='match']") || $("input[type='text']") || null;
  let btn = $("#generateBtn") || $$("button").find(b => /genereaz/.test((b.textContent || "").toLowerCase())) || null;
  let resultBox = $("#result") || $("#resultBox") || null;
  let sourcesBar = $("#sourcesBar") || null;

  // Dacă nu există container de „Rezultat”, îl creez sub primul .panel sau în body.
  function ensureUI() {
    // sources bar
    if (!sourcesBar) {
      sourcesBar = document.createElement("div");
      sourcesBar.id = "sourcesBar";
      const anchor = $(".panel") || document.body;
      anchor.appendChild(sourcesBar);
    }
    // result box
    if (!resultBox) {
      resultBox = document.createElement("div");
      resultBox.id = "result";
      const title = document.createElement("div");
      title.className = "section-title";
      title.textContent = "Rezultat";
      const anchor = $(".panel") || document.body;
      anchor.appendChild(title);
      anchor.appendChild(resultBox);
    }
    // input + buton
    if (!input) {
      input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Exemplu: Korona Kielce - Radomiak";
      input.className = "input";
      const anchor = $(".panel") || document.body;
      const row = document.createElement("div");
      row.className = "input-row";
      row.appendChild(input);
      anchor.insertBefore(row, anchor.firstChild);
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Generează analiza";
      const row = input.closest(".input-row") || input.parentElement || document.body;
      row.appendChild(btn);
    }
  }

  ensureUI();

  function setLoading(on) {
    if (btn) {
      btn.disabled = !!on;
      btn.textContent = on ? "Se generează..." : "Generează analiza";
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showInfo(msg) {
    resultBox.innerHTML = `<div class="info">${escapeHtml(msg)}</div>`;
  }

  function showError(msg) {
    resultBox.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
  }

  // Suport „-”, „–”, „—”, cu spații sau fără
  function parseMatch(text) {
    if (!text) return { home: "", away: "" };
    const parts = String(text).split(/\s*[-–—]\s*/g).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return { home: "", away: "" };
    return { home: parts[0], away: parts.slice(1).join(" - ") };
  }

  async function fetchSportyLink(home, away) {
    const url = `/api/fetchSources?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.ok) {
      throw new Error(data?.error || `fetchSources ${r.status}`);
    }
    return data; // { ok, url, formatted, source }
  }

  function renderSourcesBar(sporty) {
    sourcesBar.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.gap = "8px";
    wrap.style.flexWrap = "wrap";

    if (sporty?.url) {
      const a = document.createElement("a");
      a.href = sporty.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Deschide SportyTrader";
      a.className = "btn btn-secondary";
      wrap.appendChild(a);
    }

    sourcesBar.appendChild(wrap);
  }

  async function callChatAPI({ home, away, sources }) {
    const r = await fetch(`/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        home,
        away,
        query: `${home} - ${away}`,
        sources
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `Chat API ${r.status}`);
    return data;
  }

  function renderResult(text) {
    resultBox.innerHTML = `<pre class="result-pre">${escapeHtml(text)}</pre>`;
    resultBox.scrollTop = 0;
  }

  async function handleGenerate() {
    try {
      const raw = (input?.value || "").trim();
      const { home, away } = parseMatch(raw);
      if (!home || !away) {
        showError("Completează echipele în formatul: Gazdă - Oaspeți (ex.: Korona Kielce - Radomiak).");
        return;
      }

      setLoading(true);
      showInfo("Pregătesc sursele...");

      // SportyTrader
      let sporty = null;
      try {
        sporty = await fetchSportyLink(home, away);
      } catch (e) {
        // nu blocăm analiza dacă linkul nu iese
        console.warn("SportyTrader link error:", e);
      }
      renderSourcesBar(sporty);

      // Chat API (analiza)
      showInfo("Generez analiza în 10 puncte...");
      const data = await callChatAPI({
        home,
        away,
        sources: { sportytrader: sporty?.url || null }
      });

      const text = data?.content || data?.result || JSON.stringify(data, null, 2);
      renderResult(text);
    } catch (err) {
      console.error(err);
      showError(err.message || "Eroare necunoscută.");
    } finally {
      setLoading(false);
    }
  }

  // Hook UI
  btn.addEventListener("click", handleGenerate);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleGenerate();
  });
})();
