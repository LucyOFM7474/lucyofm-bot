document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  const input = document.querySelector("input");
  const result = document.querySelector("#result");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();

    if (!prompt) {
      result.textContent = "Introdu un meci sau o analiză.";
      return;
    }

    result.textContent = "Se analizează...";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();

      if (data.error) {
        result.textContent = `Eroare: ${data.error}`;
      } else {
        result.textContent = data.reply;
      }
    } catch (error) {
      result.textContent = `Eroare conexiune: ${error.message}`;
    }
  });
});
