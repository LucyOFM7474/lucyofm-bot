async function analizeaza() {
  const prompt = document.getElementById("prompt").value.trim();
  const rezultat = document.getElementById("rezultat");
  if (!prompt) return (rezultat.textContent = "⚠️ Introdu un meci");

  rezultat.textContent = "⏳ Se analizează...";
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const d = await r.json();
    rezultat.textContent = d.reply || `❌ ${d.error}`;
  } catch {
    rezultat.textContent = "💥 Eroare rețea";
  }
}
