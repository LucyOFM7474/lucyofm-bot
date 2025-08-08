// public/script.js
// Logica UI: parsează meciul, cheamă sursele externe și pornește analiza.
// Presupune existența elementelor cu ID-urile: matchInput, generateBtn, result, sourcesBar (opțional).

(function () {
  const $ = (id) => document.getElementById(id);

  const input = $("matchInput") || document.querySelector("input[name='match']") || document.querySelector("#match");
  const btn = $("generateBtn") || document.querySelector("[data-action='generate']");
  const resultBox = $("result") || document.querySelector("#resultBox") || document.querySelector(".result");
  const sourcesBar = $("sourcesBar") || document.querySelector("#sources");

  const BOT_URL = (window.BOT_URL || "").trim(); // opțional; dacă există înlined
  const API_BASE = "";

  function setLoading(on) {
    if (btn) btn.disabled = !!on;
    if (btn) btn.textContent = on ? "Se generează..." : "Generează analiza";
  }

  function showError(msg) {
    if (!resultBox) return alert(msg);
    resultBox.innerHTML = `<div style="color:#ff8a80">Eroare: ${escapeHtml(msg)}</div>`;
  }

  function showInfo(msg) {
    if (!resultBox) return;
    resultBox.innerHTML = `<div style="opacity:.9">${escapeHtml(msg)}</div>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Parsează „Gazdă - Oaspeți”, suportă -, – și —
  function parseMatch(text) {
    if (!text) return { home: "", away: "" };
    const parts = String(text)
      .split(/\s*[-–—]\s*/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) return { home: "", away: "" };
    const home = parts[0];
    const away = parts.slice(1).join(" - "); // dacă există alte „-” în nume
    return { home, away };
  }

  async function fetchSportyLink(home, away) {
    const url = `${API_BASE}/api/fetchSources?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
    const r = await fetch(url);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data?.error || `fetchSources ${r.status}`);
    }
    return r.json(); // { ok, url, formatted, source }
  }

  function renderSourcesBar(linkObj) {
    if (!sourcesBar) return;
    sourcesBar.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.gap = "8px";
    wrap.style.flexWrap = "wrap";

    if (linkObj?.url) {
      const a = document.createElement("a");
      a.href = linkObj.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Deschide SportyTrader";
      a.className = "btn btn-secondary";
      wrap.appendChild(a);
    }

    sourcesBar.appendChild(wrap);
  }

  async function handleGenerate() {
    try {
      if (!input) return alert("Nu găsesc câmpul de meci (matchInput).");
      const raw = input.value || "";
      const { home, away } = parseMatch(raw);

      if (!home || !away) {
        showError("Completează echipele în formatul: Gazdă - Oaspeți (ex: Tokyo Verdy - Yokohama F Marinos).");
        return;
      }

      setLoading(true);
      showInfo("Pregătesc sursele...");

      // 1) SportyTrader link (fix 400)
      let sporty = null;
      try {
        sporty = await fetchSportyLink(home, away);
        renderSourcesBar(sporty);
      } catch (e) {
        // nu blocăm analiza dacă SportyTrader dă eroare
        console.warn("Sporty link error:", e);
        renderSourcesBar(null);
      }

      // 2) Pornește analiza principală (apel către API-ul tău /api/chat)
      showInfo("Generez analiza în 10 puncte...");
      const body = {
        home,
        away,
        query: `${home} - ${away}`,
        // poți trece și sporty?.url mai jos, dacă backend-ul îl folosește
        sources: {
          sportytrader: sporty?.url || null
        }
      };

      const r = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || `Chat API ${r.status}`);
      }

      const data = await r.json();

      // așteptăm câmpurile: data.content (markdown/text) sau data.result
      const text = data?.content || data?.result || JSON.stringify(data, null, 2);

      if (resultBox) {
        resultBox.innerHTML = `<pre class="result-pre">${escapeHtml(text)}</pre>`;
      } else {
        alert("Analiza generată (fără container vizual):\n\n" + text);
      }
    } catch (err) {
      console.error(err);
      showError(err.message || "Eroare necunoscută.");
    } finally {
      setLoading(false);
    }
  }

  // Hook UI
  if (btn) btn.addEventListener("click", handleGenerate);
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleGenerate();
    });
  }
})();
