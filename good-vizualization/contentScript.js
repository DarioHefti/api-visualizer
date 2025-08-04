// Listener for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(request);
  if (request.action === 'initVisualization') {
    initVisualizer();
  }
});

async function initVisualizer() {
  // Avoid duplicate injection
  if (document.getElementById('ai-dashboard')) {
    console.log('AI Visualizer already injected.');
    return;
  }

  // Retrieve settings from storage
  const origin = window.location.origin;
  const { siteConfigs = {}, chatUrl, chatModel, apiKey } = await chrome.storage.local.get(['siteConfigs','chatUrl','chatModel','apiKey']);
  const site = siteConfigs[origin] || {};
  const { apiBase, jwtToken: rawToken, apiDescription } = site;
  const jwtToken = rawToken ? rawToken.replace(/^Bearer\s+/i, '') : undefined;
  
  if (!jwtToken || !apiDescription || !chatUrl || !chatModel || !apiKey) {
    console.warn('JWT token, API description, chat URL, or chat model missing.');
    return;
  }

  // Create container element
  const container = document.createElement('div');
  container.id = 'ai-dashboard';
  container.style.bottom = '0';
  container.style.left = '0';
  container.style.right = '0';
  container.style.background = '#ffffff';
  container.style.zIndex = '999999';
  document.body.appendChild(container);

  // Always load libraries from packaged resources to avoid CSP issues
  const importLocal = (path) => import(chrome.runtime.getURL(path));

  let vizLib;
  try {
    await importLocal('libs/chart/dist/chart.js');
      vizLib = await importLocal('libs/ai-data-visualization/dist/esm/index.js');
  } catch (err) {
    console.error('Failed to load local AI visualization library or its dependencies', err);
    return;
  }

  // Chat completion via user-provided endpoint or echo fallback
  const chatCompletion = async (message) => {
    if (chatUrl) {
      try {
        const body ={
          model: chatModel,
          messages: [{ role: 'system', content: 'You are a wizard at creating visual representations of data. You will always generate astonishing charts, grahps and diagrams.' },
             { role: 'user', content: message }],
        };
        const res = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`Chat endpoint error ${res.status}`);
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Invalid response from OpenAI');
        }
        return content;
      } catch (err) {
        console.error('chatCompletion error', err);
        throw err;
      }
    }
    // fallback echo
    return `Echo: ${message}`;
  };

  // API request implementation that adds the JWT token
  const apiRequest = async (url, options = {}) => {
    try {
      const fullUrl = apiBase ? apiBase.replace(/\/$/, '') + url : url;
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      return contentType.includes('application/json') ? await response.json() : await response.text();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  };

  try {
    const { create } = vizLib;
    create({
      container: '#ai-dashboard',
      apiDescription,
      chatCompletion,
      apiRequest,
      jwtToken,
      iframeHeight: 800,
      onError: (error) => console.error('Visualization error:', error)
    });
  } catch (err) {
    console.error('Visualization initialization failed', err);
  }
 }