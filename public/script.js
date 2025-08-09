function salveazaIstoric(meci, rezultat) {
  let istoric = JSON.parse(localStorage.getItem("lucyofm_istoric") || "[]");
  istoric.unshift({ meci, rezultat, data: new Date().toLocaleString("ro-RO") });
  localStorage.setItem("lucyofm_istoric", JSON.stringify(istoric.slice(0, 20)));
  afiseazaIstoric();
}

function stergeIstoric() {
  if (confirm("Sigur vrei să ștergi tot istoricul?")) {
    localStorage.removeItem("lucyofm_istoric");
    afiseazaIstoric();
  }
}

function afiseazaIstoric() {
  const istoric = JSON.parse(localStorage.getItem("lucyofm_istoric") || "[]");
  const container = document.getElementById("istoric-list");
  
  if (istoric.length === 0) {
    container.innerHTML = "<p style='opacity:0.7'>Nu există analize salvate</p>";
    return;
  }
  
  container.innerHTML = istoric.map(item => `
    <div class="istoric-item" onclick="incarcaAnaliza('${item.meci}')">
      <strong>${item.meci}</strong>
      <small>${item.data}</small>
    </div>
  `).join("");
}

function incarcaAnaliza(meci) {
  document.getElementById("prompt").value = meci;
  document.getElementById("rezultat").scrollIntoView({ behavior: 'smooth' });
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
    rezultat.textContent = "💥 Eroare rețea - verifică conexiunea";
  }
}

// Inițializează istoricul la încărcare
afiseazaIstoric();
