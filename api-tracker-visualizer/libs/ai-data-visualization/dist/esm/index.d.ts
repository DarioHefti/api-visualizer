import { AIDataVisualization } from './ai-visualization';
import { AIDataVisualizationConfig, VisualizationState, ErrorType, AIDataVisualizationError } from './types';
/**
 * Create a new AI Data Visualization instance
 * @param config Configuration options
 * @returns AIDataVisualization instance
 */
export declare function create(config: AIDataVisualizationConfig): AIDataVisualization;
export { AIDataVisualization, AIDataVisualizationConfig, VisualizationState, ErrorType, AIDataVisualizationError };
declare const _default: {
    create: typeof create;
    AIDataVisualization: typeof AIDataVisualization;
    VisualizationState: typeof VisualizationState;
    ErrorType: typeof ErrorType;
    AIDataVisualizationError: typeof AIDataVisualizationError;
};
export default _default;
declare global {
    interface Window {
        AIDataVisualization?: any;
    }
}
//# sourceMappingURL=index.d.ts.map