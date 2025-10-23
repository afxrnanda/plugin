document.addEventListener("mouseup", (event) => {
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText) return;

  // Remove popups anteriores
  const oldPopup = document.getElementById("tradutor-popup");
  if (oldPopup) oldPopup.remove();

  // Cria popup
  const popup = document.createElement("div");
  popup.id = "tradutor-popup";
  popup.innerText = "🔤 Traduzir texto";
  Object.assign(popup.style, {
    position: "absolute",
    top: `${event.pageY + 10}px`,
    left: `${event.pageX + 10}px`,
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0px 4px 8px rgba(0,0,0,0.2)",
    zIndex: 9999,
  });

  popup.addEventListener("click", async () => {
    popup.innerText = "⏳ Traduzindo...";
    const traducao = await traduzirComIA(selectedText);
    popup.remove();
    mostrarTraducao(traducao, event.pageX, event.pageY);
  });

  document.body.appendChild(popup);
});

async function traduzirComIA(texto) {
  try {
    const resposta = await fetch("http://localhost:3001/traduzir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });

    const data = await resposta.json();
    return data.traducao || "Erro ao traduzir o texto.";
  } catch (error) {
    console.error(error);
    return "Erro de conexão com o servidor.";
  }
}

function mostrarTraducao(texto, x, y) {
  const janela = document.createElement("div");
  janela.innerText = texto;
  Object.assign(janela.style, {
    position: "absolute",
    top: `${y + 20}px`,
    left: `${x + 20}px`,
    maxWidth: "350px",
    background: "#f9f9f9",
    border: "1px solid #bbb",
    borderRadius: "10px",
    padding: "12px",
    fontSize: "15px",
    lineHeight: "1.5",
    color: "#333",
    zIndex: 10000,
    boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
  });

  const fechar = document.createElement("button");
  fechar.innerText = "Fechar";
  Object.assign(fechar.style, {
    marginTop: "8px",
    padding: "4px 8px",
    borderRadius: "5px",
    border: "none",
    background: "#333",
    color: "#fff",
    cursor: "pointer",
  });

  fechar.onclick = () => janela.remove();

  janela.appendChild(document.createElement("br"));
  janela.appendChild(fechar);
  document.body.appendChild(janela);
}
