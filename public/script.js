document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  const input = document.querySelector("#prompt");
  const button = document.querySelector("button");
  const output = document.querySelector("#output");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const prompt = input.value.trim();
    if (!prompt) {
      output.innerHTML = `<span style="color:red;">Introduceți un text pentru analiză!</span>`;
      return;
    }

    button.disabled = true;
    output.innerHTML = "Se analizează...";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        output.innerHTML = `<span style="color:red;">Eroare: ${errorText}</span>`;
        button.disabled = false;
        return;
      }

      const data = await response.json();
      output.innerHTML = `<strong>Răspuns:</strong> ${data.result}`;
    } catch (err) {
      console.error(err);
      output.innerHTML = `<span style="color:red;">Eroare de rețea sau server!</span>`;
    } finally {
      button.disabled = false;
    }
  });
});
