import { AIDataVisualizationConfig, VisualizationState } from './types.js';
/**
 * Main AI Data Visualization class
 */
export declare class AIDataVisualization {
    private container;
    private config;
    private state;
    private iframe?;
    private messageListener?;
    private lastGeneratedCode;
    private originalPrompt;
    private improvementPrompts;
    private inputCollapsed;
    private history;
    private readonly HISTORY_KEY;
    private activeHistoryIndex;
    private apiOverviewHtml;
    constructor(config: AIDataVisualizationConfig);
    /**
     * Resolve container element from string selector or HTMLElement
     */
    private resolveContainer;
    /**
     * Validate configuration
     */
    private validateConfig;
    /**
     * Initialize the visualization component
     */
    private initialize;
    /**
     * Create the HTML structure
     */
    private createHTML;
    /**
     * Attach CSS styles
     */
    private attachStyles;
    /**
     * Get CSS styles
     */
    private getStyles;
    /**
     * Setup event listeners
     */
    private setupEventListeners;
    /**
     * Toggle visibility of the input section
     */
    private toggleInputSection;
    /**
     * Setup message listener for iframe communication
     */
    private setupMessageListener;
    /**
     * Handle API requests from iframe
     */
    private handleApiRequest;
    /**
     * Send message to iframe
     */
    private sendMessageToIframe;
    /**
     * Generate visualization based on user input
     */
    generateVisualization(): Promise<void>;
    /**
     * Build the prompt for AI visualization generation
     */
    private buildVisualizationPrompt;
    /**
     * Build prompt for improving an existing visualization
     */
    private buildImprovementPrompt;
    /** Display the generated visualization in iframe */
    private displayVisualization;
    /** Inject parent↔iframe bridge */
    private injectApiBridge;
    /** Clean AI response by stripping ```html or ``` code fences */
    private sanitizeHtmlResponse;
    /** Clear current visualization */
    clearVisualization(): void;
    /** Update UI state */
    private setState;
    private showError;
    private hideError;
    destroy(): void;
    getState(): VisualizationState;
    setTheme(theme: 'light' | 'dark' | 'auto'): void;
    /** (re)build simple API overview list */
    private buildApiOverviewHtml;
    private loadHistory;
    private saveHistory;
    private replaceHistory;
    private renderHistoryList;
    private clearHistory;
    private removeHistory;
}
//# sourceMappingURL=ai-visualization.d.ts.map