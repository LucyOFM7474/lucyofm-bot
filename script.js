async function sendMessage() {
  const input = document.getElementById('user-input');
  const message = input.value.trim();
  if (!message) return;

  const chatBox = document.getElementById('chat-box');
  chatBox.innerHTML += `<p><strong>Tu:</strong> ${message}</p>`;
  input.value = '...';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        excludedPoints: [] // opțional: [1, 4, 7]
      })
    });

    const data = await response.json();
    chatBox.innerHTML += `<p><strong>Lucy:</strong> ${data.response}</p>`;
  } catch (err) {
    console.error(err); // 👉 pentru debug
    chatBox.innerHTML += `<p style="color:red;"><strong>Eroare la răspuns.</strong></p>`;
  } finally {
    input.value = '';
  }
}
