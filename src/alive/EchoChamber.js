/**
 * EchoChamber - Simulated group chat of AI readers
 * Phase 7.3: The Magnum Opus of Alive Editor
 */

import { stripContent } from '../utils/TextUtils.js';

export class EchoChamber {
    constructor(app) {
        this.app = app;

        // The 5 Readers - Fixed personalities
        this.readers = [
            {
                id: 'alex',
                name: 'Alex',
                emoji: '🧐',
                personality: 'The Analyst — notices plot holes, continuity issues, foreshadowing, and narrative structure. Thoughtful and observant.',
                style: 'Analytical, uses phrases like "Interesting...", "Wait, didn\'t...", "This connects to..."'
            },
            {
                id: 'sam',
                name: 'Sam',
                emoji: '😍',
                personality: 'The Shipper — obsessed with relationships, romantic tension, character dynamics. Ships everyone with everyone.',
                style: 'Enthusiastic about romance, uses heart emojis in speech, squeals at tension, says "OMG", "I SHIP IT", "the chemistry!"'
            },
            {
                id: 'max',
                name: 'Max',
                emoji: '🤨',
                personality: 'The Skeptic — questions character motivations, calls out plot conveniences, plays devil\'s advocate.',
                style: 'Cynical but engaged, uses "Yeah but...", "Convenient much?", "I\'m calling it now..."'
            },
            {
                id: 'riley',
                name: 'Riley',
                emoji: '🎉',
                personality: 'The Hype — gets excited about action, twists, dramatic moments. Pure enthusiasm and energy.',
                style: 'ALL CAPS when excited, uses "YOOO", "NO WAY", "THIS IS INSANE", lots of exclamation marks'
            },
            {
                id: 'jordan',
                name: 'Jordan',
                emoji: '📚',
                personality: 'The Lore Keeper — tracks world-building, magic systems, history, named locations. The wiki editor of the group.',
                style: 'Encyclopedic, says "Actually...", "This reminds me of...", "In chapter X they mentioned..."'
            }
        ];

        // State (will be loaded from app state)
        this.isActive = false;
        this.isGenerating = false; // New flag for UI spinner
        this.letterCounter = 0;
        this.currentConversationId = null;

        // Default settings (will be loaded from app state)
        this.letterTrigger = 500;

        // Previous trigger state (for comparison)
        this.previousState = null;

        // UI Elements (set after DOM ready)
        this.modal = null;
        this.chatContainer = null;
        this.logPanel = null;
        this.statusIndicator = null;

        this.initUI();
        this.loadSettings();  // Load persisted state
    }

    loadSettings() {
        // Load persisted state from app
        const echoState = this.app.state.echoChamber || {};
        this.isActive = echoState.isActive || false;
        this.letterTrigger = echoState.letterTrigger || 500;

        // Update UI to reflect loaded state
        if (this.triggerInput) {
            this.triggerInput.value = this.letterTrigger;
        }
        this.updateStatus();
    }

    saveSettings() {
        // Persist settings to app state
        if (!this.app.state.echoChamber) {
            this.app.state.echoChamber = { conversations: [] };
        }
        this.app.state.echoChamber.isActive = this.isActive;
        this.app.state.echoChamber.letterTrigger = this.letterTrigger;
        this.app.save();
    }

    initUI() {
        this.modal = document.getElementById('echo-chamber-modal');
        this.chatContainer = document.getElementById('echo-chat-container');
        this.logPanel = document.getElementById('echo-log-content');
        this.statusIndicator = document.getElementById('echo-status');
        this.triggerInput = document.getElementById('echo-trigger-count');

        // Modal open/close
        document.getElementById('btn-echo-chamber')?.addEventListener('click', () => this.open());
        document.getElementById('close-echo-chamber')?.addEventListener('click', () => this.close());
        document.getElementById('echo-chamber-backdrop')?.addEventListener('click', () => this.close());

        // Control buttons
        document.getElementById('btn-start-echo')?.addEventListener('click', () => this.start());
        document.getElementById('btn-stop-echo')?.addEventListener('click', () => this.stop());
        document.getElementById('btn-new-echo-chat')?.addEventListener('click', () => this.newConversation());
        document.getElementById('btn-toggle-echo-log')?.addEventListener('click', () => this.toggleLogPanel());

        this.triggerInput?.addEventListener('change', (e) => {
            this.letterTrigger = parseInt(e.target.value) || 500;
            this.saveSettings();  // Persist on change
            this.app.aliveEditor?.updatePanel(); // Update panel immediately
        });
    }

    // ===== MODAL CONTROLS =====

    open() {
        if (!this.modal) return;
        this.modal.classList.add('open');
        this.loadConversation();
    }

    close() {
        this.modal?.classList.remove('open');
    }

    // ===== CONVERSATION MANAGEMENT =====

    getConversations() {
        return this.app.state.echoChamber?.conversations || [];
    }

    getCurrentConversation() {
        if (!this.currentConversationId) return null;
        return this.getConversations().find(c => c.id === this.currentConversationId);
    }

    loadConversation() {
        const conversations = this.getConversations();
        if (conversations.length === 0) {
            this.newConversation();
            return;
        }

        // Load most recent
        const latest = conversations[conversations.length - 1];
        this.currentConversationId = latest.id;
        this.renderConversation(latest);
    }

    newConversation() {
        const conversation = {
            id: `echo-${Date.now()}`,
            createdAt: new Date().toISOString(),
            messages: [],
            changeLog: [],
            sceneFocusHistory: [],
            isOpened: false  // Has the opening message been sent?
        };

        // Save to state
        if (!this.app.state.echoChamber) {
            this.app.state.echoChamber = { conversations: [] };
        }
        this.app.state.echoChamber.conversations.push(conversation);
        this.currentConversationId = conversation.id;

        this.renderConversation(conversation);
        this.app.save();
    }

    deleteConversation() {
        if (!this.currentConversationId) return;

        const conversations = this.getConversations();
        const idx = conversations.findIndex(c => c.id === this.currentConversationId);
        if (idx !== -1) {
            conversations.splice(idx, 1);
            this.app.save();
        }

        this.currentConversationId = null;
        if (conversations.length > 0) {
            this.loadConversation();
        } else {
            this.newConversation();
        }
    }

    renderConversation(conversation) {
        if (!this.chatContainer) return;

        this.chatContainer.innerHTML = '';

        conversation.messages.forEach(msg => {
            this.appendMessageToDOM(msg);
        });

        // Render change log
        this.renderChangeLog(conversation.changeLog);

        // Scroll to bottom
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    appendMessageToDOM(msg) {
        const reader = this.readers.find(r => r.id === msg.readerId);
        if (!reader) return;

        const bubble = document.createElement('div');
        bubble.className = `echo-message echo-${reader.id}`;
        bubble.innerHTML = `
            <span class="echo-avatar">${reader.emoji}</span>
            <div class="echo-bubble">
                <span class="echo-name">${reader.name}</span>
                <span class="echo-text">${msg.text}</span>
            </div>
        `;
        this.chatContainer.appendChild(bubble);
    }

    renderChangeLog(log) {
        if (!this.logPanel) return;

        if (log.length === 0) {
            this.logPanel.innerHTML = '<div class="echo-log-empty">No changes logged yet.</div>';
            return;
        }

        this.logPanel.innerHTML = log.map(entry => `
            <div class="echo-log-entry">
                <span class="echo-log-time">${entry.time}</span>
                <span class="echo-log-text">${entry.text}</span>
            </div>
        `).join('');
    }

    toggleLogPanel() {
        const panel = document.getElementById('echo-log-panel');
        panel?.classList.toggle('collapsed');
    }

    // ===== START / STOP =====

    start() {
        this.isActive = true;
        this.letterCounter = 0;
        this.updateStatus();
        this.saveSettings();  // Persist state

        const conv = this.getCurrentConversation();
        // Generate opening if not opened OR if no messages (failed parse)
        if (conv && (!conv.isOpened || conv.messages.length === 0)) {
            this.generateOpening();
        }
    }

    stop() {
        this.isActive = false;
        this.updateStatus();
        this.saveSettings();  // Persist state
    }

    updateStatus() {
        // Toggle status indicator class
        if (this.statusIndicator) {
            if (this.isActive) {
                this.statusIndicator.textContent = '⚡ Echo Chamber is LIVE';
                this.statusIndicator.className = 'echo-status active';
            } else {
                this.statusIndicator.textContent = '⚫ Echo Chamber is OFF';
                this.statusIndicator.className = 'echo-status inactive';
            }

            // Show/hide spinner based on isGenerating
            if (this.isGenerating) {
                this.statusIndicator.textContent = '⚡ Generatng...';
                this.statusIndicator.classList.add('generating');
            } else {
                this.statusIndicator.classList.remove('generating');
            }
        }

        // Notify AliveEditor to update its panel
        this.app.aliveEditor?.updatePanel();
    }

    // ===== LETTER COUNTING (Called from AliveEditor or Main) =====

    onLettersTyped(count) {
        if (!this.isActive) return;

        this.letterCounter += count;

        if (this.letterCounter >= this.letterTrigger) {
            this.letterCounter = 0;
            this.triggerReaction();
        }
    }

    // ===== MANUSCRIPT STATE CAPTURE =====

    captureManuscriptState() {
        const parts = this.app.state.manuscript.parts || [];
        const state = {
            metadata: {
                parts: [],
                chapters: [],
                scenes: []
            },
            chapterContents: {}
        };

        parts.forEach(part => {
            state.metadata.parts.push({
                id: part.id,
                title: part.displayTitle || part.title,
                chapterCount: part.chapters?.length || 0
            });

            part.chapters?.forEach(chapter => {
                // Calculate token count (word count * 1.3 approximation)
                let chapterContent = '';
                chapter.scenes?.forEach(scene => {
                    chapterContent += stripContent(scene.content) + '\n\n';
                });
                const wordCount = chapterContent.trim().split(/\s+/).filter(w => w).length;
                const tokenCount = Math.round(wordCount * 1.3);

                state.metadata.chapters.push({
                    id: chapter.id,
                    title: chapter.displayTitle || chapter.title,
                    partId: part.id,
                    sceneCount: chapter.scenes?.length || 0,
                    tokenCount: tokenCount
                });

                // Store full content for potential comparison
                state.chapterContents[chapter.id] = chapterContent;

                chapter.scenes?.forEach(scene => {
                    state.metadata.scenes.push({
                        id: scene.id,
                        title: scene.title,
                        chapterId: chapter.id
                    });
                });
            });
        });

        return state;
    }

    // ===== CHANGE DETECTION =====

    detectChanges(previousState, currentState) {
        if (!previousState) return { hasChanges: false, changes: [] };

        const changes = [];
        const prev = previousState.metadata;
        const curr = currentState.metadata;

        // Check for new/deleted parts
        const prevPartIds = new Set(prev.parts.map(p => p.id));
        const currPartIds = new Set(curr.parts.map(p => p.id));

        curr.parts.forEach(p => {
            if (!prevPartIds.has(p.id)) {
                changes.push({ type: 'new_part', title: p.title });
            }
        });

        prev.parts.forEach(p => {
            if (!currPartIds.has(p.id)) {
                changes.push({ type: 'deleted_part', title: p.title });
            }
        });

        // Check for new/deleted chapters
        const prevChapterIds = new Set(prev.chapters.map(c => c.id));
        const currChapterIds = new Set(curr.chapters.map(c => c.id));

        curr.chapters.forEach(c => {
            if (!prevChapterIds.has(c.id)) {
                changes.push({ type: 'new_chapter', title: c.title });
            }
        });

        prev.chapters.forEach(c => {
            if (!currChapterIds.has(c.id)) {
                changes.push({ type: 'deleted_chapter', title: c.title });
            }
        });

        // Check for new/deleted scenes
        const prevSceneIds = new Set(prev.scenes.map(s => s.id));
        const currSceneIds = new Set(curr.scenes.map(s => s.id));

        curr.scenes.forEach(s => {
            if (!prevSceneIds.has(s.id)) {
                const chapter = curr.chapters.find(c => c.id === s.chapterId);
                changes.push({ type: 'new_scene', title: s.title, chapterTitle: chapter?.title });
            }
        });

        prev.scenes.forEach(s => {
            if (!currSceneIds.has(s.id)) {
                const chapter = prev.chapters.find(c => c.id === s.chapterId);
                // Get brief description from previous content
                const prevContent = previousState.chapterContents[s.chapterId] || '';
                changes.push({
                    type: 'deleted_scene',
                    title: s.title,
                    chapterTitle: chapter?.title,
                    briefContent: prevContent.substring(0, 200)
                });
            }
        });

        // Check for token count changes (content changes)
        const changedChapters = [];
        curr.chapters.forEach(currCh => {
            const prevCh = prev.chapters.find(p => p.id === currCh.id);
            if (prevCh && prevCh.tokenCount !== currCh.tokenCount) {
                const diff = currCh.tokenCount - prevCh.tokenCount;
                changedChapters.push({
                    id: currCh.id,
                    title: currCh.title,
                    tokenDiff: diff,
                    previousContent: previousState.chapterContents[currCh.id]
                });
                changes.push({
                    type: 'content_change',
                    title: currCh.title,
                    tokenDiff: diff
                });
            }
        });

        return {
            hasChanges: changes.length > 0,
            changes: changes,
            changedChapters: changedChapters
        };
    }

    // ===== CONTEXT BUILDING =====

    buildOpeningContext() {
        // Full manuscript for opening
        let manuscript = '';
        const parts = this.app.state.manuscript.parts || [];

        parts.forEach(part => {
            manuscript += `# ${part.displayTitle || part.title}\n\n`;
            part.chapters?.forEach(chapter => {
                manuscript += `## ${chapter.displayTitle || chapter.title}\n\n`;
                chapter.scenes?.forEach(scene => {
                    manuscript += `### ${scene.title}\n`;
                    manuscript += stripContent(scene.content) + '\n\n';
                });
            });
        });

        // Current scene focus
        const sceneFocus = this.getSceneFocus();

        // Metadata
        const state = this.captureManuscriptState();
        const metadata = this.formatMetadata(state.metadata);

        return { manuscript, sceneFocus, metadata };
    }

    buildReactionContext() {
        const conv = this.getCurrentConversation();
        if (!conv) return null;

        // Current part full + other parts summaries
        const ctx = this.app.currentContext;
        let manuscript = '';

        if (ctx?.partId) {
            const parts = this.app.state.manuscript.parts || [];
            const summaries = this.app.state.summaries?.parts || {};

            parts.forEach(part => {
                if (part.id === ctx.partId) {
                    // Full content for current part
                    manuscript += `# ${part.displayTitle || part.title} [CURRENT PART - FULL CONTENT]\n\n`;
                    part.chapters?.forEach(chapter => {
                        manuscript += `## ${chapter.displayTitle || chapter.title}\n\n`;
                        chapter.scenes?.forEach(scene => {
                            manuscript += `### ${scene.title}\n`;
                            manuscript += stripContent(scene.content) + '\n\n';
                        });
                    });
                } else {
                    // Summary for other parts
                    const summary = summaries[part.id];
                    manuscript += `# ${part.displayTitle || part.title} [SUMMARY]\n`;
                    manuscript += summary || '(No summary available)';
                    manuscript += '\n\n';
                }
            });
        }

        // Capture current state
        const currentState = this.captureManuscriptState();

        // Detect changes
        const changeResult = this.detectChanges(this.previousState, currentState);

        // Get changed chapter content - BOTH previous AND current state
        // This allows AI to compare even if the changed chapter isn't in the focused part
        let changedChaptersContext = '';
        if (changeResult.changedChapters?.length > 0) {
            changedChaptersContext = '\n## CHANGED CHAPTERS (Compare Previous vs Current)\n\n';
            changeResult.changedChapters.forEach(ch => {
                const currentContent = currentState.chapterContents[ch.id] || '(Chapter no longer exists)';
                changedChaptersContext += `### ${ch.title} — PREVIOUS STATE (${ch.tokenDiff > 0 ? '+' : ''}${ch.tokenDiff} tokens change)\n`;
                changedChaptersContext += '```\n' + (ch.previousContent || '(empty)') + '\n```\n\n';
                changedChaptersContext += `### ${ch.title} — CURRENT STATE\n`;
                changedChaptersContext += '```\n' + currentContent + '\n```\n\n';
            });
        }

        // Also handle deleted scenes/chapters that aren't in changedChapters
        // (for when entire scenes are deleted, we need to show what was lost)
        if (changeResult.changes?.length > 0) {
            changeResult.changes.forEach(c => {
                if (c.type === 'deleted_scene' && c.briefContent) {
                    changedChaptersContext += `### DELETED: ${c.title} (from ${c.chapterTitle})\n`;
                    changedChaptersContext += `Previous content snippet: "${c.briefContent}..."\n\n`;
                }
            });
        }

        // Scene focus
        const sceneFocus = this.getSceneFocus();

        // Add to focus history
        conv.sceneFocusHistory.push({
            trigger: conv.sceneFocusHistory.length + 1,
            focus: sceneFocus,
            timestamp: new Date().toLocaleTimeString()
        });

        // Format focus history
        const focusHistory = conv.sceneFocusHistory.map(f =>
            `Trigger ${f.trigger} (${f.timestamp}): ${f.focus}`
        ).join('\n');

        // Change log
        const changeLogText = conv.changeLog.map(e => `${e.time} - ${e.text}`).join('\n');

        // Chat history
        const chatHistory = conv.messages.map(m => {
            const reader = this.readers.find(r => r.id === m.readerId);
            return `${reader?.emoji} ${reader?.name}: ${m.text}`;
        }).join('\n');

        // Metadata
        const metadata = this.formatMetadata(currentState.metadata);
        const prevMetadata = this.previousState ? this.formatMetadata(this.previousState.metadata) : 'N/A (First trigger)';

        // Store current state as previous for next trigger
        this.previousState = currentState;

        return {
            manuscript,
            changedChaptersContext,
            sceneFocus,
            focusHistory,
            changeLogText,
            chatHistory,
            metadata,
            prevMetadata,
            changes: changeResult.changes
        };
    }

    getSceneFocus() {
        const ctx = this.app.currentContext;
        if (!ctx) return 'Unknown';

        if (ctx.type === 'scene') {
            const part = this.app.state.manuscript.parts.find(p => p.id === ctx.partId);
            const chapter = part?.chapters.find(c => c.id === ctx.chapterId);
            const scene = chapter?.scenes.find(s => s.id === ctx.sceneId);
            return `Part: ${part?.title || 'Unknown'}, Chapter: ${chapter?.title || 'Unknown'}, Scene: ${scene?.title || 'Unknown'}`;
        }

        return `Part: ${ctx.partId || 'Unknown'}`;
    }

    formatMetadata(metadata) {
        let text = 'MANUSCRIPT STRUCTURE:\n';

        metadata.parts.forEach(part => {
            text += `\n📁 ${part.title} (${part.chapterCount} chapters)\n`;

            const chapters = metadata.chapters.filter(c => c.partId === part.id);
            chapters.forEach(ch => {
                text += `  📖 ${ch.title} - ${ch.sceneCount} scenes, ~${ch.tokenCount} tokens\n`;

                const scenes = metadata.scenes.filter(s => s.chapterId === ch.id);
                scenes.forEach(s => {
                    text += `    📝 ${s.title}\n`;
                });
            });
        });

        return text;
    }

    // ===== PROMPT BUILDING =====

    buildOpeningPrompt(context) {
        const readerDescriptions = this.readers.map(r =>
            `${r.emoji} **${r.name}** - ${r.personality}\n   Style: ${r.style}`
        ).join('\n\n');

        return `You are simulating a GROUP CHAT of 5 passionate readers who have been following a novel-in-progress. They're reuniting in their private chat to read the latest from the author.

═══════════════════════════════════════════════════════
THE READERS (embody each one's unique voice):
═══════════════════════════════════════════════════════

${readerDescriptions}

═══════════════════════════════════════════════════════
THE FULL MANUSCRIPT (everything written so far):
═══════════════════════════════════════════════════════

${context.manuscript}

═══════════════════════════════════════════════════════
CURRENT WRITING FOCUS: ${context.sceneFocus}
═══════════════════════════════════════════════════════

${context.metadata}

═══════════════════════════════════════════════════════
YOUR TASK: Generate 10 opening messages
═══════════════════════════════════════════════════════

Create a natural group chat conversation as the readers gather to read more. They should:

1. **Act like they've read everything above** - Reference SPECIFIC events, characters, dialogue, and scenes from the manuscript. NO GENERIC STATEMENTS like "that fight scene was cool." Be specific: "That moment when [character] said [actual quote] gave me chills."

2. **Show genuine excitement** - They're fans reuniting. Banter with each other. Disagree sometimes. Ship characters. Theorize.

3. **Reference the LATEST content more heavily** - The final 2-3 messages should specifically anticipate what might happen next in the most recent chapter/scene.

4. **End with anticipation** - The last messages should express excitement to see what the author writes today.

5. **Stay in character** - Alex analyzes, Sam ships, Max is skeptical, Riley hypes, Jordan tracks lore.

═══════════════════════════════════════════════════════
FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
═══════════════════════════════════════════════════════

MESSAGES:
🧐 Alex: [message text]
😍 Sam: [message text]
🤨 Max: [message text]
🎉 Riley: [message text]
📚 Jordan: [message text]
...continue for 10 messages total, mixing up the order naturally...

(No LOG section for opening messages)`;
    }

    buildReactionPrompt(context) {
        const readerDescriptions = this.readers.map(r =>
            `${r.emoji} **${r.name}** - ${r.personality}\n   Style: ${r.style}`
        ).join('\n\n');

        // Format detected changes for the prompt
        let changesDescription = '';
        let noRealChanges = false;

        if (context.changes.length > 0) {
            changesDescription = '\n⚠️ DETECTED CHANGES SINCE LAST TRIGGER:\n';
            context.changes.forEach(c => {
                switch (c.type) {
                    case 'new_scene':
                        changesDescription += `  • NEW SCENE: "${c.title}" added to ${c.chapterTitle}\n`;
                        break;
                    case 'deleted_scene':
                        changesDescription += `  • DELETED SCENE: "${c.title}" removed from ${c.chapterTitle}\n`;
                        break;
                    case 'new_chapter':
                        changesDescription += `  • NEW CHAPTER: "${c.title}" added\n`;
                        break;
                    case 'deleted_chapter':
                        changesDescription += `  • DELETED CHAPTER: "${c.title}" removed\n`;
                        break;
                    case 'content_change':
                        changesDescription += `  • CONTENT CHANGE: "${c.title}" (${c.tokenDiff > 0 ? '+' : ''}${c.tokenDiff} tokens)\n`;
                        break;
                }
            });
        } else {
            noRealChanges = true;
            changesDescription = `
⚠️ NO MEANINGFUL CHANGES DETECTED!
The author triggered this but the manuscript content is essentially unchanged.
They may be:
- Just typing spaces/thinking
- AFK or distracted
- Stuck on what to write next

YOUR REACTION SHOULD ACKNOWLEDGE THIS. Examples:
- "...is anything happening?"
- "Hello? Anyone writing over there?"
- "I think they're stuck..."
- "Come on, we're waiting!"
- "Did they fall asleep?"
`;
        }

        return `You are simulating a GROUP CHAT of 5 passionate readers who are experiencing a novel-in-progress IN REAL-TIME as the author writes it.

═══════════════════════════════════════════════════════
THE READERS (embody each one's unique voice):
═══════════════════════════════════════════════════════

${readerDescriptions}

═══════════════════════════════════════════════════════
CURRENT MANUSCRIPT STATE:
═══════════════════════════════════════════════════════

${context.manuscript}

${context.changedChaptersContext}

═══════════════════════════════════════════════════════
CHANGE DETECTION (compare current vs previous):
═══════════════════════════════════════════════════════

PREVIOUS STRUCTURE:
${context.prevMetadata}

CURRENT STRUCTURE:
${context.metadata}

${changesDescription}

═══════════════════════════════════════════════════════
SCENE FOCUS HISTORY (where the author has been writing):
═══════════════════════════════════════════════════════

${context.focusHistory}

CURRENT FOCUS: ${context.sceneFocus}

═══════════════════════════════════════════════════════
CHANGE LOG (what you've noticed in previous triggers):
═══════════════════════════════════════════════════════

${context.changeLogText || '(No previous entries)'}

═══════════════════════════════════════════════════════
CHAT HISTORY (your conversation so far):
═══════════════════════════════════════════════════════

${context.chatHistory}

═══════════════════════════════════════════════════════
YOUR TASK: React to what happened + Log the changes
═══════════════════════════════════════════════════════

Generate 5-10 messages as the readers react to the NEW CONTENT. You must:

1. **PRIORITIZE DETECTED CHANGES** - If scenes were added/deleted, chapters changed, or significant content was written—REACT TO IT FIRST. Compare the previous chapter content with current to see exactly what changed.

2. **BE SPECIFIC** - Reference actual new text, character names, dialogue, events. Don't be vague.

3. **BREAK THE 4TH WALL** - You're watching the author write in real-time. Comment on things like:
   - "Wait, did they just add a whole new scene?"
   - "Oof, that scene got scrapped..."
   - "The pacing is picking up!"
   - "Are they going back to edit chapter 2?"

4. **REACT NATURALLY** - Banter with each other. Disagree. Get excited. Get worried. Theorize about where this is going.

5. **STAY IN CHARACTER** - Alex analyzes structure, Sam ships, Max is skeptical, Riley hypes, Jordan tracks lore.

6. **GENERATE LOG ENTRIES** - After messages, create concise log entries describing what changed this trigger. If nothing changed, log that too (e.g., "No progress - author idle").

═══════════════════════════════════════════════════════
FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
═══════════════════════════════════════════════════════

MESSAGES:
🧐 Alex: [message]
😍 Sam: [message]
...5-10 messages total...

LOG:
[current time like "10:32pm"] - [Brief description of change, or "No progress - author appears idle"]`;
    }

    // ===== MESSAGE GENERATION =====

    async generateOpening() {
        const conv = this.getCurrentConversation();
        if (!conv) return;

        this.isGenerating = true;
        this.updateStatus(); // Update UI to show spinner
        this.showTypingIndicator();

        try {
            const context = this.buildOpeningContext();
            const prompt = this.buildOpeningPrompt(context);

            const response = await this.app.aiService.sendAliveRequest(
                prompt,
                'You are simulating a group chat of 5 readers reacting to a novel. Follow the format exactly.'
            );

            console.log('Echo Chamber opening response:', response);

            // Parse and add messages
            const beforeCount = conv.messages.length;
            this.parseAndAddMessages(response, conv);

            // Only mark as opened if messages were actually added
            if (conv.messages.length > beforeCount) {
                conv.isOpened = true;
                // Save initial state as previous
                this.previousState = this.captureManuscriptState();
            } else {
                console.warn('No messages parsed from response');
                this.showError('Messages could not be parsed. Check console for AI response.');
            }

            this.app.save();
            this.renderConversation(conv);

        } catch (err) {
            console.error('Echo Chamber opening failed:', err);
            this.showError('Failed to generate opening. Check API configuration.');
        }

        this.isGenerating = false;
        this.updateStatus();
        this.hideTypingIndicator();
    }

    async triggerReaction() {
        const conv = this.getCurrentConversation();
        if (!conv || !conv.isOpened) return;

        this.isGenerating = true;
        this.updateStatus();
        this.showTypingIndicator();

        try {
            const context = this.buildReactionContext();
            if (!context) return;

            // Debug: Log detected changes
            console.log('Echo Chamber - Detected changes:', context.changes);
            console.log('Echo Chamber - Changed chapters context length:', context.changedChaptersContext?.length);

            const prompt = this.buildReactionPrompt(context);

            const response = await this.app.aiService.sendAliveRequest(
                prompt,
                'You are simulating a group chat of 5 readers reacting to a novel in real-time. Follow the format exactly.'
            );

            console.log('Echo Chamber reaction response:', response);

            // Parse messages and log
            this.parseAndAddMessages(response, conv);
            this.parseAndAddLog(response, conv);

            this.app.save();
            this.renderConversation(conv);

        } catch (err) {
            console.error('Echo Chamber reaction failed:', err);
        }

        this.isGenerating = false;
        this.updateStatus();
        this.hideTypingIndicator();
    }

    parseAndAddMessages(response, conv) {
        // Extract MESSAGES section
        const messagesMatch = response.match(/MESSAGES:\s*([\s\S]*?)(?=LOG:|$)/i);

        // Fallback: if no MESSAGES header, try to parse the whole response
        const textToParse = messagesMatch ? messagesMatch[1] : response;

        const messageLines = textToParse.split('\n').filter(l => l.trim());
        console.log('Parsing message lines:', messageLines.length);

        const emojiMap = {
            '🧐': 'alex', '😍': 'sam', '🤨': 'max', '🎉': 'riley', '📚': 'jordan'
        };

        const nameMap = {
            'alex': 'alex', 'sam': 'sam', 'max': 'max', 'riley': 'riley', 'jordan': 'jordan'
        };

        messageLines.forEach(line => {
            // Try multiple patterns

            // Pattern 1: Emoji Name: message
            let match = line.match(/^(🧐|😍|🤨|🎉|📚)\s*(\w+):\s*(.+)$/);
            if (!match) {
                // Pattern 2: **Name**: message or Name: message (without emoji at start)
                match = line.match(/^\*?\*?(Alex|Sam|Max|Riley|Jordan)\*?\*?:\s*(.+)$/i);
                if (match) {
                    const name = match[1].toLowerCase();
                    const text = match[2];
                    const reader = this.readers.find(r => r.id === name);
                    if (reader) {
                        conv.messages.push({
                            readerId: reader.id,
                            text: text,
                            timestamp: new Date().toISOString()
                        });
                        console.log('Added message from', reader.name);
                    }
                    return;
                }
            }

            if (!match) {
                // Pattern 3: Just NAME: message anywhere in line
                match = line.match(/(Alex|Sam|Max|Riley|Jordan):\s*(.+)$/i);
                if (match) {
                    const name = match[1].toLowerCase();
                    const text = match[2];
                    const reader = this.readers.find(r => r.id === name);
                    if (reader) {
                        conv.messages.push({
                            readerId: reader.id,
                            text: text,
                            timestamp: new Date().toISOString()
                        });
                        console.log('Added message from', reader.name);
                    }
                    return;
                }
            }

            if (match && match.length >= 4) {
                // Original pattern matched
                const emoji = match[1];
                const name = match[2];
                const text = match[3];

                const readerId = emojiMap[emoji] || nameMap[name.toLowerCase()];
                const reader = this.readers.find(r => r.id === readerId);
                if (reader) {
                    conv.messages.push({
                        readerId: reader.id,
                        text: text,
                        timestamp: new Date().toISOString()
                    });
                    console.log('Added message from', reader.name);
                }
            }
        });

        console.log('Total messages parsed:', conv.messages.length);
    }

    parseAndAddLog(response, conv) {
        // Extract LOG section
        const logMatch = response.match(/LOG:\s*([\s\S]*?)$/i);
        if (!logMatch) return;

        const logText = logMatch[1];
        const logLines = logText.split('\n').filter(l => l.trim());

        logLines.forEach(line => {
            // Match time - description
            const match = line.match(/^\[?(\d{1,2}:\d{2}\s*(?:am|pm)?)\]?\s*[-–]\s*(.+)$/i);
            if (match) {
                conv.changeLog.push({
                    time: match[1],
                    text: match[2]
                });
            } else if (line.trim()) {
                // Fallback: just add the line with current time
                conv.changeLog.push({
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    text: line.trim()
                });
            }
        });
    }

    showTypingIndicator() {
        if (!this.chatContainer) return;
        const indicator = document.createElement('div');
        indicator.className = 'echo-typing';
        indicator.id = 'echo-typing-indicator';
        indicator.innerHTML = '<span>Readers are typing</span><span class="typing-dots">...</span>';
        this.chatContainer.appendChild(indicator);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    hideTypingIndicator() {
        document.getElementById('echo-typing-indicator')?.remove();
    }

    showError(message) {
        if (!this.chatContainer) return;
        const error = document.createElement('div');
        error.className = 'echo-error';
        error.textContent = message;
        this.chatContainer.appendChild(error);
    }
}
