function salveazaIstoric(meci, rezultat) {
  let istoric = JSON.parse(localStorage.getItem("lucyofm_istoric") || "[]");
  istoric.unshift({ meci, rezultat, data: new Date().toLocaleString("ro-RO") });
  localStorage.setItem("lucyofm_istoric", JSON.stringify(istoric.slice(0, 20)));
  afiseazaIstoric();
}

function stergeIstoric() {
  if (confirm("Sigur vrei să ștergi tot istoricul local?")) {
    localStorage.removeItem("lucyofm_istoric");
    afiseazaIstoric();
  }
}

function afiseazaIstoric() {
  const istoric = JSON.parse(localStorage.getItem("lucyofm_istoric") || "[]");
  const container = document.getElementById("istoric-list");
  
  if (istoric.length === 0) {
    container.innerHTML = "<p style='opacity:0.7'>Nu există analize salvate local</p>";
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

    // 🔁 Salvează în MongoDB
    await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meci: prompt, rezultat: d.reply }),
    });

  } catch {
    rezultat.textContent = "💥 Eroare rețea - verifică conexiunea";
  }
}

// 🔁 Încarcă istoricul din MongoDB
async function incarcaIstoricCloud() {
  const container = document.getElementById("istoric-list");
  container.innerHTML = "⏳ Se încarcă din cloud...";

  try {
    const r = await fetch("/api/history");
    const analize = await r.json();

    if (!analize.length) {
      container.innerHTML = "<p style='opacity:0.7'>Niciun istoric salvat în cloud</p>";
      return;
    }

    container.innerHTML = analize.map(item => `
      <div class="istoric-item" onclick="incarcaAnaliza('${item.meci}')">
        <strong>${item.meci}</strong>
        <small>${new Date(item.data).toLocaleString("ro-RO")}</small>
      </div>
    `).join("");

  } catch {
    container.innerHTML = "❌ Eroare la încărcarea din cloud";
  }
}

// 🔁 Inițializează istoricul local la pornire
afiseazaIstoric();
