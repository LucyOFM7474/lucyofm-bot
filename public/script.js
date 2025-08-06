async function sendMessage() {
  const input = document.getElementById('user-input').value;
  const responseDiv = document.getElementById('response');

  responseDiv.innerHTML = "Se încarcă răspunsul...";

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: input })
  });

  const data = await response.json();
  responseDiv.innerHTML = `<p>${data.reply}</p>`;
}
