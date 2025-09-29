let CHATGPT_API_KEY = process.env.CHATGPT_API_KEY;

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "modificarConteudo",
      title: "Modificar conteúdo com ChatGPT",
      contexts: ["page"]
    });
  });
  
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "modificarConteudo") {
      const apiKey = CHATGPT_API_KEY;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: salvarConteudoOriginal
      });
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: modificarConteudoComChatGPT,
        args: [apiKey]
      });
    }
  });

  function salvarConteudoOriginal() {
    const conteudoOriginal = document.body.innerHTML;
    localStorage.setItem('conteudoOriginal', conteudoOriginal);
  }

  function restaurarConteudoOriginal() {
    const conteudoOriginal = localStorage.getItem('conteudoOriginal');
    if (conteudoOriginal) {
      document.body.innerHTML = conteudoOriginal;
      localStorage.removeItem('conteudoOriginal');
    } else {
      location.reload();
    }
  }

  async function modificarConteudoComChatGPT(apiKey) {
    function calcularBackoff(tentativa, baseDelay = 2000, maxDelay = 60000) {
      const exponentialDelay = Math.min(baseDelay * Math.pow(2, tentativa), maxDelay);
      const jitter = Math.random() * 0.2 * exponentialDelay; 
      return Math.floor(exponentialDelay + jitter);
    }

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

    async function aguardarComThrottling(tempoBase = 2000) {
      const tempoAleatorio = Math.random() * 1000; // 0-1s adicional
      const tempoTotal = tempoBase + tempoAleatorio;
      await new Promise(resolve => setTimeout(resolve, tempoTotal));
    }

    function gerarHash(texto) {
      let hash = 0;
      for (let i = 0; i < texto.length; i++) {
        const char = texto.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; 
      }
      return hash.toString();
    }

    async function chamarChatGPT(texto, apiKey, maxRetries = 3, onProgress = null) {
      const chunks = dividirTextoEmChunks(texto, 600); 
      const resultados = [];
      const cache = JSON.parse(localStorage.getItem('chatgptCache') || '{}');
      
      await aguardarComThrottling(3000);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkHash = gerarHash(chunk);
        
        if (cache[chunkHash]) {
          if (onProgress) {
            onProgress(i + 1, chunks.length, `Usando cache para parte ${i + 1} de ${chunks.length}...`);
          }
          resultados.push(cache[chunkHash]);
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
                max_tokens: 400, 
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
            
            cache[chunkHash] = resultado;
            localStorage.setItem('chatgptCache', JSON.stringify(cache));
            
            resultados.push(resultado);
            sucesso = true;
            
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
                throw new Error('Limite de requisições da API excedido.');
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

    const textoOriginal = document.body.innerText;
    
    if (!textoOriginal || textoOriginal.trim().length === 0) {
      alert('Nenhum conteúdo de texto encontrado na página.');
      return;
    }
    
    try {
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
  