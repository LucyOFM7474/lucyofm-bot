async function sendMessage() {
  const input = document.getElementById("user-input");
  const text = input.value.trim();
  if (!text) return;

  addMessage("Tu", text);
  input.value = "";

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: text }],
    }),
  });

  const data = await response.json();
  addMessage("LucyOFM", data.result || "Eroare răspuns.");
}

function addMessage(sender, text) {
  const messages = document.getElementById("messages");
  const msg = document.createElement("div");
  msg.className = "message";
  msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}
