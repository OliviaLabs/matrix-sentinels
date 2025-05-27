export default class AiDisplayPanel {
    constructor() {
        this.panelElement = document.getElementById('ai-thinking-panel');
        this.paramsDisplayElement = document.getElementById('ai-params-display');

        if (!this.panelElement || !this.paramsDisplayElement) {
            console.warn('AI Display Panel HTML elements not found. Panel will not be active.');
            this.active = false;
        } else {
            this.active = true;
            this.paramsDisplayElement.textContent = 'Initializing AI...';
        }
    }

    updateParameters(params) {
        if (!this.active) return;

        if (typeof params === 'object' && params !== null) {
            // Filter out uniforms that are not top-level or are too verbose for basic display
            const displayParams = {};
            for (const key in params) {
                if (typeof params[key] !== 'object' || key === 'color') { // Show color object, filter others
                    displayParams[key] = params[key];
                }
            }
            this.paramsDisplayElement.textContent = JSON.stringify(displayParams, null, 2);
        } else if (typeof params === 'string') {
            this.paramsDisplayElement.textContent = params; // For direct status messages
        } else {
            this.paramsDisplayElement.textContent = 'Received unknown parameters format.';
        }
    }

    showError(message) {
        if (!this.active) return;
        this.paramsDisplayElement.textContent = `Error: ${message}`;
        this.paramsDisplayElement.style.color = 'red';
    }

    showLoading(message = 'AI is thinking...') {
        if (!this.active) return;
        this.paramsDisplayElement.textContent = message;
        this.paramsDisplayElement.style.color = '#00ff00'; // Default color
    }
} 