document.addEventListener('DOMContentLoaded', function () {
  // Helper function to safely get origin from URL (returns null for invalid/special URLs)
  function safeGetOrigin(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      // Only allow http/https origins
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.origin;
    } catch {
      return null;
    }
  }

  // Get all UI elements
  const chatUrlInput = document.getElementById('chatUrl');
  const chatModelInput = document.getElementById('chatModel');
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const injectBtn = document.getElementById('injectBtn');
  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');
  const generateBtn = document.getElementById('generateBtn');
  const logPreview = document.getElementById('logPreview');
  const spinner = document.getElementById('spinner');
  const clearBtn = document.getElementById('clear');
  const statsDiv = document.getElementById('stats');
  const schemaContentDiv = document.getElementById('schemaContent') || logPreview;
  const aiSettingsDetails = document.getElementById('aiSettings');
  const themeToggle = document.getElementById('themeToggle');
  const statsBadge = document.getElementById('statsBadge');
  const testAiBtn = document.getElementById('testAiBtn');
  const testResult = document.getElementById('testResult');

  // Schema modal elements
  const schemaModal = document.getElementById('schemaModal');
  const schemaModalTitle = document.getElementById('schemaModalTitle');
  const schemaModalClose = document.getElementById('schemaModalClose');
  const schemaTree = document.getElementById('schemaTree');

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      themeToggle.checked = true;
    } else {
      root.removeAttribute('data-theme');
      themeToggle.checked = false;
    }
  }

  function saveTheme(theme) {
    chrome.storage.local.set({ themePreference: theme });
  }

  function loadTheme() {
    chrome.storage.local.get(['themePreference'], ({ themePreference }) => {
      applyTheme(themePreference || 'light');
    });
  }

  themeToggle?.addEventListener('change', () => {
    const theme = themeToggle.checked ? 'dark' : 'light';
    applyTheme(theme);
    saveTheme(theme);
  });

  function openSchemaModal(title, schema) {
    schemaModalTitle.textContent = title;
    renderSchemaTree(schemaTree, schema);
    schemaModal.classList.add('open');
    schemaModal.setAttribute('aria-hidden', 'false');
  }
  function closeSchemaModal() {
    schemaModal.classList.remove('open');
    schemaModal.setAttribute('aria-hidden', 'true');
    schemaTree.innerHTML = '';
  }
  schemaModalClose.addEventListener('click', closeSchemaModal);
  schemaModal.addEventListener('click', (e) => {
    if (e.target === schemaModal) closeSchemaModal();
  });

  let recordingActive = false;

  // Load initial data
  function loadInitialData() {
    loadTheme();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const origin = tabs.length ? safeGetOrigin(tabs[0].url) : null;
      chrome.storage.local.get([
        'siteConfigs', 'chatUrl', 'chatModel', 'apiKey',
        'recordingLog', 'recordingActive', 'recordingHeartbeat'
      ], (data) => {
        const {
          siteConfigs = {}, chatUrl, chatModel, apiKey,
          recordingLog = [], recordingActive: recAct, recordingHeartbeat
        } = data;

        // Load AI settings
        if (chatUrl) chatUrlInput.value = chatUrl;
        if (chatModel) chatModelInput.value = chatModel;
        if (apiKey) apiKeyInput.value = apiKey;

        // Check heartbeat - if recording is marked active but heartbeat is stale (>5s), reset state
        let actuallyRecording = !!recAct;
        if (actuallyRecording && recordingHeartbeat) {
          const heartbeatAge = Date.now() - recordingHeartbeat;
          if (heartbeatAge > 5000) {
            console.warn('[Popup] Recording heartbeat is stale, resetting state');
            actuallyRecording = false;
            chrome.storage.local.set({ recordingActive: false, recordingHeartbeat: null });
          }
        } else if (actuallyRecording && !recordingHeartbeat) {
          // Recording marked active but no heartbeat - likely stale state
          console.warn('[Popup] Recording active but no heartbeat, resetting state');
          actuallyRecording = false;
          chrome.storage.local.set({ recordingActive: false });
        }

        // Set recording state
        recordingActive = actuallyRecording;
        recordBtn.disabled = recordingActive;
        stopBtn.disabled = !recordingActive;

        // Load and display data
        generateBtn.disabled = !getDedupedEntries(recordingLog).length;
        loadSchemas();
        toggleAiDetails();
      });
    });
  }

  // Auto-collapse AI settings if filled
  function toggleAiDetails() {
    const empty = !chatUrlInput.value && !apiKeyInput.value && !chatModelInput.value;
    aiSettingsDetails.open = empty;
  }

  // Save AI settings
  saveBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return;
      const origin = safeGetOrigin(tabs[0].url);
      if (!origin) {
        alert('Cannot save settings on this page. Open a normal website (http/https) first.');
        return;
      }
      chrome.storage.local.get(['siteConfigs'], ({ siteConfigs = {} }) => {
        const site = siteConfigs[origin] || {};
        siteConfigs[origin] = site;
        chrome.storage.local.set({
          siteConfigs,
          chatUrl: chatUrlInput.value.trim(),
          chatModel: chatModelInput.value.trim(),
          apiKey: apiKeyInput.value.trim()
        }, () => {
          alert('Saved!');
          toggleAiDetails();
        });
      });
    });
  });

  // Test AI connection
  testAiBtn.addEventListener('click', async () => {
    const chatUrl = chatUrlInput.value.trim();
    const chatModel = chatModelInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    // Show testing state
    testResult.style.display = 'block';
    testResult.style.background = 'rgba(148, 163, 184, 0.15)';
    testResult.style.color = 'var(--subtext)';
    testResult.innerHTML = '⏳ Testing connection...';
    testAiBtn.disabled = true;

    // Validate inputs
    if (!chatUrl) {
      showTestResult('error', '❌ Chat URL is required');
      return;
    }
    if (!chatModel) {
      showTestResult('error', '❌ Chat Model is required');
      return;
    }
    if (!apiKey) {
      showTestResult('error', '❌ API Key is required');
      return;
    }

    try {
      const body = {
        model: chatModel,
        messages: [
          { role: 'user', content: 'Respond with only: "OK"' }
        ]
      };

      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = `HTTP ${res.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson.error?.message || errorJson.message || errorMsg;
        } catch {
          if (errorText.length < 100) errorMsg = errorText;
        }
        showTestResult('error', `❌ Failed: ${errorMsg}`);
        return;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (content) {
        showTestResult('success', `✅ Connection successful! Model responded: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
      } else {
        showTestResult('warning', '⚠️ Connected but received unexpected response format');
      }
    } catch (err) {
      showTestResult('error', `❌ Connection failed: ${err.message}`);
    }
  });

  function showTestResult(type, message) {
    testAiBtn.disabled = false;
    testResult.style.display = 'block';
    
    if (type === 'success') {
      testResult.style.background = 'rgba(34, 197, 94, 0.15)';
      testResult.style.color = 'var(--success)';
    } else if (type === 'error') {
      testResult.style.background = 'rgba(239, 68, 68, 0.15)';
      testResult.style.color = 'var(--danger)';
    } else {
      testResult.style.background = 'rgba(251, 191, 36, 0.15)';
      testResult.style.color = '#f59e0b';
    }
    
    testResult.innerHTML = message;
  }

  // Helper to persist configuration
  function persistConfig(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return;
      const origin = safeGetOrigin(tabs[0].url);
      if (!origin) {
        if (cb) cb();
        return;
      }
      chrome.storage.local.get(['siteConfigs'], ({ siteConfigs = {} }) => {
        const site = siteConfigs[origin] || {};
        siteConfigs[origin] = site;
        chrome.storage.local.set({
          siteConfigs,
          chatUrl: chatUrlInput.value.trim(),
          chatModel: chatModelInput.value.trim(),
          apiKey: apiKeyInput.value.trim()
        }, cb);
      });
    });
  }

  function isInjectableUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Recording functionality
  recordBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) return;
      const origin = safeGetOrigin(tab.url);
      if (!origin) {
        alert('Cannot record on this page. Open a normal website (http/https) first.');
        return;
      }
      chrome.runtime.sendMessage({
        action: 'startRecording',
        origin,
        tabId: tab.id
      }, (response) => {
        if (response && response.ok === false) {
          // Recording failed to start
          alert(response.error || 'Failed to start recording.');
          recordingActive = false;
          recordBtn.disabled = false;
          stopBtn.disabled = true;
          statsBadge.textContent = 'Failed';
          return;
        }
        // Recording started successfully
        recordingActive = true;
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        generateBtn.disabled = true;
        logPreview.innerHTML = '<em>Recording… perform actions on the page.</em>';
        statsBadge.textContent = 'Recording';
      });
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopRecording' }, () => {
      recordingActive = false;
      recordBtn.disabled = false;
      stopBtn.disabled = true;
      statsBadge.textContent = 'Idle';
    });
  });

  // Helper function to make AI requests
  async function makeAIRequest(prompt, systemMessage, chatUrl, chatModel, apiKey) {
    const body = {
      model: chatModel,
      messages: [
        { role: 'system', content: systemMessage },
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
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Invalid AI response');

    return content;
  }

  // Robust JSON extraction from AI responses (handles markdown code fences, extra text, etc.)
  function extractJsonFromAIResponse(text, expectedType = 'any') {
    if (!text || typeof text !== 'string') {
      throw new Error('Empty or invalid AI response');
    }

    let cleaned = text.trim();
    
    // Step 1: Try direct parse
    try {
      const parsed = JSON.parse(cleaned);
      if (validateJsonType(parsed, expectedType)) return parsed;
    } catch { /* continue */ }

    // Step 2: Strip markdown code fences (```json ... ``` or ``` ... ```)
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        if (validateJsonType(parsed, expectedType)) return parsed;
      } catch { /* continue */ }
    }

    // Step 3: Extract JSON object or array using regex
    // Look for outermost { } or [ ]
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    
    // Prefer array if expectedType is array, otherwise try object first
    const matches = expectedType === 'array' 
      ? [arrayMatch, objectMatch] 
      : [objectMatch, arrayMatch];
    
    for (const match of matches) {
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (validateJsonType(parsed, expectedType)) return parsed;
        } catch { /* continue */ }
      }
    }

    // Step 4: If still no luck, try to find any parseable JSON substring
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{' || cleaned[i] === '[') {
        for (let j = cleaned.length; j > i; j--) {
          try {
            const substr = cleaned.substring(i, j);
            const parsed = JSON.parse(substr);
            if (validateJsonType(parsed, expectedType)) return parsed;
          } catch { /* continue */ }
        }
      }
    }

    // Failed to extract JSON
    const preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
    throw new Error(`Could not extract valid JSON from AI response. Response preview: ${preview}`);
  }

  function validateJsonType(data, expectedType) {
    if (expectedType === 'any') return true;
    if (expectedType === 'array') return Array.isArray(data);
    if (expectedType === 'object') return data !== null && typeof data === 'object' && !Array.isArray(data);
    return true;
  }

  // Generate API description from captured log
  async function generateDescription() {
    console.log('Generating API description...');
    spinner.style.display = 'flex';
    const originalText = generateBtn.textContent;
    generateBtn.textContent = 'Analyzing URLs...';
    generateBtn.disabled = true;

    try {
      const { recordingLog = [], chatUrl, chatModel, apiKey } = await chrome.storage.local.get([
        'recordingLog', 'chatUrl', 'chatModel', 'apiKey'
      ]);

      const deduped = getDedupedEntries(recordingLog);
      if (!deduped.length) {
        alert('No recorded requests.');
        return;
      }

      if (!chatUrl || !chatModel) {
        alert('Chat URL or model missing.');
        return;
      }

      const escape = (str) => str.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

      // STEP 1: Ask AI which URLs are interesting for data visualization
      const urlAnalysisPrompt = `You are an expert data visualization consultant analyzing API endpoints to identify which ones contain valuable data for creating charts, graphs, dashboards, and visual analytics.

Examine these captured API endpoints and their response schemas. Your mission is to identify URLs that contain:
- Quantitative data (numbers, metrics, measurements, counts, statistics)
- Time-series data (dates, timestamps, historical data)
- Categorical data (groups, segments, classifications)
- Aggregated data (totals, averages, summaries)
- Business metrics (sales, revenue, performance indicators)
- User analytics (behavior, interactions, demographics)
- Scientific data (measurements, observations, calculations)
- Financial data (transactions, balances, rates)

EXCLUDE URLs that are primarily:
- Authentication/login endpoints
- Simple CRUD operations returning single records
- Configuration/settings endpoints
- File upload/download endpoints
- Health checks or status endpoints
- Search endpoints returning minimal data

For each URL, analyze the response schema and determine if it contains data that would create meaningful, insightful visualizations.

URLs and Schemas:
${deduped.map((r, i) => `${i + 1}. ${escape(r.url)}
   Schema: ${typeof r.response === 'string' ? r.response : JSON.stringify(r.response, null, 2)}
`).join('\n')}

Return ONLY a JSON array of numbers representing the interesting URLs (e.g., [1, 3, 5] if URLs 1, 3, and 5 are interesting for visualization).
Consider data richness, visualization potential, and business value. Be selective - choose only URLs that would create compelling, data-driven visualizations.`;

      console.log('Step 1: Analyzing URLs for visualization potential...');

      const interestingIndices = await makeAIRequest(
        urlAnalysisPrompt,
        'You are a data visualization expert. Return only a JSON array of numbers. No explanations, no text, just the array.',
        chatUrl,
        chatModel,
        apiKey
      );

      console.log('AI selected interesting URLs:', interestingIndices);

      // Parse the response to get the interesting URL indices using robust extraction
      let selectedIndices;
      try {
        selectedIndices = extractJsonFromAIResponse(interestingIndices, 'array');
        // Validate that it's an array of numbers
        if (!selectedIndices.every(item => typeof item === 'number')) {
          throw new Error('Response array contains non-numeric values');
        }
      } catch (e) {
        console.warn('Failed to parse AI response for URL selection:', e.message);
        console.warn('Raw AI response:', interestingIndices);
        // Fallback: use all URLs
        selectedIndices = deduped.map((_, i) => i + 1);
      }

      // Filter deduped to only include interesting URLs
      const interestingRequests = deduped.filter((_, index) =>
        selectedIndices.includes(index + 1)
      );

      if (interestingRequests.length === 0) {
        alert('No URLs were identified as interesting for data visualization. Try recording more API calls with data-rich endpoints.');
        return;
      }

      console.log(`Step 2: Generating API description for ${interestingRequests.length} interesting URLs...`);
      generateBtn.textContent = 'Generating API Description...';

      // STEP 2: Generate API description using only the interesting URLs
      const apiDescriptionPrompt = `Analyze the following carefully selected API endpoints that contain rich data perfect for visualization.
Create a comprehensive OpenAPI JSON description that will be used to build interactive dashboards, charts, and data visualizations.

Important constraints you MUST follow:
- DO NOT include full URLs in the 'paths' keys. Use ONLY the path portion (must start with '/').
- DO NOT invent or change base URLs. We will provide servers separately.
- The 'servers' section should either be omitted or contain the exact backend origins of the provided endpoints.
- NEVER use the current page/frontend origin. Use the origins derived from the provided URLs.
- Preserve HTTP methods exactly as given. Do not change methods.
- Ensure schemas reflect the provided response structures.

Focus on:
- Clear endpoint descriptions highlighting the data value
- Detailed response schemas showing data structure
- Proper data types for visualization engines
- Mark ALL parameters as REQUIRED for robust API documentation

Selected URLs and Their Schemas:
${interestingRequests.map((r, i) => `### Endpoint ${i + 1}
URL: ${escape(r.url)}
Method: ${r.method}
Response Schema: ${typeof r.response === 'string' ? r.response : JSON.stringify(r.response, null, 2)}
`).join('\n')}

Return a complete OpenAPI 3.0 JSON specification optimized for data visualization tools. Do not include any text outside of the JSON.`;

      const description = await makeAIRequest(
        apiDescriptionPrompt,
        'You are an expert in creating OpenAPI descriptions for data visualization. ONLY RETURN THE JSON, DO NOT RETURN ANY OTHER TEXT. Ensure the schema is perfectly formatted for visualization tools.',
        chatUrl,
        chatModel,
        apiKey
      );

      console.log('Generated API description:', description);

      // Post-process to enforce backend servers and path-only keys using robust extraction
      let finalDescription = description;
      try {
        const parsed = extractJsonFromAIResponse(description, 'object');
        const normalized = normalizeOpenApiSpec(parsed, interestingRequests);
        finalDescription = JSON.stringify(normalized, null, 2);
      } catch (e) {
        console.warn('Failed to parse AI OpenAPI JSON:', e.message);
        console.warn('Raw AI response:', description.substring(0, 500));
        // Still store the raw output - user can try again
        finalDescription = description;
      }

      // Save description to siteConfigs
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab) return;
        const origin = safeGetOrigin(tab.url);
        if (!origin) {
          alert('Cannot save API description on this page.');
          spinner.style.display = 'none';
          generateBtn.textContent = originalText;
          generateBtn.disabled = false;
          return;
        }
        chrome.storage.local.get(['siteConfigs', 'recordingLog'], ({ siteConfigs = {}, recordingLog = [] }) => {
          const site = siteConfigs[origin] || {};
          site.apiDescription = finalDescription;

          // Derive apiBase from the first interesting request if not already set
          if (interestingRequests.length && !site.apiBase) {
            try {
              const firstUrl = new URL(interestingRequests[0].url);
              site.apiBase = firstUrl.origin;
              console.log('Derived apiBase from interesting requests:', site.apiBase);
            } catch (e) {
              console.warn('Failed to derive apiBase:', e);
            }
          }

          siteConfigs[origin] = site;
          chrome.storage.local.set({ siteConfigs, recordingLog: [] }, () => {
            generateBtn.disabled = true;
            generateBtn.textContent = originalText;
            spinner.style.display = 'none';
            // Highlight inject button
            injectBtn.classList.add('highlight');
            alert(`API description generated from ${interestingRequests.length} visualization-ready endpoints! You can now inject the AI visualizer.`);
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

  // AI Visualization injection
  injectBtn.addEventListener('click', () => {
    persistConfig(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab) return;
        const tabId = tab.id;
        const tabUrl = tab.url || '';

        if (!isInjectableUrl(tabUrl)) {
          alert('Cannot inject into this page. Open a normal website tab (http/https) and try again.');
          return;
        }

        const init = () => chrome.tabs.sendMessage(tabId, { action: 'initVisualization' }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Init failed:', chrome.runtime.lastError.message);
            alert('Failed to initialize visualizer on this page.');
          }
        });

        // Try ping
        chrome.tabs.sendMessage(tabId, { ping: true }, () => {
          if (chrome.runtime.lastError) {
            // No listener yet → inject and then init if success
            chrome.scripting.executeScript(
              { target: { tabId }, files: ['content.js'] },
              () => {
                if (chrome.runtime.lastError) {
                  console.warn('Injection failed:', chrome.runtime.lastError.message);
                  alert('Cannot inject into this page: ' + chrome.runtime.lastError.message);
                  return;
                }
                init();
              }
            );
          } else {
            // Listener exists
            init();
          }
        });
      });
    });
  });

  // Remove highlight when user clicks injectBtn
  injectBtn.addEventListener('click', () => {
    injectBtn.classList.remove('highlight');
  });

  // Deduplicate by canonicalKey if available, else by URL+method (path only)
  function getDedupedEntries(schemas) {
    const map = new Map();
    for (const entry of (schemas || [])) {
      const key = entry.canonicalKey || (() => {
        try {
          const u = new URL(entry.url);
          return `${u.origin}${u.pathname}::${(entry.method || 'GET').toUpperCase()}`;
        } catch {
          return `${entry.url}::${(entry.method || 'GET').toUpperCase()}`;
        }
      })();
      if (!map.has(key)) {
        map.set(key, entry);
      } else {
        // Prefer the newest with a schema object
        const existing = map.get(key);
        const existingTime = new Date(existing.timestamp || 0).getTime();
        const incomingTime = new Date(entry.timestamp || 0).getTime();
        const chooseIncoming = (incomingTime > existingTime) || (typeof existing.response !== 'object' && typeof entry.response === 'object');
        if (chooseIncoming) map.set(key, entry);
      }
    }
    return Array.from(map.values());
  }

  // Normalize OpenAPI spec to ensure backend servers and path-only keys
  function normalizeOpenApiSpec(spec, interestingRequests) {
    const uniqueOrigins = Array.from(new Set((interestingRequests || []).map(r => {
      try { return new URL(r.url).origin; } catch { return null; }
    }).filter(Boolean)));

    const normalized = { ...spec };
    if (!normalized.openapi) {
      normalized.openapi = '3.0.3';
    }

    if (!Array.isArray(normalized.servers) || normalized.servers.length === 0) {
      normalized.servers = uniqueOrigins.map(url => ({ url }));
    } else {
      // Overwrite servers to ensure backend origins
      normalized.servers = uniqueOrigins.map(url => ({ url }));
    }

    const paths = normalized.paths || {};
    const newPaths = {};
    Object.keys(paths).forEach((key) => {
      let newKey = key;
      try {
        if (key.includes('://')) {
          newKey = new URL(key).pathname || '/';
        }
      } catch { /* ignore */ }
      if (!newKey.startsWith('/')) newKey = '/' + newKey;
      if (!newPaths[newKey]) {
        newPaths[newKey] = paths[key];
      } else {
        // Merge methods if collision
        newPaths[newKey] = { ...newPaths[newKey], ...paths[key] };
      }
    });
    normalized.paths = newPaths;

    return normalized;
  }

  // Schema tracking functionality
  function loadSchemas() {
    chrome.storage.local.get(['recordingLog'], function (data) {
      const entries = getDedupedEntries(data.recordingLog || []);
      displayStats(entries);
      displaySchemas(entries);
    });
  }

  function displayStats(schemas) {
    const uniqueUrls = new Set((schemas || []).map(s => s.canonicalKey || s.url)).size;
    const totalRequests = (schemas || []).length;

    // Check storage usage
    if (chrome.storage.local.getBytesInUse) {
      chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
        const quotaBytes = 5242880; // 5MB
        const usageRatio = bytesInUse / quotaBytes;
        const usagePercent = (usageRatio * 100).toFixed(0);
        
        let storageWarning = '';
        if (usageRatio > 0.8) {
          storageWarning = `<span style="color: var(--danger); font-weight: bold;"> ⚠️ Storage ${usagePercent}%</span>`;
        } else if (usageRatio > 0.5) {
          storageWarning = `<span style="color: var(--muted);"> 💾 ${usagePercent}%</span>`;
        }
        
        statsDiv.innerHTML = `
          <strong>📊 Stats:</strong> 
          ${totalRequests} endpoints from ${uniqueUrls} URLs${storageWarning}
        `;
      });
    } else {
      statsDiv.innerHTML = `
        <strong>📊 Stats:</strong> 
        ${totalRequests} total unique endpoints from ${uniqueUrls} unique URLs
      `;
    }
    statsBadge.textContent = `${uniqueUrls} URLs`;
  }

  function displaySchemas(schemas) {
    if (!schemas || schemas.length === 0) {
      const noDataHtml = `
        <div class="no-data">
          No schemas tracked yet. Start recording API requests to see schemas here.
        </div>
      `;
      schemaContentDiv.innerHTML = noDataHtml;
      if (logPreview) {
        logPreview.innerHTML = noDataHtml;
      }
      return;
    }

    // Group by canonical key
    const urlGroups = {};
    schemas.forEach((entry, index) => {
      const groupKey = entry.canonicalKey || (() => {
        try { const u = new URL(entry.url); return `${u.origin}${u.pathname}::${(entry.method || 'GET').toUpperCase()}`; } catch { return `${entry.url}::${(entry.method || 'GET').toUpperCase()}`; }
      })();
      if (!urlGroups[groupKey]) {
        urlGroups[groupKey] = { latest: null, entries: [] };
      }
      urlGroups[groupKey].entries.push({ ...entry, originalIndex: index });
      const latest = urlGroups[groupKey].latest;
      if (!latest || new Date(entry.timestamp || 0) > new Date(latest.timestamp || 0)) {
        urlGroups[groupKey].latest = entry;
      }
    });

    const html = Object.entries(urlGroups)
      .sort(([, a], [, b]) => {
        const latestA = new Date(a.latest?.timestamp || 0).getTime();
        const latestB = new Date(b.latest?.timestamp || 0).getTime();
        return latestB - latestA;
      })
      .slice(0, 10)
      .map(([key, group]) => {
        const latest = group.latest;
        const count = group.entries.length;
        const timestamp = latest.timestamp ? new Date(latest.timestamp).toLocaleString() : 'Unknown';
        const schema = latest.response;
        let schemaInfo = '';
        if (schema && typeof schema === 'object') {
          if (schema.type === 'object' && schema.properties) {
            const propCount = Object.keys(schema.properties).length;
            schemaInfo = `Object (${propCount} properties)`;
          } else if (schema.type === 'array' && schema.items) {
            schemaInfo = `Array of ${schema.items.type || 'items'}`;
          } else {
            schemaInfo = `Type: ${schema.type || 'unknown'}`;
          }
        } else if (typeof schema === 'string') {
          schemaInfo = schema;
        }

        const displayUrl = (() => {
          try { const u = new URL(latest.url); return `${u.origin}${u.pathname}`; } catch { return latest.url; }
        })();
        const safeKey = encodeURIComponent(key);
        return `
          <div class="card">
            <div class="url-item" data-key="${safeKey}" style="font-weight: 600; font-size: 10px; margin-bottom: 4px;">
              ${displayUrl}
            </div>
            <div style="font-size: 10px; color: var(--subtext); display: flex; gap: 8px;">
              <div>${schemaInfo}</div>
              <div>• ${timestamp}</div>
              <div>• ${count} request${count > 1 ? 's' : ''}</div>
            </div>
          </div>
        `;
      }).join('');

    schemaContentDiv.innerHTML = html;
    if (logPreview) {
      logPreview.innerHTML = html;
    }

    // Click handlers to open modal with tree
    schemaContentDiv.querySelectorAll('.url-item').forEach(el => {
      el.addEventListener('click', () => {
        const key = decodeURIComponent(el.getAttribute('data-key'));
        const group = urlGroups[key];
        if (!group || !group.latest) return;
        openSchemaModal(group.latest.url, group.latest.response);
      });
    });
  }

  // Tree renderer for JSON Schema (object/array focus)
  function renderSchemaTree(container, schema) {
    container.innerHTML = '';
    const root = document.createElement('div');
    root.appendChild(buildNode('root', schema));
    container.appendChild(root);
  }

  function buildNode(name, schema) {
    const li = document.createElement('li');
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'node';

    const label = document.createElement('span');
    const type = schema?.type || (schema?.anyOf ? 'anyOf' : 'unknown');
    label.textContent = `${name}: ${type}`;
    nodeDiv.appendChild(label);

    const wrapper = document.createElement('div');
    wrapper.className = 'expanded';
    const childrenContainer = document.createElement('ul');
    childrenContainer.className = 'children';
    wrapper.appendChild(childrenContainer);

    nodeDiv.addEventListener('click', () => {
      wrapper.classList.toggle('expanded');
    });

    li.appendChild(nodeDiv);
    li.appendChild(wrapper);

    // Populate children based on schema
    if (schema) {
      if (schema.type === 'object' && schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          childrenContainer.appendChild(buildNode(prop, propSchema));
        }
      } else if (schema.type === 'array' && schema.items) {
        childrenContainer.appendChild(buildNode('[item]', schema.items));
      } else if (schema.anyOf) {
        schema.anyOf.forEach((variant, idx) => {
          childrenContainer.appendChild(buildNode(`anyOf[${idx}]`, variant));
        });
      }
    }

    const container = document.createElement('ul');
    container.appendChild(li);
    return container;
  }

  // Clear all data
  clearBtn.addEventListener('click', function () {
    if (confirm('Are you sure you want to clear all stored data (schemas and recordings)?')) {
      chrome.storage.local.remove(['recordingLog'], function () {
        loadSchemas();
        generateBtn.disabled = true;
      });
    }
  });

  // Listen for storage changes to update UI in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.themePreference) {
        applyTheme(changes.themePreference.newValue || 'light');
      }
      if (changes.recordingLog) {
        const entries = getDedupedEntries(changes.recordingLog.newValue || []);
        const hasData = entries.length > 0;
        generateBtn.disabled = !hasData;
        displayStats(entries);
        displaySchemas(entries);
      }
      if (changes.recordingActive) {
        recordingActive = changes.recordingActive.newValue;
        recordBtn.disabled = recordingActive;
        stopBtn.disabled = !recordingActive;
      }

    }
  });

  // Initial load
  loadInitialData();
});