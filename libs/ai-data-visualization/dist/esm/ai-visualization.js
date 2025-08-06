import { VisualizationState, ErrorType, AIDataVisualizationError } from './types.js';
/**
 * Main AI Data Visualization class
 */
export class AIDataVisualization {
    constructor(config) {
        this.state = VisualizationState.IDLE;
        // Store the last generated visualization code so we can send it back to the AI for improvements
        this.lastGeneratedCode = null;
        // Store user requests: first original prompt and subsequent improvements
        this.originalPrompt = null;
        this.improvementPrompts = [];
        // Track whether the input section is collapsed
        this.inputCollapsed = false;
        // History of generated visualizations
        this.history = [];
        this.HISTORY_KEY = 'aiDataVizHistory';
        // Index of the history item currently being viewed/edited; null if working on a fresh visualization
        this.activeHistoryIndex = null;
        // Cached HTML for API overview list
        this.apiOverviewHtml = '';
        this.config = config;
        this.container = this.resolveContainer(config.container);
        this.validateConfig();
        this.initialize();
    }
    /**
     * Resolve container element from string selector or HTMLElement
     */
    resolveContainer(container) {
        if (typeof container === 'string') {
            const element = document.querySelector(container);
            if (!element) {
                throw new AIDataVisualizationError(ErrorType.CONTAINER_NOT_FOUND, `Container element not found: ${container}`);
            }
            return element;
        }
        return container;
    }
    /**
     * Validate configuration
     */
    validateConfig() {
        if (!this.config.apiDescription) {
            throw new AIDataVisualizationError(ErrorType.INVALID_API_DESCRIPTION, 'API description is required');
        }
        if (typeof this.config.chatCompletion !== 'function') {
            throw new AIDataVisualizationError(ErrorType.CHAT_COMPLETION_FAILED, 'chatCompletion must be a function');
        }
        if (typeof this.config.apiRequest !== 'function') {
            throw new AIDataVisualizationError(ErrorType.API_REQUEST_FAILED, 'apiRequest must be a function');
        }
    }
    /**
     * Initialize the visualization component
     */
    initialize() {
        // Load persisted history
        this.loadHistory();
        // Build API overview once (no heavy logic in render loop)
        this.apiOverviewHtml = this.buildApiOverviewHtml();
        this.createHTML();
        this.attachStyles();
        this.setupEventListeners();
        this.setupMessageListener();
        // Render history list
        this.renderHistoryList();
    }
    /**
     * Create the HTML structure
     */
    createHTML() {
        const theme = this.config.theme || 'light';
        const className = this.config.className || '';
        const apiOverviewBlock = this.apiOverviewHtml
            ? `<details class="ai-data-viz__api-overview" style="margin-top:8px;"><summary>Available API Endpoints</summary>${this.apiOverviewHtml}</details>`
            : '';
        this.container.innerHTML = `
      <div class="ai-data-viz ${theme} ${className}">
        <div class="ai-data-viz__header">
          <h2 class="ai-data-viz__title">AI Data Visualization</h2>
          <p class="ai-data-viz__subtitle">Ask for any visualization and I'll generate it using your API data</p>
          <button class="ai-data-viz__toggle-input" type="button" aria-label="Hide input">&minus;</button>
        </div>
        
        <div class="ai-data-viz__input-section">
          <div class="ai-data-viz__input-group">
            <textarea 
              class="ai-data-viz__textarea" 
              placeholder="Example: Create a chart showing employee allocation by department"
              rows="3"
            ></textarea>
            <button class="ai-data-viz__generate-btn" type="button">
              <span class="ai-data-viz__btn-text">Generate Visualization</span>
              <div class="ai-data-viz__spinner" style="display: none;"></div>
            </button>
            <button class="ai-data-viz__clear-btn" type="button" style="display: none;">
              Clear Visualization
            </button>
          </div>
          <details class="ai-data-viz__prompt-summary" style="display:none; margin-top: 8px;">
            <summary>Original Prompt</summary>
            <pre class="ai-data-viz__prompt-text" style="white-space: pre-wrap;"></pre>
          </details>
          ${apiOverviewBlock}
        </div>
        
        <div class="ai-data-viz__visualization" style="display: none;">
          <div class="ai-data-viz__loading" style="display: none;">
            <div class="ai-data-viz__spinner"></div>
            <p>Generating visualization...</p>
          </div>
          <div class="ai-data-viz__iframe-container">
            <iframe class="ai-data-viz__iframe" sandbox="allow-scripts"></iframe>
          </div>
        </div>
        <details class="ai-data-viz__history" style="margin-top:12px;">
          <summary class="ai-data-viz__history-summary">
            <span>Diagram History</span>
            <button type="button" title="Clear entire history" class="ai-data-viz__history-clear-btn">&times;</button>
          </summary>
          <ul class="ai-data-viz__history-list"></ul>
        </details>
        
        <div class="ai-data-viz__error" style="display: none;">
          <div class="ai-data-viz__error-content">
            <p class="ai-data-viz__error-message"></p>
            <button class="ai-data-viz__error-retry" type="button">Try Again</button>
          </div>
        </div>
      </div>
    `;
    }
    /**
     * Attach CSS styles
     */
    attachStyles() {
        if (document.getElementById('ai-data-viz-styles')) {
            return; // Styles already loaded
        }
        const style = document.createElement('style');
        style.id = 'ai-data-viz-styles';
        style.textContent = this.getStyles();
        document.head.appendChild(style);
    }
    /**
     * Get CSS styles
     */
    getStyles() {
        return `
      .ai-data-viz {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .ai-data-viz.dark {
        background: #1a1a1a;
        border-color: #333;
        color: #ffffff;
      }

      .ai-data-viz__header {
        margin-bottom: 24px;
        text-align: center;
        position: relative;
      }

      .ai-data-viz__title {
        margin: 0 0 8px 0;
        font-size: 24px;
        font-weight: 600;
        color: #333;
      }

      .ai-data-viz.dark .ai-data-viz__title {
        color: #ffffff;
      }

      /* Toggle input button */
      .ai-data-viz__toggle-input {
        position: absolute;
        top: 0;
        right: 0;
        background: transparent;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: inherit;
        line-height: 1;
        padding: 4px 8px;
      }

      .ai-data-viz__toggle-input:hover {
        opacity: 0.7;
      }

      .ai-data-viz__subtitle {
        margin: 0;
        color: #666;
        font-size: 14px;
      }

      .ai-data-viz.dark .ai-data-viz__subtitle {
        color: #ccc;
      }

      .ai-data-viz__input-section {
        margin-bottom: 20px;
      }

      .ai-data-viz__input-group {
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
      }

      .ai-data-viz__textarea {
        flex: 1;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-family: inherit;
        font-size: 14px;
        resize: vertical;
        min-height: 80px;
      }

      .ai-data-viz.dark .ai-data-viz__textarea {
        background: #2a2a2a;
        border-color: #444;
        color: #ffffff;
      }

      .ai-data-viz__textarea:focus {
        outline: none;
        border-color: #007bff;
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
      }

      .ai-data-viz__generate-btn {
        padding: 12px 24px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 6px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 180px;
        justify-content: center;
      }

      .ai-data-viz__generate-btn:hover:not(:disabled) {
        background: #0056b3;
      }

      .ai-data-viz__generate-btn:disabled {
        background: #6c757d;
        cursor: not-allowed;
      }

      .ai-data-viz__clear-btn {
        padding: 8px 16px;
        background: transparent;
        color: #dc3545;
        border: 1px solid #dc3545;
        border-radius: 6px;
        font-family: inherit;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .ai-data-viz__clear-btn:hover {
        background: #dc3545;
        color: white;
      }

      .ai-data-viz__spinner {
        width: 16px;
        height: 16px;
        border: 2px solid transparent;
        border-top: 2px solid currentColor;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .ai-data-viz__visualization {
        margin-top: 20px;
      }

      .ai-data-viz__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px;
        color: #666;
      }

      .ai-data-viz.dark .ai-data-viz__loading {
        color: #ccc;
      }

      .ai-data-viz__loading p {
        margin-top: 12px;
      }

      .ai-data-viz__iframe-container {
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        overflow: hidden;
      }

      .ai-data-viz.dark .ai-data-viz__iframe-container {
        border-color: #444;
      }

      .ai-data-viz__iframe {
        width: 100%;
        height: ${this.config.iframeHeight || 600}px;
        border: none;
        background: white;
      }

      .ai-data-viz__error {
        margin-top: 20px;
        padding: 16px;
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 6px;
        color: #721c24;
      }

      .ai-data-viz.dark .ai-data-viz__error {
        background: #2d1b1e;
        border-color: #5a1a1a;
        color: #f8d7da;
      }

      .ai-data-viz__error-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .ai-data-viz__error-message {
        margin: 0;
        flex: 1;
      }

      .ai-data-viz__error-retry {
        padding: 6px 12px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
      }

      .ai-data-viz__error-retry:hover {
        background: #c82333;
      }

      /* Prompt summary */
      .ai-data-viz__prompt-summary {
        background: #f8f9fa;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 8px;
        font-size: 12px;
        color: #333;
      }

      .ai-data-viz.dark .ai-data-viz__prompt-summary {
        background: #2a2a2a;
        border-color: #444;
        color: #ccc;
      }

      /* API overview */
      .ai-data-viz__api-overview {
        background: #f1f3f5;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 8px;
        font-size: 12px;
        color: #333;
      }

      .ai-data-viz.dark .ai-data-viz__api-overview {
        background: #252525;
        border-color: #444;
        color: #ccc;
      }

      /* Diagram history container */
      .ai-data-viz__history {
        background: #f8f9fa;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 8px;
        font-size: 12px;
        color: #333;
      }

      .ai-data-viz.dark .ai-data-viz__history {
        background: #2a2a2a;
        border-color: #444;
        color: #ccc;
      }

      /* History list */
      .ai-data-viz__history-list {
        margin: 6px 0 0 20px;
        padding: 0;
        list-style: disc;
      }
      .ai-data-viz__history-list li {
        cursor: pointer;
        padding: 4px 4px;
      }
      .ai-data-viz__history-summary {
        cursor: pointer;
        position: relative;
        padding-right: 18px; /* space for clear button */
      }
      .ai-data-viz__history-clear-btn {
        background: none;
        border: none;
        color: inherit;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        position: absolute;
        right: 0;
        top: 0;
      }
      .ai-data-viz__history-btn-div {
        display: flex;
        gap: 4px;
      }
      .ai-data-viz__history-clear-btn:hover { opacity: 0.7; }
      .ai-data-viz__history-publish-btn {
        background: #007bff;
        border: none;
        color: #fff;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        cursor: pointer;
      }
      .ai-data-viz__history-publish-btn:hover { opacity: 0.85; }
      .ai-data-viz__history-remove-btn {
        background:rgb(54, 54, 54);
        border: none;
        color: #fff;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        cursor: pointer;
      }
      .ai-data-viz__history-remove-btn:hover { opacity: 0.7; }
      .ai-data-viz.dark .ai-data-viz__history-list li {
        border-color: #444;
      }
      .ai-data-viz__history-list li:hover {
        background: #f0f0f0;
      }
      .ai-data-viz.dark .ai-data-viz__history-list li:hover {
        background: #333;
      }

      @media (max-width: 768px) {
        .ai-data-viz {
          padding: 16px;
        }

        .ai-data-viz__input-group {
          flex-direction: column;
        }

        .ai-data-viz__generate-btn {
          min-width: auto;
        }

        .ai-data-viz__iframe {
          height: 400px;
        }
      }
    `;
    }
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const textarea = this.container.querySelector('.ai-data-viz__textarea');
        const generateBtn = this.container.querySelector('.ai-data-viz__generate-btn');
        const clearBtn = this.container.querySelector('.ai-data-viz__clear-btn');
        const retryBtn = this.container.querySelector('.ai-data-viz__error-retry');
        const toggleBtn = this.container.querySelector('.ai-data-viz__toggle-input');
        const historyList = this.container.querySelector('.ai-data-viz__history-list');
        const clearHistoryBtn = this.container.querySelector('.ai-data-viz__history-clear-btn');
        generateBtn.addEventListener('click', () => this.generateVisualization());
        clearBtn.addEventListener('click', () => this.clearVisualization());
        retryBtn.addEventListener('click', () => this.generateVisualization());
        toggleBtn.addEventListener('click', () => this.toggleInputSection());
        // History click (handles publish / remove / select version)
        historyList.addEventListener('click', (e) => {
            const target = e.target;
            // Publish latest version
            const publishBtn = target.closest('.ai-data-viz__history-publish-btn');
            if (publishBtn) {
                e.stopPropagation();
                const li = publishBtn.closest('li[data-index]');
                if (!li)
                    return;
                const idx = parseInt(li.getAttribute('data-index') || '-1', 10);
                if (idx >= 0 && idx < this.history.length) {
                    const item = this.history[idx];
                    const latest = item.versions[item.versions.length - 1];
                    if (this.config.publishGeneratedDiagram) {
                        try {
                            this.config.publishGeneratedDiagram(latest.html, item.prompt);
                        }
                        catch (err) {
                            console.error('publishGeneratedDiagram error', err);
                        }
                    }
                }
                return;
            }
            // Remove entire prompt history
            const removeBtn = target.closest('.ai-data-viz__history-remove-btn');
            if (removeBtn) {
                e.stopPropagation();
                const li = removeBtn.closest('li[data-index]');
                if (!li)
                    return;
                const idx = parseInt(li.getAttribute('data-index') || '-1', 10);
                if (idx >= 0 && idx < this.history.length) {
                    this.removeHistory(idx);
                }
                return;
            }
            // Click on a specific version
            const versionLi = target.closest('li[data-version]');
            if (versionLi) {
                const idx = parseInt(versionLi.getAttribute('data-index') || '-1', 10);
                const vIdx = parseInt(versionLi.getAttribute('data-version') || '-1', 10);
                if (idx >= 0 && idx < this.history.length && vIdx >= 0 && vIdx < this.history[idx].versions.length) {
                    const item = this.history[idx];
                    const version = item.versions[vIdx];
                    this.activeHistoryIndex = idx;
                    this.displayVisualization(version.html);
                    this.lastGeneratedCode = version.html;
                    // Prompt & context
                    const textarea = this.container.querySelector('.ai-data-viz__textarea');
                    textarea.value = '';
                    const promptSummary = this.container.querySelector('.ai-data-viz__prompt-summary');
                    const promptTextEl = this.container.querySelector('.ai-data-viz__prompt-text');
                    if (promptSummary && promptTextEl) {
                        promptTextEl.textContent = item.prompt;
                        promptSummary.style.display = 'block';
                        promptSummary.open = false;
                    }
                    this.originalPrompt = item.prompt;
                    this.improvementPrompts = [];
                    this.setState(VisualizationState.DISPLAYING);
                }
                return;
            }
            // Click on parent prompt (loads latest version)
            const li = target.closest('li[data-index]');
            if (li) {
                const idx = parseInt(li.getAttribute('data-index') || '-1', 10);
                if (idx >= 0 && idx < this.history.length) {
                    const item = this.history[idx];
                    const latest = item.versions[item.versions.length - 1];
                    this.activeHistoryIndex = idx;
                    this.displayVisualization(latest.html);
                    this.lastGeneratedCode = latest.html;
                    const textarea = this.container.querySelector('.ai-data-viz__textarea');
                    textarea.value = '';
                    const promptSummary = this.container.querySelector('.ai-data-viz__prompt-summary');
                    const promptTextEl = this.container.querySelector('.ai-data-viz__prompt-text');
                    if (promptSummary && promptTextEl) {
                        promptTextEl.textContent = item.prompt;
                        promptSummary.style.display = 'block';
                        promptSummary.open = false;
                    }
                    this.originalPrompt = item.prompt;
                    this.improvementPrompts = [];
                    this.setState(VisualizationState.DISPLAYING);
                }
            }
        });
        // Enable generate button only when there's text
        textarea.addEventListener('input', () => {
            generateBtn.disabled = !textarea.value.trim() || this.state === VisualizationState.GENERATING;
        });
        // Initial state
        generateBtn.disabled = true;
        // Clear history handler
        clearHistoryBtn.addEventListener('click', () => {
            this.clearHistory();
        });
    }
    /**
     * Toggle visibility of the input section
     */
    toggleInputSection() {
        const inputSection = this.container.querySelector('.ai-data-viz__input-section');
        const toggleBtn = this.container.querySelector('.ai-data-viz__toggle-input');
        this.inputCollapsed = !this.inputCollapsed;
        if (this.inputCollapsed) {
            inputSection.style.display = 'none';
            toggleBtn.textContent = '+';
            toggleBtn.setAttribute('aria-label', 'Show input');
        }
        else {
            inputSection.style.display = 'block';
            toggleBtn.textContent = '−';
            toggleBtn.setAttribute('aria-label', 'Hide input');
        }
    }
    /**
     * Setup message listener for iframe communication
     */
    setupMessageListener() {
        this.messageListener = (event) => {
            var _a;
            // Ignore messages from unknown sources to prevent malicious injections
            if (event.source !== ((_a = this.iframe) === null || _a === void 0 ? void 0 : _a.contentWindow)) {
                return;
            }
            const data = event.data;
            if (data.type === 'API_REQUEST' && data.requestId && data.url) {
                this.handleApiRequest(data);
            }
            else if (data.type === 'IFRAME_ERROR') {
                this.setState(VisualizationState.ERROR);
                this.showError(data.message || 'Visualization error');
                if (this.config.onError) {
                    this.config.onError(new Error(data.message || 'Visualization error'));
                }
            }
        };
        window.addEventListener('message', this.messageListener);
    }
    /**
     * Handle API requests from iframe
     */
    async handleApiRequest(requestData) {
        const { requestId, url } = requestData;
        try {
            const response = await this.config.apiRequest(url);
            this.sendMessageToIframe({
                type: 'API_RESPONSE',
                requestId,
                data: response
            });
        }
        catch (error) {
            this.sendMessageToIframe({
                type: 'API_RESPONSE',
                requestId,
                error: error instanceof Error ? error.message : 'API request failed'
            });
        }
    }
    /**
     * Send message to iframe
     */
    sendMessageToIframe(message) {
        var _a;
        if ((_a = this.iframe) === null || _a === void 0 ? void 0 : _a.contentWindow) {
            this.iframe.contentWindow.postMessage(message, '*');
        }
    }
    /**
     * Generate visualization based on user input
     */
    async generateVisualization() {
        const textarea = this.container.querySelector('.ai-data-viz__textarea');
        const message = textarea.value.trim();
        if (!message) {
            this.showError('Please enter a visualization request');
            return;
        }
        try {
            const isImprovement = this.lastGeneratedCode !== null && this.state === VisualizationState.DISPLAYING;
            // Track prompt history
            if (isImprovement) {
                this.improvementPrompts.push(message);
            }
            else {
                this.originalPrompt = message;
                this.improvementPrompts = [];
            }
            this.setState(VisualizationState.GENERATING);
            this.hideError();
            const prompt = isImprovement
                ? this.buildImprovementPrompt(this.lastGeneratedCode)
                : this.buildVisualizationPrompt(message);
            let htmlResponse = await this.config.chatCompletion(prompt);
            htmlResponse = this.sanitizeHtmlResponse(htmlResponse);
            if (!htmlResponse || !htmlResponse.trim()) {
                throw new AIDataVisualizationError(ErrorType.INVALID_HTML_RESPONSE, 'AI returned empty response');
            }
            this.displayVisualization(htmlResponse);
            // Save generated code and prompt for future improvements and display
            this.lastGeneratedCode = htmlResponse;
            // Update prompt summary UI with full history
            const promptSummary = this.container.querySelector('.ai-data-viz__prompt-summary');
            const promptTextEl = this.container.querySelector('.ai-data-viz__prompt-text');
            if (promptSummary && promptTextEl) {
                const allPrompts = [this.originalPrompt, ...this.improvementPrompts].filter(Boolean).join('\n');
                promptTextEl.textContent = allPrompts;
                promptSummary.style.display = 'block';
                promptSummary.open = false; // keep collapsed by default
            }
            // Clear textarea for next improvement
            textarea.value = '';
            // Persist history (keep original + all improvements)
            if (isImprovement && this.activeHistoryIndex !== null) {
                this.addVersionToHistory(this.activeHistoryIndex, { html: htmlResponse, timestamp: Date.now(), prompt: message });
            }
            else {
                const historyItem = {
                    prompt: this.originalPrompt || message,
                    versions: [{ html: htmlResponse, timestamp: Date.now(), prompt: this.originalPrompt || message }]
                };
                this.saveHistory(historyItem);
                this.activeHistoryIndex = 0; // newest item index
            }
            this.renderHistoryList();
            this.setState(VisualizationState.DISPLAYING);
        }
        catch (error) {
            this.setState(VisualizationState.ERROR);
            const errorMessage = error instanceof Error ? error.message : 'Failed to generate visualization';
            this.showError(errorMessage);
            if (this.config.onError) {
                this.config.onError(error instanceof Error ? error : new Error(errorMessage));
            }
        }
    }
    /**
     * Build the prompt for AI visualization generation
     */
    buildVisualizationPrompt(userMessage) {
        return `You are an expert front-end engineer who creates data visualizations.

USER REQUEST:
"${userMessage}"

AVAILABLE API ENDPOINTS (OpenAPI-like schema):
${this.config.apiDescription}

TASK:
Generate a COMPLETE, self-contained HTML document (including CSS & JavaScript) that satisfies the user's request by fetching data from the listed API endpoints. Use Chart.js (CDN: https://cdn.jsdelivr.net/npm/chart.js) or native web technologies.

REQUIREMENTS (IMPORTANT):
• Return ONLY HTML/JS/CSS code – no markdown, explanations or extra text.
• Include professional, responsive styling.
• USE the provided global function \`apiRequest(url)\` for ALL data calls (do NOT use fetch/axios directly).
• apiRequest(url) returns the parsed JSON body **directly** (no \`data\` wrapper, no \`success\` flag). Treat what it returns as the endpoint's response payload.
• Handle loading states & errors gracefully within the HTML.
• The code runs in a sandboxed iframe WITHOUT same-origin privileges → do NOT access localStorage, sessionStorage, cookies, IndexedDB, etc.
• Try to use all the available space for the diagram (no fixed max height/width).
• Avoid viewport units (vw, vh) for width/height inside the iframe; rely on flex layouts or percentage sizes (width:100%, height:100%).

EXAMPLE API USAGE:
\`\`\`js
async function loadData() {
  // Suppose /api/users returns an array of users
  const users = await apiRequest('/api/users');
  console.log(users.length);
}
\`\`\`

Return the finished HTML document now.`;
    }
    /**
     * Build prompt for improving an existing visualization
     */
    buildImprovementPrompt(existingCode) {
        const promptHistory = [this.originalPrompt, ...this.improvementPrompts].filter(Boolean).join('\n');
        return `You are provided with an EXISTING visualization (full HTML) generated earlier plus the complete history of user requests. Improve the visualization to satisfy the LATEST request while preserving prior context and functionality.

AVAILABLE API ENDPOINTS:
${this.config.apiDescription}

IMPORTANT API RULES:
• Use ONLY the global \`apiRequest(url)\` helper for HTTP calls.
• apiRequest(url) returns the endpoint's parsed JSON payload directly (no \`data\` or \`success\` fields).

EXISTING VISUALIZATION CODE START
${existingCode}
EXISTING VISUALIZATION CODE END

FULL USER REQUEST HISTORY:
${promptHistory}

REQUIREMENTS:
• Return ONLY HTML/JS/CSS code (no explanations).
• Produce a FULL HTML document that can replace the previous one.
• Continue to use \`apiRequest(url)\` for data access.
• Avoid viewport units (vw, vh) for width/height to prevent overflow; prefer percentages or flex layouts that stay within the iframe bounds.
• Keep styling modern and responsive.
• Gracefully handle loading and error states.
• Remember the sandbox constraints: no access to localStorage, cookies, or other same-origin only APIs.`;
    }
    /** Display the generated visualization in iframe */
    displayVisualization(htmlContent) {
        const visualizationDiv = this.container.querySelector('.ai-data-viz__visualization');
        const loadingDiv = this.container.querySelector('.ai-data-viz__loading');
        const clearBtn = this.container.querySelector('.ai-data-viz__clear-btn');
        visualizationDiv.style.display = 'block';
        loadingDiv.style.display = 'none';
        clearBtn.style.display = 'inline-block';
        const modifiedHtml = this.injectApiBridge(htmlContent);
        this.iframe = this.container.querySelector('.ai-data-viz__iframe');
        this.iframe.srcdoc = modifiedHtml;
    }
    /** Inject parent↔iframe bridge */
    injectApiBridge(htmlContent) {
        const bridge = `
<style>html,body{margin:0;padding:0;width:100%;height:100%;box-sizing:border-box;overflow:hidden;}body>*{max-width:100%;}canvas,svg{display:block;max-width:100%;max-height:100%;}/* force generated container to stay in bounds */.container{width:100%!important;height:100%!important;}</style>
<script>(function(){window.apiRequest=function(u){return new Promise((res,rej)=>{const id='req_'+Date.now()+'_'+Math.random().toString(36).substr(2,9);function h(e){const d=e.data;if(d&&d.type==='API_RESPONSE'&&d.requestId===id){window.removeEventListener('message',h);d.error?rej(new Error(d.error)):res(d.data);}}window.addEventListener('message',h);window.parent.postMessage({type:'API_REQUEST',requestId:id,url:u},'*');setTimeout(()=>{window.removeEventListener('message',h);rej(new Error('API request timeout'));},3e4);});};})();</script>
<script>window.addEventListener('error',e=>{window.parent.postMessage({type:'IFRAME_ERROR',message:e.message,stack:e.error&&e.error.stack},'*');});window.addEventListener('unhandledrejection',e=>{window.parent.postMessage({type:'IFRAME_ERROR',message:e.reason?e.reason.message||String(e.reason):'Unhandled rejection',stack:e.reason&&e.reason.stack},'*');});</script>`;
        const headClose = htmlContent.toLowerCase().indexOf('</head>');
        if (headClose !== -1)
            return htmlContent.slice(0, headClose) + bridge + htmlContent.slice(headClose);
        const bodyOpen = htmlContent.toLowerCase().indexOf('<body');
        if (bodyOpen !== -1) {
            const bodyTagEnd = htmlContent.indexOf('>', bodyOpen) + 1;
            return htmlContent.slice(0, bodyTagEnd) + bridge + htmlContent.slice(bodyTagEnd);
        }
        return bridge + htmlContent;
    }
    /** Clean AI response by stripping ```html or ``` code fences */
    sanitizeHtmlResponse(raw) {
        let cleaned = raw.trim();
        // Remove leading ```html or ```
        cleaned = cleaned.replace(/^````?\s*html\s*/i, '').replace(/^```/, '');
        // Remove trailing ```
        cleaned = cleaned.replace(/````?\s*$/i, '').trim();
        // Strip stray sourceMappingURL comments that break devtools when running inside about:srcdoc
        cleaned = cleaned.replace(/\/\/[@#]\s*sourceMappingURL=.*$/gim, '');
        return cleaned;
    }
    /** Clear current visualization */
    clearVisualization() {
        const visualizationDiv = this.container.querySelector('.ai-data-viz__visualization');
        const clearBtn = this.container.querySelector('.ai-data-viz__clear-btn');
        visualizationDiv.style.display = 'none';
        clearBtn.style.display = 'none';
        this.setState(VisualizationState.IDLE);
        this.hideError();
        if (this.iframe) {
            this.iframe.srcdoc = '';
        }
        this.iframe = undefined;
        this.lastGeneratedCode = null;
        this.activeHistoryIndex = null;
        this.originalPrompt = null;
        this.improvementPrompts = [];
        const promptSummary = this.container.querySelector('.ai-data-viz__prompt-summary');
        const promptTextEl = this.container.querySelector('.ai-data-viz__prompt-text');
        if (promptSummary && promptTextEl) {
            promptSummary.style.display = 'none';
            promptTextEl.textContent = '';
        }
    }
    /** Update UI state */
    setState(state) {
        // Persist internal state value for future checks
        this.state = state;
        const generateBtn = this.container.querySelector('.ai-data-viz__generate-btn');
        const btnText = generateBtn.querySelector('.ai-data-viz__btn-text');
        const btnSpinner = generateBtn.querySelector('.ai-data-viz__spinner');
        const textarea = this.container.querySelector('.ai-data-viz__textarea');
        switch (state) {
            case VisualizationState.GENERATING:
                generateBtn.disabled = true;
                btnText.textContent = 'Generating...';
                btnSpinner.style.display = 'block';
                textarea.disabled = true;
                break;
            case VisualizationState.DISPLAYING:
                generateBtn.disabled = !textarea.value.trim();
                btnText.textContent = 'Improve Visualization';
                btnSpinner.style.display = 'none';
                textarea.disabled = false;
                break;
            case VisualizationState.IDLE:
            case VisualizationState.ERROR:
                generateBtn.disabled = !textarea.value.trim();
                btnText.textContent = 'Generate Visualization';
                btnSpinner.style.display = 'none';
                textarea.disabled = false;
                break;
        }
    }
    showError(msg) {
        const errorDiv = this.container.querySelector('.ai-data-viz__error');
        const p = this.container.querySelector('.ai-data-viz__error-message');
        p.textContent = msg;
        errorDiv.style.display = 'block';
    }
    hideError() {
        const errorDiv = this.container.querySelector('.ai-data-viz__error');
        errorDiv.style.display = 'none';
    }
    destroy() {
        if (this.messageListener)
            window.removeEventListener('message', this.messageListener);
        this.container.innerHTML = '';
        this.iframe = undefined;
    }
    getState() { return this.state; }
    setTheme(theme) {
        const vizDiv = this.container.querySelector('.ai-data-viz');
        vizDiv.className = `ai-data-viz ${theme} ${this.config.className || ''}`;
        this.config.theme = theme;
    }
    /** (re)build simple API overview list */
    buildApiOverviewHtml() {
        var _a;
        try {
            const parsed = JSON.parse(this.config.apiDescription);
            if (!parsed || typeof parsed !== 'object' || !parsed.paths)
                return '';
            const items = [];
            for (const path in parsed.paths) {
                const methods = parsed.paths[path];
                if (methods) {
                    for (const m in methods) {
                        const summary = ((_a = methods[m]) === null || _a === void 0 ? void 0 : _a.summary) || '';
                        items.push(`<li><code>${m.toUpperCase()} ${path}</code>${summary ? ' - ' + summary : ''}</li>`);
                    }
                }
            }
            return items.length ? `<ul style="margin:8px 0 0 16px;">${items.join('')}</ul>` : '';
        }
        catch (_b) {
            return '';
        }
    }
    loadHistory() {
        try {
            const raw = localStorage.getItem(this.HISTORY_KEY);
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return;
            this.history = parsed.map((it) => {
                if (it && it.versions)
                    return it;
                // Legacy single-version entry → migrate
                return {
                    prompt: it.prompt,
                    versions: [{ html: it.html, timestamp: it.timestamp }]
                };
            });
        }
        catch (_a) { }
    }
    saveHistory(item) {
        this.history.unshift(item);
        this.history = this.history.slice(0, 10);
        this.persistHistory();
    }
    // Append a new version to an existing prompt history
    addVersionToHistory(idx, version) {
        if (idx < 0 || idx >= this.history.length)
            return;
        this.history[idx].versions.push(version);
        this.persistHistory();
    }
    persistHistory() {
        try {
            localStorage.setItem(this.HISTORY_KEY, JSON.stringify(this.history));
        }
        catch (_a) { }
    }
    renderHistoryList() {
        const list = this.container.querySelector('.ai-data-viz__history-list');
        if (!list)
            return;
        list.innerHTML = '';
        this.history.forEach((item, idx) => {
            const li = document.createElement('li');
            li.setAttribute('data-index', String(idx));
            // Header (prompt + buttons)
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            const span = document.createElement('span');
            span.textContent = item.prompt.slice(0, 120);
            const btnDiv = document.createElement('div');
            btnDiv.className = 'ai-data-viz__history-btn-div';
            const pubBtn = document.createElement('button');
            pubBtn.type = 'button';
            pubBtn.textContent = 'Publish';
            pubBtn.className = 'ai-data-viz__history-publish-btn';
            const rmBtn = document.createElement('button');
            rmBtn.type = 'button';
            rmBtn.textContent = 'Remove';
            rmBtn.className = 'ai-data-viz__history-remove-btn';
            btnDiv.appendChild(pubBtn);
            btnDiv.appendChild(rmBtn);
            header.appendChild(span);
            header.appendChild(btnDiv);
            li.appendChild(header);
            list.appendChild(li);
            // Versions list (including original and all improvements)
            if (item.versions.length) {
                const vUl = document.createElement('ul');
                vUl.className = 'ai-data-viz__history-version-list';
                item.versions.forEach((v, vIdx) => {
                    const vLi = document.createElement('li');
                    vLi.setAttribute('data-index', String(idx));
                    vLi.setAttribute('data-version', String(vIdx));
                    const promptText = vIdx === 0
                        ? (item.prompt.slice(0, 120) || 'Original')
                        : (v.prompt ? v.prompt.slice(0, 120) : 'Improvement');
                    vLi.textContent = `v${vIdx} — ${promptText}`;
                    vUl.appendChild(vLi);
                });
                list.appendChild(vUl);
            }
        });
    }
    clearHistory() {
        // Remove persisted history
        this.history = [];
        this.activeHistoryIndex = null;
        try {
            localStorage.removeItem(this.HISTORY_KEY);
        }
        catch (_a) { }
        // Reset current visualization & prompt context
        this.clearVisualization();
        // Re-render empty list
        this.renderHistoryList();
    }
    removeHistory(idx) {
        if (idx < 0 || idx >= this.history.length)
            return;
        this.history.splice(idx, 1);
        this.persistHistory();
        this.renderHistoryList();
    }
}
//# sourceMappingURL=ai-visualization.js.map