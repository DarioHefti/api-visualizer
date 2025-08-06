import { AIDataVisualization } from './ai-visualization.js';
import { VisualizationState, ErrorType, AIDataVisualizationError } from './types.js';
/**
 * Create a new AI Data Visualization instance
 * @param config Configuration options
 * @returns AIDataVisualization instance
 */
export function create(config) {
    return new AIDataVisualization(config);
}
// Export all types and classes for TypeScript users
export { AIDataVisualization, VisualizationState, ErrorType, AIDataVisualizationError };
// Default export for convenience
export default {
    create,
    AIDataVisualization,
    VisualizationState,
    ErrorType,
    AIDataVisualizationError
};
// Ensure global export happens
const globalExport = {
    create,
    AIDataVisualization,
    VisualizationState,
    ErrorType,
    AIDataVisualizationError
};
if (typeof window !== 'undefined') {
    window.AIDataVisualization = globalExport;
}
// Also make it available as module export for UMD
if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalExport;
}
//# sourceMappingURL=index.js.map