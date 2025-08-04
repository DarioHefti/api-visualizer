/* Background service worker for recording same-origin GET requests using chrome.webRequest */

let isRecording = false;
let recordingOrigin = '';
let recordingLog = []; // Array of { url, method, body, response }
const requestsMap = new Map(); // requestId -> entry (to fill response later)

// helper to persist the log and enforce 10-item cap
function persistLog() {
  chrome.storage.local.set({ recordingLog });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'startRecording': {
      isRecording = true;
      recordingOrigin = msg.origin;
      recordingLog = [];
      pendingRequests.clear();
      debuggerTabId = msg.tabId;
      chrome.storage.local.set({ recordingActive: true, recordingLog: [] });
      // persist empty log as well
      persistLog();
      console.log('[Recorder] Started for origin', recordingOrigin);
      
      // Attach debugger to capture response bodies
      chrome.debugger.attach({ tabId: debuggerTabId }, "1.3", () => {
        if (chrome.runtime.lastError) {
          console.error('[Recorder] Failed to attach debugger:', chrome.runtime.lastError.message);
        } else {
          console.log('[Recorder] Debugger attached');
          // Enable multiple domains
          chrome.debugger.sendCommand({ tabId: debuggerTabId }, "Runtime.enable", {}, () => {
            console.log('[Recorder] Runtime domain enabled');
          });
          
          chrome.debugger.sendCommand({ tabId: debuggerTabId }, "Network.enable", { maxResourceBufferSize: 10000000, maxPostDataSize: 10000000 }, () => {
            if (chrome.runtime.lastError) {
              console.error('[Recorder] Failed to enable Network domain:', chrome.runtime.lastError.message);
            } else {
              console.log('[Recorder] Network domain enabled');
              // Enable additional network features
              chrome.debugger.sendCommand({ tabId: debuggerTabId }, "Network.setCacheDisabled", { cacheDisabled: true }, () => {
                console.log('[Recorder] Cache settings configured');
              });
              chrome.debugger.sendCommand({ tabId: debuggerTabId }, "Network.setUserAgentOverride", { userAgent: "" }, () => {
                console.log('[Recorder] User agent configured');
              });
              // Clear browser cache to force fresh requests
              chrome.debugger.sendCommand({ tabId: debuggerTabId }, "Network.clearBrowserCache", {}, () => {
                console.log('[Recorder] Browser cache cleared');
              });
            }
          });
        }
      });
      
      sendResponse({ ok: true });
      break;
    }
    case 'stopRecording': {
      isRecording = false;
      
      // Detach debugger
      if (debuggerTabId) {
        chrome.debugger.detach({ tabId: debuggerTabId }, () => {
          if (chrome.runtime.lastError) {
            console.error('[Recorder] Failed to detach debugger:', chrome.runtime.lastError.message);
          } else {
            console.log('[Recorder] Debugger detached');
          }
        });
        debuggerTabId = null;
      }
      
      chrome.storage.local.set({ recordingActive: false });
      console.log('[Recorder] Stopped');
      sendResponse({ ok: true });
      break;
    }
    default:
      if (msg.action === 'test') {
        console.log('[Background] Test message received');
        sendResponse({ status: 'ok' });
      }
      break;
  }
  return true; // keep messaging channel open if async needed
});

// Remove webRequest listeners since we're using page-level interception
// Keep only the auth header capture and remove the response capture parts

// capture auth headers (Authorization / X-API-Key) & strip them
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!isRecording || details.method !== 'GET') return;
    // No origin filtering here – capture auth headers for any request during recording

    // detect auth headers and stash them into siteConfigs for later reuse
    const authHeader = (details.requestHeaders || []).find(h => h.name.toLowerCase() === 'authorization');
    const apiKeyHeader = (details.requestHeaders || []).find(h => h.name.toLowerCase() === 'x-api-key');

    if (authHeader || apiKeyHeader) {
      chrome.storage.local.get(['siteConfigs'], ({ siteConfigs = {} }) => {
        const site = siteConfigs[recordingOrigin] || {};
        if (authHeader) site.jwtToken = authHeader.value;
        if (apiKeyHeader) site.apiKey = apiKeyHeader.value;
        siteConfigs[recordingOrigin] = site;
        const updateObj = { siteConfigs };
        if (apiKeyHeader) updateObj.apiKey = apiKeyHeader.value;
        chrome.storage.local.set(updateObj);
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders']
);

// Capture request URLs (but not bodies) - page-level recorder will add response bodies
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log(`[Recorder] -> ${details.method} ${details.url}`);
    
    if (!isRecording) return;
    if (details.method !== 'GET') return;
    if (details.url.startsWith('chrome-extension://')) return;
    if (!/\/api\//i.test(details.url)) return;
    if (details.initiator && details.initiator.startsWith('chrome-extension://')) return;
    if (recordingLog.length >= 10) return;

    const entry = { url: details.url, method: details.method, response: '(pending...)' };
    recordingLog.push(entry);
    persistLog();
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

// Also try to catch completed requests via webRequest
chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log(`[Recorder] <- ${details.statusCode} ${details.url}`);
    if (!isRecording) return;
    if (details.method !== 'GET') return;
    if (details.url.startsWith('chrome-extension://')) return;
    if (!/\/api\//i.test(details.url)) return; // skip non-API assets
    if (details.initiator && details.initiator.startsWith('chrome-extension://')) return;
    if (details.statusCode !== 200) return;
    
    // Find pending entry and mark it as completed via webRequest
    const idx = recordingLog.findIndex(e => e.url === details.url && e.method === 'GET' && e.response === '(pending...)');
    if (idx !== -1) {
      console.log('[Recorder] Fetching response body (fallback)');
      
      // Since debugger missed this request, fetch the response ourselves
      chrome.storage.local.get(['siteConfigs'], ({ siteConfigs = {} }) => {
        const site = siteConfigs[recordingOrigin] || {};
        const authToken = site.jwtToken || '';

        fetch(details.url, {
          method: 'GET',
          headers: {
            ...(authToken ? { 'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}` } : {}),
            'Content-Type': 'application/json'
          }
        }).then(response => response.json()) //todo maybe revert to text()
          .then(text => {
            console.log('[Recorder] Response captured, length:', text.length);
            recordingLog[idx].response = text;
            persistLog();
          })
          .catch(err => {
            console.error('[Recorder] Fallback fetch failed:', err.message);
            recordingLog[idx].response = '(fallback fetch failed: ' + err.message + ')';
            persistLog();
          });
      });
    }
  },
  { urls: ['<all_urls>'] },
  []
);

let debuggerTabId = null;
let pendingRequests = new Map(); // requestId -> log entry index

// Use Chrome DevTools Protocol to capture response bodies
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!isRecording || source.tabId !== debuggerTabId) return;
  
  if (method === 'Network.requestWillBeSent') {
    // no-op: remove verbose network logs
  }
  
  if (method === 'Network.loadingFinished') {
    // removed fallback attempt here
  }
  
  if (method === 'Network.loadingFailed') {
    console.log('[Recorder] Network.loadingFailed:', params.requestId, params.errorText);
    return;
  }
  
  if (method === 'Network.requestServedFromCache') {
    console.log('[Recorder] Network.requestServedFromCache:', params.requestId);
    return;
  }
  
  if (method === 'Network.responseReceived') {
    // ignore other debugger events
  }
}); 