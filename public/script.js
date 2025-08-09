const form = document.getElementById("form");
const out = document.getElementById("output");
const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  out.textContent = "";
  setStatus("Se analizează...");

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
    if (!res.ok || !data.ok) {
      throw new Error(data?.error || "Eroare necunoscută");
    }
    out.textContent = data.result || "(fără rezultat)";
    setStatus("Gata ✓");
  } catch (err) {
    setStatus("Eroare: " + (err?.message || err));
  }
});
