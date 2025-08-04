document.addEventListener('DOMContentLoaded', () => {
  // Remove old tokenInput and apiInput variables and add new UI elements
  const chatUrlInput   = document.getElementById('chatUrl');
  const chatModelInput = document.getElementById('chatModel');
  const apiKeyInput    = document.getElementById('apiKey');
  const saveBtn        = document.getElementById('saveBtn');
  const injectBtn      = document.getElementById('injectBtn');

  // New recording elements
  const recordBtn      = document.getElementById('recordBtn');
  const stopBtn        = document.getElementById('stopBtn');
  const generateBtn    = document.getElementById('generateBtn');
  const logPreview     = document.getElementById('logPreview');
  const spinner        = document.getElementById('spinner');

  // Load previously saved data
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const origin = tabs.length ? new URL(tabs[0].url || '').origin : null;
    chrome.storage.local.get(['siteConfigs','chatUrl','chatModel','apiKey'], ({ siteConfigs = {}, chatUrl, chatModel, apiKey }) => {
      const site = origin ? siteConfigs[origin] || {} : {};
      // apiBase removed
      if (chatUrl)             chatUrlInput.value   = chatUrl;
      if (chatModel)           chatModelInput.value = chatModel;
      if (apiKey)              apiKeyInput.value    = apiKey;
    });
  });

  // Save button handler
  saveBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return;
      const origin = new URL(tabs[0].url || '').origin;
      chrome.storage.local.get(['siteConfigs'], ({ siteConfigs = {} }) => {
        const site = siteConfigs[origin] || {};
        siteConfigs[origin] = site;
        chrome.storage.local.set({ siteConfigs, chatUrl: chatUrlInput.value.trim(), chatModel: chatModelInput.value.trim(), apiKey: apiKeyInput.value.trim() }, () => {
          alert('Saved!');
          toggleAiDetails();
        });
      });
    });
  });

  // helper to save per-site and global config then invoke cb
  function persistConfig(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return;
      const origin = new URL(tabs[0].url || '').origin;
      chrome.storage.local.get(['siteConfigs'], ({ siteConfigs = {} }) => {
        const site = siteConfigs[origin] || {};
        siteConfigs[origin] = site;
        chrome.storage.local.set({ siteConfigs, chatUrl: chatUrlInput.value.trim(), chatModel: chatModelInput.value.trim(), apiKey: apiKeyInput.value.trim() }, cb);
      });
    });
  }

  // Inject button handler
  injectBtn.addEventListener('click', () => {
    persistConfig(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab) return;
        const tabId = tab.id;

        const init = () => chrome.tabs.sendMessage(tabId, { action: 'initVisualization' });

        // try ping
        chrome.tabs.sendMessage(tabId, { ping: true }, () => {
          if (chrome.runtime.lastError) {
            // no listener yet → inject
            chrome.scripting.executeScript(
              { target: { tabId }, files: ['contentScript.js'] },
              init            // run init after injection
            );
          } else {
            // listener exists
            init();
          }
        });
      });
    });
  });

  // Rendering helper for live log preview
  function renderLog(log = []) {
    if (!log.length) {
      logPreview.innerHTML = '<em>No requests captured yet.</em>';
      return;
    }
    const rows = log.map((r, idx) => `<tr><td>${r.method}</td><td>${r.url}</td></tr>`).join('');
    logPreview.innerHTML = `<table style="width:100%; font-size:12px;"><thead><tr><th>Method</th><th>URL</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // Listen for storage changes to update preview in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.recordingLog) {
        renderLog(changes.recordingLog.newValue || []);
        const hasData = (changes.recordingLog.newValue || []).length > 0;
        generateBtn.disabled = !hasData;
      }
      if (changes.recordingActive) {
        recordingActive = changes.recordingActive.newValue;
        recordBtn.disabled = recordingActive;
        stopBtn.disabled   = !recordingActive;
      }
    }
  });

  let recordingActive = false;

  // Initial load of saved data & existing log
  chrome.storage.local.get(['siteConfigs','chatUrl','chatModel','apiKey','recordingLog','recordingActive'], ({ siteConfigs = {}, chatUrl, chatModel, apiKey, recordingLog = [], recordingActive: recAct }) => {
    recordingActive = !!recAct;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const origin = tabs.length ? new URL(tabs[0].url || '').origin : null;
      const site   = origin ? siteConfigs[origin] || {} : {};
      // apiBase removed
      if (chatUrl)             chatUrlInput.value   = chatUrl;
      if (chatModel)           chatModelInput.value = chatModel;
      if (apiKey)              apiKeyInput.value    = apiKey;
      renderLog(recordingLog);
      generateBtn.disabled = !recordingLog.length;
      // set button states
      recordBtn.disabled = recordingActive;
      stopBtn.disabled   = !recordingActive;
    });
  });

  const aiSettingsDetails = document.getElementById('aiSettings');
  
  function toggleAiDetails() {
    const empty = !chatUrlInput.value && !apiKeyInput.value && !chatModelInput.value;
    aiSettingsDetails.open = empty;
  }
  
  // --- Recording controls ---
  recordBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return;
      const origin = new URL(tab.url || '').origin;
      chrome.runtime.sendMessage({ action: 'startRecording', origin, tabId: tab.id }, () => {
        recordingActive = true;
        recordBtn.disabled = true;
        stopBtn.disabled   = false;
        generateBtn.disabled = true;
        logPreview.innerHTML = '<em>Recording… perform actions on the page.</em>';
      });
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopRecording' }, () => {
      recordingActive = false;
      recordBtn.disabled = false;
      stopBtn.disabled   = true;
    });
  });

  // Generate API description from captured log
  async function generateDescription() {
    console.log('start generating description');
    spinner.style.display = 'block';
    const originalText = generateBtn.textContent;
    generateBtn.textContent = 'Generating...';
    generateBtn.disabled = true;
    const { recordingLog = [], chatUrl, chatModel, apiKey } = await chrome.storage.local.get(['recordingLog','chatUrl','chatModel','apiKey']);
    if (!recordingLog.length) { alert('No recorded requests.'); spinner.style.display='none'; generateBtn.textContent=originalText; generateBtn.disabled=false; return; }
    if (!chatUrl || !chatModel) { alert('Chat URL or model missing.'); spinner.style.display='none'; generateBtn.textContent=originalText; generateBtn.disabled=false; return; }

    const escape = (str) => str.replace(/`/g,'\\`').replace(/\$\{/g,'\\${');
    const prompt = `Analyze the following sample GET requests and their responses.\nReturn a concise OpenAPI JSON description summarizing the endpoints. MARK ALL PARAMETERS AS REQUIRED.\nThis is the Code that will generate a visual representation of the api description.
    \n      /** (re)build simple API overview list */\n  private buildApiOverviewHtml(): string {\n    try {\n      const parsed = JSON.parse(this.config.apiDescription);\n      if (!parsed || typeof parsed !== 'object' || !parsed.paths) return '';\n      
    const items: string[] = [];\n      for (const path in parsed.paths) {\n        const methods = parsed.paths[path];\n        if (methods) {\n          for (const m in methods) {\n            const summary = methods[m]?.summary || '';\n            
    items.push(<li><code>\${m.toUpperCase()} \${path}</code>\${summary ? ' - '+summary : ''}</li>);\n          }\n        }\n      }\n      return items.length ? <ul style="margin:8px 0 0 16px;">\${items.join('')}</ul> : '';\n    } catch { return ''; }\n  } 
       \n\n${recordingLog.map((r,i)=>`### Request ${i+1}\nURL: ${escape(r.url)}\nMethod: ${r.method}\nResponse: ${JSON.stringify(r.response)}\n`).join('\n')}\n`;

    console.log('prompt', prompt);
    try {
      const body = {
        model: chatModel,
        messages: [
          { role: 'system', content: 'You are an expert in creating OpenAPI descriptions.ONLY RETURN THE JSON, DO NOT RETURN ANY OTHER TEXT. DO specify the return type of the response (for example if it is wrappend in a response object).' },
          { role: 'user', content: prompt }
        ]
      };
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const description = data.choices?.[0]?.message?.content;
      if (!description) throw new Error('Invalid AI response');
      console.log('description', description);

      // save description into siteConfigs
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab) return;
        const origin = new URL(tab.url || '').origin;
        chrome.storage.local.get(['siteConfigs','recordingLog'], ({ siteConfigs = {}, recordingLog = [] }) => {
          const site = siteConfigs[origin] || {};
          site.apiDescription = description;
          // Derive apiBase from the first recorded request if not already set
          if (recordingLog.length && !site.apiBase) {
            try {
              const firstUrl = new URL(recordingLog[0].url);
              site.apiBase = firstUrl.origin; // protocol + host (+ port)
              console.log('[Popup] Derived apiBase from recording:', site.apiBase);
            } catch(e) {
              console.warn('[Popup] Failed to derive apiBase:', e);
            }
          }
          siteConfigs[origin] = site;
          chrome.storage.local.set({ siteConfigs, recordingLog: [] }, () => {
            renderLog([]);
            generateBtn.disabled = true;
            generateBtn.textContent = originalText;
            spinner.style.display = 'none';
            // highlight inject button
            injectBtn.classList.add('highlight');
          });
        });
      });
    } catch (err) {
      console.error(err);
      alert('Failed to generate description: ' + err.message);
      spinner.style.display = 'none';
      generateBtn.textContent = originalText;
      generateBtn.disabled = false;
    }
  }

  generateBtn.addEventListener('click', generateDescription);

  // Remove highlight when user clicks injectBtn
  injectBtn.addEventListener('click', () => {
    injectBtn.classList.remove('highlight');
  });
}); 