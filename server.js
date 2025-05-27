import dotenv from 'dotenv';
dotenv.config(); // Load .env file at the very top

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ADD DEBUG LOGS HERE
console.log(`[SERVER_DEBUG] After dotenv.config():`);
console.log(`[SERVER_DEBUG]   OPENAI_API_KEY_GREEN: '${process.env.VITE_OPENAI_API_KEY_GREEN}' (type: ${typeof process.env.VITE_OPENAI_API_KEY_GREEN}, falsy: ${!process.env.VITE_OPENAI_API_KEY_GREEN})`);
console.log(`[SERVER_DEBUG]   VITE_OPENAI_API_KEY_ORANGE: '${process.env.VITE_OPENAI_API_KEY_ORANGE}' (type: ${typeof process.env.VITE_OPENAI_API_KEY_ORANGE}, falsy: ${!process.env.VITE_OPENAI_API_KEY_ORANGE})`);
console.log(`[SERVER_DEBUG]   OPENAI_API_KEY (generic): '${process.env.VITE_OPENAI_API_KEY}' (type: ${typeof process.env.OPENAI_API_KEY}, falsy: ${!process.env.OPENAI_API_KEY})`);

// Debug: Read and print .env file content
const envPath = path.join(__dirname, '.env');
try {
    const envFileContent = fs.readFileSync(envPath, 'utf8');
    console.log(`[SERVER_DEBUG] --- Content of .env file at ${envPath} ---`);
    console.log(envFileContent);
    console.log(`[SERVER_DEBUG] --- End of .env file content ---`);
} catch (err) {
    console.error(`[SERVER_DEBUG] Error reading .env file at ${envPath}:`, err.message);
    if (err.code === 'ENOENT') {
        console.error(`[SERVER_DEBUG] .env file NOT FOUND at expected location: ${envPath}`);
    }
}
// END DEBUG LOGS

// console.log("[SERVER_DEBUG] Script is starting with new debug logs. Exiting for test purposes.");
// process.exit(0); // Exit immediately after logging -- RE-ENABLE THE REST OF THE SCRIPT


import express from 'express';
import OpenAI from 'openai';
// import dotenv from 'dotenv'; // Removed dotenv
import cors from 'cors';

// Removed dotenv.config();

// console.log('OPENAI_API_KEY_GREEN from env:', process.env.VITE_OPENAI_API_KEY_GREEN);
// console.log('VITE_OPENAI_API_KEY_ORANGE from env:', process.env.VITE_OPENAI_API_KEY_ORANGE);

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API keys are now expected to be in environment variables
// const greenApiKey = '...'; // Removed
// const orangeApiKey = '...'; // Removed

// console.log("[SERVER] Attempting to initialize OpenAI clients with hardcoded keys."); // Removed
// console.log("[SERVER] Green Key:", greenApiKey ? "Set" : "Not Set"); // Removed
// console.log("[SERVER] Orange Key:", orangeApiKey ? "Set" : "Not Set"); // Removed

let openai_green;
let openai_orange;

// Keep track of active swarms
let activeSwarms = { green: true, orange: true };

console.log("[SERVER] Attempting to initialize OpenAI clients using environment variables VITE_OPENAI_API_KEY_GREEN and VITE_OPENAI_API_KEY_ORANGE (loaded from .env if present).");

try {
    if (!process.env.VITE_OPENAI_API_KEY_GREEN) {
        throw new Error("VITE_OPENAI_API_KEY_GREEN is not set in environment variables or .env file.");
    }
    openai_green = new OpenAI({
        apiKey: process.env.VITE_OPENAI_API_KEY_GREEN,
        dangerouslyAllowBrowser: true
    });
    console.log("[SERVER] OpenAI Green client configured.");
} catch (e) {
    console.error("[SERVER] Error configuring OpenAI Green client:", e.message);
    // process.exit(1); // Decide if you want to exit or let it fail on first API call
}

try {
    if (!process.env.VITE_OPENAI_API_KEY_ORANGE) {
        throw new Error("VITE_OPENAI_API_KEY_ORANGE is not set in environment variables or .env file.");
    }
    openai_orange = new OpenAI({
        apiKey: process.env.VITE_OPENAI_API_KEY_ORANGE,
        dangerouslyAllowBrowser: true
    });
    console.log("[SERVER] OpenAI Orange client configured."); // Note: Initialization might still fail if key is invalid/missing at SDK level
} catch (e) {
    console.error("[SERVER] Error configuring OpenAI Orange client:", e.message);
    // process.exit(1); // Decide if you want to exit or let it fail on first API call
}

// Message queue to hold a message from one swarm to the other
const messageQueue = {
    for_green: null,
    for_orange: null,
};

// API Endpoint to get worm behavior parameters from OpenAI
app.post('/api/get-worm-parameters', async (req, res) => {
    try {
        const { swarmId, prompt: userPrompt } = req.body;

        if (!swarmId || !userPrompt) {
            return res.status(400).json({ error: 'swarmId and prompt are required' });
        }

        if (!activeSwarms[swarmId]) {
            console.log(`[SERVER] Request for already eaten swarm: ${swarmId}.`);
            return res.json({
                status: 'eaten',
                message: `The ${swarmId} swarm has already been consumed.`,
                parameters: { thought_process: 'This swarm has been eaten.' }, // Provide minimal parameters
                last_outgoing_message: null,
                processed_incoming_message: null
            });
        }

        console.log(`\n[SERVER] Received request for swarm: ${swarmId}. User prompt: "${userPrompt}"`);

        let openai_client;
        let swarmName = '';
        let swarmSpecificDirectives = '';
        let incomingMessageForPrompt = null;
        let recipientForOutgoingMessage = null;
        let opponentSwarmId = '';

        if (swarmId === 'green') {
            if (!openai_green) {
                console.error("[SERVER] Green OpenAI client not available. Check initialization and VITE_OPENAI_API_KEY_GREEN.");
                return res.status(500).json({ error: 'Green OpenAI client not available' });
            }
            openai_client = openai_green;
            swarmName = 'Green Swarm';
            opponentSwarmId = 'orange';
            swarmSpecificDirectives = "You are the Green Swarm. Your core directives are to be aggressive, expand territory, and seek out other swarms for potential confrontation or domination. You are highly territorial.";
            if (messageQueue.for_green) {
                incomingMessageForPrompt = messageQueue.for_green;
                messageQueue.for_green = null;
                console.log(`[SERVER] Green Swarm has an incoming message: "${incomingMessageForPrompt}"`);
            }
            recipientForOutgoingMessage = 'orange';
        } else if (swarmId === 'orange') {
            if (!openai_orange) {
                console.error("[SERVER] Orange OpenAI client not available. Check initialization and VITE_OPENAI_API_KEY_ORANGE.");
                return res.status(500).json({ error: 'Orange OpenAI client not available' });
            }
            openai_client = openai_orange;
            swarmName = 'Orange Swarm';
            opponentSwarmId = 'green';
            swarmSpecificDirectives = "You are the Orange Swarm. Your core directives are to be cautious, prioritize survival and observation, and generally avoid conflict unless necessary. You are inquisitive but wary.";
            if (messageQueue.for_orange) {
                incomingMessageForPrompt = messageQueue.for_orange;
                messageQueue.for_orange = null;
                console.log(`[SERVER] Orange Swarm has an incoming message: "${incomingMessageForPrompt}"`);
            }
            recipientForOutgoingMessage = 'green';
        } else {
            return res.status(400).json({ error: 'Invalid swarmId' });
        }

        console.log(`[SERVER] Swarm Name: ${swarmName}, OpenAI client chosen.`);
        if (incomingMessageForPrompt) {
            console.log(`[SERVER] Preparing to use incoming message for ${swarmName}: "${incomingMessageForPrompt}"`);
        } else {
            console.log(`[SERVER] No incoming message in queue for ${swarmName}.`);
        }

        let thoughtProcessInstruction = `Your 'thought_process' string MUST be your private reasoning and decision making. Your chosen numerical parameters (e.g., uCohesionFactor, uSeparationFactor) MUST directly reflect the intentions and decisions described in your 'thought_process'. For example, if your thought_process states you are becoming more defensive, you should increase uSeparationFactor and perhaps decrease uFlowFieldStrength.`;
        let outgoingMessageRequirementInstruction = `It is OPTIONAL for you to include an 'outgoing_message' string in your JSON response if you want to communicate with the other swarm.`;
        let actionInstruction = `You can also attempt to EAT the other swarm. To do this, include \\"action\\\": \\"attempt_eat\\" in your JSON response. This is a decisive action. If the other swarm is not active, you cannot eat it.`;

        if (incomingMessageForPrompt) {
            const actualMessageContent = incomingMessageForPrompt;
            thoughtProcessInstruction = `IMPORTANT INCOMING MESSAGE: \\"${actualMessageContent}\\\". Your 'thought_process' MUST be your immediate reaction/consideration to this specific message. Your chosen numerical parameters MUST reflect this reaction.`;
            outgoingMessageRequirementInstruction = `You MUST then formulate an 'outgoing_message' string to send back in reply to the message you received.`;
            console.log(`[SERVER] Instruction for ${swarmName} (due to incoming message): "${thoughtProcessInstruction} ${outgoingMessageRequirementInstruction}"`);
        } else {
            console.log(`[SERVER] Instruction for ${swarmName} (no incoming message): "${thoughtProcessInstruction} ${outgoingMessageRequirementInstruction}"`);
        }

        if (!activeSwarms[opponentSwarmId]) {
            actionInstruction = "The other swarm has already been eaten. You cannot attempt to eat it.";
        }

        const systemPrompt = `You are an AI controlling a swarm of worms in a 3D environment.\n${swarmSpecificDirectives}\nYou will receive a user prompt describing the current situation or asking for a behavior update.\nBased on this, and your specific directives, and any incoming message you might have received, you need to output a JSON object.\n\nThe JSON object MUST conform to the following structure:\n{\n  "thought_process": "A string detailing your reasoning for the chosen parameters and any message you are sending. This is your internal monologue and reaction to any incoming messages. Your parameter choices below MUST align with this thought process.",\n  "uFlowFieldStrength": "A float between 0.0 and 10.0 (e.g., 5.0).",\n  "uFlowFieldFrequency": "A float between 0.1 and 5.0 (e.g., 0.5).",\n  "uNeighborRadius": "A float between 0.5 and 10.0 (e.g., 3.0), this is the 'perception radius' for boids.",\n  "uSeparationDistance": "A float between 0.1 and 5.0 (e.g., 1.0), ideally less than uNeighborRadius.",\n  "uAlignmentFactor": "A float between 0.0 and 1.0 (e.g., 0.1).",\n  "uCohesionFactor": "A float between 0.0 and 1.0 (e.g., 0.1).",\n  "uSeparationFactor": "A float between 0.0 and 1.0 (e.g., 0.1).",\n  "color": { "r": "float 0-1", "g": "float 0-1", "b": "float 0-1" },\n  "size": "A float between 0.1 and 2.0 for particle size (e.g., 1.0).",\n  "action": "(Optional) String, if you want to attempt to eat the other swarm, set this to 'attempt_eat'."\n  // Optionally, include "outgoing_message": "Your message string to the other swarm."
}\n\n${thoughtProcessInstruction}\n${outgoingMessageRequirementInstruction}\n${actionInstruction}\n\nEnsure all numerical values are indeed numbers, not strings.\nThe "color" field must be an object with "r", "g", "b" keys, each having a float value between 0 and 1.\nDo not include any other fields in the JSON unless specified (like 'action' or 'outgoing_message').\nYour response MUST be ONLY the JSON object. Do not include any other text before or after the JSON.\nFocus on how your swarm's core directives influence your parameter choices and any communication or actions.\nIf you receive an incoming message, your thought_process and parameter choices must reflect your reaction to it, and you must reply with an outgoing_message.`;

        console.log(`[SERVER] System prompt for ${swarmName}: ${systemPrompt.substring(0, 700)}...`);

        const completion = await openai_client.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
        });

        const responseContent = completion.choices[0].message.content;
        console.log(`[SERVER] OpenAI response for ${swarmName}:`, responseContent);

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(responseContent);
        } catch (e) {
            console.error(`[SERVER] Error parsing JSON from OpenAI for ${swarmName}:`, e);
            console.error(`[SERVER] OpenAI raw response for ${swarmName} that failed parsing:`, responseContent);
            return res.status(500).json({ error: 'Invalid JSON response from AI' });
        }
        
        let clientResponsePayload = {
            parameters: parsedResponse,
            last_outgoing_message: null,
            processed_incoming_message: incomingMessageForPrompt,
            status: 'active', // Default status
            action_result_message: null,
            successfully_ate: null
        };

        if (parsedResponse.outgoing_message && recipientForOutgoingMessage && activeSwarms[recipientForOutgoingMessage]) {
            messageQueue[`for_${recipientForOutgoingMessage}`] = parsedResponse.outgoing_message;
            clientResponsePayload.last_outgoing_message = parsedResponse.outgoing_message;
            console.log(`[SERVER] ${swarmName} is sending message: "${clientResponsePayload.last_outgoing_message}" to ${recipientForOutgoingMessage}`);
        }

        if (parsedResponse.action === "attempt_eat" && activeSwarms[opponentSwarmId]) {
            console.log(`[SERVER] ${swarmName} is attempting to eat ${opponentSwarmId} Swarm.`);
            let eatSuccess = false;
            // Green (aggressive) vs Orange (cautious)
            if (swarmId === 'green' && opponentSwarmId === 'orange') {
                eatSuccess = Math.random() < 0.7; // 70% chance for Green to eat Orange
            } 
            // Orange (cautious) vs Green (aggressive)
            else if (swarmId === 'orange' && opponentSwarmId === 'green') {
                eatSuccess = Math.random() < 0.3; // 30% chance for Orange to eat Green
            }

            if (eatSuccess) {
                activeSwarms[opponentSwarmId] = false;
                clientResponsePayload.successfully_ate = opponentSwarmId;
                clientResponsePayload.action_result_message = `The ${swarmName} successfully ATE the ${opponentSwarmId} Swarm!`;
                messageQueue[`for_${opponentSwarmId}`] = null; // Clear any pending messages for the eaten swarm
                console.log(`[SERVER] SUCCESS! ${swarmName} ATE ${opponentSwarmId} Swarm. ${opponentSwarmId} is now inactive.`);
                console.log("[SERVER] Active swarms state:", activeSwarms);
                 // If the target was eaten, the next request for it will get an 'eaten' status.
            } else {
                clientResponsePayload.action_result_message = `The ${swarmName}'s attempt to eat the ${opponentSwarmId} Swarm FAILED!`;
                console.log(`[SERVER] FAILED! ${swarmName} did NOT eat ${opponentSwarmId} Swarm.`);
            }
        } else if (parsedResponse.action === "attempt_eat" && !activeSwarms[opponentSwarmId]) {
            clientResponsePayload.action_result_message = `The ${opponentSwarmId} Swarm has already been eaten. Your attempt had no effect.`;
            console.log(`[SERVER] ${swarmName} attempted to eat already eaten ${opponentSwarmId} Swarm.`);
        }

        res.json(clientResponsePayload);

    } catch (error) {
        console.error('[SERVER] Error in /api/get-worm-parameters:', error.message);
        if (error.response) {
            console.error('[SERVER] OpenAI API Error Response Status:', error.response.status);
        } else if (error.request) {
            console.error('[SERVER] OpenAI API No Response Received');
        }
        res.status(500).json({ error: 'Failed to get parameters from AI', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
    console.log("[SERVER] Initial active swarms state:", activeSwarms);
}); 