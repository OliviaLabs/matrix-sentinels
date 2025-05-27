export default class AiDisplayPanel {
    constructor() {
        this.greenDisplay = {
            panel: document.getElementById('green-swarm-ai-display'),
            narrative: document.querySelector('#green-swarm-ai-display .ai-narrative-display'),
            strategy: document.querySelector('#green-swarm-ai-display .ai-strategy-display'),
            incomingMessagesContainer: document.querySelector('#green-swarm-ai-display .ai-incoming-message-display'),
            outgoingMessagesContainer: document.querySelector('#green-swarm-ai-display .ai-outgoing-message-display'),
            params: document.querySelector('#green-swarm-ai-display .ai-params-display'),
        };
        this.orangeDisplay = {
            panel: document.getElementById('orange-swarm-ai-display'),
            narrative: document.querySelector('#orange-swarm-ai-display .ai-narrative-display'),
            strategy: document.querySelector('#orange-swarm-ai-display .ai-strategy-display'),
            incomingMessagesContainer: document.querySelector('#orange-swarm-ai-display .ai-incoming-message-display'),
            outgoingMessagesContainer: document.querySelector('#orange-swarm-ai-display .ai-outgoing-message-display'),
            params: document.querySelector('#orange-swarm-ai-display .ai-params-display'),
        };

        this.active = this.validateDisplayElements(this.greenDisplay, 'Green') &&
                      this.validateDisplayElements(this.orangeDisplay, 'Orange');

        if (this.active) {
            console.log('AiDisplayPanel is active.');
            this.clearAllMessages(); // Clear on init
        } else {
            console.warn('AiDisplayPanel is not fully active due to missing HTML elements.');
        }
    }

    validateDisplayElements(display, swarmName) {
        if (!display.panel) console.warn(`${swarmName} AI display panel not found.`);
        if (!display.narrative) console.warn(`${swarmName} AI narrative display not found.`);
        if (!display.strategy) console.warn(`${swarmName} AI strategy display not found.`);
        if (!display.incomingMessagesContainer) console.warn(`${swarmName} AI incoming messages container not found.`);
        if (!display.outgoingMessagesContainer) console.warn(`${swarmName} AI outgoing messages container not found.`);
        if (!display.params) console.warn(`${swarmName} AI params display not found.`);
        return display.panel && display.narrative && display.strategy && display.incomingMessagesContainer && display.outgoingMessagesContainer && display.params;
    }

    getDisplay(swarmId) {
        return swarmId === 'green' ? this.greenDisplay : this.orangeDisplay;
    }

    updateParameters(data) {
        if (!this.active || !data) return;
        const display = this.getDisplay(data.swarmId);
        if (!display || !display.panel) return;

        if (data.thought_process) {
            display.narrative.textContent = data.thought_process;
        } else {
            display.narrative.textContent = 'Thought process not available.';
        }

        if (data.strategic_focus) {
            display.strategy.textContent = `Strategy: ${data.strategic_focus}`;
        } else {
            display.strategy.textContent = 'Strategic focus not available.';
        }

        const paramsToDisplay = { ...data };
        delete paramsToDisplay.swarmId;
        delete paramsToDisplay.thought_process;
        delete paramsToDisplay.strategic_focus;
        // Also remove any message fields from the main param display
        delete paramsToDisplay.last_outgoing_message; 
        delete paramsToDisplay.processed_incoming_message;

        display.params.textContent = JSON.stringify(paramsToDisplay, null, 2);
    }

    _appendMessage(container, message, type, swarmName) {
        if (!container || !message) return;
        const messageElement = document.createElement('div');
        messageElement.classList.add('message-entry');
        messageElement.classList.add(type === 'incoming' ? 'incoming-msg' : 'outgoing-msg');
        
        const prefix = type === 'incoming' ? `${swarmName === 'Green' ? 'Orange' : 'Green'} says: ` : `You (to ${swarmName === 'Green' ? 'Orange' : 'Green'}): `;
        
        messageElement.textContent = `${new Date().toLocaleTimeString()}: ${prefix}${message}`;
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight; // Auto-scroll to latest
    }

    showIncomingMessage(swarmId, message) {
        if (!this.active || !message) return;
        const display = this.getDisplay(swarmId);
        if (!display || !display.incomingMessagesContainer) return;
        const recipientSwarmName = swarmId === 'green' ? 'Green' : 'Orange';
        this._appendMessage(display.incomingMessagesContainer, message, 'incoming', recipientSwarmName);
    }

    showOutgoingMessage(swarmId, message) {
        if (!this.active || !message) return;
        const display = this.getDisplay(swarmId);
        if (!display || !display.outgoingMessagesContainer) return;
        const recipientSwarmName = swarmId === 'green' ? 'Green' : 'Orange'; // The message is *from* this swarmId
        this._appendMessage(display.outgoingMessagesContainer, message, 'outgoing', recipientSwarmName);
    }
    
    clearIncomingMessage(swarmId) { // Now clears the specific container
        if (!this.active) return;
        const display = this.getDisplay(swarmId);
        if (display && display.incomingMessagesContainer) {
            display.incomingMessagesContainer.innerHTML = '';
            // Add a placeholder if needed
            // const placeholder = document.createElement('div');
            // placeholder.textContent = 'No incoming messages.';
            // placeholder.style.fontStyle = 'italic';
            // display.incomingMessagesContainer.appendChild(placeholder);
        }
    }

    clearOutgoingMessage(swarmId) { // Now clears the specific container
        if (!this.active) return;
        const display = this.getDisplay(swarmId);
        if (display && display.outgoingMessagesContainer) {
            display.outgoingMessagesContainer.innerHTML = '';
            // Add a placeholder if needed
            // const placeholder = document.createElement('div');
            // placeholder.textContent = 'No outgoing messages.';
            // placeholder.style.fontStyle = 'italic';
            // display.outgoingMessagesContainer.appendChild(placeholder);
        }
    }
    
    clearAllMessages() {
        if (!this.active) return;
        this.clearIncomingMessage('green');
        this.clearOutgoingMessage('green');
        this.clearIncomingMessage('orange');
        this.clearOutgoingMessage('orange');
    }

    showError(swarmId, message) {
        if (!this.active) return;
        const display = this.getDisplay(swarmId);
        if (!display || !display.params) return; // Show error in params section for now
        display.params.textContent = `Error: ${message}`;
        display.narrative.textContent = 'Error occurred.';
        display.strategy.textContent = '';
    }
} 