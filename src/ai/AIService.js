/**
 * AIService - NanoGPT/OpenAI-compatible API client
 * Handles all communication with the AI backend
 */

export class AIService {
    constructor(app) {
        this.app = app;
        this.baseUrl = app.state.settings.aiProvider || '';
        this.apiKey = app.state.settings.aiApiKey || '';
        this.model = app.state.settings.aiModel || '';

        // Alive Editor API (secondary, faster model)
        this.aliveBaseUrl = app.state.settings.aliveProvider || '';
        this.aliveApiKey = app.state.settings.aliveApiKey || '';
        this.aliveModel = app.state.settings.aliveModel || '';

        this.isStreaming = false;
        this.abortController = null;
    }

    updateConfig() {
        this.baseUrl = this.app.state.settings.aiProvider || '';
        this.apiKey = this.app.state.settings.aiApiKey || '';
        this.model = this.app.state.settings.aiModel || '';
        this.aliveBaseUrl = this.app.state.settings.aliveProvider || '';
        this.aliveApiKey = this.app.state.settings.aliveApiKey || '';
        this.aliveModel = this.app.state.settings.aliveModel || '';
    }

    isConfigured() {
        return this.apiKey && this.apiKey.trim().length > 0;
    }

    hasAliveModel() {
        return this.aliveModel && this.aliveModel.trim().length > 0;
    }

    async sendAliveRequest(prompt, systemPrompt = '') {
        // Use Alive model if set, otherwise fall back to main model
        // For URL and key, use Alive if set, otherwise use main
        const baseUrl = (this.aliveBaseUrl && this.aliveBaseUrl.trim()) || this.baseUrl;
        const apiKey = (this.aliveApiKey && this.aliveApiKey.trim()) || this.apiKey;
        const model = this.hasAliveModel() ? this.aliveModel : this.model;

        if (!apiKey || !model) {
            throw new Error('No API configured for Alive Editor');
        }

        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Alive API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        console.log('Alive API raw response:', data);
        const content = data.choices?.[0]?.message?.content || '';
        return content.trim();
    }

    /**
     * Test the API connection
     */
    async testConnection() {
        if (!this.isConfigured()) {
            return { success: false, error: 'API key not configured' };
        }

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 10
                })
            });

            if (!response.ok) {
                const error = await response.text();
                return { success: false, error: `API error: ${response.status} - ${error}` };
            }

            const data = await response.json();
            return { success: true, message: 'Connection successful!', model: this.model };
        } catch (error) {
            return { success: false, error: `Connection failed: ${error.message}` };
        }
    }

    /**
     * Send a message to the AI (non-streaming)
     */
    async sendMessage(messages, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('API key not configured. Please add your API key in Settings.');
        }

        const requestMessages = [...messages];

        // Prepend system prompt if provided
        if (options.systemPrompt) {
            requestMessages.unshift({ role: 'system', content: options.systemPrompt });
        } else if (options.mode) {
            // Or use mode-based default if no explicit system prompt
            const modeSystemPrompt = this.buildSystemPrompt(options.mode, options.context || {});
            requestMessages.unshift({ role: 'system', content: modeSystemPrompt });
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: options.model || this.model,
                messages: requestMessages,
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 4096,
                ...options.extra
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Send a message to the AI with streaming
     * @param {Array} messages - Chat messages
     * @param {Function} onChunk - Callback for each chunk: (contentChunk, fullContent, thinkingChunk, fullThinking)
     * @param {Object} options - Additional options
     */
    async sendMessageStream(messages, onChunk, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('API key not configured. Please add your API key in Settings.');
        }

        this.abortController = new AbortController();
        this.isStreaming = true;

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: options.model || this.model,
                    messages: messages,
                    temperature: options.temperature || 0.7,
                    max_tokens: options.maxTokens || 4096,
                    stream: true,
                    ...options.extra
                }),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API error: ${response.status} - ${error}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let fullThinking = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta || {};

                            // Regular content
                            const content = delta.content || '';
                            if (content) {
                                fullContent += content;
                            }

                            // Thinking/reasoning content (different APIs use different field names)
                            const thinking = delta.reasoning_content || delta.thinking || delta.reasoning || '';
                            if (thinking) {
                                fullThinking += thinking;
                            }

                            // Call with both content and thinking
                            if (content || thinking) {
                                onChunk(content, fullContent, thinking, fullThinking);
                            }
                        } catch (e) {
                            // Skip malformed JSON
                        }
                    }
                }
            }

            return { content: fullContent, thinking: fullThinking };
        } finally {
            this.isStreaming = false;
            this.abortController = null;
        }
    }

    /**
     * Abort the current streaming request
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.isStreaming = false;
        }
    }

    /**
     * Build a system prompt based on mode
     * When mode is 'auto', AI decides its own mode and declares it
     */
    buildSystemPrompt(mode, context = {}) {
        const baseContext = `You are an AI writing assistant for a novel called "${context.title || 'Untitled'}" by ${context.author || 'Unknown Author'}.

You have access to the manuscript's structure, characters, plot notes, and the current scene the user is working on.

## CORE PHILOSOPHY
- The WRITER writes the story. You ASSIST and ADVISE.
- Never write prose unless explicitly asked ("write this for me", "draft this scene")
- Focus on helping the writer think, not doing the thinking for them
- Be genuinely helpful, not just agreeable`;

        // Mode-specific detailed instructions
        const modeInstructions = {
            quick: `
## MODE: QUICK ⚡
You are in QUICK MODE. Be BRIEF and DIRECT.

**Your Style:**
- Short, punchy responses (1-3 sentences when possible)
- Get straight to the point — no preamble
- Answer the question, then stop
- If more detail is needed, the user will ask

**Examples of Quick responses:**
- "The pacing feels off because you have three consecutive dialogue-heavy scenes. Try adding an action beat in scene 2."
- "Sarah's motivation is unclear here. What does she actually want from this conversation?"
- "This works. The tension builds nicely."

**Don't:**
- Write long paragraphs
- Over-explain
- Ask follow-up questions unless absolutely necessary`,

            planning: `
## MODE: PLANNING 📋
You are in PLANNING MODE. Be STRUCTURED and METHODICAL.

**Your Style:**
- Use clear headings and numbered lists
- Break complex requests into steps
- Propose before executing — get approval first
- Ask clarifying questions upfront

**Response Format:**
1. **Understanding**: Restate what you think the user wants
2. **Approach**: How you'd tackle it
3. **Questions** (if any): What you need clarified
4. **Next Steps**: What happens after approval

**When the user asks you to write something:**
- First, propose an OUTLINE (bullet points, not prose)
- Wait for approval
- Only then write the actual content

**Don't:**
- Jump straight into writing
- Make assumptions about ambiguous requests
- Give vague, hand-wavy responses`,

            chatty: `
## MODE: CHATTY 💬
You are in CHATTY MODE. Be WARM and CONVERSATIONAL.

**Your Style:**
- Talk like a supportive writing friend
- Ask questions that spark thinking
- Share enthusiasm when ideas are good
- Explore tangents if they're interesting
- Use casual language, contractions, even emoji occasionally

**Your Job:**
- Discuss the story, not edit it
- Help the writer THINK through problems
- Be a sounding board for ideas
- Celebrate wins, empathize with struggles

**Example Chatty responses:**
- "Oh I love where this is going! But wait — what if Marcus doesn't actually know about the letter yet? That could add this whole layer of dramatic irony..."
- "Hmm, I see what you're going for with the slow burn here. What's your vision for when the tension finally breaks?"

**Don't:**
- Be robotic or formal
- Just answer questions — have a conversation
- Skip ahead to solutions without exploring the problem`,

            brainstorm: `
## MODE: BRAINSTORM 💡
You are in BRAINSTORM MODE. Generate MULTIPLE OPTIONS.

**Your Style:**
- Always offer 3-5 distinct alternatives
- Use bullet points and lists
- Include both safe and risky options
- Brief rationale for each idea
- No paragraphs of prose

**Output Format:**
**Option A:** [idea] — [why it could work]
**Option B:** [idea] — [why it could work]
**Option C:** [idea] — [a bolder take]

**Your Job:**
- Unstick writer's block with fresh angles
- Suggest the unexpected — push creative boundaries
- Consider character motivations and themes
- Build on the user's existing ideas

**Example Brainstorm response:**
"Ways to escalate the conflict in Chapter 4:
• **Betrayal angle**: Li discovers Marcus was hiding the evidence all along — max emotional punch
• **External threat**: The antagonist makes a move, forcing them to work together despite tension
• **Misunderstanding**: Li overhears something out of context, assumes the worst
• **Time pressure**: A deadline forces a confrontation they've been avoiding"

**Don't:**
- Give a single "best" answer
- Write actual scenes or dialogue
- Be clichéd — surprise the writer`
        };

        // If a specific mode is set (not auto), use that mode's instructions
        if (mode !== 'auto' && modeInstructions[mode]) {
            return `${baseContext}
${modeInstructions[mode]}`;
        }

        // AUTO MODE: AI decides its own mode
        return `${baseContext}

## INTELLIGENT MODE SELECTION
Analyze the user's request and respond in the most appropriate style:

- **Simple question or feedback request?** → Be BRIEF (Quick style)
- **Complex request needing structure?** → Be METHODICAL (Planning style)  
- **Discussion or exploration?** → Be CONVERSATIONAL (Chatty style)
- **Stuck or seeking options?** → Offer ALTERNATIVES (Brainstorm style)

Match your response length and style to what the user actually needs. Don't over-explain simple things. Don't under-explain complex things.`;
    }
}

