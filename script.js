function salveazaIstoric(meci, rezultat) {
  let istoric = JSON.parse(localStorage.getItem("lucyofm_istoric") || "[]");
  istoric.unshift({ meci, rezultat, data: new Date().toISOString() });
  localStorage.setItem("lucyofm_istoric", JSON.stringify(istoric.slice(0, 50)));
}

function stergeIstoric() {
  localStorage.removeItem("lucyofm_istoric");
  location.reload();
}

async function analizeaza() {
  const prompt = document.getElementById("prompt").value.trim();
  const rezultat = document.getElementById("rezultat");
  if (!prompt) return (rezultat.textContent = "⚠️ Introdu un meci valid");

  rezultat.textContent = "⏳ Se analizează...";

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const d = await r.json();
    rezultat.textContent = d.reply || `❌ ${d.error}`;
    salveazaIstoric(prompt, d.reply);
  } catch {
    rezultat.textContent = "💥 Eroare rețea";
  }
}
