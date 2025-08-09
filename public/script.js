const form = document.getElementById("form");
const out = document.getElementById("output");
const statusEl = document.getElementById("status");

function setStatus(m){ statusEl.textContent = m||""; }

form.addEventListener("submit", async (e)=>{
  e.preventDefault(); out.textContent=""; setStatus("Se analizează...");
  const home = document.getElementById("home").value.trim();
  const away = document.getElementById("away").value.trim();
  const urls = document.getElementById("urls").value.trim()
    .split("\n").map(s=>s.trim()).filter(Boolean);

  try{
    const res = await fetch("/api/chat", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ home, away, urls })
    });
    const data = await res.json();
    if(!res.ok || !data.ok) throw new Error(data?.error||"Eroare necunoscută");

    // Diagnoză scraping
    const diag = (data.scraped||[]).map(s =>
      `${s.ok ? "OK" : "FAIL"} ${s.proxied ? "[proxy]" : ""} ${s.url}\n${s.error?("Eroare: "+s.error):("Preview: "+(s.preview||""))}`
    ).join("\n---\n");

    out.textContent = `# DIAGNOSTIC SCRAPING\n${diag||"(fără)"}\n\n# ANALIZĂ\n${data.result||"(fără rezultat)"}`;
    setStatus("Gata ✓");
  }catch(err){
    setStatus("Eroare: "+(err?.message||err));
  }
});
