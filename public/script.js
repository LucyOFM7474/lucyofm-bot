document.getElementById("analyzeButton").addEventListener("click", async () => {
  const matchInput = document.getElementById("matchInput").value.trim();
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = "<i>Se analizează...</i>";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ meci: matchInput }),
    });

    if (!response.ok) {
      throw new Error(`Eroare ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.message || "⚠️ Niciun rezultat întors.";

    resultDiv.innerHTML = formatResponse(text);
  } catch (error) {
    resultDiv.innerHTML = `<span style="color:red;">Eroare: ${error.message}</span>`;
  }
});

function formatResponse(text) {
  const puncte = text.split(/\n(?=\d+\.)/).filter(Boolean); // împarte la 1., 2., ... etc.
  return puncte.map(p => `<p>${p.trim()}</p>`).join("");
}
