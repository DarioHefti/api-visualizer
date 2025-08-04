"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIDataVisualizationError = exports.ErrorType = exports.VisualizationState = exports.AIDataVisualization = void 0;
exports.create = create;
const ai_visualization_1 = require("./ai-visualization");
Object.defineProperty(exports, "AIDataVisualization", { enumerable: true, get: function () { return ai_visualization_1.AIDataVisualization; } });
const types_1 = require("./types");
Object.defineProperty(exports, "VisualizationState", { enumerable: true, get: function () { return types_1.VisualizationState; } });
Object.defineProperty(exports, "ErrorType", { enumerable: true, get: function () { return types_1.ErrorType; } });
Object.defineProperty(exports, "AIDataVisualizationError", { enumerable: true, get: function () { return types_1.AIDataVisualizationError; } });
/**
 * Create a new AI Data Visualization instance
 * @param config Configuration options
 * @returns AIDataVisualization instance
 */
function create(config) {
    return new ai_visualization_1.AIDataVisualization(config);
}
// Default export for convenience
exports.default = {
    create,
    AIDataVisualization: ai_visualization_1.AIDataVisualization,
    VisualizationState: types_1.VisualizationState,
    ErrorType: types_1.ErrorType,
    AIDataVisualizationError: types_1.AIDataVisualizationError
};
// Ensure global export happens
const globalExport = {
    create,
    AIDataVisualization: ai_visualization_1.AIDataVisualization,
    VisualizationState: types_1.VisualizationState,
    ErrorType: types_1.ErrorType,
    AIDataVisualizationError: types_1.AIDataVisualizationError
};
if (typeof window !== 'undefined') {
    window.AIDataVisualization = globalExport;
}
// Also make it available as module export for UMD
if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalExport;
}
//# sourceMappingURL=index.js.map