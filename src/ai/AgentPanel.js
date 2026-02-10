/**
 * AgentPanel - AI Agent Interface
 * 
 * Provides a collapsible panel for interacting with the AI agent.
 * Supports multiple modes: Auto, Quick, Planning, Chatty
 * Conversations are persisted per-project
 */

import { ContextManager } from './ContextManager.js';


export class AgentPanel {
    constructor(app) {
        this.app = app;
        this.contextManager = new ContextManager(app);

        this.history = []; // Current conversation messages (for AI context)
        this.currentMode = 'auto'; // auto, quick, planning, chatty
        this.isProcessing = false;
        this.isExpanded = false; // Start collapsed
        this.currentConversationId = null;

        this.panel = document.getElementById('agent-panel');
        this.drawerTab = document.getElementById('agent-drawer-tab');
        this.resizeHandle = document.getElementById('agent-resize-handle');
        this.modeSelect = document.getElementById('agent-mode-select');
        this.historyContainer = document.getElementById('agent-history');
        this.inputField = document.getElementById('agent-input');
        this.sendBtn = document.getElementById('agent-send-btn');
        this.statusIndicator = document.getElementById('agent-status');
        this.newConversationBtn = document.getElementById('agent-new-conversation');
        this.conversationSelect = document.getElementById('agent-conversation-select');
        this.deleteConversationBtn = document.getElementById('agent-delete-conversation');

        // Image attachment elements
        this.attachBtn = document.getElementById('agent-attach-btn');
        this.imageInput = document.getElementById('agent-image-input');
        this.imagePreview = document.getElementById('agent-image-preview');
        this.imageThumb = document.getElementById('agent-image-thumb');
        this.imageRemoveBtn = document.getElementById('agent-image-remove');
        this.pendingImage = null; // { base64, mimeType }

        this.bindEvents();
        this.bindResizeEvents();
        this.loadActiveConversation();
    }

    bindEvents() {
        // Delete conversation
        if (this.deleteConversationBtn) {
            this.deleteConversationBtn.addEventListener('click', () => this.deleteCurrentConversation());
        }

        // Toggle panel
        if (this.drawerTab) {
            this.drawerTab.addEventListener('click', () => this.togglePanel());
        }

        // Mode change
        if (this.modeSelect) {
            this.modeSelect.addEventListener('change', (e) => {
                this.currentMode = e.target.value;
                this.updateModeIndicator();
            });
        }

        // Send message
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => this.sendMessage());
        }

        // Enter key to send
        if (this.inputField) {
            this.inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // New conversation button
        if (this.newConversationBtn) {
            this.newConversationBtn.addEventListener('click', () => this.createNewConversation());
        }

        // Conversation select dropdown
        if (this.conversationSelect) {
            this.conversationSelect.addEventListener('change', (e) => {
                const convId = e.target.value;
                if (convId) {
                    this.loadConversation(convId);
                }
            });
        }

        // Image attachment
        if (this.attachBtn) {
            this.attachBtn.addEventListener('click', () => this.imageInput?.click());
        }
        if (this.imageInput) {
            this.imageInput.addEventListener('change', (e) => this.handleImageAttach(e));
        }
        if (this.imageRemoveBtn) {
            this.imageRemoveBtn.addEventListener('click', () => this.removeAttachedImage());
        }

        // Paste image support
        if (this.inputField) {
            this.inputField.addEventListener('paste', (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (file) this.processImageFile(file);
                        break;
                    }
                }
            });
        }
    }

    bindResizeEvents() {
        if (!this.resizeHandle || !this.panel) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        const onMouseMove = (e) => {
            if (!isResizing) return;

            // Calculate width based on mouse position from right edge of viewport
            const viewportWidth = window.innerWidth;
            const mouseFromRight = viewportWidth - e.clientX;

            // Strict clamp (Min 350px - only allow expansion)
            const maxAllowedWidth = Math.min(600, viewportWidth - 50);
            const newWidth = Math.min(maxAllowedWidth, Math.max(350, mouseFromRight));

            // Apply width via CSS variable
            document.documentElement.style.setProperty('--agent-panel-width', `${newWidth}px`);
        };

        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;

            this.resizeHandle.classList.remove('resizing');
            document.body.classList.remove('resizing-active'); // Re-enable transitions

            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Save width preference
            const currentWidth = getComputedStyle(document.documentElement).getPropertyValue('--agent-panel-width').trim();
            localStorage.setItem('novelwriter-agent-panel-width', currentWidth);

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        this.resizeHandle.addEventListener('mousedown', (e) => {
            if (!this.isExpanded) return;
            e.preventDefault();
            isResizing = true;
            startX = e.clientX;

            this.resizeHandle.classList.add('resizing');
            document.body.classList.add('resizing-active'); // Disable transitions

            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Cleanup legacy inline styles from previous versions
        if (this.panel) {
            this.panel.style.width = '';
            this.panel.style.right = '';
            this.panel.style.left = '';
            this.panel.style.transform = '';
        }
        if (this.drawerTab) {
            this.drawerTab.style.right = '';
        }

        // Restore saved width
        const savedWidth = localStorage.getItem('novelwriter-agent-panel-width');
        if (savedWidth) {
            document.documentElement.style.setProperty('--agent-panel-width', savedWidth);
        }
    }

    togglePanel() {
        this.isExpanded = !this.isExpanded;
        if (this.panel) {
            this.panel.classList.toggle('collapsed', !this.isExpanded);
        }
    }

    updateModeIndicator() {
        const modeColors = {
            auto: '#3b82f6',
            quick: '#22c55e',
            planning: '#f59e0b',
            chatty: '#a855f7',
            brainstorm: '#f97316' // Orange for creative energy
        };

        if (this.statusIndicator) {
            this.statusIndicator.style.background = modeColors[this.currentMode] || modeColors.auto;
            this.statusIndicator.title = `Mode: ${this.currentMode}`;
        }
    }

    /**
     * Detect the appropriate mode based on user input
     */
    detectMode(input) {
        const lowerInput = input.toLowerCase();

        // Check for explicit mode prefixes
        if (lowerInput.startsWith('[quick]')) return 'quick';
        if (lowerInput.startsWith('[planning]')) return 'planning';
        if (lowerInput.startsWith('[chat]')) return 'chatty';

        // Planning patterns - big tasks that need thought/permission
        const planningPatterns = [
            /\b(draft|write)\s+(a\s+)?(new\s+)?(chapter|scene|section)/i,
            /\b(create|add)\s+(a\s+)?(new\s+)?(chapter|scene|character)/i,
            /^rewrite\s+(the\s+)?(entire|whole|all)/i,
            /^restructure/i, /^refactor/i, /^reorganize/i,
            /^plan\s/i, /^outline/i, /^analyze\s+(the\s+)?manuscript/i,
            /\bexpand\s+(this|the)\s+(scene|chapter)/i
        ];

        // Quick patterns - simple, immediate edits
        const quickPatterns = [
            /^fix\s/i, /^correct\s/i, /^grammar/i, /^spelling/i,
            /^rewrite\s/i, /^rephrase/i, /^summarize/i, /^tighten/i,
            /^shorten/i, /^lengthen/i, /^improve/i
        ];

        // Chatty patterns - discussion, not action
        // Note: Removed the greedy /\?$/ pattern - questions can be actionable
        const chattyPatterns = [
            /^what\s+(do\s+you\s+)?think/i,
            /^how\s+(should|could|would)\s+(i|we)/i,
            /^help\s+me\s+(brainstorm|think|understand)/i,
            /^discuss/i, /^explain/i,
            /^tell\s+me\s+about/i,
            /^what\s+is/i, /^who\s+is/i
        ];

        // Check planning first (higher priority for big tasks)
        for (const pattern of planningPatterns) {
            if (pattern.test(lowerInput)) return 'planning';
        }

        // Then quick for simple edits
        for (const pattern of quickPatterns) {
            if (pattern.test(lowerInput)) return 'quick';
        }

        // Then chatty for discussions
        for (const pattern of chattyPatterns) {
            if (pattern.test(lowerInput)) return 'chatty';
        }

        // Default: if it's a question, lean toward planning (user wants something done)
        // Otherwise chatty for unrecognized input
        if (lowerInput.includes('?')) {
            return 'planning'; // Questions about doing something = planning
        }

        return 'chatty'; // Default to friendly chat
    }

    /**
     * Send a message to the AI
     */
    async sendMessage() {
        if (!this.inputField || this.isProcessing) return;

        const userInput = this.inputField.value.trim();
        if (!userInput && !this.pendingImage) return;

        // Check API configuration
        if (!this.app.aiService.isConfigured()) {
            this.addMessage('system', '⚠️ API not configured. Click the plug icon to add your API key.');
            return;
        }

        // Auto-create conversation if none exists
        if (!this.currentConversationId) {
            this.createNewConversation();
        }

        // Capture and clear pending image
        const attachedImage = this.pendingImage;
        this.removeAttachedImage();

        // Clear input
        this.inputField.value = '';

        // Use the user-selected mode (default 'auto')
        // When 'auto', the AI will decide and declare its mode in the response
        const selectedMode = this.currentMode;

        // Remove explicit mode prefix if user typed one manually
        let cleanInput = userInput
            .replace(/^\[(quick|planning|chat|chatty)\]\s*/i, '');

        // Add user message to history (with image thumbnail if attached)
        let savedImageFilename = null;
        if (attachedImage) {
            const imgDataUrl = `data:${attachedImage.mimeType};base64,${attachedImage.base64}`;
            const imageHtml = `<div class="chat-image-attachment"><img src="${imgDataUrl}" alt="Attached image"></div>`;
            const textContent = cleanInput || 'What do you see in this image?';
            const msgId = this.addMessage('user', `${imageHtml}${this.formatContent(textContent)}`, false, '', true);

            // Override dataset.content with text-only (image is referenced via dataset.imageFile)
            const msgEl = document.getElementById(msgId);
            if (msgEl) msgEl.dataset.content = textContent;

            // Save image to FileStorage for persistence
            if (this.app.fileStorage) {
                try {
                    savedImageFilename = await this.app.fileStorage.saveImage(imgDataUrl, `chat-img-${Date.now()}`);
                    // Store filename on the DOM element for saveConversation to pick up
                    if (msgEl) msgEl.dataset.imageFile = savedImageFilename;
                } catch (e) {
                    console.warn('Could not save chat image to FileStorage:', e.message);
                }
            }
        } else {
            this.addMessage('user', cleanInput);
        }

        // Show thinking message (mode will be updated when AI responds)
        if (selectedMode === 'auto') {
            this.addMessage('mode', 'AI is analyzing your request...');
        } else {
            const modeNames = {
                quick: '⚡ Quick Mode',
                planning: '📋 Planning Mode',
                chatty: '💬 Chatty Mode',
                brainstorm: '💡 Brainstorm Mode'
            };
            this.addMessage('mode', `Using ${modeNames[selectedMode]}`);
        }

        // Show typing indicator
        this.isProcessing = true;
        this.updateStatus('thinking');
        const typingId = this.addMessage('agent', '', true);

        try {
            // Detect context macros in user input
            const includeCharactersMacro = /\{characters?\}/i.test(cleanInput);
            const includePlotMacro = /\{plot\}/i.test(cleanInput);
            const includeNotesMacro = /\{notes?\}/i.test(cleanInput);
            const includeAnalysisMacro = /\{analysis\}/i.test(cleanInput);
            const includeWorldMacro = /\{world\}/i.test(cleanInput);

            // Remove macros from the message displayed to AI
            const cleanedInput = cleanInput
                .replace(/\{characters?\}/gi, '')
                .replace(/\{plot\}/gi, '')
                .replace(/\{notes?\}/gi, '')
                .replace(/\{analysis\}/gi, '')
                .replace(/\{world\}/gi, '')
                .trim();

            // Build context (characters always included; plot, notes, analysis only with macros)
            const context = this.contextManager.buildContext({
                includeStructure: true,
                includeCurrentScene: true,
                includeCharacters: true,
                includePlot: includePlotMacro,
                includeNotes: includeNotesMacro,
                includeAnalysis: includeAnalysisMacro,
                includeWorld: includeWorldMacro
            });

            // Get manuscript summary for system prompt
            const summary = this.contextManager.getManuscriptSummary();

            // Build system prompt (uses selectedMode - when 'auto', AI decides)
            let systemPrompt = this.app.aiService.buildSystemPrompt(selectedMode, {
                title: summary.title,
                author: summary.author,
                projectType: this.app.state?.metadata?.projectType || 'novel'
            });

            // Append vision instructions when image is attached
            if (attachedImage) {
                systemPrompt += `\n\n## IMAGE ATTACHED
The user has attached an image to this message. You CAN see and analyze the image.
Describe what you observe in the image and relate it to the story/manuscript context.
If the image appears to be a moodboard, character reference, setting illustration, or any visual reference, incorporate those visual details into your writing advice or creative suggestions.
Do NOT say you cannot see images — you have full vision capability for this message.`;
            }

            // Build messages
            const userTextContent = `[MANUSCRIPT CONTEXT]\n${context}\n\n[USER REQUEST]\n${cleanedInput}`;

            // If image is attached, use multipart content format (OpenAI vision API)
            let userMessage;
            if (attachedImage) {
                userMessage = {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: `data:${attachedImage.mimeType};base64,${attachedImage.base64}` }
                        },
                        {
                            type: 'text',
                            text: userTextContent
                        }
                    ]
                };
            } else {
                userMessage = { role: 'user', content: userTextContent };
            }

            const messages = [
                { role: 'system', content: systemPrompt },
                userMessage
            ];

            // Add conversation history (last 40 exchanges = 80 messages)
            const recentHistory = this.history.slice(-80);
            for (const msg of recentHistory) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    // If user message had an image, include it as multi-modal content
                    if (msg.role === 'user' && msg.imageFile && this.app.fileStorage) {
                        try {
                            console.log('[AgentPanel] Loading image from history:', msg.imageFile);
                            const imageData = await this.app.fileStorage.loadImage(msg.imageFile);
                            if (imageData) {
                                console.log('[AgentPanel] Image loaded, including in API messages');
                                messages.splice(-1, 0, {
                                    role: 'user',
                                    content: [
                                        { type: 'image_url', image_url: { url: imageData } },
                                        { type: 'text', text: msg.content || 'What do you see in this image?' }
                                    ]
                                });
                                continue;
                            }
                        } catch (e) {
                            console.warn('[AgentPanel] Failed to load history image:', e.message);
                            // Fall through to text-only
                        }
                    }
                    messages.splice(-1, 0, { role: msg.role, content: msg.content });
                }
            }

            // Send to AI with streaming
            let fullResponse = '';
            let fullThinking = '';
            let aiDeclaredMode = null;
            let modeAnnounced = false;

            await this.app.aiService.sendMessageStream(
                messages,
                (chunk, accumulated, thinkingChunk, accumulatedThinking) => {
                    fullResponse = accumulated;
                    fullThinking = accumulatedThinking || '';

                    // Parse and announce AI's declared mode (only once, from first chunk)
                    if (!modeAnnounced && selectedMode === 'auto') {
                        const modeMatch = accumulated.match(/^\[MODE:\s*(quick|planning|chatty)\]/i);
                        if (modeMatch) {
                            aiDeclaredMode = modeMatch[1].toLowerCase();
                            modeAnnounced = true;

                            // Update the mode announcement
                            const modeNames = {
                                quick: '⚡ Quick Mode',
                                planning: '📋 Planning Mode',
                                chatty: '💬 Chatty Mode',
                                brainstorm: '💡 Brainstorm Mode'
                            };
                            this.updateModeAnnouncement(`AI selected ${modeNames[aiDeclaredMode]}`);
                        }
                    }

                    // Update message with content and thinking
                    const displayContent = accumulated.replace(/^\[MODE:\s*(quick|planning|chatty)\]\s*/i, '');
                    this.updateMessage(typingId, displayContent, fullThinking);
                }
            );


            // Store in history — only filename reference for images (loaded from FileStorage)
            this.history.push(
                { role: 'user', content: cleanInput || '[Image sent]', imageFile: savedImageFilename || null },
                { role: 'assistant', content: fullResponse, thinking: fullThinking }
            );

            // Save conversation to storage
            this.saveConversation();

            // Update status with detected mode
            this.updateStatus('ready', aiDeclaredMode || selectedMode);

        } catch (error) {
            this.updateMessage(typingId, `❌ Error: ${error.message}`);
            this.updateStatus('error');
            // Still save on error so user message is preserved
            this.saveConversation();
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Handle image file selection from file input
     */
    handleImageAttach(e) {
        const file = e.target.files?.[0];
        if (file) this.processImageFile(file);
        // Reset input so same file can be re-selected
        if (this.imageInput) this.imageInput.value = '';
    }

    /**
     * Process an image file into base64 and show preview
     */
    processImageFile(file) {
        if (!file.type.startsWith('image/')) return;

        // Limit to 4MB to avoid API issues
        if (file.size > 4 * 1024 * 1024) {
            this.addMessage('system', '⚠️ Image too large (max 4MB). Please use a smaller image.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            // Extract base64 and mime type
            const [header, base64] = dataUrl.split(',');
            const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';

            this.pendingImage = { base64, mimeType };

            // Show preview
            if (this.imageThumb) this.imageThumb.src = dataUrl;
            if (this.imagePreview) this.imagePreview.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }

    /**
     * Remove the attached image
     */
    removeAttachedImage() {
        this.pendingImage = null;
        if (this.imagePreview) this.imagePreview.style.display = 'none';
        if (this.imageThumb) this.imageThumb.src = '';
        if (this.imageInput) this.imageInput.value = '';
    }

    /**
     * Send a silent request to the AI (for quick actions)
     * Does NOT show the user's prompt in chat, only shows AI response
     * Includes FULL manuscript context for story-aware suggestions
     * @param {string} action - The action type (rewrite, expand, etc.)
     * @param {string} selectedText - The text the user selected
     * @param {string} instruction - Additional instruction for the AI
     */
    async sendSilentRequest(action, selectedText, instruction = '') {
        if (this.isProcessing) return;

        // Check API configuration
        if (!this.app.aiService.isConfigured()) {
            this.addMessage('system', '⚠️ API not configured. Click the plug icon to add your API key.');
            return;
        }

        // Auto-create conversation if none exists
        if (!this.currentConversationId) {
            this.createNewConversation();
        }

        // Get current location in manuscript
        const sceneContext = this.contextManager.getCurrentSceneContext();
        const locationInfo = sceneContext
            ? `**Current Location:** ${sceneContext.partTitle} > ${sceneContext.chapterTitle} > ${sceneContext.sceneTitle}`
            : 'Working on manuscript';

        // Build action-specific prompts (no code blocks - just natural suggestions)
        // Build action-specific prompts
        let actionPrompts = {};

        if (this.app.state?.metadata?.projectType === 'screenplay') {
            actionPrompts = {
                rewrite: `The user has selected the following text and wants you to rewrite it to improve flow, punchiness, and cinematic quality. Ensure strict Fountain formatting and avoid "we see" or passive voice.`,
                expand: `The user has selected the following text and wants you to expand it with more visual action lines, sensory details, or beat-by-beat breakdown.`,
                shorten: `The user has selected the following text and wants you to tighten it for better reading speed (vertical writing). Remove excessive description and keep only what's visible on screen.`,
                fix: `The user has selected the following text and wants you to fix any grammar or Fountain syntax errors (e.g., scene heading format, character names).`
            };
        } else {
            actionPrompts = {
                rewrite: `The user has selected the following text and wants you to rewrite it to improve flow, clarity, and prose quality while maintaining the original meaning and fitting the story's tone.`,
                expand: `The user has selected the following text and wants you to expand it with more sensory details, emotions, and depth while staying true to the story.`,
                shorten: `The user has selected the following text and wants you to make it more concise while keeping the essential meaning and narrative flow.`,
                fix: `The user has selected the following text and wants you to fix any grammar, spelling, or punctuation errors. Only fix errors - don't change the style or meaning.`
            };
        }

        const actionInstruction = actionPrompts[action] || instruction;

        // Build the full prompt with location and selected text
        const fullPrompt = `${locationInfo}

${actionInstruction}

**Selected Text:**
"${selectedText}"

Please provide your suggestion. Keep it natural and fitting to the story.`;

        // Show a subtle processing indicator (NOT the user message)
        const actionLabels = {
            rewrite: '✏️ Rewriting...',
            expand: '📝 Expanding...',
            shorten: '✂️ Shortening...',
            fix: '🔧 Fixing...'
        };
        this.addMessage('mode', actionLabels[action] || '⚡ Processing...');

        // Show typing indicator
        this.isProcessing = true;
        this.updateStatus('thinking');
        const typingId = this.addMessage('agent', '', true);

        try {
            // Build FULL context - include everything for story awareness
            const fullContext = this.contextManager.buildContext({
                includeStructure: true,      // Full manuscript structure
                includeCurrentScene: true,   // Current scene content
                includeCharacters: true,     // Character profiles
                includePlot: true            // Plot notes
            });

            // Build system prompt with full context
            const systemPrompt = this.app.aiService.buildSystemPrompt('quick', {
                title: this.app.state.metadata.title,
                author: this.app.state.metadata.author,
                projectType: this.app.state?.metadata?.projectType || 'novel'
            }) + '\n\n--- MANUSCRIPT CONTEXT ---\n\n' + fullContext;

            // Prepare messages
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: fullPrompt }
            ];

            // Stream response
            let fullResponse = '';
            let fullThinking = '';
            await this.app.aiService.sendMessageStream(
                messages,
                (chunk, accumulated, thinkingChunk, accumulatedThinking) => {
                    fullResponse = accumulated;
                    fullThinking = accumulatedThinking || '';
                    // Strip mode prefix if present
                    const displayContent = accumulated.replace(/^\[MODE:\s*(quick|planning|chatty)\]\s*/i, '');
                    this.updateMessage(typingId, displayContent, fullThinking);
                }
            );

            // Save to history
            this.history.push(
                { role: 'user', content: `[Quick Action: ${action}] on "${selectedText.substring(0, 50)}..."` },
                { role: 'assistant', content: fullResponse }
            );
            this.saveConversation();

            this.updateStatus('ready', 'quick');

        } catch (error) {
            this.updateMessage(typingId, `❌ Error: ${error.message}`);
            this.updateStatus('error');
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Add a message to the history UI
     * @param {string} thinking - Optional thinking/reasoning content for agent messages
     */
    addMessage(role, content, isTyping = false, thinking = '', isRawHtml = false) {
        if (!this.historyContainer) return null;

        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const messageEl = document.createElement('div');

        // Handle mode announcement as a special system-like message
        if (role === 'mode') {
            messageEl.className = 'agent-message mode-announcement';
            messageEl.innerHTML = `<div class="message-content">${content}</div>`;
        } else {
            // Normalize 'assistant' to 'agent' for consistent CSS styling
            // (Messages are saved as 'assistant' per OpenAI format, but styled as 'agent')
            const cssRole = (role === 'assistant') ? 'agent' : role;
            messageEl.className = `agent-message ${cssRole}`;
            messageEl.id = messageId;
            messageEl.dataset.content = content; // Store original content for editing
            if (thinking) {
                messageEl.dataset.thinking = thinking;
            }

            // Build thinking section HTML if present (for agent/assistant messages)
            const isAgentMessage = (role === 'agent' || role === 'assistant');
            const thinkingHtml = (isAgentMessage && thinking) ? `
                <details class="message-thinking">
                    <summary>💭 Show Thinking</summary>
                    <div class="thinking-content">${this.formatContent(thinking)}</div>
                </details>
            ` : '';

            if (isTyping) {
                messageEl.classList.add('typing');
                messageEl.innerHTML = `<div class="message-content"><span class="typing-dots">...</span></div>`;
            } else if (role === 'user') {
                // User messages get an undo/edit button
                const renderedContent = isRawHtml ? content : this.formatContent(content);
                messageEl.innerHTML = `
                    <div class="message-content">${renderedContent}</div>
                    <button class="message-undo-btn" title="Edit and regenerate from here">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 10h7V3"/>
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                        </svg>
                    </button>
                `;
                // Add click handler for undo
                const undoBtn = messageEl.querySelector('.message-undo-btn');
                undoBtn.addEventListener('click', () => this.rollbackToMessage(messageId, content));
            } else if (isAgentMessage) {
                // Agent/assistant messages get thinking + content + retry button
                messageEl.innerHTML = `
                    ${thinkingHtml}
                    <div class="message-content">${this.formatContent(content)}</div>
                    <button class="message-retry-btn" title="Regenerate response">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                            <path d="M21 3v5h-5"/>
                        </svg>
                    </button>
                `;
                // Add click handler for retry
                const retryBtn = messageEl.querySelector('.message-retry-btn');
                retryBtn.addEventListener('click', () => this.retryLastMessage());


            } else {
                messageEl.innerHTML = `<div class="message-content">${this.formatContent(content)}</div>`;
            }
        }

        this.historyContainer.appendChild(messageEl);
        this.historyContainer.scrollTop = this.historyContainer.scrollHeight;

        return messageId;
    }

    /**
     * Update an existing message (removes typing indicator)
     */
    updateMessage(messageId, content, thinking = '') {
        const messageEl = document.getElementById(messageId);
        if (messageEl) {
            messageEl.classList.remove('typing');
            messageEl.dataset.content = content; // Store for potential retry
            if (thinking) {
                messageEl.dataset.thinking = thinking;
            }

            // Build thinking section HTML if present
            const thinkingHtml = thinking ? `
                <details class="message-thinking">
                    <summary>💭 Show Thinking</summary>
                    <div class="thinking-content">${this.formatContent(thinking)}</div>
                </details>
            ` : '';

            // Check if this is an agent message - add retry button
            if (messageEl.classList.contains('agent')) {
                messageEl.innerHTML = `
                    ${thinkingHtml}
                    <div class="message-content">${this.formatContent(content)}</div>
                    <button class="message-retry-btn" title="Regenerate response">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                            <path d="M21 3v5h-5"/>
                        </svg>
                    </button>
                `;
                // Add click handler for retry
                const retryBtn = messageEl.querySelector('.message-retry-btn');
                retryBtn.addEventListener('click', () => this.retryLastMessage());


            } else {
                const contentEl = messageEl.querySelector('.message-content');
                if (contentEl) {
                    contentEl.innerHTML = this.formatContent(content);
                }
            }

            this.historyContainer.scrollTop = this.historyContainer.scrollHeight;
        }
    }



    /**
     * Update the most recent mode announcement
     */
    updateModeAnnouncement(newText) {
        if (!this.historyContainer) return;

        // Find the last mode announcement
        const announcements = this.historyContainer.querySelectorAll('.mode-announcement');
        if (announcements.length > 0) {
            const lastAnnouncement = announcements[announcements.length - 1];
            const contentEl = lastAnnouncement.querySelector('.message-content');
            if (contentEl) {
                contentEl.textContent = newText;
            }
        }
    }

    /**
     * Roll back conversation to a specific message and put content in input for editing
     */
    rollbackToMessage(messageId, content) {
        if (this.isProcessing) return; // Don't allow during processing

        const messageEl = document.getElementById(messageId);
        if (!messageEl || !this.historyContainer) return;

        // Find all messages after this one and remove them
        let foundTarget = false;
        const messagesToRemove = [];

        for (const child of this.historyContainer.children) {
            if (foundTarget) {
                messagesToRemove.push(child);
            }
            if (child.id === messageId) {
                foundTarget = true;
                messagesToRemove.push(child); // Also remove the target message itself
            }
        }

        // Remove the messages from DOM
        for (const msg of messagesToRemove) {
            msg.remove();
        }

        // Update internal history - find correct index by counting previous messages in DOM
        // (Content matching is unsafe if user said the same thing twice)
        let historyIndex = 0;
        const allMessages = Array.from(this.historyContainer.children);

        for (const msg of allMessages) {
            if (msg.id === messageId) break;

            // Only count messages that actually exist in history (user and agent)
            if (msg.classList.contains('user') || msg.classList.contains('agent')) {
                historyIndex++;
            }
        }

        // Slice history up to this index
        if (historyIndex >= 0 && historyIndex < this.history.length) {
            this.history = this.history.slice(0, historyIndex);
        }

        // Put the content back in the input field for editing
        if (this.inputField) {
            this.inputField.value = content;
            this.inputField.focus();
        }

        // Save the updated conversation state
        this.saveConversation();
    }

    /**
     * Retry/regenerate the last AI response
     */
    retryLastMessage() {
        if (this.isProcessing) return;

        // Find the last user message in history
        let lastUserMessage = null;
        for (let i = this.history.length - 1; i >= 0; i--) {
            if (this.history[i].role === 'user') {
                lastUserMessage = this.history[i].content;
                break;
            }
        }

        if (!lastUserMessage) return;

        // Remove the last assistant message from history
        if (this.history.length > 0 && this.history[this.history.length - 1].role === 'assistant') {
            this.history.pop();
        }

        // Remove the last user message from history (so it doesn't get duplicated)
        if (this.history.length > 0 && this.history[this.history.length - 1].role === 'user') {
            this.history.pop();
        }

        // Remove the last agent message, mode announcement, AND user message from UI
        if (this.historyContainer) {
            const messages = this.historyContainer.querySelectorAll('.agent-message');
            const toRemove = [];

            // Find last agent message and any mode announcement before it
            let passedAgent = false;
            for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (msg.classList.contains('agent')) {
                    toRemove.push(msg);
                    passedAgent = true;
                } else if (msg.classList.contains('mode-announcement')) {
                    toRemove.push(msg);
                } else if (msg.classList.contains('user')) {
                    if (passedAgent) {
                        // This is the user message associated with the agent response we just removed
                        toRemove.push(msg);
                        break; // Stop after removing the user message pair
                    }
                }
            }

            for (const msg of toRemove) {
                msg.remove();
            }
        }

        // Put the last user message in input and trigger send
        if (this.inputField) {
            this.inputField.value = lastUserMessage;
            this.sendMessage();
        }
    }

    /**
     * Format content for display (basic markdown support)
     */
    formatContent(content) {
        if (!content) return '';

        // Escape HTML first
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Basic markdown
        formatted = formatted
            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>') // Code blocks
            .replace(/`([^`]+)`/g, '<code>$1</code>') // Inline code
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*([^*]+)\*/g, '<em>$1</em>') // Italic
            .replace(/\n/g, '<br>'); // Line breaks

        return formatted;
    }

    /**
     * Update the status indicator
     */
    updateStatus(status, mode = null) {
        if (!this.statusIndicator) return;

        const statusMap = {
            ready: { class: 'ready', title: `Ready (${mode || this.currentMode})` },
            thinking: { class: 'thinking', title: 'Thinking...' },
            error: { class: 'error', title: 'Error occurred' }
        };

        const s = statusMap[status] || statusMap.ready;
        this.statusIndicator.className = `agent-status ${s.class}`;
        this.statusIndicator.title = s.title;
    }

    /**
     * Clear conversation history (UI only)
     */
    clearHistoryUI() {
        if (this.historyContainer) {
            // Keep the welcome message
            this.historyContainer.innerHTML = `
                <div class="agent-message system">
                    <div class="message-content">👋 I'm your AI writing assistant. Ask me anything about your story, request edits, or just chat about your plot!</div>
                </div>
            `;
        }
    }

    // ========================================
    // Conversation Persistence Methods
    // ========================================

    /**
     * Load the active conversation for current project
     */
    loadActiveConversation() {
        const state = this.app.state;
        const activeId = state.activeConversationId;

        if (activeId) {
            const conversation = state.conversations?.find(c => c.id === activeId);
            if (conversation) {
                this.loadConversation(activeId);
                return;
            }
        }

        // No active conversation - show empty state
        this.currentConversationId = null;
        this.history = [];
        this.clearHistoryUI();
        this.populateConversationSelect();
    }

    /**
     * Load a specific conversation by ID
     */
    async loadConversation(conversationId) {
        const state = this.app.state;
        const conversation = state.conversations?.find(c => c.id === conversationId);

        if (!conversation) {
            console.warn('Conversation not found:', conversationId);
            return;
        }

        this.currentConversationId = conversationId;
        this.history = conversation.messages.filter(m => m.role === 'user' || m.role === 'assistant');

        // Update active conversation in state
        state.activeConversationId = conversationId;
        this.app.save();

        // Render messages in UI
        this.clearHistoryUI();
        for (const msg of conversation.messages) {
            // If message has an attached image, load it from FileStorage
            if (msg.imageFile && this.app.fileStorage) {
                try {
                    const imageData = await this.app.fileStorage.loadImage(msg.imageFile);
                    if (imageData) {
                        // Strip any legacy HTML from content (old saves had HTML baked in)
                        const cleanContent = msg.content.replace(/<div class="chat-image-attachment">.*?<\/div>/g, '').trim();
                        const imageHtml = `<div class="chat-image-attachment"><img src="${imageData}" alt="Attached image"></div>`;
                        const msgId = this.addMessage(msg.role, `${imageHtml}${this.formatContent(cleanContent)}`, false, msg.thinking || '', true);
                        const msgEl = document.getElementById(msgId);
                        if (msgEl) {
                            msgEl.dataset.imageFile = msg.imageFile;
                            msgEl.dataset.content = cleanContent; // Text-only
                        }
                        continue;
                    }
                } catch (e) {
                    console.warn('Could not load chat image:', e.message);
                }
            }
            // Strip legacy HTML from content if present (no imageFile but HTML from old saves)
            let content = msg.content;
            if (content.includes('<div class="chat-image-attachment">')) {
                content = content.replace(/<div class="chat-image-attachment">.*?<\/div>/g, '').trim();
            }
            this.addMessage(msg.role, content, false, msg.thinking || '');
        }

        this.populateConversationSelect();
    }

    /**
     * Save current conversation to state
     */
    saveConversation() {
        if (!this.currentConversationId) return;

        const state = this.app.state;
        if (!state.conversations) state.conversations = [];

        let conversation = state.conversations.find(c => c.id === this.currentConversationId);

        if (!conversation) {
            conversation = {
                id: this.currentConversationId,
                title: 'New Conversation',
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                messages: []
            };
            state.conversations.push(conversation);
        }

        // Get messages from the UI (skip system messages like welcome)
        const messages = [];
        if (this.historyContainer) {
            const messageEls = this.historyContainer.querySelectorAll('.agent-message');
            for (const el of messageEls) {
                // Skip system messages (welcome message) and mode announcements
                if (el.classList.contains('system') || el.classList.contains('mode-announcement')) {
                    continue;
                }

                let role = 'system';
                if (el.classList.contains('user')) role = 'user';
                else if (el.classList.contains('agent')) role = 'assistant';

                const content = el.dataset.content || el.querySelector('.message-content')?.textContent || '';
                const thinking = el.dataset.thinking || '';
                const imageFile = el.dataset.imageFile || '';
                if (content && !el.classList.contains('typing')) {
                    const msgData = { role, content, thinking, timestamp: new Date().toISOString() };
                    if (imageFile) msgData.imageFile = imageFile;
                    messages.push(msgData);
                }
            }
        }

        conversation.messages = messages;
        conversation.modified = new Date().toISOString();

        // Auto-title from first user message
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (firstUserMsg && conversation.title === 'New Conversation') {
            conversation.title = firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '');
        }

        this.app.save();
        this.populateConversationSelect();
    }

    /**
     * Create a new conversation
     */
    createNewConversation() {
        const newId = crypto.randomUUID();
        this.currentConversationId = newId;
        this.history = [];

        // Update state
        const state = this.app.state;
        if (!state.conversations) state.conversations = [];

        const newConv = {
            id: newId,
            title: 'New Conversation',
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            messages: []
        };
        state.conversations.push(newConv);
        state.activeConversationId = newId;
        this.app.save();

        // Clear UI
        this.clearHistoryUI();
        this.populateConversationSelect();
    }

    /**
     * Delete the current conversation
     */
    deleteCurrentConversation() {
        if (!this.currentConversationId) return;

        if (!confirm('Are you sure you want to delete this conversation? This cannot be undone.')) {
            return;
        }

        const state = this.app.state;
        if (!state.conversations) return;

        // Remove from state
        state.conversations = state.conversations.filter(c => c.id !== this.currentConversationId);

        // Determine next active conversation
        const remaining = state.conversations.sort((a, b) => new Date(b.modified) - new Date(a.modified));
        const nextId = remaining.length > 0 ? remaining[0].id : null;

        // Update active ID
        state.activeConversationId = nextId;
        this.app.save();

        if (nextId) {
            this.loadConversation(nextId);
        } else {
            this.currentConversationId = null;
            this.history = [];
            this.clearHistoryUI();
            this.populateConversationSelect();
        }
    }

    /**
     * Populate the conversation select dropdown
     */
    populateConversationSelect() {
        if (!this.conversationSelect) return;

        const conversations = this.app.state.conversations || [];

        // Sort by modified date (newest first)
        const sorted = [...conversations].sort((a, b) =>
            new Date(b.modified) - new Date(a.modified)
        );

        this.conversationSelect.innerHTML = '';

        // Add placeholder if no conversations
        if (sorted.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No conversations yet';
            this.conversationSelect.appendChild(option);
            return;
        }

        for (const conv of sorted) {
            const option = document.createElement('option');
            option.value = conv.id;
            option.textContent = conv.title || 'Untitled';
            if (conv.id === this.currentConversationId) {
                option.selected = true;
            }
            this.conversationSelect.appendChild(option);
        }
    }
}
