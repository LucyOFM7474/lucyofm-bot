async function trimite() {
  const prompt = document.getElementById("prompt").value;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  document.getElementById("raspuns").textContent = data.result || data.error;
}
