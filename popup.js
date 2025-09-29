// Carregamento da API Key a partir do env.json com cache em memória
let CHATGPT_API_KEY = null;
async function loadApiKey() {
  if (CHATGPT_API_KEY) return CHATGPT_API_KEY;
  try {
    const url = chrome.runtime.getURL('env.json');
    const res = await fetch(url, { cache: 'no-cache' });
    const json = await res.json();
    CHATGPT_API_KEY = json.CHATGPT_API_KEY || null;
    return CHATGPT_API_KEY;
  } catch (e) {
    console.error('Falha ao carregar env.json:', e);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Verificar se a página já foi modificada
  checkPageStatus();
});

// Modificar página atual
document.getElementById("modificarPagina").addEventListener("click", async () => {
  try {
    const apiKey = await loadApiKey();
    if (!apiKey) {
      updateStatus('API key não encontrada. Verifique env.json.', 'error');
      return;
    }
    // Obter a aba ativa
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      updateStatus('Nenhuma aba ativa encontrada', 'error');
      return;
    }
    
    updateStatus('Modificando página...', 'info');
    
    // Salvar conteúdo original antes de modificar
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: salvarConteudoOriginal
    });
    
    // Executar script na página
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: modificarConteudoComChatGPT,
      args: [apiKey]
    });
    
    updateStatus('Página modificada com sucesso!', 'success');
    
    // Fechar popup após 2 segundos
    setTimeout(() => {
      window.close();
    }, 2000);
    
  } catch (error) {
    updateStatus('Erro ao modificar página: ' + error.message, 'error');
  }
});

// Restaurar página original
document.getElementById("restaurarPagina").addEventListener("click", async () => {
  try {
    // Obter a aba ativa
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      updateStatus('Nenhuma aba ativa encontrada', 'error');
      return;
    }
    
    updateStatus('Restaurando página...', 'info');
    
    // Executar script para restaurar
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: restaurarConteudoOriginal
    });
    
    updateStatus('Página restaurada com sucesso!', 'success');
    
    // Fechar popup após 2 segundos
    setTimeout(() => {
      window.close();
    }, 2000);
    
  } catch (error) {
    updateStatus('Erro ao restaurar página: ' + error.message, 'error');
  }
});

// Limpar cache
document.getElementById("limparCache").addEventListener("click", async () => {
  try {
    // Limpar cache do localStorage
    localStorage.removeItem('chatgptCache');
    
    updateStatus('Cache limpo com sucesso!', 'success');
    
    // Fechar popup após 2 segundos
    setTimeout(() => {
      window.close();
    }, 2000);
    
  } catch (error) {
    updateStatus('Erro ao limpar cache: ' + error.message, 'error');
  }
});

// Função para verificar status da página
async function checkPageStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return document.body.innerHTML.includes('Conteúdo Melhorado pelo ChatGPT');
        }
      });
      
      if (result && result[0] && result[0].result) {
        document.getElementById('modificarPagina').style.display = 'none';
        document.getElementById('restaurarPagina').style.display = 'block';
        updateStatus('Página já foi modificada. Use "Restaurar" para voltar ao original.', 'info');
      } else {
        document.getElementById('modificarPagina').style.display = 'block';
        document.getElementById('restaurarPagina').style.display = 'none';
      }
    }
  } catch (error) {
    console.log('Erro ao verificar status da página:', error);
  }
}

// Função para atualizar status geral
function updateStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}

// Função para salvar conteúdo original
function salvarConteudoOriginal() {
  const conteudoOriginal = document.body.innerHTML;
  localStorage.setItem('conteudoOriginal', conteudoOriginal);
}

// Função para restaurar conteúdo original
function restaurarConteudoOriginal() {
  const conteudoOriginal = localStorage.getItem('conteudoOriginal');
  if (conteudoOriginal) {
    document.body.innerHTML = conteudoOriginal;
    localStorage.removeItem('conteudoOriginal');
  } else {
    location.reload();
  }
}

// Função que será executada na página
async function modificarConteudoComChatGPT(apiKey) {
  // Função para calcular backoff exponencial mais conservador
  function calcularBackoff(tentativa, baseDelay = 2000, maxDelay = 60000) {
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, tentativa), maxDelay);
    const jitter = Math.random() * 0.2 * exponentialDelay; // 20% de jitter
    return Math.floor(exponentialDelay + jitter);
  }

  // Função para dividir texto em chunks muito menores
  function dividirTextoEmChunks(texto, tamanhoChunk = 800) {
    const chunks = [];
    const palavras = texto.split(' ');
    let chunkAtual = '';
    
    for (const palavra of palavras) {
      if ((chunkAtual + ' ' + palavra).length > tamanhoChunk && chunkAtual.length > 0) {
        chunks.push(chunkAtual.trim());
        chunkAtual = palavra;
      } else {
        chunkAtual += (chunkAtual ? ' ' : '') + palavra;
      }
    }
    
    if (chunkAtual.trim()) {
      chunks.push(chunkAtual.trim());
    }
    
    return chunks;
  }

  // Função para aguardar com throttling rigoroso
  async function aguardarComThrottling(tempoBase = 2000) {
    const tempoAleatorio = Math.random() * 1000; // 0-1s adicional
    const tempoTotal = tempoBase + tempoAleatorio;
    await new Promise(resolve => setTimeout(resolve, tempoTotal));
  }

  // Função para gerar hash simples do texto
  function gerarHash(texto) {
    let hash = 0;
    for (let i = 0; i < texto.length; i++) {
      const char = texto.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  // Função para chamar a API do ChatGPT com throttling ultra-conservador
  async function chamarChatGPT(texto, apiKey, maxRetries = 3, onProgress = null) {
    const chunks = dividirTextoEmChunks(texto, 600); // Chunks muito menores
    const resultados = [];
    const cache = JSON.parse(localStorage.getItem('chatgptCache') || '{}');
    
    // Aguardar antes de começar para evitar burst inicial
    await aguardarComThrottling(3000);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkHash = gerarHash(chunk);
      
      // Verificar cache primeiro
      if (cache[chunkHash]) {
        if (onProgress) {
          onProgress(i + 1, chunks.length, `Usando cache para parte ${i + 1} de ${chunks.length}...`);
        }
        resultados.push(cache[chunkHash]);
        // Aguardar mesmo com cache para manter ritmo
        await aguardarComThrottling(1000);
        continue;
      }
      
      let sucesso = false;
      let tentativa = 0;
      
      if (onProgress) {
        onProgress(i + 1, chunks.length, `Processando parte ${i + 1} de ${chunks.length}...`);
      }
      
      while (!sucesso && tentativa < maxRetries) {
        try {
          // Aguardar antes de cada requisição
          if (tentativa > 0) {
            await aguardarComThrottling(5000);
          }
          
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                {
                  role: 'system',
                  content: 'Você é um assistente que melhora e simplifica textos para melhor compreensão. Mantenha o significado original mas torne o texto mais claro e acessível. Responda APENAS com o texto melhorado, sem explicações adicionais.'
                },
                {
                  role: 'user',
                  content: `Melhore e simplifique este texto: ${chunk}`
                }
              ],
              max_tokens: 400, // Reduzido para diminuir carga
              temperature: 0.7
            })
          });

          if (response.status === 429) {
            const waitTime = calcularBackoff(tentativa);
            console.log(`Rate limit atingido. Aguardando ${waitTime}ms antes da tentativa ${tentativa + 1}/${maxRetries}`);
            
            if (tentativa < maxRetries - 1) {
              if (onProgress) {
                onProgress(i + 1, chunks.length, `Rate limit! Aguardando ${Math.ceil(waitTime/1000)}s...`);
              }
              await new Promise(resolve => setTimeout(resolve, waitTime));
              tentativa++;
              continue;
            } else {
              throw new Error('Rate limit da API excedido. Aguarde 5-10 minutos antes de tentar novamente.');
            }
          }

          if (!response.ok) {
            throw new Error(`Erro na API: ${response.status} - ${response.statusText}`);
          }

          const data = await response.json();
          const resultado = data.choices[0].message.content.trim();
          
          // Salvar no cache
          cache[chunkHash] = resultado;
          localStorage.setItem('chatgptCache', JSON.stringify(cache));
          
          resultados.push(resultado);
          sucesso = true;
          
          // Pausa obrigatória entre requisições (muito mais longa)
          if (i < chunks.length - 1) {
            if (onProgress) {
              onProgress(i + 1, chunks.length, `Aguardando 3-4s antes da próxima parte...`);
            }
            await aguardarComThrottling(3000);
          }
          
        } catch (error) {
          console.error(`Chunk ${i + 1}, Tentativa ${tentativa + 1} falhou:`, error);
          
          if (tentativa === maxRetries - 1) {
            if (error.message.includes('Rate limit') || error.message.includes('429')) {
              throw new Error('Limite de requisições da API excedido. Aguarde 10-15 minutos antes de tentar novamente.');
            } else if (error.message.includes('401')) {
              throw new Error('API key inválida. Verifique sua configuração.');
            } else {
              throw new Error(`Erro na API: ${error.message}`);
            }
          }
          
          const waitTime = calcularBackoff(tentativa);
          if (onProgress) {
            onProgress(i + 1, chunks.length, `Erro na parte ${i + 1}. Aguardando ${Math.ceil(waitTime/1000)}s...`);
          }
          await new Promise(resolve => setTimeout(resolve, waitTime));
          tentativa++;
        }
      }
    }
    
    return resultados.join(' ');
  }

  // Obter todo o texto da página
  const textoOriginal = document.body.innerText;
  
  if (!textoOriginal || textoOriginal.trim().length === 0) {
    alert('Nenhum conteúdo de texto encontrado na página.');
    return;
  }
  
  try {
    // Salvar conteúdo original
    const conteudoOriginal = document.body.innerHTML;
    localStorage.setItem('conteudoOriginal', conteudoOriginal);
    
    // Mostrar indicador de carregamento com barra de progresso
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.95);
      color: white;
      padding: 40px;
      border-radius: 20px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      text-align: center;
      min-width: 400px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    `;
    
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      width: 100%;
      height: 8px;
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
      margin: 20px 0;
      overflow: hidden;
    `;
    
    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #007acc, #00aaff);
      width: 0%;
      transition: width 0.3s ease;
    `;
    
    progressBar.appendChild(progressFill);
    
    loadingDiv.innerHTML = `
      <div style="font-size: 20px; margin-bottom: 10px;">🤖 Processando com ChatGPT</div>
      <div id="progressText" style="font-size: 14px; color: #ccc; margin-bottom: 10px;">Iniciando processamento...</div>
    `;
    loadingDiv.appendChild(progressBar);
    loadingDiv.innerHTML += `
      <div style="margin-top: 15px; font-size: 12px; color: #aaa;">Processando em partes para melhor qualidade</div>
    `;
    
    document.body.appendChild(loadingDiv);
    
    // Função para atualizar progresso
    const updateProgress = (atual, total, mensagem) => {
      const progressText = document.getElementById('progressText');
      const percentual = Math.round((atual / total) * 100);
      
      if (progressText) {
        progressText.textContent = mensagem;
      }
      
      progressFill.style.width = `${percentual}%`;
    };
    
    // Chamar ChatGPT com callback de progresso
    const textoMelhorado = await chamarChatGPT(textoOriginal, apiKey, 5, updateProgress);
    
    // Atualizar progresso final
    updateProgress(1, 1, 'Finalizando...');
    
    // Remover indicador de carregamento
    document.body.removeChild(loadingDiv);
    
    // Substituir o conteúdo da página
    document.body.innerHTML = `
      <div style="
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        font-family: Arial, sans-serif;
        line-height: 1.6;
        background: #f9f9f9;
        min-height: 100vh;
      ">
        <h1 style="color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px;">
          Conteúdo Melhorado pelo ChatGPT
        </h1>
        <div style="
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          white-space: pre-wrap;
        ">${textoMelhorado}</div>
        <div style="margin-top: 20px; text-align: center;">
          <button onclick="restaurarConteudoOriginal()" style="
            background: #007acc;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
          ">Restaurar Página Original</button>
        </div>
      </div>
    `;
    
  } catch (error) {
    alert('Erro ao processar conteúdo: ' + error.message);
  }
}

  