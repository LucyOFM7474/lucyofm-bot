const form = document.getElementById("form");
const out = document.getElementById("output");
const statusEl = document.getElementById("status");
function setStatus(m){ statusEl.textContent = m || ""; }

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  out.textContent = "";
  setStatus("Se caută surse și se generează analiza...");

  const home = document.getElementById("home").value.trim();
  const away = document.getElementById("away").value.trim();
  const urlsRaw = document.getElementById("urls")?.value.trim() || "";
  const urls = urlsRaw ? urlsRaw.split("\n").map(s=>s.trim()).filter(Boolean) : [];

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ home, away, urls })
    });
    const data = await res.json();

    const envTxt = data.env
      ? `ENV → OpenAI:${data.env.hasOpenAI ? "✓" : "✗"}  Bing:${data.env.hasBing ? "✓" : "✗"}  Node:${data.env.node}`
      : "";

    if (!res.ok || data.ok === false) {
      out.textContent = `${envTxt}\n\nEroare API: ${data.error || "necunoscută"}`;
      setStatus("Eroare");
      return;
    }

    // când backend-ul a compus deja un text cu DIAGNOSTIC în "result", îl afișăm direct
    if (typeof data.result === "string" && data.result.startsWith("# DIAGNOSTIC SCRAPING")) {
      out.textContent = `${envTxt}\n\n${data.result}`;
      setStatus("Gata ✓");
      return;
    }

    const diag = (data.scraped || [])
      .map(s => (s.ok ? "OK  (direct) " : "FAIL (direct) ") + s.url + (s.error ? " — " + s.error : ""))
      .join("\n");

    const header = `${envTxt}\n\n# DIAGNOSTIC SCRAPING\n${diag || "(fără)"}\n\n# ANALIZĂ\n`;
    out.textContent = header + (data.result || "(fără rezultat)");
    setStatus("Gata ✓");
  } catch (err) {
    setStatus("Eroare: " + (err?.message || err));
  }
});
