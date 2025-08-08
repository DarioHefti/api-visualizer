// ===== EMBEDDED SCHEMA GENERATOR LIBRARY =====
// Browser-compatible version of the schema generator from good-request-tracking

const utils = {
  isObject: function (value) {
    return (null !== value && typeof value === typeof {} && !this.isArray(value));
  },

  isNumber: function (value) {
    return !this.isArray(value) && (value - parseFloat(value) + 1) >= 0;
  },

  isArray: function (value) {
    return (value instanceof Array);
  },

  isString: function (value) {
    return (typeof value === typeof '');
  },

  isNull: function (value) {
    return (null === value);
  },

  isBoolean: function (value) {
    return (value === true || value === false);
  },

  getType: function (data) {
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

AST.prototype.buildPrimitive = function (tree, node) {
  tree.type = utils.getType(node);
  if (tree.type === 'string') {
    tree.minLength = (node.length > 0) ? 1 : 0;
  }

  if (node !== null && typeof node !== 'undefined') {
    tree.required = true;
  }
};

AST.prototype.buildObjectTree = function (tree, node) {
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

AST.prototype.buildArrayTree = function (tree, node) {
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

AST.prototype.build = function (json) {
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

Compiler.prototype.generate = function (tree, schema, parent) {
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

Compiler.prototype.compile = function (tree) {
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

// Main schema generator function (advanced)
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




// Helper to persist the log
function persistLog() {
  console.log(recordingLog);
  chrome.storage.local.set({ recordingLog });
}

// Simple JSON content-type check
function isJsonContentType(value = '') {
  return /^application\/(?:json|[a-z0-9.+-]*\+json)\b/i.test(value);
}

// Normalize URL against current recording origin to avoid duplicates
function toAbsoluteUrl(inputUrl) {
  try {
    const u = new URL(inputUrl, recordingOrigin || undefined);
    return u.toString();
  } catch {
    return inputUrl;
  }
}

// Canonical key: origin + pathname (no query/hash) + method
function canonicalKeyFor(inputUrl, method = 'GET') {
  try {
    const u = new URL(inputUrl, recordingOrigin || undefined);
    return `${u.origin}${u.pathname}::${method.toUpperCase()}`;
  } catch {
    return `${inputUrl}::${method.toUpperCase()}`;
  }
}

// Heuristics to ignore framework/static navigation endpoints even if JSON
const DEFAULT_IGNORED_PATTERNS = [
  // Common static directories
  /(^|\/)assets(\/|$)/i,
  /(^|\/)static(\/|$)/i,
  /(^|\/)i18n(\/|$)/i,
  /(^|\/)locales?(\/|$)/i,
  /(^|\/)translations?(\/|$)/i,
  // Framework build outputs
  /(^|\/)_(?:next)(\/|$)/i,
  /(^|\/)\.(?:next|vite)(\/|$)/i,
  /(^|\/)webpack(\/|$)/i,
  /(^|\/)sockjs-node(\/|$)/i,
  // Service workers/manifests
  /(^|\/)ngsw(\/|\.|$)/i,
  /(^|\/)service-worker(\/|\.|$)/i,
  /(^|\/)manifest\.json$/i,
  /(^|\/)asset-manifest\.json$/i
];

function isIgnoredUrl(inputUrl) {
  try {
    const u = new URL(inputUrl, recordingOrigin || undefined);
    const path = u.pathname || '';
    return DEFAULT_IGNORED_PATTERNS.some((re) => re.test(path));
  } catch {
    return DEFAULT_IGNORED_PATTERNS.some((re) => re.test(String(inputUrl || '')));
  }
}

// Merge two JSON Schemas conservatively
function mergeSchemas(schemaA, schemaB) {
  if (!schemaA) return schemaB;
  if (!schemaB) return schemaA;

  // If types differ, express union
  if (schemaA.type && schemaB.type && schemaA.type !== schemaB.type) {
    // Avoid nesting anyOf inside anyOf repeatedly
    const toArray = (s) => (s.anyOf ? s.anyOf : [s]);
    return { anyOf: [...toArray(schemaA), ...toArray(schemaB)] };
  }

  // Objects: merge properties and intersect required
  if (schemaA.type === 'object' && schemaB.type === 'object') {
    const propsA = schemaA.properties || {};
    const propsB = schemaB.properties || {};
    const keys = new Set([...Object.keys(propsA), ...Object.keys(propsB)]);
    const properties = {};
    for (const key of keys) {
      properties[key] = mergeSchemas(propsA[key], propsB[key]);
    }
    const reqA = new Set(schemaA.required || []);
    const reqB = new Set(schemaB.required || []);
    const required = [...[...keys].filter(k => reqA.has(k) && reqB.has(k))];
    return { type: 'object', properties, ...(required.length ? { required } : {}) };
  }

  // Arrays: merge items
  if (schemaA.type === 'array' && schemaB.type === 'array') {
    return { type: 'array', items: mergeSchemas(schemaA.items, schemaB.items) };
  }

  // Prefer the more detailed schema if available
  return schemaA.properties || schemaA.items ? schemaA : schemaB;
}

// ===== SCHEMA TRACKING FUNCTIONALITY (from good-request-tracking) =====
const emojiMap = {
  fetch: '🚀',
  xhr: '📡',
  webreq: '🌍'
};

function logEntry(type, info) {
  const emoji = emojiMap[type] || '❔';
  const url = toAbsoluteUrl(info.url || '');
  const method = (info.method || 'GET').toUpperCase();
  console.log(`${emoji} ${type.toUpperCase()} ${method} ${url}`);

  // Only process JSON responses
  if (type === 'fetch' || type === 'xhr') {
    const contentType = info.response?.headers?.['content-type'] || info.response?.headers?.['Content-Type'] || '';
    if (!isJsonContentType(contentType)) {
      return; // ignore non-JSON
    }

    if (info.response && typeof info.response.body === 'string' && info.response.body.trim()) {
      try {
        const json = JSON.parse(info.response.body);
        const schema = jsonToSchema(json);
        addSchemaEntry(url, schema, method);
      } catch (parseError) {
        // ignore invalid JSON
      }
    }
  }
}

function addSchemaEntry(url, schema, method = 'GET') {
  const absUrl = toAbsoluteUrl(url);
  const methodUp = (method || 'GET').toUpperCase();
  const key = canonicalKeyFor(absUrl, methodUp);
  const timestamp = new Date().toISOString();

  // Find by canonical key
  const matchIdx = recordingLog.findIndex(e => e.canonicalKey === key);
  if (matchIdx !== -1 && typeof recordingLog[matchIdx].response === 'object') {
    recordingLog[matchIdx].response = mergeSchemas(recordingLog[matchIdx].response, schema);
    recordingLog[matchIdx].timestamp = timestamp;
  } else if (matchIdx !== -1) {
    recordingLog[matchIdx].response = schema;
    recordingLog[matchIdx].timestamp = timestamp;
  } else {
    recordingLog.push({ url: absUrl, method: methodUp, canonicalKey: key, response: schema, timestamp });
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
      const payload = msg.data;
      const method = (payload.request?.method || 'GET').toUpperCase();
      const url = toAbsoluteUrl(payload.request?.url || payload.url || '');
      const resp = payload.response || {};
      const ct = resp.headers?.['content-type'] || resp.headers?.['Content-Type'] || '';
      if (method === 'OPTIONS') {
        return; // skip CORS preflights
      }
      if (isIgnoredUrl(url)) {
        return; // skip framework/static endpoints
      }
      if (!isJsonContentType(ct)) {
        return; // JSON only
      }
      logEntry(payload.type, { ...payload.request, url, method, response: resp });
    } catch (error) {
      console.error('❌ Error processing intercepted message:', error);
    }
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
          console.error('[Recorder] Failed to attach debugger:', chrome.runtime.lastError.message);
        } else {
          console.log('[Recorder] Debugger attached');
          chrome.debugger.sendCommand({ tabId: debuggerTabId }, 'Runtime.enable', {}, () => {
            console.log('[Recorder] Runtime domain enabled');
          });
          chrome.debugger.sendCommand({ tabId: debuggerTabId }, 'Network.enable', {
            maxResourceBufferSize: 10000000,
            maxPostDataSize: 10000000
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('[Recorder] Failed to enable Network domain:', chrome.runtime.lastError.message);
            } else {
              console.log('[Recorder] Network domain enabled');
              chrome.debugger.sendCommand({ tabId: debuggerTabId }, 'Network.setCacheDisabled', { cacheDisabled: true });
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
    if (!isRecording) return;

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


// Remove fallback re-fetch to avoid replaying requests
// (Previously used onCompleted to refetch and parse JSON)
// chrome.webRequest.onCompleted.addListener( ... ) — removed


// Chrome DevTools Protocol debugger events
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!isRecording || source.tabId !== debuggerTabId) return;

  // Track request metadata
  if (method === 'Network.requestWillBeSent') {
    const { requestId, request, type } = params;
    // Only track XHR/Fetch/documents that could carry JSON
    const isRelevantType = type === 'XHR' || type === 'Fetch';
    if (!isRelevantType) return;
    pendingRequests.set(requestId, {
      url: toAbsoluteUrl(request.url),
      method: (request.method || 'GET').toUpperCase(),
      hasJson: false
    });
    return;
  }

  if (method === 'Network.responseReceived') {
    const { requestId, response } = params;
    const meta = pendingRequests.get(requestId);
    if (!meta) return;
    const ct = response.headers && (response.headers['content-type'] || response.headers['Content-Type']) || '';
    const mime = response.mimeType || '';
    const looksJson = isJsonContentType(ct) || isJsonContentType(mime);
    // Only mark as JSON to retrieve body later
    if (looksJson) {
      meta.hasJson = true;
      pendingRequests.set(requestId, meta);
    }
    return;
  }

  if (method === 'Network.loadingFinished') {
    const { requestId } = params;
    const meta = pendingRequests.get(requestId);
    if (!meta || !meta.hasJson) {
      // Clean up any non-JSON tracked request
      pendingRequests.delete(requestId);
      return;
    }

    // Skip framework/static endpoints
    if (meta.method === 'OPTIONS' || isIgnoredUrl(meta.url)) {
      pendingRequests.delete(requestId);
      return;
    }

    // Get response body without replaying
    chrome.debugger.sendCommand({ tabId: debuggerTabId }, 'Network.getResponseBody', { requestId }, (bodyResult) => {
      try {
        if (!bodyResult) return;
        let bodyText = bodyResult.body || '';
        if (bodyResult.base64Encoded) {
          // Decode base64
          try {
            bodyText = atob(bodyText);
          } catch (e) {
            console.warn('Failed to decode base64 body');
            pendingRequests.delete(requestId);
            return;
          }
        }
        if (!bodyText.trim()) {
          pendingRequests.delete(requestId);
          return;
        }
        try {
          const json = JSON.parse(bodyText);
          const schema = jsonToSchema(json);
          addSchemaEntry(meta.url, schema, meta.method || 'GET');
        } catch (e) {
          // Not valid JSON; ignore
        }
      } finally {
        pendingRequests.delete(requestId);
      }
    });
    return;
  }

  if (method === 'Network.loadingFailed') {
    console.log('[Recorder] Network.loadingFailed:', params.requestId, params.errorText);
    pendingRequests.delete(params.requestId);
    return;
  }

  if (method === 'Network.requestServedFromCache') {
    console.log('[Recorder] Network.requestServedFromCache:', params.requestId);
    return;
  }
});

console.log('🔧 API Data Visualizer background script loaded successfully');