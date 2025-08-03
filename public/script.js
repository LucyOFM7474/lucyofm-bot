// public/script.js
const form   = document.getElementById('form');
const input  = document.getElementById('meciInput');
const output = document.getElementById('output');
const load   = document.getElementById('loading');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const meci = input.value.trim();
  if (!meci) return;

  load.hidden = false;
  output.innerHTML = '';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meci })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Eroare server');

    const puncte = data.raspuns.split('\n').filter(l => l.trim());
    puncte.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p.replace(/^•\s*/, '');
      output.appendChild(li);
    });
  } catch (err) {
    output.innerHTML = `<li style="color:red">Eroare: ${err.message}</li>`;
  } finally {
    load.hidden = true;
  }
});
