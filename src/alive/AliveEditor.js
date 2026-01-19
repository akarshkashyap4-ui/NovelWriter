/**
 * AliveEditor - Real-time AI awareness while writing
 * Phase 7: Alive Editor features
 */

import { stripContent } from '../utils/TextUtils.js';

export class AliveEditor {
    constructor(app) {
        this.app = app;

        // Letter counters for each feature
        this.counters = { mood: 0, remarks: 0, echo: 0 };

        // Feature configurations
        this.features = {
            mood: { enabled: true, trigger: 50, icon: '🎭', label: 'Mood', pending: false },
            remarks: { enabled: false, trigger: 300, icon: '💬', label: 'Remarks', pending: false },
            echo: { enabled: false, trigger: 500, icon: '👥', label: 'Echo', pending: false }
        };

        this.currentMood = 'undetermined';
        this.moodColors = {
            tense: '#C0392B', romantic: '#E91E63', melancholic: '#5D6D7E',
            action: '#F39C12', calm: '#27AE60', mysterious: '#8E44AD',
            humorous: '#3498DB', undetermined: '#95A5A6'
        };

        // Helper to clean content for AI (strips HTML and inline suggestions)


        // UI Elements (will be null if not yet in DOM)
        this.panel = document.getElementById('alive-panel');
        this.moodIndicator = document.getElementById('mood-indicator');
        this.popup = document.getElementById('alive-popup');
        this.popupTimeout = null;

        // Load settings
        const alive = this.app.state.settings?.alive || {};
        if (alive.moodEnabled !== undefined) this.features.mood.enabled = alive.moodEnabled;
        if (alive.moodTrigger) this.features.mood.trigger = alive.moodTrigger;

        this.bindEvents();
        this.updatePanel();
    }

    bindEvents() {
        const editor = document.getElementById('editor-content');
        if (!editor) return;

        editor.addEventListener('input', (e) => {
            // Only count insertions
            if (e.inputType?.startsWith('insert')) {
                const len = e.data?.length || 1;
                this.incrementCounters(len);
            }
        });
    }

    incrementCounters(amount) {
        for (const key of Object.keys(this.features)) {
            if (this.features[key].enabled && !this.features[key].pending) {
                this.counters[key] += amount;
                if (this.counters[key] >= this.features[key].trigger) {
                    this.triggerFeature(key);
                }
            }
        }
        this.updatePanel();
    }

    async triggerFeature(feature) {
        this.features[feature].pending = true;
        this.updatePanel();

        try {
            if (feature === 'mood') await this.analyzeMood();
            if (feature === 'remarks') await this.generateRemarks();
        } catch (err) {
            console.error(`Alive ${feature} error:`, err);
        } finally {
            this.counters[feature] = 0;
            this.features[feature].pending = false;
            this.updatePanel();
        }
    }

    async analyzeMood() {
        const scene = this.app.getCurrentScene?.();
        if (!scene?.content) {
            this.currentMood = 'undetermined';
            this.updateMoodIndicator();
            return;
        }

        // Get chapter context
        let chapterContext = '';
        if (this.app.currentContext) {
            const { partId, chapterId, sceneId } = this.app.currentContext;
            const part = this.app.state.manuscript.parts.find(p => p.id === partId);
            const chapter = part?.chapters.find(c => c.id === chapterId);
            if (chapter?.scenes) {
                chapterContext = chapter.scenes
                    .filter(s => s.id !== sceneId)
                    .map(s => stripContent(s.content))
                    .join('\n\n---\n\n');
            }
        }

        const prompt = `You are analyzing the emotional mood of a specific scene.

${chapterContext ? `CHAPTER CONTEXT (other scenes in this chapter):
${chapterContext}

---

` : ''}CURRENT SCENE TO ANALYZE:
${stripContent(scene.content)}

Based on the scene above (using chapter context if provided), what is the dominant emotional mood?
Choose ONE word: tense, romantic, melancholic, action, calm, mysterious, humorous, undetermined

Respond with ONLY the mood word.`;

        try {
            const response = await this.app.aiService.sendAliveRequest(
                prompt, 'You are a literary mood analyzer. Respond with only a single word.'
            );
            // Extract first word and normalize
            const cleaned = response.toLowerCase().replace(/[^a-z\s]/g, '').trim();
            const firstWord = cleaned.split(/\s+/)[0];
            console.log('Mood response:', response, '-> parsed:', firstWord);
            this.currentMood = this.moodColors[firstWord] ? firstWord : 'undetermined';
        } catch (err) {
            console.error('Mood analysis failed:', err);
            this.currentMood = 'undetermined';
        }

        this.updateMoodIndicator();
        this.showPopupAtCursor();
    }

    showPopupAtCursor() {
        if (!this.popup) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const rect = selection.getRangeAt(0).getBoundingClientRect();
        let top = rect.top - 50;
        let left = rect.left;

        if (top < 10) top = rect.bottom + 10;
        if (left < 10) left = 10;
        if (left > window.innerWidth - 200) left = window.innerWidth - 200;

        this.popup.style.top = `${top}px`;
        this.popup.style.left = `${left}px`;

        const label = this.currentMood.charAt(0).toUpperCase() + this.currentMood.slice(1);
        this.popup.querySelector('.alive-popup-content').innerHTML = `🎭 Mood: <strong>${label}</strong>`;
        this.popup.className = `alive-popup visible mood-${this.currentMood}`;

        if (this.popupTimeout) clearTimeout(this.popupTimeout);
        this.popupTimeout = setTimeout(() => {
            this.popup.classList.remove('visible');
        }, 5000);
    }

    updatePanel() {
        if (!this.panel) return;

        let html = '';
        for (const [key, f] of Object.entries(this.features)) {
            const pct = Math.min(100, (this.counters[key] / f.trigger) * 100);
            const cls = !f.enabled ? 'disabled' : f.pending ? 'pending' : '';
            html += `<div class="alive-feature ${cls}">
                <span class="alive-icon">${f.icon}</span>
                <span class="alive-label">${f.label}</span>
                <span class="alive-counter">${f.enabled ? `${this.counters[key]}/${f.trigger}` : 'OFF'}</span>
                ${f.enabled ? `<div class="alive-progress" style="width:${pct}%"></div>` : ''}
                ${f.pending ? '<span class="alive-spinner">⟳</span>' : ''}
            </div>`;
        }
        this.panel.innerHTML = html;
    }

    updateMoodIndicator() {
        if (!this.moodIndicator) return;
        const color = this.moodColors[this.currentMood] || this.moodColors.undetermined;
        const label = this.currentMood.charAt(0).toUpperCase() + this.currentMood.slice(1);
        this.moodIndicator.innerHTML = `<span class="mood-dot" style="background:${color}"></span><span class="mood-label">${label}</span>`;
        this.moodIndicator.style.borderColor = color;
    }

    // Personality modes for Agent Remarks (with unique colors)
    remarkPersonalities = [
        { emoji: '👓', name: 'The Writer', desc: 'A seasoned author appreciating the craft', color: '#3498DB' },
        { emoji: '😲', name: 'The Fanboy', desc: 'An excited superfan reading their favorite story', color: '#E74C3C' },
        { emoji: '😤', name: 'The Critic', desc: 'A snooty literary critic who finds everything tropey', color: '#95A5A6' },
        { emoji: '🤔', name: 'The Suspicious Reader', desc: 'Someone who suspects every character and plot twist', color: '#F39C12' },
        { emoji: '💕', name: 'The Hopeless Romantic', desc: 'Only cares about ships and romantic tension', color: '#E91E63' },
        { emoji: '💥', name: 'The Action Junkie', desc: 'Wants explosions, fights, and high stakes', color: '#FF5722' }
    ];

    async generateRemarks() {
        const scene = this.app.getCurrentScene?.();
        if (!scene?.content) return;

        // Build context: current part + previous part summaries
        let partContext = '';
        let previousSummaries = '';

        if (this.app.currentContext) {
            const { partId } = this.app.currentContext;
            const parts = this.app.state.manuscript.parts || [];
            const summaries = this.app.state.summaries?.parts || {};

            // Previous part summaries
            for (const p of parts) {
                if (p.id === partId) break;
                const summary = summaries[p.id];
                if (summary) {
                    previousSummaries += `${p.title}: ${summary}\n\n`;
                }
            }

            // Current part content
            const currentPart = parts.find(p => p.id === partId);
            if (currentPart?.chapters) {
                currentPart.chapters.forEach(ch => {
                    partContext += `## ${ch.title}\n`;
                    ch.scenes?.forEach(s => {
                        partContext += stripContent(s.content) + '\n\n';
                    });
                });
            }
        }

        // Pick a random personality on OUR side (not AI) for true randomness
        const personality = this.remarkPersonalities[Math.floor(Math.random() * this.remarkPersonalities.length)];

        const prompt = `You are ${personality.name}: ${personality.desc}.

You are reading a novel-in-progress and reacting to the current scene.

${previousSummaries ? `PREVIOUS PARTS SUMMARY:\n${previousSummaries}\n---\n\n` : ''}CURRENT PART:
${partContext}

---
CURRENT SCENE (react to THIS):
${stripContent(scene.content)}

Give a SHORT reaction (max 10 words) in character as ${personality.name}.
Respond with ONLY the reaction text, nothing else.`;

        try {
            const response = await this.app.aiService.sendAliveRequest(
                prompt, `You are ${personality.name}, reacting to a story. Be brief and in character.`
            );
            console.log('Remarks response:', response);
            // Pass the full remark with emoji + response, and personality for color
            this.showRemarksPopup(`${personality.emoji} ${response}`, personality.color);
        } catch (err) {
            console.error('Remarks generation failed:', err);
        }
    }

    showRemarksPopup(remark, color = '#9B59B6') {
        if (!this.popup) return;

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const rect = selection.getRangeAt(0).getBoundingClientRect();
        let top = rect.top - 80; // Higher above cursor than mood
        let left = rect.left;

        if (top < 10) top = rect.bottom + 10;
        if (left < 10) left = 10;
        if (left > window.innerWidth - 200) left = window.innerWidth - 200;

        this.popup.style.top = `${top}px`;
        this.popup.style.left = `${left}px`;

        this.popup.querySelector('.alive-popup-content').innerHTML = remark;
        this.popup.className = 'alive-popup visible remarks-popup';
        this.popup.style.borderLeftColor = color;  // Dynamic color per personality

        if (this.popupTimeout) clearTimeout(this.popupTimeout);
        this.popupTimeout = setTimeout(() => {
            this.popup.classList.remove('visible');
        }, 5000);
    }

    updateSettings(settings) {
        if (settings.moodEnabled !== undefined) this.features.mood.enabled = settings.moodEnabled;
        if (settings.moodTrigger) this.features.mood.trigger = parseInt(settings.moodTrigger) || 50;
        if (settings.remarksEnabled !== undefined) this.features.remarks.enabled = settings.remarksEnabled;
        if (settings.remarksTrigger) this.features.remarks.trigger = parseInt(settings.remarksTrigger) || 300;
        if (settings.echoEnabled !== undefined) this.features.echo.enabled = settings.echoEnabled;
        if (settings.echoTrigger) this.features.echo.trigger = parseInt(settings.echoTrigger) || 500;
        this.updatePanel();
    }
}
