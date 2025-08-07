document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  const input = document.getElementById("prompt");
  const output = document.getElementById("output");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    output.innerText = "⏳ Se generează analiza...";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      if (response.ok) {
        output.innerText = data.result || "⚠️ Nicio analiză generată.";
      } else {
        output.innerText = `❌ Eroare: ${data.error || "necunoscută"}`;
      }
    } catch (err) {
      console.error("Eroare fetch:", err);
      output.innerText = "❌ Eroare de rețea sau server.";
    }
  });
});
