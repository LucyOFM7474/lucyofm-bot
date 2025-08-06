async function sendMessage() {
  const input = document.getElementById("input").value;
  const output = document.getElementById("output");
  output.innerHTML = "Se încarcă...";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
    });

    const data = await response.json();
    output.innerHTML = data.reply;
  } catch (error) {
    output.innerHTML = "Eroare la comunicarea cu serverul.";
  }
}
