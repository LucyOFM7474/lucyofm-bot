async function analyzeMatch() {
  const input = document.getElementById("matchInput").value.trim();
  const resultBox = document.getElementById("result");
  resultBox.textContent = "Se analizează...";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ meci: input }),
    });

    const data = await response.json();

    if (data.rezultat) {
      resultBox.textContent = data.rezultat;
    } else {
      resultBox.textContent = "❌ Nu s-a putut genera analiza.";
    }
  } catch (err) {
    resultBox.textContent = "❌ Eroare la conectare cu serverul.";
  }
}
