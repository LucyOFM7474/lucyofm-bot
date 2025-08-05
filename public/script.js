async function sendMessage() {
  const prompt = document.getElementById('prompt').value;
  const exclude = document.getElementById('exclude').value;
  const excludedPoints = exclude.split(',').map(e => parseInt(e.trim())).filter(e => !isNaN(e));

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt, excludedPoints })
  });

  const data = await res.json();
  document.getElementById('response').textContent = data.reply || "Fără răspuns.";
}