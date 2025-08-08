// public/script.js

// Helper pentru a găsi elemente indiferent de id-urile folosite în versiuni anterioare
function $(ids) {
  if (typeof ids === "string") ids = [ids];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

const els = {
  form: $("matchForm"),
  home: $("homeTeam"),
  away: $("awayTeam"),
  // câmpuri opționale pentru URL-uri directe (dacă utilizatorul le are)
  urlSporty: $("urlSportyTrader"),
  urlPredictz: $("urlPredictZ"),
  urlForebet: $("urlForebet"),

  // butoane/linkuri către surse
  btnSporty: $("linkSportyTrader") || $("btnSportyTrader"),
  btnPredictz: $("linkPredictZ") || $("btnPredictZ"),
  btnForebet: $("linkForebet") || $("btnForebet"),

  // caseta unde arătăm ce au zis sursele
  sourcesBox: $("sourcesBox") || $("sources"),
};

function setHref(a, href) {
  if (!a) return;
  try {
    a.setAttribute("href", href);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
  } catch {}
}

function renderSources(s) {
  if (!els.sourcesBox) return;

  const lines = [];

  if (s?.sportytrader) {
    const p = s.sportytrader.prediction ? ` — ${s.sportytrader.prediction}` : "";
    lines.push(`✅ SportyTrader${p}`);
  } else {
    lines.push(`⚠️ SportyTrader: indisponibil`);
  }

  if (s?.predictz) {
    const p = s.predictz.prediction ? ` — ${s.predictz.prediction}` : "";
    lines.push(`📊 PredictZ${p}`);
  } else {
    lines.push(`⚠️ PredictZ: indisponibil`);
  }

  if (s?.forebet) {
    const p = s.forebet.prediction ? ` — ${s.forebet.prediction}` : "";
    lines.push(`📊 Forebet${p}`);
  } else {
    lines.push(`⚠️ Forebet: indisponibil`);
  }

  els.sourcesBox.textContent = lines.join("\n");
}

async function fetchSources(payload) {
  const res = await fetch("/api/fetchSources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function onSubmit(e) {
  e?.preventDefault?.();

  const homeTeam = (els.home?.value || "").trim();
  const awayTeam = (els.away?.value || "").trim();

  if (!homeTeam || !awayTeam) {
    alert("Completează echipele (acasă și deplasare).");
    return;
  }

  const urls = {};
  if (els.urlSporty?.value) urls.sportytrader = els.urlSporty.value.trim();
  if (els.urlPredictz?.value) urls.predictz = els.urlPredictz.value.trim();
  if (els.urlForebet?.value) urls.forebet = els.urlForebet.value.trim();

  try {
    const data = await fetchSources({ homeTeam, awayTeam, urls });

    // Setăm link-urile butoanelor (fără 404; au fallback pe căutare „site:”)
    setHref(els.btnSporty, data?.links?.sportytrader);
    setHref(els.btnPredictz, data?.links?.predictz);
    setHref(els.btnForebet, data?.links?.forebet);

    // Afișăm ce au zis sursele, exact cum scrie pe site
    renderSources(data?.sources);

    // (opțional) trigger pentru analiza extinsă, dacă ai un buton separat
    // startFullAnalysis({ homeTeam, awayTeam, sources: data?.sources });

  } catch (err) {
    console.error(err);
    alert("Nu am putut citi sursele. Încearcă din nou sau adaugă URL-urile directe.");
  }
}

// Inițializare
(() => {
  if (els.form) els.form.addEventListener("submit", onSubmit);
  // Dacă ai buton „Caută”, atașează-l aici:
  const btn = $("btnFetchSources");
  if (btn) btn.addEventListener("click", onSubmit);
})();
