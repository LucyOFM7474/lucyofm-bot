document.getElementById("send-button").addEventListener("click", async () => {
  const input = document.getElementById("message-input");
  const message = input.value.trim();
  const chatBox = document.getElementById("chat-box");

  if (!message) return;

  chatBox.innerHTML = "<p><em>Se analizează, așteaptă...</em></p>";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message }) // 👈 Aici era problema în multe versiuni!
    });

    const data = await response.json();

    if (response.ok && data.response) {
      chatBox.innerHTML = `<pre>${data.response}</pre>`;
    } else {
      chatBox.innerHTML = `<p><strong>Eroare:</strong> ${data.message || "Nu s-a putut genera analiza."}</p>`;
    }
  } catch (error) {
    chatBox.innerHTML = `<p><strong>Eroare:</strong> ${error.message}</p>`;
  }
});
