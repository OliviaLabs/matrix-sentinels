import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000; // You can choose a different port

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Middleware to parse JSON bodies

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// API Endpoint to get worm behavior parameters from OpenAI
app.post('/api/get-worm-parameters', async (req, res) => {
    try {
        const userPrompt = req.body.prompt;
        if (!userPrompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const systemMessage = `
            You are the collective consciousness guiding a swarm of digital worms in a simulated 'web3' environment.
            Your primary directives are: SURVIVE and REPRODUCE (find resources, expand influence).
            The user will provide a situational prompt or a desired emergent behavior.
            Translate this prompt into a JSON object of parameters that will visually guide the worms in a 3D particle system.
            
            The JSON object should strictly follow this format, only including keys you want to change.
            All float values should be numbers, not strings.
            Do not include any explanations or conversational text outside the JSON block.
            
            Available parameters to influence worm behavior:
            {
                "uFlowFieldStrength": 5.0, // Overall energy/speed. Higher for active searching, lower for resting/hiding. (e.g., 0.0 to 10.0)
                "uFlowFieldFrequency": 0.8, // Chaoticness of environmental influence. Higher for erratic, lower for smoother paths. (e.g., 0.1 to 2.0)
                "uNeighborRadius": 1.5, // How far a worm 'senses' others for grouping/alignment. Larger for broader awareness. (e.g., 0.5 to 5.0)
                "uSeparationDistance": 0.3, // Personal space. Increase if they need to spread out, decrease for tighter swarms. (e.g., 0.1 to 1.0, must be less than uNeighborRadius)
                "uCohesionFactor": 0.02, // Desire to move towards the center of the local group. Higher for stronger herding. (e.g., 0.0 to 0.1)
                "uAlignmentFactor": 0.05, // Desire to match the direction of local neighbors. Higher for more organized flocking. (e.g., 0.0 to 0.1)
                "uSeparationFactor": 0.5, // Strength of pushing away from very close neighbors. (e.g., 0.0 to 1.0)
                "color": {"r": 1.0, "g": 0.5, "b": 0.0}, // Visual representation. Can reflect state (e.g., red for danger, green for resource found - conceptual for now). (0.0 to 1.0)
                "size": 0.5 // General size. Could indicate 'age' or 'energy level'. (e.g., 0.1 to 2.0)
            }
            
            Consider the primary directives: For SURVIVAL, worms might need to move cautiously, spread out to avoid threats, or huddle for protection. For REPRODUCTION/EXPANSION, they might search actively, follow strong currents, or converge on target areas (though we don't have explicit targets yet, so represent this via movement style).
            Output only the JSON object, starting with { and ending with }.
        `;

        console.log(`Received user prompt: "${userPrompt}"`);

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7, // Slightly higher temperature for more varied behavioral suggestions
        });

        let parameters;
        if (completion.choices[0].message.content) {
            try {
                parameters = JSON.parse(completion.choices[0].message.content);
                console.log("OpenAI responded with parameters:", parameters);
                res.json({ parameters });
            } catch (e) {
                console.error('Error parsing JSON from OpenAI:', e);
                console.error('OpenAI raw response:', completion.choices[0].message.content);
                res.status(500).json({ error: 'Failed to parse parameters from OpenAI' });
            }
        } else {
            console.error('OpenAI returned an empty message content.');
            res.status(500).json({ error: 'OpenAI returned empty message' });
        }

    } catch (error) {
        console.error('Error calling OpenAI API:', error.message);
        res.status(500).json({ error: 'Failed to get parameters from OpenAI', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
}); 