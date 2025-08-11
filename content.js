// Prevent multiple injections on the same page
if (!window.__API_TRACKER_VISUALIZER_INJECTED__) {
  window.__API_TRACKER_VISUALIZER_INJECTED__ = true;
  
  console.log('🔧 API Data Visualizer content script loaded on:', window.location.href);
  
  // ===== REQUEST INTERCEPTION FUNCTIONALITY (from good-request-tracking) =====
  
  // (Injection moved to background script - will be triggered on recording start)

  // Listen for messages from the injected script (request interception)
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data.__FROM_PAGE__) return;
    
    console.log('📨 Received message from injected script:', event.data.payload?.type, event.data.payload?.request?.url);
    
    try {
      chrome.runtime.sendMessage({ type: 'intercepted', data: event.data.payload });
    } catch (error) {
      console.warn('Failed to send intercepted data:', error);
    }
  });

  // (Interceptor status check removed – interception only enabled during active recording)
}

// ===== AI VISUALIZATION FUNCTIONALITY (from good-vizualization) =====

// Listener for messages from the popup (AI visualization)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Content script received message:', request);
  if (request.action === 'initVisualization') {
    initVisualizer();
  }
  if (request.ping) {
    sendResponse({ pong: true });
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
    alert('Missing required configuration! Please:\n1. Record some API requests\n2. Generate API description\n3. Configure AI settings\n4. Try again');
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
  container.style.border = '1px solid #ccc';
  container.style.borderBottom = 'none';
  document.body.appendChild(container);

  // Always load libraries from packaged resources to avoid CSP issues
  const importLocal = (path) => import(chrome.runtime.getURL(path));

  let vizLib;
  try {
    await importLocal('libs/chart/dist/chart.js');
    vizLib = await importLocal('libs/ai-data-visualization/dist/esm/index.js');
  } catch (err) {
    console.error('Failed to load local AI visualization library or its dependencies', err);
    alert('Failed to load visualization libraries. Please check the extension installation.');
    return;
  }

  // Chat completion via user-provided endpoint
  const chatCompletion = async (message) => {
    if (chatUrl) {
      try {
        const body = {
          model: chatModel,
          messages: [
            { 
              role: 'system', 
              content: 'You are a wizard at creating visual representations of data. You will always generate astonishing charts, graphs and diagrams.' 
            },
            { role: 'user', content: message }
          ],
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
            throw new Error('Invalid response from AI endpoint');
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
      onError: (error) => {
        console.error('Visualization error:', error);
        alert('Visualization error: ' + error.message);
      }
    });
    console.log('✅ AI Visualizer successfully initialized');
  } catch (err) {
    console.error('Visualization initialization failed', err);
    alert('Failed to initialize visualizer: ' + err.message);
  }
}

// Add debugging for page lifecycle
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔧 DOM Content Loaded, API Data Visualizer should be active');
});

console.log('✅ API Data Visualizer content script fully loaded');