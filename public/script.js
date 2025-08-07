await fetch("/api/chat", {
  method: "POST",               // ← obligatoriu
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt }),
});
