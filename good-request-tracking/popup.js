document.addEventListener('DOMContentLoaded', function() {
  const refreshBtn = document.getElementById('refresh');
  const testBtn = document.getElementById('test');
  const debugBtn = document.getElementById('debug');
  const exportBtn = document.getElementById('export');
  const clearBtn = document.getElementById('clear');
  const statsDiv = document.getElementById('stats');
  const contentDiv = document.getElementById('content');
  
  // Load and display schemas
  function loadSchemas() {
    chrome.storage.local.get(['schemas'], function(data) {
      const schemas = data.schemas || [];
      displayStats(schemas);
      displaySchemas(schemas);
    });
  }
  
  function displayStats(schemas) {
    const uniqueUrls = new Set(schemas.map(s => s.url)).size;
    const totalRequests = schemas.length;
    
    statsDiv.innerHTML = `
      <strong>📊 Stats:</strong> 
      ${totalRequests} total responses intercepted from ${uniqueUrls} unique URLs
    `;
  }
  
  // Track expanded schemas
  const expandedSchemas = new Set();
  
  function displaySchemas(schemas) {
    // Save currently expanded states before regenerating HTML
    const currentlyExpanded = document.querySelectorAll('.schema-content.expanded');
    currentlyExpanded.forEach(element => {
      const id = element.id.replace('content-', '');
      expandedSchemas.add(id);
    });
    
    if (schemas.length === 0) {
      contentDiv.innerHTML = `
        <div class="no-data">
          <p><strong>No schemas found</strong></p>
          <p>Try visiting some websites with JSON APIs to start collecting schemas.</p>
          <p>Make sure the extension is enabled and reload the page if needed.</p>
          <p><em>Check the browser console for debugging information.</em></p>
        </div>
      `;
      return;
    }
    
    // Group by URL and show most recent schema for each
    const urlGroups = {};
    schemas.forEach((entry, index) => {
      if (!urlGroups[entry.url]) {
        urlGroups[entry.url] = [];
      }
      urlGroups[entry.url].push({...entry, originalIndex: index});
    });
    
    const html = Object.entries(urlGroups)
      .sort(([, a], [, b]) => {
        // Sort by most recent timestamp
        const latestA = Math.max(...a.map(e => new Date(e.timestamp || 0).getTime()));
        const latestB = Math.max(...b.map(e => new Date(e.timestamp || 0).getTime()));
        return latestB - latestA;
      })
      .map(([url, entries]) => {
        const latest = entries[entries.length - 1];
        const count = entries.length;
        const timestamp = latest.timestamp ? new Date(latest.timestamp).toLocaleString() : 'Unknown';
        const uniqueId = latest.id || latest.originalIndex;
        
        // Get schema summary
        const schema = latest.schema;
        let schemaInfo = '';
        if (schema) {
          if (typeof schema === 'object' && schema.type === 'object') {
            const propCount = Object.keys(schema.properties || {}).length;
            schemaInfo = `Object (${propCount} properties)`;
          } else if (typeof schema === 'object' && schema.type === 'array' && schema.items) {
            if (schema.items.type === 'object') {
              const propCount = Object.keys(schema.items.properties || {}).length;
              schemaInfo = `Array of Objects (${propCount} properties each)`;
            } else {
              schemaInfo = `Array of ${schema.items}`;
            }
          } else if (typeof schema === 'string') {
            schemaInfo = schema;
          } else {
            schemaInfo = `Type: ${schema.type || 'unknown'}`;
          }
        }
        
        return `
          <div class="schema-entry">
            <div class="schema-header" data-schema-id="${uniqueId}">
              <div class="url">${escapeHtml(url)}</div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; text-align: right;">
                <div class="timestamp">${timestamp}</div>
                <div style="font-size: 10px; color: #888;">${schemaInfo}</div>
                <div style="font-size: 10px; color: #666;">${count} request${count > 1 ? 's' : ''}</div>
              </div>
              <div class="toggle" id="toggle-${uniqueId}">▼</div>
            </div>
            <div class="schema-content" id="content-${uniqueId}">
              <div style="margin-bottom: 10px; font-size: 11px; color: #666;">
                <strong>URL:</strong> ${escapeHtml(url)}<br>
                <strong>Last seen:</strong> ${timestamp}<br>
                <strong>Total requests:</strong> ${count}
              </div>
              <div class="schema-json">${formatSchema(schema)}</div>
            </div>
          </div>
        `;
      }).join('');
    
    contentDiv.innerHTML = html;
    
    // Restore expanded states after HTML regeneration
    expandedSchemas.forEach(schemaId => {
      const content = document.getElementById(`content-${schemaId}`);
      const toggle = document.getElementById(`toggle-${schemaId}`);
      if (content && toggle) {
        content.classList.add('expanded');
        toggle.textContent = '▲';
      }
    });
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function formatSchema(schema, indent = 0) {
    const spaces = '  '.repeat(indent);
    
    if (typeof schema === 'string') {
      return schema;
    }
    
    if (typeof schema === 'object' && schema.type === 'object' && schema.properties) {
      // Format object properties
      const props = Object.entries(schema.properties)
        .map(([key, type]) => {
          if (typeof type === 'object' && type.type === 'object' && type.properties) {
            // Nested object - format recursively
            const nestedSchema = formatSchema(type, indent + 1);
            return `${spaces}  ${key}: ${nestedSchema}`;
          } else if (typeof type === 'object' && type.type === 'array' && type.items) {
            // Array type - show simplified format
            if (type.items.type === 'object' && type.items.properties) {
              // Array of objects - show properties inline
              const objectProps = Object.entries(type.items.properties)
                .map(([objKey, objType]) => {
                  if (typeof objType === 'object' && objType.type === 'array') {
                    // Nested array - analyze recursively
                    if (typeof objType.items === 'object' && objType.items.type === 'object' && objType.items.properties) {
                      // Array of objects - show object structure
                      const nestedObjectProps = Object.entries(objType.items.properties)
                        .map(([nestedKey, nestedType]) => {
                          if (typeof nestedType === 'object' && nestedType.type === 'array') {
                            return `${nestedKey}: array<${nestedType.items || 'unknown'}>`;
                          } else if (typeof nestedType === 'object') {
                            return `${nestedKey}: ${nestedType.type || 'object'}`;
                          } else {
                            return `${nestedKey}: ${nestedType}`;
                          }
                        })
                        .join(', ');
                      return `${objKey}: array<{ ${nestedObjectProps} }>`;
                    } else if (typeof objType.items === 'object' && objType.items.properties) {
                      // Simple object without nested arrays - show properties
                      const simpleObjectProps = Object.entries(objType.items.properties)
                        .map(([propKey, propType]) => `${propKey}: ${typeof propType === 'object' ? propType.type || 'object' : propType}`)
                        .join(', ');
                      return `${objKey}: array<{ ${simpleObjectProps} }>`;
                    } else {
                      return `${objKey}: array<${objType.items || 'unknown'}>`;
                    }
                  } else if (typeof objType === 'object') {
                    return `${objKey}: ${objType.type || 'object'}`;
                  } else {
                    return `${objKey}: ${objType}`;
                  }
                })
                .join(', ');
              return `${spaces}  ${key}: array<{ ${objectProps} }>`;
            } else {
              return `${spaces}  ${key}: array<${type.items}>`;
            }
          } else {
            // Simple type - handle case where type might be an object without .type property
            let displayType;
            if (typeof type === 'object' && type !== null) {
              displayType = type.type || 'object';
            } else {
              displayType = type;
            }
            return `${spaces}  ${key}: ${displayType}`;
          }
        })
        .join('\n');
      
      if (indent === 0) {
        return `{\n${props}\n}`;
      } else {
        return `{\n${props}\n${spaces}}`;
      }
    }
    
    if (typeof schema === 'object' && schema.type === 'array' && schema.items) {
      // Top-level array
      if (schema.items.type === 'object' && schema.items.properties) {
        const objectProps = Object.entries(schema.items.properties)
          .map(([key, type]) => {
            if (typeof type === 'object' && type.type === 'array') {
              // Nested array - analyze recursively
              if (typeof type.items === 'object' && type.items.type === 'object' && type.items.properties) {
                // Array of objects - show object structure
                const nestedObjectProps = Object.entries(type.items.properties)
                  .map(([nestedKey, nestedType]) => {
                    if (typeof nestedType === 'object' && nestedType.type === 'array') {
                      return `${nestedKey}: array<${nestedType.items || 'unknown'}>`;
                    } else if (typeof nestedType === 'object') {
                      return `${nestedKey}: ${nestedType.type || 'object'}`;
                    } else {
                      return `${nestedKey}: ${nestedType}`;
                    }
                  })
                  .join(', ');
                return `${key}: array<{ ${nestedObjectProps} }>`;
              } else if (typeof type.items === 'object' && type.items.properties) {
                // Simple object without nested arrays - show properties
                const simpleObjectProps = Object.entries(type.items.properties)
                  .map(([propKey, propType]) => `${propKey}: ${typeof propType === 'object' ? propType.type || 'object' : propType}`)
                  .join(', ');
                return `${key}: array<{ ${simpleObjectProps} }>`;
              } else {
                return `${key}: array<${type.items || 'unknown'}>`;
              }
            } else if (typeof type === 'object') {
              return `${key}: ${type.type || 'object'}`;
            } else {
              return `${key}: ${type}`;
            }
          })
          .join(', ');
        return `array<{ ${objectProps} }>`;
      } else {
        return `array<${schema.items}>`;
      }
    }
    
    // Fallback to JSON stringify for other cases
    return JSON.stringify(schema, null, 2);
  }
  
  // Toggle schema visibility
  function toggleSchema(index) {
    const content = document.getElementById(`content-${index}`);
    const toggle = document.getElementById(`toggle-${index}`);
    
    if (content && toggle) {
      if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggle.textContent = '▼';
        expandedSchemas.delete(index); // Remove from expanded set
      } else {
        content.classList.add('expanded');
        toggle.textContent = '▲';
        expandedSchemas.add(index); // Add to expanded set
      }
    }
  }
  
  // Event listeners
  refreshBtn.addEventListener('click', loadSchemas);
  
  testBtn.addEventListener('click', function() {
    // Test the interceptor on the current page
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: function() {
            console.log('🧪 Testing interceptor...');
            
            // Test if injected script is loaded
            if (window.__FETCH_XHR_INTERCEPTOR_LOADED__) {
              console.log('✅ Interceptor is loaded');
            } else {
              console.log('❌ Interceptor not detected');
            }
            
            // Test XMLHttpRequest
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'https://jsonplaceholder.typicode.com/posts/1');
            xhr.onload = function() {
              console.log('🧪 Test XHR completed:', this.status);
            };
            xhr.send();
            
            // Test fetch
            fetch('https://jsonplaceholder.typicode.com/users/1')
              .then(response => response.json())
              .then(data => console.log('🧪 Test fetch completed:', Object.keys(data)))
              .catch(err => console.log('🧪 Test fetch failed:', err));
          }
        }).then(() => {
          alert('Test requests sent! Check the browser console and wait a few seconds, then refresh this popup to see results.');
        }).catch(err => {
          alert('Failed to run test: ' + err.message);
        });
      }
    });
  });
  
  debugBtn.addEventListener('click', function() {
    // Show debug information
    chrome.storage.local.get(null, function(allData) {
      const debugInfo = {
        storageKeys: Object.keys(allData),
        schemasCount: (allData.schemas || []).length,
        fullStorageData: allData,
        storageSize: JSON.stringify(allData).length
      };
      
      console.log('🔧 Debug Information:', debugInfo);
      
      // Show debug popup
      const debugWindow = window.open('', 'debug', 'width=600,height=400');
      debugWindow.document.write(`
        <html>
          <head><title>Extension Debug Info</title></head>
          <body style="font-family: monospace; padding: 20px;">
            <h2>🔧 Debug Information</h2>
            <h3>Storage Keys:</h3>
            <p>${debugInfo.storageKeys.join(', ') || 'None found'}</p>
            <h3>Schemas Count:</h3>
            <p>${debugInfo.schemasCount}</p>
            <h3>Storage Size:</h3>
            <p>${debugInfo.storageSize} characters</p>
            <h3>Full Storage Data:</h3>
            <pre style="background: #f5f5f5; padding: 10px; overflow: auto; max-height: 300px;">${JSON.stringify(debugInfo.fullStorageData, null, 2)}</pre>
            <p><em>This information is also logged to the console.</em></p>
          </body>
        </html>
      `);
    });
  });
  
  exportBtn.addEventListener('click', function() {
    chrome.storage.local.get(['schemas'], function(data) {
      const schemas = data.schemas || [];
      const exportData = {
        exportDate: new Date().toISOString(),
        totalSchemas: schemas.length,
        schemas: schemas
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `intercepted-schemas-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });
  
  clearBtn.addEventListener('click', function() {
    if (confirm('Are you sure you want to clear all stored schemas?')) {
      chrome.storage.local.remove(['schemas'], function() {
        loadSchemas();
      });
    }
  });
  
  // Set up global click event delegation for schema headers
  document.addEventListener('click', function(event) {
    const header = event.target.closest('.schema-header');
    if (header) {
      const schemaId = header.getAttribute('data-schema-id');
      if (schemaId) {
        toggleSchema(schemaId);
      }
    }
  });
  
  // Initial load
  loadSchemas();
});