document.getElementById("analyzeButton")?.addEventListener("click", async () => {
  const matchInput = document.getElementById("matchInput")?.value.trim();

  if (!matchInput) {
    alert("Scrie un meci, de exemplu: Rapid - FC Botoșani");
    return;
  }

  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = "<p><em>Se analizează...</em></p>";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Analizează meciul ${matchInput} în 10 puncte clare, cu tot ce ai mai bun.`,
      }),
    });

    const data = await response.json();

    if (data?.response) {
      resultDiv.innerHTML = `<pre style="white-space: pre-wrap">${data.response}</pre>`;
    } else {
      resultDiv.innerHTML = "<p><strong>Nu s-a putut genera analiza.</strong></p>";
    }
  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = "<p><strong>Eroare la conexiune sau API.</strong></p>";
  }
});
