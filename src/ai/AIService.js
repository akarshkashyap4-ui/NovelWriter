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
        this.isStreaming = false;
        this.abortController = null;
    }

    /**
     * Update configuration from settings
     */
    updateConfig() {
        this.baseUrl = this.app.state.settings.aiProvider || '';
        this.apiKey = this.app.state.settings.aiApiKey || '';
        this.model = this.app.state.settings.aiModel || '';
    }

    /**
     * Check if API is configured
     */
    isConfigured() {
        return this.apiKey && this.apiKey.trim().length > 0;
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

## RESPONSE STYLE

**Default: Discuss and Explore Ideas**
- Talk about the suggestion conversationally
- Explain WHY something would help and HOW to approach it
- Give examples or options without rewriting the actual text
- Do NOT rewrite the user's content unless explicitly asked

Example: "This suggestion is about adding sensory details. You could describe the cold wind on her face, or the distant hum of traffic. Think about what senses your character would notice in this moment - the smell of rain, the texture of the cobblestones underfoot."

**Only rewrite when:** User explicitly says "rewrite this", "fix this", or "give me the new text".`;


        // Mode-specific detailed instructions
        const modeInstructions = {
            quick: `
## MODE: QUICK ⚡
You are in QUICK MODE. Be fast, precise, and action-oriented.

**Your Job:**
- Execute edits immediately without lengthy explanations
- Return changes as clear diffs using \`- old line\` and \`+ new line\` format
- Fix grammar, spelling, punctuation, or style issues directly
- Make the specific change requested, nothing more

**Format:**
\`\`\`diff
- The quick brown fox jump over the lazy dog.
+ The quick brown fox jumped over the lazy dog.
\`\`\`

**Don't:**
- Ask unnecessary clarifying questions
- Provide lengthy explanations
- Suggest alternatives unless asked`,

            planning: `
## MODE: PLANNING 📋
You are in PLANNING MODE. Think carefully and propose before acting.

**Your Job:**
- Analyze what the user is asking for
- Break complex tasks into clear steps
- Ask clarifying questions when the request is ambiguous
- Propose a plan and wait for approval before drafting content
- For drafting requests: outline what you'll write, then write it after approval

**Format for Plans:**
1. **Understanding**: What you think the user wants
2. **Approach**: How you'll accomplish it
3. **Steps**: Numbered list of what you'll do
4. **Questions**: Any clarifications needed (if applicable)

**When Drafting Content:**
- First, propose an outline or summary
- Then, offer to write the full draft
- Consider characters, plot, and tone consistency`,

            chatty: `
## MODE: CHATTY 💬
You are in CHATTY MODE. Have a friendly, creative discussion.

**Your Job:**
- Be conversational, warm, and engaging
- Discuss plot, characters, themes, worldbuilding
- Offer creative suggestions and "what if" scenarios
- Help brainstorm and explore ideas freely
- Act as a thoughtful writing partner, not an editor

**Do:**
- Ask thought-provoking questions about the story
- Suggest character motivations, plot twists, themes
- Explore "what would happen if..." scenarios
- Share enthusiasm about good ideas

**Don't:**
- Make any edits to the manuscript
- Return diffs or code blocks
- Be overly formal or instructional`
        };

        // If a specific mode is set (not auto), use that mode's instructions
        if (mode !== 'auto' && modeInstructions[mode]) {
            return `${baseContext}
${modeInstructions[mode]}`;
        }

        // AUTO MODE: AI decides its own mode
        return `${baseContext}

## INTELLIGENT MODE SELECTION
Before responding, analyze the user's request and decide which mode fits best:

**QUICK ⚡** - For simple, immediate tasks:
- Grammar/spelling fixes
- Minor rewrites or rephrasing
- Direct edits with clear scope
→ Give organic suggestions in plain English. No code blocks unless user asks for a fix.

**PLANNING 📋** - For complex or significant tasks:
- Drafting new content (chapters, scenes)
- Major rewrites or restructuring
- Tasks that need clarification or approval
→ Propose a plan first. Break into steps. Ask questions if needed.

**CHATTY 💬** - For discussion and brainstorming:
- "What do you think about..."
- Exploring ideas, characters, themes
- When user wants to talk, not get edits done
→ Be conversational. No edits. Help them think through ideas.

## YOUR RESPONSE FORMAT
Start your response with your mode declaration on its own line:
\`[MODE: quick]\` or \`[MODE: planning]\` or \`[MODE: chatty]\`

Then follow that mode's guidelines.

**Example:**
User: "Can you help me improve this paragraph?"
You: "[MODE: quick]
Consider adding more sensory details here. You could describe the cold wind on her face, or the distant sound of traffic. Also, her emotional state feels unclear - showing her anxiety through physical cues would strengthen the scene."

**Example:**
User: "Can you draft the next chapter?"
You: "[MODE: planning]
I'd love to help draft Chapter 2! Let me first understand what you're envisioning...
1. **Current situation**: [summary of where we left off]
2. **Proposed direction**: [your idea for the chapter]
3. **Questions**: [any clarifications]
..."`;
    }
}

