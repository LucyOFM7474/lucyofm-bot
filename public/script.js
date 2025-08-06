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

    if (d.reply && d.reply.trim()) {
      rezultat.textContent = d.reply;
      salveazaIstoric(prompt, d.reply);

      // Salvează și în MongoDB
      await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meci: prompt, rezultat: d.reply }),
      });
    } else {
      rezultat.textContent = "⚠️ Nu s-a generat nicio analiză.";
    }

  } catch (err) {
    rezultat.textContent = "💥 Eroare rețea - verifică conexiunea";
  }
}
