// ===== EMBEDDED SCHEMA GENERATOR LIBRARY =====
// Browser-compatible version of the schema generator from good-request-tracking

const utils = {
  isObject: function(value) {
    return (null !== value && typeof value === typeof {} && !this.isArray(value));
  },
  
  isNumber: function(value) {
    return !this.isArray(value) && (value - parseFloat(value) + 1) >= 0;
  },
  
  isArray: function(value) {
    return (value instanceof Array);
  },
  
  isString: function(value) {
    return (typeof value === typeof '');
  },
  
  isNull: function(value) {
    return (null === value);
  },
  
  isBoolean: function(value) {
    return (value === true || value === false);
  },
  
  getType: function(data) {
    if (this.isObject(data)) {
      return 'object';
    } else if (this.isArray(data)) {
      return 'array';
    } else if (this.isNull(data)) {
      return null;
    } else if (this.isBoolean(data)) {
      return 'boolean';
    } else if (this.isString(data)) {
      return 'string';
    } else if (this.isNumber(data)) {
      return 'number';
    }
  }
};

// AST Class
function AST() {
  this.tree = {};
}

AST.prototype.buildPrimitive = function(tree, node) {
  tree.type = utils.getType(node);
  if (tree.type === 'string') {
    tree.minLength = (node.length > 0) ? 1 : 0;
  }
  
  if (node !== null && typeof node !== 'undefined') {
    tree.required = true;
  }
};

AST.prototype.buildObjectTree = function(tree, node) {
  tree.type = tree.type || 'object';
  tree.children = tree.children || {};
  for (var i in node) {
    if (utils.isArray(node[i])) {
      tree.children[i] = {};
      this.buildArrayTree(tree.children[i], node[i]);
    } else if (utils.isObject(node[i])) {
      tree.children[i] = {};
      this.buildObjectTree(tree.children[i], node[i]);
    } else {
      tree.children[i] = {};
      this.buildPrimitive(tree.children[i], node[i]);
    }
  }
};

AST.prototype.buildArrayTree = function(tree, node) {
  tree.type = 'array';
  tree.children = {};
  
  if (node.length === 0) {
    tree.uniqueItems = false;
    tree.minItems = 0;
    return;
  }
  
  var first = node[0];
  if (utils.isObject(first)) {
    tree.uniqueItems = true;
    tree.minItems = 1;
    
    var mergedObject = {};
    for (var idx = 0; idx < node.length; idx++) {
      if (utils.isObject(node[idx])) {
        var keys = Object.keys(node[idx]);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          if (!mergedObject.hasOwnProperty(key)) {
            mergedObject[key] = node[idx][key];
          }
        }
      }
    }
    
    return this.buildObjectTree(tree, mergedObject);
  }
  
  for (var i = 0; i < node.length; i++) {
    if (utils.isObject(node[i])) {
      tree.children[i] = {};
      tree.children[i].type = 'object';
      var keys = Object.keys(node[i]);
      if (keys.length > 0) {
        tree.children[i].required = true;
      }
      this.buildObjectTree(tree.children[i], node[i]);
    } else if (utils.isArray(node[i])) {
      tree.children[i] = {};
      tree.children[i].type = 'array';
      tree.children[i].uniqueItems = true;
      if (node[i].length > 0) {
        tree.children[i].required = true;
      }
      this.buildArrayTree(tree.children[i], node[i]);
    } else {
      tree.children[i] = {};
      this.buildPrimitive(tree.children[i], node[i]);
    }
  }
};

AST.prototype.build = function(json) {
  if (json instanceof Array) {
    this.buildArrayTree(this.tree, json);
  } else {
    this.buildObjectTree(this.tree, json);
  }
};

// Compiler Class
function Compiler() {
  this.schema = {};
}

Compiler.prototype.generate = function(tree, schema, parent) {
  for (var i in tree.children) {
    var child = tree.children[i];
    if (child.type === 'object') {
      if (utils.isArray(parent.required)) {
        parent.required.push(i);
      }
      schema[i] = {
        type: 'object',
        properties: {},
        required: []
      };
      this.generate(child, schema[i].properties, schema[i]);
    } else if (child.type === 'array') {
      if (utils.isArray(parent.required)) {
        parent.required.push(i);
      }
      schema[i] = {
        type: 'array',
        uniqueItems: child.uniqueItems,
        minItems: child.minItems,
        items: {
          type: 'object',
          required: [],
          properties: {}
        }
      };
      this.generate(child, schema[i].items.properties, schema[i].items);
    } else {
      schema[i] = {};
      if (child.type) {
        schema[i].type = child.type;
      } else {
        schema[i].type = child.type || 'string';
      }
      
      if (child.minLength) {
        schema[i].minLength = child.minLength;
      }
      
      if (child.required) {
        if (parent.items && utils.isArray(parent.items.required)) {
          parent.items.required.push(i);
        } else {
          parent.required.push(i);
        }
      }
    }
  }
};

Compiler.prototype.compile = function(tree) {
  if (tree.type === 'object') {
    this.schema = {
      description: '',
      type: 'object',
      properties: {},
      required: []
    };
    this.generate(tree, this.schema.properties, this.schema);
  } else {
    this.schema = {
      type: 'array',
      description: '',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'object',
        required: [],
        properties: {}
      }
    };
    this.generate(tree, this.schema.items.properties, this.schema.items);
  }
};

// Main schema generator function
function jsonToSchema(json) {
  var compiler = new Compiler();
  var ast = new AST();
  ast.build(json);
  compiler.compile(ast.tree);
  return compiler.schema;
}

// ===== END EMBEDDED SCHEMA GENERATOR LIBRARY =====

// ===== RECORDING FUNCTIONALITY (from good-vizualization) =====
let isRecording = false;
let recordingOrigin = '';
let recordingLog = [];
let debuggerTabId = null;
let pendingRequests = new Map();
let heartbeatInterval = null;

// Heartbeat mechanism to keep recording state in sync
function startHeartbeat() {
  stopHeartbeat(); // Clear any existing interval
  updateHeartbeat(); // Immediate update
  heartbeatInterval = setInterval(updateHeartbeat, 2000); // Update every 2 seconds
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  // Clear heartbeat timestamp when stopping
  chrome.storage.local.set({ recordingHeartbeat: null });
}

function updateHeartbeat() {
  if (isRecording) {
    chrome.storage.local.set({ recordingHeartbeat: Date.now() });
  }
}

// Reset recording state on browser startup/extension load
chrome.runtime.onStartup.addListener(() => {
  console.log('[Recorder] Browser started, resetting recording state');
  isRecording = false;
  debuggerTabId = null;
  chrome.storage.local.set({ 
    recordingActive: false, 
    recordingHeartbeat: null 
  });
});

// Also reset on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Recorder] Extension installed/updated, resetting recording state');
  isRecording = false;
  debuggerTabId = null;
  chrome.storage.local.set({ 
    recordingActive: false, 
    recordingHeartbeat: null 
  });
});

// ===== Common filter helper =====
function shouldTrack(details, { requireResponse = false, requireJsonHeader = false } = {}) {
  if (!isRecording) return false;
  if (details.method !== 'GET') return false;
  if (details.url.startsWith('chrome-extension://')) return false;
  // Skip typical static asset extensions
  if (/\.(?:json|js|mjs|css|png|jpe?g|gif|svg|ico|webp|woff2?|ttf)(?:\?|$)/i.test(details.url)) return false;
  if (details.initiator && details.initiator.startsWith('chrome-extension://')) return false;

  if (requireResponse) {
    if (details.statusCode !== 200) return false;
    if (requireJsonHeader) {
      const ctHeader = (details.responseHeaders || []).find(h => h.name.toLowerCase() === 'content-type');
      if (!ctHeader) return false;
      if (!/^application\/json\b/i.test(ctHeader.value)) return false;
    }
  }
  return true;
}


// Storage quota management constants
const MAX_RECORDING_LOG_ENTRIES = 100;
const STORAGE_WARNING_THRESHOLD = 0.8; // 80% of quota

// Helper to persist the log with quota management
function persistLog() {
  // Trim oldest entries if exceeding limit
  if (recordingLog.length > MAX_RECORDING_LOG_ENTRIES) {
    const excess = recordingLog.length - MAX_RECORDING_LOG_ENTRIES;
    recordingLog.splice(0, excess);
    console.log(`[Storage] Trimmed ${excess} oldest entries to stay under limit`);
  }
  
  console.log(`[Storage] Persisting ${recordingLog.length} entries`);
  chrome.storage.local.set({ recordingLog }, () => {
    // Check storage usage after write
    checkStorageQuota();
  });
}

// Check storage quota and warn if approaching limit
function checkStorageQuota() {
  if (chrome.storage.local.getBytesInUse) {
    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
      // chrome.storage.local has a 5MB limit (5242880 bytes)
      const quotaBytes = 5242880;
      const usageRatio = bytesInUse / quotaBytes;
      
      if (usageRatio > STORAGE_WARNING_THRESHOLD) {
        console.warn(`[Storage] Warning: Storage usage at ${(usageRatio * 100).toFixed(1)}% (${(bytesInUse / 1024).toFixed(1)}KB / 5MB)`);
        
        // If very high, aggressively trim the recording log
        if (usageRatio > 0.95 && recordingLog.length > 10) {
          const trimCount = Math.floor(recordingLog.length / 2);
          recordingLog.splice(0, trimCount);
          console.warn(`[Storage] Emergency trim: removed ${trimCount} entries to free space`);
          chrome.storage.local.set({ recordingLog });
        }
      }
    });
  }
}

// ===== SCHEMA TRACKING FUNCTIONALITY (from good-request-tracking) =====
const emojiMap = {
  fetch: '🚀',
  xhr: '📡',
  webreq: '🌍'
};

function logEntry(type, info) {
  const emoji = emojiMap[type] || '❔';
  const url = info.url || 'n/a';
  const method = info.method || '';
  console.log(`${emoji} ${type.toUpperCase()} ${method} ${url}`);
  
  // Enhanced schema generation for responses
  if (type === 'fetch' || type === 'xhr') {
    if (info.response && info.response.body) {
      const body = info.response.body;
      const contentType = info.response.headers?.['content-type'] || '';
      
      console.log(`🔍 Processing response body for ${url}:`, {
        bodyType: typeof body,
        bodyLength: body.length,
        contentType,
        isString: typeof body === 'string'
      });
      
      // Try to parse JSON responses
      if (typeof body === 'string' && body.trim()) {
        try {
          const json = JSON.parse(body);
          const schema = jsonToSchema(json);
          console.log(`✅ JSON schema generated for ${url}:`, schema);
          addSchemaEntry(url, schema);
        } catch (parseError) {
          console.log(`❌ Failed to parse JSON for ${url}:`, parseError.message);
          
          // Try to detect other structured data formats
          if (body.trim().startsWith('<') && body.includes('>')) {
            const schema = {
              type: 'xml_or_html',
              length: body.length,
              rootElement: body.match(/<([^>\s]+)/)?.[1] || 'unknown'
            };
            addSchemaEntry(url, schema);
          } else if (contentType.includes('text/plain') || contentType.includes('text/')) {
            const schema = {
              type: 'text',
              length: body.length,
              lines: body.split('\n').length,
              contentType
            };
            addSchemaEntry(url, schema);
          }
        }
      }
    } else {
      console.log(`ℹ️ No response body to process for ${url}`);
    }
  }
}

function addSchemaEntry(url, schema) {
  // Store schema directly on the recording log instead of a separate collection
  const matchIdx = recordingLog.findIndex(e => e.url === url && e.method === 'GET');
  if (matchIdx !== -1) {
    recordingLog[matchIdx].response = schema;
  } else {
    recordingLog.push({ url, method: 'GET', response: schema, timestamp: new Date().toISOString() });
  }
  persistLog();
}

// ===== MESSAGE HANDLERS =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('📨 Background received message:', msg.type || msg.action, msg.data?.type, msg.data?.request?.url);
  
  // Handle intercepted requests (from injected script)
  if (msg.type === 'intercepted') {
    if (!isRecording) return; // Ignore when not actively recording
    try {
      logEntry(msg.data.type, msg.data.request ? { ...msg.data.request, response: msg.data.response, data: msg.data.data } : msg.data);
    } catch (error) {
      console.error('❌ Error processing intercepted message:', error);
    }
    return;
  }
  
  // Handle script injection requests
  if (msg.type === 'inject_script' && sender.tab) {
    console.log('🔧 Injecting script into tab:', sender.tab.id);
    chrome.scripting.executeScript({ 
      target: { tabId: sender.tab.id }, 
      files: ['injected.js'], 
      world: 'MAIN' 
    })
      .then(() => console.log('✅ Script injection successful'))
      .catch(err => console.warn('❌ Failed to inject script:', err));
    return;
  }

  // Handle recording control messages
  switch (msg.action) {
    case 'startRecording': {
      recordingOrigin = msg.origin;
      recordingLog = [];
      pendingRequests.clear();
      debuggerTabId = msg.tabId;
      console.log('[Recorder] Starting for origin', recordingOrigin);
      
      // Inject fetch/XHR interceptor into the page when recording starts
      chrome.scripting.executeScript({
        target: { tabId: debuggerTabId },
        files: ['injected.js'],
        world: 'MAIN'
      }).then(() => {
        console.log('[Recorder] Interceptor injected');
      }).catch(err => {
        console.warn('[Recorder] Failed to inject interceptor:', err);
      });
      
      // Attach debugger to capture response bodies
      chrome.debugger.attach({ tabId: debuggerTabId }, "1.3", () => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          console.error('[Recorder] Failed to attach debugger:', errorMsg);
          
          // Reset recording state on failure
          isRecording = false;
          debuggerTabId = null;
          chrome.storage.local.set({ recordingActive: false, recordingLog: [] });
          
          // Determine user-friendly error message
          let userMessage = 'Failed to start recording.';
          if (errorMsg.includes('Another debugger')) {
            userMessage = 'Cannot start recording while DevTools is open. Please close DevTools and try again.';
          } else if (errorMsg.includes('Cannot access')) {
            userMessage = 'Cannot record on this page. Try a different website.';
          } else {
            userMessage = `Recording failed: ${errorMsg}`;
          }
          
          sendResponse({ ok: false, error: userMessage });
        } else {
          console.log('[Recorder] Debugger attached');
          
          // Now set recording as active since debugger attached successfully
          isRecording = true;
          chrome.storage.local.set({ recordingActive: true, recordingLog: [] });
          persistLog();
          startHeartbeat(); // Start heartbeat to keep state in sync
          
          chrome.debugger.sendCommand({ tabId: debuggerTabId }, "Runtime.enable", {}, () => {
            console.log('[Recorder] Runtime domain enabled');
          });
          
          chrome.debugger.sendCommand({ tabId: debuggerTabId }, "Network.enable", { 
            maxResourceBufferSize: 10000000, 
            maxPostDataSize: 10000000 
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('[Recorder] Failed to enable Network domain:', chrome.runtime.lastError.message);
            } else {
              console.log('[Recorder] Network domain enabled');
              chrome.debugger.sendCommand({ tabId: debuggerTabId }, "Network.setCacheDisabled", { cacheDisabled: true });
            }
          });
          
          sendResponse({ ok: true });
        }
      });
      
      break;
    }
    
    case 'stopRecording': {
      isRecording = false;
      stopHeartbeat(); // Stop heartbeat
      
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

// ===== WEBREQUEST LISTENERS =====

// Capture auth headers during recording
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!isRecording || details.method !== 'GET') return;

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


// Capture completed requests during recording
// Note: Response body capture happens through the injected script interceptors
// This listener just logs completed requests for debugging
chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log(`[Recorder] <- ${details.statusCode} ${details.url}`);
    if (!shouldTrack(details, { requireResponse: true, requireJsonHeader: true })) return;

    // Check if we already have a schema for this request (captured by interceptors)
    const existingIdx = recordingLog.findIndex(e => e.url === details.url && e.method === 'GET');
    if (existingIdx !== -1 && recordingLog[existingIdx].response && 
        typeof recordingLog[existingIdx].response === 'object') {
      // Already have schema from interceptor, no action needed
      console.log('[Recorder] Schema already captured via interceptor:', details.url);
      return;
    }
    
    // If no entry exists yet, create a placeholder
    // The actual schema will be filled in by the intercepted fetch/XHR response
    if (existingIdx === -1) {
      recordingLog.push({ 
        url: details.url, 
        method: details.method, 
        response: '(awaiting interceptor data)',
        timestamp: new Date().toISOString()
      });
      persistLog();
      console.log('[Recorder] Created placeholder entry for:', details.url);
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Chrome DevTools Protocol debugger events
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!isRecording || source.tabId !== debuggerTabId) return;
  
  if (method === 'Network.loadingFailed') {
    console.log('[Recorder] Network.loadingFailed:', params.requestId, params.errorText);
    return;
  }
  
  if (method === 'Network.requestServedFromCache') {
    console.log('[Recorder] Network.requestServedFromCache:', params.requestId);
    return;
  }
});

console.log('🔧 API Data Visualizer background script loaded successfully');