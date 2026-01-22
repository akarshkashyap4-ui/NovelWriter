/**
 * EventLine - AI-powered and Custom story event timeline visualization
 * Phase 8: Event Line feature + Phase 14: Custom Mode
 */

import { stripContent } from '../utils/TextUtils.js';

export class EventLine {
    constructor(app) {
        this.app = app;
        this.modal = document.getElementById('event-line-modal');
        this.container = document.getElementById('event-line-container');
        this.generateBtn = document.getElementById('btn-generate-events');
        this.closeBtn = document.getElementById('close-event-line');
        this.openBtn = document.getElementById('btn-event-line');

        // Mode toggle elements
        this.modeToggle = document.getElementById('event-line-mode-toggle');
        this.aiControls = document.getElementById('event-line-ai-controls');
        this.customControls = document.getElementById('event-line-custom-controls');

        // Custom mode elements
        this.addEventBtn = document.getElementById('btn-add-event');
        this.plotLinesBtn = document.getElementById('btn-plot-lines');
        this.plotLinesMenu = document.getElementById('plot-lines-menu');
        this.plotLinesList = document.getElementById('plot-lines-list');
        this.currentPlotLineName = document.getElementById('current-plot-line-name');
        this.newPlotLineBtn = document.getElementById('btn-new-plot-line');

        // Add event popup elements
        this.addEventPopup = document.getElementById('add-event-popup');
        this.addEventType = document.getElementById('add-event-type');
        this.addEventGap = document.getElementById('add-event-gap');
        this.addEventTitle = document.getElementById('add-event-title');
        this.addEventDescription = document.getElementById('add-event-description');
        this.saveEventBtn = document.getElementById('btn-save-event');
        this.popupTitle = this.addEventPopup?.querySelector('h3');
        this.cancelEventBtn = document.getElementById('btn-cancel-add-event');

        this.isGenerating = false;
        this.mode = 'ai'; // 'ai' or 'custom'
        this.currentPlotLine = 'Main Plot';

        this.editingIndex = -1; // -1 for new, >= 0 for edit
        this.insertIndex = -1; // -1 for append, >= 0 for insert at specific index

        this.bindEvents();
        this.initCustomData();
    }

    bindEvents() {
        this.openBtn?.addEventListener('click', () => this.open());
        this.closeBtn?.addEventListener('click', () => this.close());
        this.generateBtn?.addEventListener('click', () => this.generate());

        // Mode toggle
        this.modeToggle?.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
        });

        // Custom mode controls
        this.addEventBtn?.addEventListener('click', () => this.openAddEventPopup());
        this.plotLinesBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePlotLinesMenu();
        });
        this.newPlotLineBtn?.addEventListener('click', () => this.createNewPlotLine());

        // Add event popup
        this.saveEventBtn?.addEventListener('click', () => this.saveEvent());
        this.cancelEventBtn?.addEventListener('click', () => this.closeAddEventPopup());

        // Close menus on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#plot-lines-dropdown')) {
                this.plotLinesMenu?.classList.add('hidden');
            }
        });

        // Horizontal scroll with wheel (bind once)
        this.container?.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                this.container.scrollLeft += e.deltaY;
            }
        }, { passive: false });
    }

    initCustomData() {
        // Initialize custom event lines data if not exists
        if (!this.app.state.customEventLines) {
            this.app.state.customEventLines = {
                'Main Plot': { events: [], name: 'Main Plot' }
            };
        }
    }

    // ===== MODE SWITCHING =====

    setMode(mode) {
        this.mode = mode;

        // Update toggle buttons
        this.modeToggle?.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Show/hide controls
        if (mode === 'ai') {
            this.aiControls?.classList.remove('hidden');
            this.customControls?.classList.add('hidden');
        } else {
            this.aiControls?.classList.add('hidden');
            this.customControls?.classList.remove('hidden');
            this.updatePlotLineDisplay();
        }

        this.render();
    }

    // ===== MODAL CONTROLS =====

    open() {
        if (!this.modal) return;
        this.modal.classList.add('open');
        this.render();
    }

    close() {
        this.modal?.classList.remove('open');
        this.closeAddEventPopup();
    }

    // ===== RENDERING =====

    render() {
        if (this.mode === 'ai') {
            this.renderAIMode();
        } else {
            this.renderCustomMode();
        }
    }

    renderAIMode() {
        const events = this.app.state.eventLine?.events || [];

        if (events.length === 0) {
            this.container.innerHTML = `
                <div class="event-line-empty">
                    <p>No events extracted yet.</p>
                    <p>Click <strong>Generate / Update</strong> to scan your manuscript and build the event line.</p>
                </div>
            `;
            return;
        }

        // Always show delete/edit controls as requested by user for both modes
        this.renderEventTimeline(events, true);
    }

    renderCustomMode() {
        const plotLine = this.app.state.customEventLines?.[this.currentPlotLine];
        const events = plotLine?.events || [];

        if (events.length === 0) {
            this.container.innerHTML = `
                <div class="event-line-empty">
                    <p>No custom events yet.</p>
                    <p>Click <strong>Add Event</strong> to manually create events for "${this.currentPlotLine}".</p>
                </div>
            `;
            return;
        }

        this.renderEventTimeline(events, true);
    }

    renderEventTimeline(events, showDelete = false) {
        let html = `<div class="event-line-track">`;

        events.forEach((event, index) => {
            const position = index % 2 === 0 ? 'above' : 'below';
            const type = event.type || 'setup';
            const gap = event.gap || 'soon';

            // Add connector segment (not for first node)
            if (index > 0) {
                const prevType = events[index - 1].type || 'setup';
                const fromColor = this.getTypeColor(prevType);
                const toColor = this.getTypeColor(type);
                const gradientStyle = `background: linear-gradient(90deg, ${fromColor}, ${toColor});`;
                html += `<div class="event-segment gap-${gap}" style="${gradientStyle}" data-insert-index="${index}"></div>`;
            }

            const deleteBtn = showDelete ? `
                <button class="event-delete-btn" data-index="${index}" title="Delete event">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            ` : '';

            html += `
                <div class="event-node ${position} type-${type}" data-index="${index}" style="cursor: pointer;">
                    ${deleteBtn}
                    <div class="event-dot"></div>
                    <div class="event-glow"></div>
                    <div class="event-title">${event.title}</div>
                    <div class="event-popup">
                        <div class="popup-type type-${type}">${this.getTypeLabel(type)}</div>
                        <strong>${event.title}</strong>
                        <p>${event.description || 'No description'}</p>
                        ${event.gap ? `<span class="event-gap-label">${this.getGapLabel(event.gap)}</span>` : ''}
                        <div style="font-size: 10px; color: #64748b; margin-top: 4px; font-style: italic;">Click to edit</div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        this.container.innerHTML = html;

        // Add listeners for inserting events (click on segment)
        this.container.querySelectorAll('.event-segment').forEach(segment => {
            segment.style.cursor = 'cell'; // distinctive cursor
            segment.title = 'Click to insert event here';

            segment.addEventListener('click', (e) => {
                e.stopPropagation();
                const insertIndex = parseInt(segment.dataset.insertIndex);
                this.openAddEventPopup(-1, insertIndex);
            });

            // Add hover effect via JS since we can't easily add CSS right now
            segment.addEventListener('mouseenter', () => segment.style.opacity = '0.8');
            segment.addEventListener('mouseleave', () => segment.style.opacity = '1');
        });

        // Add event listeners for editing (click on node)
        this.container.querySelectorAll('.event-node').forEach(node => {
            node.addEventListener('click', (e) => {
                if (!e.target.closest('.event-delete-btn')) {
                    const index = parseInt(node.dataset.index);
                    this.openAddEventPopup(index);
                }
            });

            // Hover logic
            node.addEventListener('mouseenter', () => node.classList.add('show-popup'));
            node.addEventListener('mouseleave', () => node.classList.remove('show-popup'));
        });

        // Add delete listeners
        if (showDelete) {
            this.container.querySelectorAll('.event-delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteEvent(parseInt(btn.dataset.index));
                });
            });
        }

        // Horizontal scroll handled in bindEvents()
    }

    getTypeLabel(type) {
        const labels = {
            'none': '⚪ NONE',
            'action': '⚔️ ACTION',
            'conflict': '💢 CONFLICT',
            'chase': '🏃 CHASE',
            'reveal': '💡 REVEAL',
            'mystery': '🔍 MYSTERY',
            'decision': '⚖️ DECISION',
            'betrayal': '🗡️ BETRAYAL',
            'death': '💀 DEATH',
            'victory': '🏆 VICTORY',
            'defeat': '💥 DEFEAT',
            'emotional': '💔 EMOTIONAL',
            'calm': '🌿 CALM',
            'setup': '📍 SETUP'
        };
        return labels[type] || type.toUpperCase();
    }

    getTypeColor(type) {
        const colors = {
            'none': '#ffffff',
            'action': '#ef4444',
            'conflict': '#f97316',
            'chase': '#eab308',
            'reveal': '#ea00ff',
            'mystery': '#8b5cf6',
            'decision': '#6366f1',
            'betrayal': '#ec4899',
            'death': '#78716c',
            'victory': '#fbbf24',
            'defeat': '#64748b',
            'emotional': '#06b6d4',
            'calm': '#22c55e',
            'setup': '#3b82f6'
        };
        return colors[type] || '#888888';
    }

    getGapLabel(gap) {
        const labels = {
            'immediate': '⚡ Immediate',
            'soon': '🕐 Shortly after',
            'later': '📅 Some time later',
            'skip': '⏭️ Time skip'
        };
        return labels[gap] || gap;
    }

    // ===== CUSTOM MODE: ADD EVENT =====

    openAddEventPopup(index = -1, insertIndex = -1) {
        this.editingIndex = index;
        this.insertIndex = insertIndex;

        this.addEventPopup?.classList.remove('hidden');

        // Reset fields first (Robust Fix)
        if (this.addEventType) this.addEventType.value = 'none';
        if (this.addEventGap) this.addEventGap.value = 'soon';
        if (this.addEventTitle) this.addEventTitle.value = '';
        if (this.addEventDescription) this.addEventDescription.value = '';

        // Update title
        if (this.popupTitle) {
            this.popupTitle.textContent = index >= 0 ? 'Edit Event' : (insertIndex >= 0 ? 'Insert Event' : 'Add New Event');
        }

        if (index >= 0) {
            // Edit mode - get events from correct source based on mode
            const events = this.getCurrentEvents();
            const event = events?.[index];
            if (event) {
                if (this.addEventType) this.addEventType.value = event.type || 'none';
                if (this.addEventGap) this.addEventGap.value = event.gap || 'soon';
                if (this.addEventTitle) this.addEventTitle.value = event.title || '';
                if (this.addEventDescription) this.addEventDescription.value = event.description || '';
            }
        }

        this.addEventTitle?.focus();
    }

    // Helper to get the current events array based on mode
    getCurrentEvents() {
        if (this.mode === 'ai') {
            return this.app.state.eventLine?.events || [];
        } else {
            const plotLine = this.app.state.customEventLines?.[this.currentPlotLine];
            return plotLine?.events || [];
        }
    }

    closeAddEventPopup() {
        this.addEventPopup?.classList.add('hidden');
        this.editingIndex = -1;
        this.insertIndex = -1;
    }

    saveEvent() {
        const title = this.addEventTitle?.value.trim();
        if (!title) {
            alert('Please enter an event title.');
            return;
        }

        const event = {
            title: title.substring(0, 50),
            description: (this.addEventDescription?.value || '').trim().substring(0, 200),
            type: this.addEventType?.value || 'none',
            gap: this.addEventGap?.value || 'soon'
        };

        // Get the correct events array based on mode
        let events;
        if (this.mode === 'ai') {
            // AI mode - ensure eventLine exists
            if (!this.app.state.eventLine) {
                this.app.state.eventLine = { events: [] };
            }
            if (!this.app.state.eventLine.events) {
                this.app.state.eventLine.events = [];
            }
            events = this.app.state.eventLine.events;
        } else {
            // Custom mode
            if (!this.app.state.customEventLines[this.currentPlotLine]) {
                this.app.state.customEventLines[this.currentPlotLine] = { events: [], name: this.currentPlotLine };
            }
            events = this.app.state.customEventLines[this.currentPlotLine].events;
        }

        if (this.editingIndex >= 0) {
            // Update existing
            if (events[this.editingIndex]) {
                events[this.editingIndex] = { ...events[this.editingIndex], ...event };
                if (this.editingIndex === 0) events[this.editingIndex].gap = null; // First event always no gap
            }
        } else if (this.insertIndex >= 0) {
            // Insert at index
            if (this.insertIndex === 0) {
                event.gap = null;
                if (events.length > 0 && !events[0].gap) {
                    events[0].gap = 'soon';
                }
            }
            events.splice(this.insertIndex, 0, event);
        } else {
            // Append
            if (events.length === 0) {
                event.gap = null; // First event has no gap
            }
            events.push(event);
        }

        this.app.save();
        this.closeAddEventPopup();
        this.render();
    }

    deleteEvent(index) {
        const events = this.getCurrentEvents();
        if (!events || !events[index]) return;

        if (confirm(`Delete event "${events[index].title}"?`)) {
            events.splice(index, 1);
            // Reset first event gap if needed
            if (events.length > 0) {
                events[0].gap = null;
            }
            this.app.save();
            this.render();
        }
    }

    // ===== CUSTOM MODE: PLOT LINES MANAGEMENT =====

    togglePlotLinesMenu() {
        this.plotLinesMenu?.classList.toggle('hidden');
        if (!this.plotLinesMenu?.classList.contains('hidden')) {
            this.renderPlotLinesList();
        }
    }

    renderPlotLinesList() {
        if (!this.plotLinesList) return;

        const plotLines = Object.keys(this.app.state.customEventLines || {});
        let html = '';

        plotLines.forEach(name => {
            const isActive = name === this.currentPlotLine;
            html += `
                <div class="item-manager-item ${isActive ? 'active' : ''}" data-name="${name}">
                    <span class="item-name">${name}</span>
                    <div class="item-actions">
                        <button class="item-rename-btn" title="Rename" data-name="${name}">✏️</button>
                        ${plotLines.length > 1 ? `<button class="item-delete-btn" title="Delete" data-name="${name}">🗑️</button>` : ''}
                    </div>
                </div>
            `;
        });

        this.plotLinesList.innerHTML = html;

        // Add click handlers
        this.plotLinesList.querySelectorAll('.item-manager-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.item-actions')) {
                    this.switchPlotLine(item.dataset.name);
                }
            });
        });

        this.plotLinesList.querySelectorAll('.item-rename-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.renamePlotLine(btn.dataset.name);
            });
        });

        this.plotLinesList.querySelectorAll('.item-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePlotLine(btn.dataset.name);
            });
        });
    }

    updatePlotLineDisplay() {
        if (this.currentPlotLineName) {
            this.currentPlotLineName.textContent = this.currentPlotLine;
        }
    }

    switchPlotLine(name) {
        this.currentPlotLine = name;
        this.updatePlotLineDisplay();
        this.plotLinesMenu?.classList.add('hidden');
        this.render();
    }

    createNewPlotLine() {
        const name = prompt('Enter name for new plot line:');
        if (!name?.trim()) return;

        const trimmedName = name.trim();
        if (this.app.state.customEventLines[trimmedName]) {
            alert('A plot line with this name already exists.');
            return;
        }

        this.app.state.customEventLines[trimmedName] = { events: [], name: trimmedName };
        this.currentPlotLine = trimmedName;
        this.app.save();
        this.updatePlotLineDisplay();
        this.plotLinesMenu?.classList.add('hidden');
        this.render();
    }

    renamePlotLine(oldName) {
        const newName = prompt('Enter new name:', oldName);
        if (!newName?.trim() || newName.trim() === oldName) return;

        const trimmedName = newName.trim();
        if (this.app.state.customEventLines[trimmedName]) {
            alert('A plot line with this name already exists.');
            return;
        }

        // Move data to new key
        this.app.state.customEventLines[trimmedName] = this.app.state.customEventLines[oldName];
        this.app.state.customEventLines[trimmedName].name = trimmedName;
        delete this.app.state.customEventLines[oldName];

        // Update current if renamed
        if (this.currentPlotLine === oldName) {
            this.currentPlotLine = trimmedName;
        }

        this.app.save();
        this.updatePlotLineDisplay();
        this.renderPlotLinesList();
        this.render();
    }

    deletePlotLine(name) {
        if (!confirm(`Delete plot line "${name}" and all its events?`)) return;

        delete this.app.state.customEventLines[name];

        // Switch to another if current was deleted
        if (this.currentPlotLine === name) {
            const remaining = Object.keys(this.app.state.customEventLines);
            this.currentPlotLine = remaining[0] || 'Main Plot';
            if (remaining.length === 0) {
                this.app.state.customEventLines['Main Plot'] = { events: [], name: 'Main Plot' };
            }
        }

        this.app.save();
        this.updatePlotLineDisplay();
        this.renderPlotLinesList();
        this.render();
    }

    // ===== AI MODE: GENERATION =====

    async generate() {
        if (this.isGenerating) return;

        this.isGenerating = true;
        this.updateGenerateButton(true);

        try {
            // Build manuscript context
            const context = this.buildContext();

            if (!context.trim()) {
                alert('No manuscript content to analyze.');
                return;
            }

            // Build prompt
            const prompt = this.buildPrompt(context);

            // Call AI
            let response = '';
            await this.app.aiService.sendMessageStream(
                [
                    { role: 'system', content: 'You are a story analyst that extracts key narrative events from manuscripts.' },
                    { role: 'user', content: prompt }
                ],
                (chunk, accumulated) => {
                    response = accumulated;
                }
            );

            // Parse response
            const events = this.parseResponse(response);

            // Save to state
            this.app.state.eventLine = {
                events,
                generatedAt: new Date().toISOString()
            };
            this.app.save();

            // Re-render
            this.render();

        } catch (error) {
            console.error('Event line generation failed:', error);
            alert('Failed to generate event line: ' + error.message);
        } finally {
            this.isGenerating = false;
            this.updateGenerateButton(false);
        }
    }

    updateGenerateButton(generating) {
        if (!this.generateBtn) return;
        if (generating) {
            this.generateBtn.disabled = true;
            this.generateBtn.innerHTML = `
                <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Analyzing...
            `;
        } else {
            this.generateBtn.disabled = false;
            this.generateBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
                Generate / Update
            `;
        }
    }

    buildContext() {
        const parts = this.app.state.manuscript?.parts || [];
        let context = '';

        parts.forEach(part => {
            context += `\n=== ${part.title} ===\n`;
            part.chapters.forEach(chapter => {
                context += `\n-- ${chapter.title} --\n`;
                chapter.scenes.forEach(scene => {
                    const text = stripContent(scene.content || '');
                    if (text.trim()) {
                        context += text + '\n\n';
                    }
                });
            });
        });

        return context;
    }

    buildPrompt(context) {
        return `Analyze this manuscript and extract the KEY STORY EVENTS in chronological order.

For each event, provide:
1. A SHORT TITLE (2-5 words, action-focused)
2. A BRIEF DESCRIPTION (1-2 sentences)
3. A TYPE category (pick the BEST fit):
   - "action": Battles, fights, combat
   - "conflict": Arguments, confrontations, tension
   - "chase": Pursuits, escapes, fleeing
   - "reveal": Secrets exposed, plot twists
   - "mystery": Clues found, questions raised
   - "decision": Important choices made
   - "betrayal": Treachery, backstabbing
   - "death": Character death, major loss
   - "victory": Triumph, achievement, success
   - "defeat": Failure, setback, loss
   - "emotional": Bonding, romance, grief, internal conflict
   - "calm": Peaceful moments, rest, reflection, recovery
   - "setup": Travel, exposition, introductions, planning
4. A GAP indicator showing time to previous event:
   - "immediate" = right after
   - "soon" = same day/scene
   - "later" = days/weeks pass
   - "skip" = significant time jump

OUTPUT FORMAT (JSON array):
[
  {"title": "Event Title", "description": "What happens.", "type": "action", "gap": "immediate"},
  ...
]

RULES:
- Extract 10-30 meaningful events
- First event has no gap
- Output ONLY the JSON array

MANUSCRIPT:
${context.substring(0, 50000)}`;
    }

    parseResponse(response) {
        try {
            // Find JSON array in response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.error('No JSON array found in response');
                return [];
            }

            const events = JSON.parse(jsonMatch[0]);

            // Validate structure and include type
            const validTypes = ['action', 'conflict', 'chase', 'reveal', 'mystery', 'decision', 'betrayal', 'death', 'victory', 'defeat', 'emotional', 'calm', 'setup'];
            return events.filter(e => e.title && typeof e.title === 'string').map((e, i) => ({
                title: e.title.substring(0, 50),
                description: (e.description || '').substring(0, 200),
                type: validTypes.includes(e.type) ? e.type : 'setup',
                gap: i === 0 ? null : (e.gap || 'soon')
            }));
        } catch (error) {
            console.error('Failed to parse event line response:', error);
            return [];
        }
    }
}
