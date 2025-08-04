document.getElementById("send").addEventListener("click", async () => {
  const input = document.getElementById("input").value.trim();
  const output = document.getElementById("output");
  
  if (!input) {
    output.textContent = "⚠️ Te rog introdu un meci (ex: Rapid - FCSB)";
    return;
  }

  output.textContent = "⏳ Se analizează... așteaptă răspunsul în 10 puncte.";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: input })
    });

    const data = await res.json();

    if (!res.ok) {
      output.textContent = `❌ Eroare: ${data.error?.message || "necunoscută"}`;
      return;
    }

    output.textContent = data.result || "⚠️ Nu s-a generat nicio analiză.";
  } catch (err) {
    output.textContent = "💥 Eroare la conectarea cu serverul.";
  }
});
