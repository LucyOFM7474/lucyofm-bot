const form = document.getElementById("form");
const out = document.getElementById("output");
const statusEl = document.getElementById("status");

function setStatus(msg) { statusEl.textContent = msg || ""; }

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  out.textContent = "";
  setStatus("Se caută surse și se generează analiza...");

  const home = document.getElementById("home").value.trim();
  const away = document.getElementById("away").value.trim();
  const urlsRaw = document.getElementById("urls").value.trim();
  const urls = urlsRaw ? urlsRaw.split("\n").map(s => s.trim()).filter(Boolean) : [];

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ home, away, urls })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data?.error || "Eroare necunoscută");

    // Afișează diagnosticul + analiza
    const diag = (data.scraped || [])
      .map(s => (s.ok ? "OK  " : "FAIL ") + (s.proxied ? "(proxy) " : "") + s.url + (s.error ? " — " + s.error : ""))
      .join("\n");
    const header = "# DIAGNOSTIC SCRAPING\n" + (diag || "(fără)") + "\n\n# ANALIZĂ\n";
    out.textContent = header + (data.result || "(fără rezultat)");
    setStatus("Gata ✓");
  } catch (err) {
    setStatus("Eroare: " + (err?.message || err));
  }
});
