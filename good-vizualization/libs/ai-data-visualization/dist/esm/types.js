/**
 * Visualization state enum
 */
export var VisualizationState;
(function (VisualizationState) {
    VisualizationState["IDLE"] = "idle";
    VisualizationState["GENERATING"] = "generating";
    VisualizationState["DISPLAYING"] = "displaying";
    VisualizationState["ERROR"] = "error";
})(VisualizationState || (VisualizationState = {}));
/**
 * Error types that can occur
 */
export var ErrorType;
(function (ErrorType) {
    ErrorType["CONTAINER_NOT_FOUND"] = "container-not-found";
    ErrorType["INVALID_API_DESCRIPTION"] = "invalid-api-description";
    ErrorType["CHAT_COMPLETION_FAILED"] = "chat-completion-failed";
    ErrorType["API_REQUEST_FAILED"] = "api-request-failed";
    ErrorType["IFRAME_COMMUNICATION_FAILED"] = "iframe-communication-failed";
    ErrorType["INVALID_HTML_RESPONSE"] = "invalid-html-response";
})(ErrorType || (ErrorType = {}));
/**
 * Custom error class for AI Data Visualization errors
 */
export class AIDataVisualizationError extends Error {
    constructor(type, message, originalError) {
        super(message);
        this.type = type;
        this.originalError = originalError;
        this.name = 'AIDataVisualizationError';
    }
}
//# sourceMappingURL=types.js.map