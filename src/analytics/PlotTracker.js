/**
 * PlotTracker - AI-powered and Custom plot analysis tool
 * Combines Open Plot Points Tracker and Plot Hole Detector
 * Phase 8 + Phase 14: Custom Mode
 */

import { stripContent } from '../utils/TextUtils.js';

export class PlotTracker {
    constructor(app) {
        this.app = app;
        this.modal = document.getElementById('plot-tracker-modal');
        this.container = document.getElementById('plot-tracker-container');
        this.scanBtn = document.getElementById('btn-scan-plots');
        this.closeBtn = document.getElementById('close-plot-tracker');
        this.openBtn = document.getElementById('btn-plot-tracker');

        // Mode toggle elements
        this.modeToggle = document.getElementById('plot-tracker-mode-toggle');
        this.aiControls = document.getElementById('plot-tracker-ai-controls');
        this.customControls = document.getElementById('plot-tracker-custom-controls');

        // Add card popup elements
        this.addCardPopup = document.getElementById('add-card-popup');
        this.addCardTitleEl = document.getElementById('add-card-title');
        this.cardTitleInput = document.getElementById('card-title');
        this.cardLocationInput = document.getElementById('card-location');
        this.cardDescriptionInput = document.getElementById('card-description');
        this.severityGroup = document.getElementById('severity-group');
        this.cardSeverityInput = document.getElementById('card-severity');
        this.severityValueEl = document.getElementById('severity-value');
        this.saveCardBtn = document.getElementById('btn-save-card');
        this.cancelCardBtn = document.getElementById('btn-cancel-add-card');

        this.isScanning = false;
        this.mode = 'ai'; // 'ai' or 'custom'
        this.currentCategory = null; // 'open', 'concluded', 'holes'
        this.editingIndex = -1; // -1 means new card, >= 0 means editing

        this.bindEvents();
        this.initCustomData();
    }

    bindEvents() {
        this.openBtn?.addEventListener('click', () => this.open());
        this.closeBtn?.addEventListener('click', () => this.close());
        this.scanBtn?.addEventListener('click', () => this.scan());

        // Mode toggle
        this.modeToggle?.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
        });

        // Add card popup
        this.saveCardBtn?.addEventListener('click', () => this.saveCard());
        this.cancelCardBtn?.addEventListener('click', () => this.closeAddCardPopup());

        // Severity slider
        this.cardSeverityInput?.addEventListener('input', () => {
            if (this.severityValueEl) {
                this.severityValueEl.textContent = this.cardSeverityInput.value;
            }
        });
    }

    initCustomData() {
        // Initialize custom plot tracker data if not exists
        if (!this.app.state.customPlotTracker) {
            this.app.state.customPlotTracker = {
                openPlots: [],
                concludedPlots: [],
                plotHoles: []
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
        this.closeAddCardPopup();
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
        const data = this.app.state.plotTracker;

        if (!data || (!data.openPlots?.length && !data.concludedPlots?.length && !data.plotHoles?.length)) {
            this.container.innerHTML = `
                <div class="plot-tracker-empty">
                    <p>No plot analysis yet.</p>
                    <p>Click <strong>Scan Manuscript</strong> to analyze your story for plot lines and potential holes.</p>
                </div>
            `;
            return;
        }

        this.renderSections(data, false);
    }

    renderCustomMode() {
        const data = this.app.state.customPlotTracker || { openPlots: [], concludedPlots: [], plotHoles: [] };

        if (!data.openPlots?.length && !data.concludedPlots?.length && !data.plotHoles?.length) {
            // Show sections with add buttons even when empty
            this.renderSections(data, true);
            return;
        }

        this.renderSections(data, true);
    }

    renderSections(data, showAddButtons) {
        let html = '<div class="plot-tracker-content">';

        // Open Plot Lines
        html += this.renderSection(
            '🔓 Open Plot Lines',
            'open-plots',
            'open',
            data.openPlots || [],
            this.renderOpenPlot.bind(this),
            showAddButtons
        );

        // Concluded Plot Lines
        html += this.renderSection(
            '✅ Concluded Plot Lines',
            'concluded-plots',
            'concluded',
            data.concludedPlots || [],
            this.renderConcludedPlot.bind(this),
            showAddButtons
        );

        // Plot Holes
        html += this.renderSection(
            '⚠️ Potential Plot Holes',
            'plot-holes',
            'holes',
            data.plotHoles || [],
            this.renderPlotHole.bind(this),
            showAddButtons
        );

        html += '</div>';
        this.container.innerHTML = html;

        // Bind collapse toggles
        this.container.querySelectorAll('.plot-section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (!e.target.closest('.add-card-btn')) {
                    header.parentElement.classList.toggle('collapsed');
                }
            });
        });

        // Bind add buttons
        if (showAddButtons) {
            this.container.querySelectorAll('.add-card-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openAddCardPopup(btn.dataset.category);
                });
            });
        }

        // Bind edit/delete buttons (available in both modes)
        this.container.querySelectorAll('.plot-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.plot-card-delete')) {
                    const category = card.dataset.category;
                    const index = parseInt(card.dataset.index);
                    this.openEditCardPopup(category, index);
                }
            });
        });

        this.container.querySelectorAll('.plot-card-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteCard(btn.dataset.category, parseInt(btn.dataset.index));
            });
        });
    }

    renderSection(title, className, category, items, renderItem, showAddBtn) {
        const count = items.length;
        const addBtn = showAddBtn ? `
            <button class="add-card-btn" data-category="${category}" title="Add card">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </button>
        ` : '';

        return `
            <div class="plot-section ${className}">
                <div class="plot-section-header">
                    <span class="plot-section-title">${title}</span>
                    <span class="plot-section-count">${count}</span>
                    ${addBtn}
                    <span class="plot-section-chevron">▼</span>
                </div>
                <div class="plot-section-body">
                    ${count === 0
                ? '<p class="plot-empty-note">None found</p>'
                : items.map((item, index) => renderItem(item, index)).join('')}
                </div>
            </div>
        `;
    }

    renderOpenPlot(plot, index) {
        return `
            <div class="plot-card open-plot" data-category="open" data-index="${index}">
                <button class="plot-card-delete" data-category="open" data-index="${index}" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
                <div class="plot-card-title">📖 ${this.escapeHtml(plot.title)}</div>
                <div class="plot-card-meta">
                    <span class="plot-meta-label">Introduced:</span> ${this.escapeHtml(plot.introduced || 'Unknown')}
                </div>
                <div class="plot-card-description">${this.escapeHtml(plot.description || '')}</div>
                <div class="plot-card-hint">Click to edit</div>
            </div>
        `;
    }

    renderConcludedPlot(plot, index) {
        return `
            <div class="plot-card concluded-plot" data-category="concluded" data-index="${index}">
                <button class="plot-card-delete" data-category="concluded" data-index="${index}" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
                <div class="plot-card-title">📖 ${this.escapeHtml(plot.title)}</div>
                <div class="plot-card-meta">
                    <span class="plot-meta-label">Setup:</span> ${this.escapeHtml(plot.introduced || 'Unknown')}
                    <span class="plot-meta-arrow">→</span>
                    <span class="plot-meta-label">Resolution:</span> ${this.escapeHtml(plot.resolved || 'Unknown')}
                </div>
                <div class="plot-card-description">${this.escapeHtml(plot.summary || '')}</div>
                <div class="plot-card-hint">Click to edit</div>
            </div>
        `;
    }

    renderPlotHole(hole, index) {
        const severity = Math.min(10, Math.max(1, hole.severity || 5));
        const severityClass = severity >= 7 ? 'critical' : severity >= 4 ? 'moderate' : 'minor';

        return `
            <div class="plot-card plot-hole ${severityClass}" data-category="holes" data-index="${index}">
                <button class="plot-card-delete" data-category="holes" data-index="${index}" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
                <div class="plot-hole-severity">
                    <span class="severity-badge severity-${severityClass}">${severity}/10</span>
                    <span class="severity-label">${severityClass.toUpperCase()}</span>
                </div>
                <div class="plot-card-title">${this.escapeHtml(hole.issue)}</div>
                <div class="plot-card-meta">
                    <span class="plot-meta-label">Location:</span> ${this.escapeHtml(hole.location || 'Unknown')}
                </div>
                <div class="plot-card-description">${this.escapeHtml(hole.explanation || '')}</div>
                <div class="plot-card-hint">Click to edit</div>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===== CUSTOM MODE: ADD/EDIT CARD =====

    openAddCardPopup(category) {
        this.currentCategory = category;
        this.editingIndex = -1;
        this.renderPopup(category, null);
    }

    openEditCardPopup(category, index) {
        this.currentCategory = category;
        this.editingIndex = index;

        let data;
        if (this.mode === 'ai') {
            data = this.app.state.plotTracker;
        } else {
            data = this.app.state.customPlotTracker;
        }

        let item;
        switch (category) {
            case 'open': item = data.openPlots[index]; break;
            case 'concluded': item = data.concludedPlots[index]; break;
            case 'holes': item = data.plotHoles[index]; break;
        }

        this.renderPopup(category, item);
    }

    renderPopup(category, item) {
        this.addCardPopup?.classList.remove('hidden');

        // Set title
        const titles = {
            'open': item ? 'Edit Open Plot Line' : 'Add Open Plot Line',
            'concluded': item ? 'Edit Concluded Plot Line' : 'Add Concluded Plot Line',
            'holes': item ? 'Edit Plot Hole' : 'Add Plot Hole'
        };
        if (this.addCardTitleEl) {
            this.addCardTitleEl.textContent = titles[category] || 'Add Card';
        }

        // Show/hide resolution field for concluded plots
        let resolutionGroup = document.getElementById('resolution-group');
        if (!resolutionGroup) {
            // Create resolution group if missing (it wasn't in original HTML)
            const parent = this.cardLocationInput?.parentElement?.parentElement; // add-card-form
            if (parent) {
                const div = document.createElement('div');
                div.className = 'form-group hidden';
                div.id = 'resolution-group';
                div.innerHTML = `
                    <label>Resolution Location</label>
                    <input type="text" id="card-resolution" placeholder="e.g. Part 3 - Chapter 8" maxlength="50">
                `;
                // Insert after location group
                this.cardLocationInput.parentElement.after(div);
                resolutionGroup = div;
            }
        }

        const resolutionInput = document.getElementById('card-resolution');
        if (category === 'concluded') {
            resolutionGroup?.classList.remove('hidden');
        } else {
            resolutionGroup?.classList.add('hidden');
        }

        // Show/hide severity slider for plot holes
        if (category === 'holes') {
            this.severityGroup?.classList.remove('hidden');
        } else {
            this.severityGroup?.classList.add('hidden');
        }

        // Populate or clear form
        if (item) {
            if (this.cardTitleInput) this.cardTitleInput.value = item.title || item.issue || '';
            if (this.cardLocationInput) this.cardLocationInput.value = item.introduced || item.location || '';
            if (resolutionInput) resolutionInput.value = item.resolved || '';
            if (this.cardDescriptionInput) this.cardDescriptionInput.value = item.description || item.summary || item.explanation || '';
            if (this.cardSeverityInput) {
                this.cardSeverityInput.value = item.severity || 5;
                if (this.severityValueEl) this.severityValueEl.textContent = item.severity || 5;
            }
        } else {
            if (this.cardTitleInput) this.cardTitleInput.value = '';
            if (this.cardLocationInput) this.cardLocationInput.value = '';
            if (resolutionInput) resolutionInput.value = '';
            if (this.cardDescriptionInput) this.cardDescriptionInput.value = '';
            if (this.cardSeverityInput) this.cardSeverityInput.value = '5';
            if (this.severityValueEl) this.severityValueEl.textContent = '5';
        }

        this.cardTitleInput?.focus();
    }

    closeAddCardPopup() {
        this.addCardPopup?.classList.add('hidden');
        this.currentCategory = null;
        this.editingIndex = -1;
    }

    saveCard() {
        const title = this.cardTitleInput?.value.trim();
        if (!title) {
            alert('Please enter a title.');
            return;
        }

        const location = this.cardLocationInput?.value.trim() || '';
        const resolution = document.getElementById('card-resolution')?.value.trim() || '';
        const description = this.cardDescriptionInput?.value.trim() || '';

        // Determine which data source to update
        let data;
        if (this.mode === 'ai') {
            data = this.app.state.plotTracker;
            // Initialize if empty/missing (though unlikely if rendering)
            if (!data) {
                data = { openPlots: [], concludedPlots: [], plotHoles: [] };
                this.app.state.plotTracker = data;
            }
        } else {
            data = this.app.state.customPlotTracker;
        }

        const newItem = {};

        switch (this.currentCategory) {
            case 'open':
                newItem.title = title.substring(0, 100);
                newItem.introduced = location.substring(0, 50);
                newItem.description = description.substring(0, 500);

                if (this.editingIndex >= 0) {
                    data.openPlots[this.editingIndex] = newItem;
                } else {
                    data.openPlots.push(newItem);
                }
                break;
            case 'concluded':
                newItem.title = title.substring(0, 100);
                newItem.introduced = location.substring(0, 50);
                newItem.resolved = resolution.substring(0, 50);
                newItem.summary = description.substring(0, 500);

                if (this.editingIndex >= 0) {
                    data.concludedPlots[this.editingIndex] = newItem;
                } else {
                    data.concludedPlots.push(newItem);
                }
                break;
            case 'holes':
                newItem.severity = parseInt(this.cardSeverityInput?.value || '5');
                newItem.issue = title.substring(0, 150);
                newItem.location = location.substring(0, 100);
                newItem.explanation = description.substring(0, 1000);

                if (this.editingIndex >= 0) {
                    data.plotHoles[this.editingIndex] = newItem;
                } else {
                    data.plotHoles.push(newItem);
                }
                // Sort by severity
                data.plotHoles.sort((a, b) => b.severity - a.severity);
                break;
        }

        this.app.save();
        this.closeAddCardPopup();
        this.render();
    }

    deleteCard(category, index) {
        let data;
        if (this.mode === 'ai') {
            data = this.app.state.plotTracker;
        } else {
            data = this.app.state.customPlotTracker;
        }

        let items;
        switch (category) {
            case 'open': items = data.openPlots; break;
            case 'concluded': items = data.concludedPlots; break;
            case 'holes': items = data.plotHoles; break;
        }

        if (!items || !items[index]) return;

        const title = items[index].title || items[index].issue || 'this item';
        if (confirm(`Delete "${title}"?`)) {
            items.splice(index, 1);
            this.app.save();
            this.render();
        }
    }

    // ===== AI MODE: SCANNING =====

    async scan() {
        if (this.isScanning) return;

        this.isScanning = true;
        this.updateScanButton(true);

        try {
            const context = this.buildContext();

            if (!context.trim()) {
                alert('No manuscript content to analyze.');
                return;
            }

            const prompt = this.buildPrompt(context);

            let response = '';
            await this.app.aiService.sendMessageStream(
                [
                    { role: 'system', content: 'You are a professional story editor performing comprehensive narrative analysis. Be thorough and precise.' },
                    { role: 'user', content: prompt }
                ],
                (chunk, accumulated) => {
                    response = accumulated;
                }
            );

            const analysis = this.parseResponse(response);

            // Save to state
            this.app.state.plotTracker = {
                ...analysis,
                scannedAt: new Date().toISOString()
            };
            this.app.save();

            this.render();

        } catch (error) {
            console.error('Plot scan failed:', error);
            alert('Failed to scan manuscript: ' + error.message);
        } finally {
            this.isScanning = false;
            this.updateScanButton(false);
        }
    }

    updateScanButton(scanning) {
        if (!this.scanBtn) return;
        if (scanning) {
            this.scanBtn.disabled = true;
            this.scanBtn.innerHTML = `
                <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Analyzing...
            `;
        } else {
            this.scanBtn.disabled = false;
            this.scanBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
                Scan Manuscript
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
        return `You are a professional story editor. Perform a DEEP and THOROUGH analysis of this manuscript.

Read the ENTIRE manuscript carefully and identify:

## 1. OPEN PLOT LINES
Threads, mysteries, questions, or promises introduced but NOT yet resolved.
- Unanswered questions raised to the reader
- Character goals not yet achieved
- Conflicts not yet resolved
- Mysteries without answers
- Prophecies or foreshadowing not yet fulfilled

## 2. CONCLUDED PLOT LINES
Threads that HAVE been properly resolved or wrapped up.
- Questions answered
- Goals achieved or definitively failed
- Conflicts resolved
- Mysteries solved

## 3. POTENTIAL PLOT HOLES (with severity 1-10)
Logical inconsistencies, contradictions, or narrative problems.

Types to look for:
- **Timeline contradictions**: Events that couldn't happen in the stated order
- **Character knowledge violations**: Characters knowing things they shouldn't
- **Continuity errors**: Inconsistent details (descriptions, names, facts)
- **Missing explanations**: Important events without adequate setup
- **Impossible actions**: Things that contradict established rules/physics
- **Broken promises**: Setup without payoff, Chekhov's guns unfired

Severity Guide:
- 1-3: Minor issues most readers won't notice
- 4-6: Noticeable problems that careful readers will catch
- 7-10: Critical issues that break immersion or logic

## OUTPUT FORMAT (JSON only, no other text):
{
  "openPlots": [
    {"title": "Short title", "introduced": "Chapter X", "description": "What was set up and remains unresolved"}
  ],
  "concludedPlots": [
    {"title": "Short title", "introduced": "Chapter X", "resolved": "Chapter Y", "summary": "How it was resolved"}
  ],
  "plotHoles": [
    {"severity": 7, "issue": "Brief issue title", "location": "Chapter X, Scene Y", "explanation": "Detailed explanation of the problem and why it's an issue"}
  ]
}

Be THOROUGH. Cross-reference events across the entire manuscript. Don't miss anything important.
Output ONLY valid JSON.

MANUSCRIPT:
${context.substring(0, 80000)}`;
    }

    parseResponse(response) {
        try {
            // Find JSON object in response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('No JSON object found in response');
                return { openPlots: [], concludedPlots: [], plotHoles: [] };
            }

            const data = JSON.parse(jsonMatch[0]);

            return {
                openPlots: (data.openPlots || []).map(p => ({
                    title: String(p.title || 'Untitled').substring(0, 100),
                    introduced: String(p.introduced || '').substring(0, 50),
                    description: String(p.description || '').substring(0, 500)
                })),
                concludedPlots: (data.concludedPlots || []).map(p => ({
                    title: String(p.title || 'Untitled').substring(0, 100),
                    introduced: String(p.introduced || '').substring(0, 50),
                    resolved: String(p.resolved || '').substring(0, 50),
                    summary: String(p.summary || '').substring(0, 500)
                })),
                plotHoles: (data.plotHoles || []).map(h => ({
                    severity: Math.min(10, Math.max(1, parseInt(h.severity) || 5)),
                    issue: String(h.issue || 'Unknown issue').substring(0, 150),
                    location: String(h.location || '').substring(0, 100),
                    explanation: String(h.explanation || '').substring(0, 1000)
                })).sort((a, b) => b.severity - a.severity) // Sort by severity desc
            };
        } catch (error) {
            console.error('Failed to parse plot tracker response:', error);
            return { openPlots: [], concludedPlots: [], plotHoles: [] };
        }
    }
}
