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

// ===== Simplified JSON Schema Generator =====
function _getType(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val; // 'string', 'number', 'boolean', 'object', 'undefined'
}

function jsonToSchema(data) {
  const t = _getType(data);
  if (t === 'object') {
    const properties = {};
    for (const key in data) {
      properties[key] = jsonToSchema(data[key]);
    }
    return { type: 'object', properties };
  }
  if (t === 'array') {
    if (data.length === 0) {
      return { type: 'array', items: {} };
    }
    const first = data[0];
    const itemType = _getType(first);
    if (itemType === 'object') {
      return { type: 'array', items: jsonToSchema(first) };
    }
    return { type: 'array', items: { type: itemType } };
  }
  // primitives: string, number, boolean, null, undefined
  return { type: t };
}
// ===== End Simplified JSON Schema Generator =====

// ===== RECORDING FUNCTIONALITY (from good-vizualization) =====
let isRecording = false;
let recordingOrigin = '';
let recordingLog = [];
let debuggerTabId = null;
let pendingRequests = new Map();

// Helper to persist the log
function persistLog() {
  console.log(recordingLog);
  chrome.storage.local.set({ recordingLog });
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
      isRecording = true;
      recordingOrigin = msg.origin;
      recordingLog = [];
      pendingRequests.clear();
      debuggerTabId = msg.tabId;
      chrome.storage.local.set({ recordingActive: true, recordingLog: [] });
      persistLog();
      console.log('[Recorder] Started for origin', recordingOrigin);
      
      // Attach debugger to capture response bodies
      chrome.debugger.attach({ tabId: debuggerTabId }, "1.3", () => {
        if (chrome.runtime.lastError) {
          console.error('[Recorder] Failed to attach debugger:', chrome.runtime.lastError.message);
        } else {
          console.log('[Recorder] Debugger attached');
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

// Capture request URLs during recording
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log(`[Recorder] -> ${details.method} ${details.url}`);
    if (!isRecording) return;
    if (details.method !== 'GET') return;
    if (details.url.startsWith('chrome-extension://')) return;
    if (!/\/api\//i.test(details.url)) return;
    if (details.initiator && details.initiator.startsWith('chrome-extension://')) return;

    const entry = { url: details.url, method: details.method, response: '(pending...)' };
    recordingLog.push(entry);
    persistLog();
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

// Capture completed requests during recording
chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log(`[Recorder] <- ${details.statusCode} ${details.url}`);
    if (!isRecording) return;
    if (details.method !== 'GET') return;
    if (details.url.startsWith('chrome-extension://')) return;
    if (!/\/api\//i.test(details.url)) return;
    if (details.initiator && details.initiator.startsWith('chrome-extension://')) return;
    if (details.statusCode !== 200) return;
    
    // Find pending entry and mark it as completed via webRequest
    const idx = recordingLog.findIndex(e => e.url === details.url && e.method === 'GET' && e.response === '(pending...)');
    if (idx !== -1) {
      console.log('[Recorder] Fetching response body (fallback)');
      
      chrome.storage.local.get(['siteConfigs'], ({ siteConfigs = {} }) => {
        const site = siteConfigs[recordingOrigin] || {};
        const authToken = site.jwtToken || '';

        fetch(details.url, {
          method: 'GET',
          headers: {
            ...(authToken ? { 'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}` } : {}),
            'Content-Type': 'application/json'
          }
        }).then(response => response.json())
          .then(data => {
            console.log('[Recorder] Response captured, generating schema:'+details.url);
            const schema = jsonToSchema(data);
            console.log('------------------------');
            console.log(schema);
            recordingLog[idx].response = schema;
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

// General network monitoring for schema generation
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!details.url.startsWith('http')) return;
    // Log general network requests for schema tracking
    console.log(`🌍 Network request completed: ${details.method} ${details.url} (${details.statusCode})`);
  },
  { urls: ['<all_urls>'] }
);

// Enhanced webRequest response body capture for schema generation
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Only for http/https and not extension resources
    if (!details.url.startsWith('http') || details.url.includes('extension://')) return;
    
    // Skip certain resource types that won't have JSON responses
    const skipTypes = ['image', 'media', 'font', 'stylesheet', 'websocket', 'other'];
    if (skipTypes.includes(details.type)) return;
    
    // Skip very large requests to avoid memory issues
    if (details.requestBody && details.requestBody.raw) {
      const totalSize = details.requestBody.raw.reduce((sum, part) => sum + (part.bytes?.byteLength || 0), 0);
      if (totalSize > 10 * 1024 * 1024) return; // Skip > 10MB
    }
    
    let filter;
    try {
      filter = chrome.webRequest.filterResponseData(details.requestId);
    } catch (error) {
      console.log(`⚠️ Cannot create filter for ${details.url}: ${error.message}`);
      return;
    }
    
    const chunks = [];
    let totalSize = 0;
    const maxSize = 5 * 1024 * 1024; // 5MB limit
    let hasError = false;
    
    filter.ondata = (event) => {
      try {
        totalSize += event.data.byteLength;
        if (totalSize > maxSize) {
          filter.write(event.data);
          filter.disconnect();
          return;
        }
        
        chunks.push(new Uint8Array(event.data));
        filter.write(event.data);
      } catch (error) {
        console.warn(`❌ Error in ondata for ${details.url}:`, error);
        hasError = true;
        filter.write(event.data);
      }
    };
    
    filter.onerror = (event) => {
      console.warn(`❌ Filter error for ${details.url}:`, event);
      hasError = true;
    };
    
    filter.onend = () => {
      try {
        filter.disconnect();
        
        if (hasError || chunks.length === 0) return;
        
        const responseBody = arrayBufferToString(chunks);
        
        // Try to parse as JSON for schema generation
        if (responseBody.trim()) {
          try {
            const jsonData = JSON.parse(responseBody);
            const schema = jsonToSchema(jsonData);
            console.log(`✅ WebRequest schema generated for ${details.url}`);
            addSchemaEntry(details.url, schema);
          } catch (parseError) {
            // Try to detect other structured formats
            if (responseBody.trim().startsWith('<') && responseBody.includes('>')) {
              const schema = {
                type: 'xml_or_html',
                length: responseBody.length,
                source: 'webRequest',
                rootElement: responseBody.match(/<([^>\s/]+)/)?.[1] || 'unknown'
              };
              addSchemaEntry(details.url, schema);
            } else if (responseBody.length < 1000) {
              const schema = {
                type: 'text',
                length: responseBody.length,
                source: 'webRequest',
                preview: responseBody.substring(0, 200)
              };
              addSchemaEntry(details.url, schema);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error processing webRequest response for ${details.url}:`, error);
      }
    };
  },
  { urls: ['<all_urls>'] }
);

function arrayBufferToString(chunks) {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.byteLength;
  }
  
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  
  try {
    return new TextDecoder('utf-8').decode(merged);
  } catch (error) {
    console.warn('Failed to decode as UTF-8, trying latin1');
    return new TextDecoder('latin1').decode(merged);
  }
}

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

console.log('🔧 API Tracker & Visualizer background script loaded successfully');