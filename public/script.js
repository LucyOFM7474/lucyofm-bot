document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chatForm");
  const input = document.getElementById("prompt");
  const output = document.getElementById("output");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    output.innerHTML = '<div class="loading">⏳ Se generează analiza...</div>';

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      if (response.ok) {
        output.innerHTML = data.result.replace(/\n/g, '<br>');
      } else {
        output.innerHTML = `<div class="error">❌ Eroare: ${data.error || "necunoscută"}</div>`;
      }
    } catch (err) {
      console.error("Eroare fetch:", err);
      output.innerHTML = '<div class="error">❌ Eroare de rețea sau server</div>';
    }
  });
});

// Funcție pentru încărcarea istoricului
async function loadHistory() {
  const historyDiv = document.getElementById("history");
  historyDiv.innerHTML = '<div class="loading">⏳ Se încarcă istoricul...</div>';

  try {
    const response = await fetch("/api/history");
    const data = await response.json();
    
    if (response.ok && data.conversations.length > 0) {
      historyDiv.innerHTML = data.conversations.map(conv => `
        <div class="history-item">
          <p><strong>Text:</strong> ${conv.prompt}</p>
          <p><strong>Analiză:</strong> ${conv.response.substring(0, 100)}...</p>
          <small>${new Date(conv.timestamp).toLocaleString('ro-RO')}</small>
        </div>
      `).join('');
    } else {
      historyDiv.innerHTML = '<p style="text-align: center; color: #666;">Nu există analize în istoric</p>';
    }
  } catch (err) {
    historyDiv.innerHTML = '<div class="error">❌ Eroare la încărcarea istoricului</div>';
  }
}
