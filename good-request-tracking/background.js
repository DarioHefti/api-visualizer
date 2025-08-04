const emojiMap = {
  fetch: '🚀',
  xhr: '📡',
  webreq: '🌍'
};

// ===== EMBEDDED SCHEMA GENERATOR LIBRARY =====
// Browser-compatible version of the schema generator

// Utils functions
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
  
  // Debug primitive types only for non-string types to reduce noise
  if (tree.type !== 'string') {
    console.log(`🔍 Primitive type detected:`, {
      detectedType: tree.type,
      nodeType: typeof node
    });
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
      // This is a primitive value (string, number, boolean, null)
      tree.children[i] = {};
      this.buildPrimitive(tree.children[i], node[i]);
    }
  }
};

AST.prototype.buildArrayTree = function(tree, node) {
  tree.type = 'array';
  tree.children = {};
  
  if (node.length === 0) {
    // Empty array - set basic structure
    tree.uniqueItems = false;
    tree.minItems = 0;
    return;
  }
  
  var first = node[0];
  if (utils.isObject(first)) {
    // For arrays of objects, analyze all objects to get complete schema
    tree.uniqueItems = true;
    tree.minItems = 1;
    
    // Merge properties from all objects in the array to get complete schema
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
        // Ensure all properties have a type, default to the inferred type
        schema[i].type = child.type || 'string'; // fallback
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
      
      // Debug: Log only problematic property types
      if (!schema[i].type || schema[i].type === 'string') {
        console.log(`🔍 Property "${i}" type:`, {
          finalType: schema[i].type,
          hasChildType: !!child.type
        });
      }
    }
  }
};

Compiler.prototype.compile = function(tree) {
  if (tree.type === 'object') {
    this.schema = {
      '$schema': 'http://json-schema.org/draft-04/schema#',
      description: '',
      type: 'object',
      properties: {},
      required: []
    };
    this.generate(tree, this.schema.properties, this.schema);
  } else {
    this.schema = {
      type: 'array',
      '$schema': 'http://json-schema.org/draft-04/schema#',
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
  
  // Debug: Log schema structure for arrays with objects
  if (compiler.schema.properties) {
    Object.keys(compiler.schema.properties).forEach(function(key) {
      var prop = compiler.schema.properties[key];
      if (prop.type === 'array' && prop.items && prop.items.properties) {
        console.log(`🔍 Array schema for "${key}":`, {
          arrayType: prop.type,
          itemType: prop.items.type,
          itemProperties: Object.keys(prop.items.properties),
          fullArraySchema: prop
        });
      }
    });
  }
  
  return compiler.schema;
}

// ===== END EMBEDDED SCHEMA GENERATOR LIBRARY =====

function logEntry(type, info) {
  const emoji = emojiMap[type] || '❔';
  const url = info.url || 'n/a';
  const method = info.method || '';
  console.log(`${emoji} ${type.toUpperCase()} ${method} ${url}`);
  Object.entries(info).forEach(([k, v]) => {
    if (k !== 'url' && k !== 'method') console.log(`${k[0].toUpperCase()+k.slice(1)}:`, v);
  });
  console.log('---');
  
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
            // Looks like XML/HTML
            const schema = {
              type: 'xml_or_html',
              length: body.length,
              rootElement: body.match(/<([^>\s]+)/)?.[1] || 'unknown'
            };
            addSchemaEntry(url, schema);
          } else if (contentType.includes('text/plain') || contentType.includes('text/')) {
            // Plain text response
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

// Schema generation is now handled by the imported library

function addSchemaEntry(url, schema) {
  const entry = {
    url,
    schema,
    timestamp: new Date().toISOString(),
    id: Date.now() + Math.random().toString(36).substr(2, 9)
  };
  
  chrome.storage.local.get({ schemas: [] }, (data) => {
    const schemas = data.schemas || [];
    schemas.push(entry);
    
    // Keep only last 100 entries to prevent storage bloat
    const trimmed = schemas.slice(-100);
    
    chrome.storage.local.set({ schemas: trimmed }, () => {
      console.log(`📝 Schema stored for ${url}:`, {
        totalSchemas: trimmed.length,
        schemaProperties: Object.keys(schema.properties || {}),
        schemaType: schema.type,
        fullSchema: schema
      });
      
      // Debug: Check only properties without proper types
      if (schema.properties) {
        Object.keys(schema.properties).forEach(function(key) {
          var prop = schema.properties[key];
          if (!prop.type) {
            console.log(`⚠️ Property "${key}" missing type:`, prop);
          }
        });
      }
      
      // Additional debug: Test schema storage is working
      chrome.storage.local.get({ schemas: [] }, (testData) => {
        console.log(`🔍 Storage verification: ${testData.schemas.length} schemas in storage`);
      });
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  console.log('📨 Background received message:', msg.type, msg.data?.type, msg.data?.request?.url);
  
  if (msg.type === 'intercepted') {
    try {
      logEntry(msg.data.type, msg.data.request ? { ...msg.data.request, response: msg.data.response, data: msg.data.data } : msg.data);
    } catch (error) {
      console.error('❌ Error processing intercepted message:', error);
    }
  } else if (msg.type === 'inject_script' && sender.tab) {
    console.log('🔧 Injecting script into tab:', sender.tab.id);
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id }, files: ['injected.js'], world: 'MAIN' })
      .then(() => console.log('✅ Script injection successful'))
      .catch(err => console.warn('❌ Failed to inject script:', err));
  } else {
    console.log('ℹ️ Unknown message type:', msg.type);
  }
});

// Catch-all network level using webRequest (works even for ServiceWorkers & Workers)
// Network metadata log (no body)
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!details.url.startsWith('http')) return;
    logEntry('webreq', {
      url: details.url,
      method: details.method,
      statusCode: details.statusCode,
      type: details.type,
      initiator: details.initiator
    });
  },
  { urls: ['<all_urls>'] }
);

// Enhanced webRequest response body capture for Manifest V3
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
      if (totalSize > 10 * 1024 * 1024) { // Skip > 10MB
        console.log(`⚠️ Skipping large request: ${details.url} (${totalSize} bytes)`);
        return;
      }
    }
    
    console.log(`🌍 Setting up response filter for: ${details.url} (type: ${details.type})`);
    
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
        // Check size limit
        totalSize += event.data.byteLength;
        if (totalSize > maxSize) {
          console.log(`⚠️ Response too large for ${details.url}, stopping capture at ${totalSize} bytes`);
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
        
        if (hasError || chunks.length === 0) {
          console.log(`ℹ️ No valid data to process for ${details.url}`);
          return;
        }
        
        const responseBody = arrayBufferToString(chunks);
        console.log(`🔍 Processing webRequest response for ${details.url}:`, {
          bodyLength: responseBody.length,
          chunks: chunks.length,
          preview: responseBody.substring(0, 100) + (responseBody.length > 100 ? '...' : '')
        });
        
        // Try to parse as JSON
        if (responseBody.trim()) {
          try {
            const jsonData = JSON.parse(responseBody);
            const schema = jsonToSchema(jsonData);
            console.log(`✅ WebRequest schema generated for ${details.url}:`, {
              schemaType: schema.type,
              properties: Object.keys(schema.properties || {}).length
            });
            addSchemaEntry(details.url, schema);
          } catch (parseError) {
            console.log(`ℹ️ WebRequest response not JSON for ${details.url}: ${parseError.message.substring(0, 100)}`);
            
            // Try to detect other structured formats
            if (responseBody.trim().startsWith('<') && responseBody.includes('>')) {
              const schema = {
                type: 'xml_or_html',
                length: responseBody.length,
                source: 'webRequest',
                rootElement: responseBody.match(/<([^>\s/]+)/)?.[1] || 'unknown'
              };
              addSchemaEntry(details.url, schema);
            } else if (responseBody.length < 1000) { // Only for small text responses
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

console.log('🔧 Background script loaded successfully with webRequest response capture');