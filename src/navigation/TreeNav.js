/**
 * TreeNav - Sidebar tree navigation with Parts hierarchy
 * Book > Part > Chapter > Scene
 * Fixed: custom plot grid, auto-create subsets, book title menu
 */

import { getContextMenu } from '../components/ContextMenu.js';

export class TreeNav {
    constructor(app) {
        this.app = app;
        this.container = document.getElementById('tree-nav');
        this.filterInput = document.getElementById('filter-input');
        this.contextMenu = getContextMenu();
        this.draggedItem = null;

        // Separate storage key for UI state (not tied to project save)
        this.uiStorageKey = 'novelwriter_ui_collapse';

        // Initialize collapsed items from separate localStorage
        this.initCollapseState();

        this.bindEvents();
    }

    initCollapseState() {
        // Load from SEPARATE localStorage key (not project data)
        try {
            const saved = localStorage.getItem(this.uiStorageKey);
            const parsed = saved ? JSON.parse(saved) : {};
            // Use project-specific collapse state
            const projectId = this.app.state?.id || 'default';
            this.collapsedItems = new Set(parsed[projectId] || []);
            console.log('[TreeNav] initCollapseState - Loaded:', Array.from(this.collapsedItems));
        } catch (e) {
            console.error('[TreeNav] Failed to load collapse state:', e);
            this.collapsedItems = new Set();
        }
    }

    isCollapsed(id) {
        return this.collapsedItems.has(id);
    }

    toggleCollapse(id) {
        if (this.collapsedItems.has(id)) {
            this.collapsedItems.delete(id);
        } else {
            this.collapsedItems.add(id);
        }
        // Save to SEPARATE localStorage (NOT app.save())
        this.saveCollapseState();
    }

    saveCollapseState() {
        try {
            const projectId = this.app.state?.id || 'default';
            const saved = localStorage.getItem(this.uiStorageKey);
            const parsed = saved ? JSON.parse(saved) : {};
            parsed[projectId] = Array.from(this.collapsedItems);
            localStorage.setItem(this.uiStorageKey, JSON.stringify(parsed));
            console.log('[TreeNav] saveCollapseState - Saved:', parsed[projectId]);
        } catch (e) {
            console.error('[TreeNav] Failed to save collapse state:', e);
        }
    }

    bindEvents() {
        this.filterInput.addEventListener('input', (e) => this.filter(e.target.value));
    }

    render() {
        // Refresh collapse state from persisted storage
        this.initCollapseState();

        const state = this.app.state;

        this.container.innerHTML = `
      ${this.renderSection('MANUSCRIPT', 'manuscript', this.renderManuscript())}
      ${this.renderSection('SUMMARIES', 'summaries', this.renderSummaries())}
      ${this.renderSection('ANALYSIS', 'analysis', this.renderAnalysis())}
      ${this.renderSection('PLOT', 'plot', this.renderPlot(), true)}
      ${this.renderSection('CHARACTERS', 'characters', this.renderCharacters(), true)}
      ${this.renderSection('WORLD INFO', 'worldinfo', this.renderWorldInfo())}
    `;

        this.bindTreeEvents();
    }

    bindTreeEvents() {
        // Section headers
        this.container.querySelectorAll('.tree-section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (!e.target.closest('.tree-section-menu-btn')) {
                    const section = header.parentElement.dataset.section;
                    const sectionId = `section-${section}`;
                    this.toggleCollapse(sectionId);
                    header.parentElement.classList.toggle('collapsed');
                }
            });

            const menuBtn = header.querySelector('.tree-section-menu-btn');
            if (menuBtn) {
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const section = header.parentElement.dataset.section;
                    const rect = menuBtn.getBoundingClientRect();
                    this.showSectionMenu(section, rect.right, rect.bottom);
                });
            }
        });

        // Tree items
        this.container.querySelectorAll('.tree-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't select if clicking menu button or collapse toggle
                if (!e.target.closest('.tree-item-menu-btn') && !e.target.closest('.tree-collapse-toggle')) {
                    this.selectItem(item);
                }
            });

            const menuBtn = item.querySelector('.tree-item-menu-btn');
            if (menuBtn) {
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rect = menuBtn.getBoundingClientRect();
                    this.showItemMenu(item, rect.right, rect.bottom);
                });
            }

            // Collapse toggle handler
            const collapseToggle = item.querySelector('.tree-collapse-toggle');
            if (collapseToggle) {
                collapseToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const targetId = collapseToggle.dataset.toggle;
                    const itemType = item.dataset.type;
                    const isCollapsing = !this.isCollapsed(targetId);

                    // Toggle in state (persists)
                    this.toggleCollapse(targetId);

                    // When collapsing a Part, also collapse all its chapters
                    // This ensures re-expanding shows only chapters (scenes hidden)
                    if (isCollapsing && itemType === 'part') {
                        const part = this.app.state.manuscript.parts.find(p => p.id === targetId);
                        if (part) {
                            part.chapters.forEach(chapter => {
                                if (!this.isCollapsed(chapter.id)) {
                                    this.toggleCollapse(chapter.id);
                                }
                            });
                        }
                    }

                    // Re-render to apply all changes correctly
                    this.render();
                });
            }

            // Drag and drop
            if (item.draggable) {
                item.addEventListener('dragstart', (e) => this.handleDragStart(e, item));
                item.addEventListener('dragover', (e) => this.handleDragOver(e, item));
                item.addEventListener('drop', (e) => this.handleDrop(e, item));
                item.addEventListener('dragend', () => this.handleDragEnd());
            }
        });
    }

    // ========== DRAG & DROP ==========
    handleDragStart(e, item) {
        this.draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    handleDragOver(e, item) {
        e.preventDefault();
        if (!this.draggedItem || this.draggedItem === item) return;
        if (this.draggedItem.dataset.type !== item.dataset.type) return;

        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        item.classList.remove('drag-above', 'drag-below');
        item.classList.add(e.clientY < midY ? 'drag-above' : 'drag-below');
    }

    handleDrop(e, targetItem) {
        e.preventDefault();
        if (!this.draggedItem || this.draggedItem === targetItem) return;
        if (this.draggedItem.dataset.type !== targetItem.dataset.type) return;

        const draggedId = this.draggedItem.dataset.id;
        const targetId = targetItem.dataset.id;
        const isAbove = targetItem.classList.contains('drag-above');

        this.reorderItems(this.draggedItem.dataset.type, draggedId, targetId, isAbove);
    }

    handleDragEnd() {
        this.container.querySelectorAll('.tree-item').forEach(item => {
            item.classList.remove('dragging', 'drag-above', 'drag-below');
        });
        this.draggedItem = null;
    }

    reorderItems(type, draggedId, targetId, insertBefore) {
        const state = this.app.state;
        let items;

        if (type === 'part') {
            items = state.manuscript.parts;
        } else if (type === 'chapter') {
            const part = state.manuscript.parts.find(p => p.id === this.draggedItem.dataset.parent);
            items = part?.chapters;
        } else if (type === 'scene') {
            const part = state.manuscript.parts.find(p => p.id === this.draggedItem.dataset.grandparent);
            const chapter = part?.chapters.find(c => c.id === this.draggedItem.dataset.parent);
            items = chapter?.scenes;
        }

        if (!items) return;

        const draggedIdx = items.findIndex(i => i.id === draggedId);
        const targetIdx = items.findIndex(i => i.id === targetId);
        if (draggedIdx === -1 || targetIdx === -1) return;

        const [draggedItem] = items.splice(draggedIdx, 1);
        const newIdx = insertBefore ? targetIdx : targetIdx + 1;
        items.splice(newIdx > draggedIdx ? newIdx - 1 : newIdx, 0, draggedItem);
        items.forEach((item, i) => item.order = i);

        this.app.save();
        this.render();
    }

    // ========== RENDERING ==========
    renderSection(title, id, content, hasMenu = false) {
        const sectionId = `section-${id}`;
        const isCollapsed = this.isCollapsed(sectionId);

        const menuBtn = hasMenu ? `
      <button class="tree-section-menu-btn icon-btn icon-btn-sm" title="Options">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
        </svg>
      </button>
    ` : '';

        return `
      <div class="tree-section${isCollapsed ? ' collapsed' : ''}" data-section="${id}">
        <div class="tree-section-header">
          <svg class="tree-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
          <span class="tree-section-title">${title}</span>
          ${menuBtn}
        </div>
        <div class="tree-items">${content}</div>
      </div>
    `;
    }

    renderManuscript() {
        const state = this.app.state;
        const bookTitle = state.metadata.title || 'Untitled Book';

        let html = this.renderItem({ section: 'manuscript', id: 'book-title', type: 'book', label: bookTitle, icon: 'book' });

        state.manuscript.parts.forEach(part => {
            const partCollapsed = this.isCollapsed(part.id);
            html += this.renderItem({ section: 'manuscript', id: part.id, type: 'part', label: part.title, icon: 'part', depth: 1, draggable: true, collapsible: true, isCollapsed: partCollapsed });

            // Collapsible container for chapters (collapsed if part is collapsed)
            html += `<div class="tree-children${partCollapsed ? ' collapsed' : ''}" data-parent="${part.id}">`;

            part.chapters.forEach(chapter => {
                const chapterCollapsed = this.isCollapsed(chapter.id);
                html += this.renderItem({
                    section: 'manuscript',
                    id: chapter.id,
                    type: 'chapter',
                    label: chapter.title,
                    icon: 'file',
                    depth: 2,
                    parent: part.id,
                    draggable: true,
                    collapsible: true,
                    isCollapsed: chapterCollapsed,
                    moodArt: chapter.moodArt?.imageData
                });

                // Collapsible container for scenes (collapsed if chapter is collapsed)
                html += `<div class="tree-children${chapterCollapsed ? ' collapsed' : ''}" data-parent="${chapter.id}">`;

                chapter.scenes.forEach(scene => {
                    html += this.renderItem({ section: 'manuscript', id: scene.id, type: 'scene', label: scene.title, icon: 'doc', depth: 3, parent: chapter.id, grandparent: part.id, draggable: true });
                });

                html += `</div>`;
            });

            html += `</div>`;
        });

        return html;
    }

    renderPlot() {
        const state = this.app.state;
        let html = this.renderItem({ section: 'plot', id: 'plot-grid-default', type: 'plot-grid', label: `Plot for ${state.metadata.title}`, icon: 'grid' });

        if (state.plot.plotLines) {
            state.plot.plotLines.forEach(pl => {
                html += this.renderItem({ section: 'plot', id: pl.id, type: pl.type || 'plotline', label: pl.title, icon: pl.type === 'grid' ? 'grid' : 'list', depth: 1 });
            });
        }

        return html;
    }

    renderCharacters() {
        const characters = this.app.state.characters;
        const casts = {};
        characters.forEach(c => {
            const role = c.role || 'Other';
            if (!casts[role]) casts[role] = [];
            casts[role].push(c);
        });

        let html = '';
        Object.entries(casts).forEach(([castName, chars]) => {
            const castId = `cast-${castName.replace(/\s+/g, '-').toLowerCase()}`;
            html += this.renderItem({ section: 'characters', id: castId, type: 'cast', label: castName, icon: 'users' });
            chars.forEach(c => {
                html += this.renderItem({ section: 'characters', id: c.id, type: 'character', label: c.name, icon: 'user', depth: 1 });
            });
        });

        return html || '<div class="tree-item-empty">No casts yet</div>';
    }

    renderWorldInfo() {
        const worldInfo = this.app.state.worldInfo?.parts || {};
        const parts = this.app.state.manuscript.parts || [];

        // Get world info that exists, in part order
        const worldInfoItems = parts
            .filter(part => worldInfo[part.id])
            .map(part => ({
                id: part.id,
                title: part.displayTitle || part.title,
                isLoading: worldInfo[part.id].isLoading
            }));

        if (worldInfoItems.length === 0) {
            return '<div class="tree-item-empty">Right-click a Part → Extract Details</div>';
        }

        return worldInfoItems.map(item =>
            this.renderItem({
                section: 'worldinfo',
                id: item.id,
                type: 'worldinfo',
                label: `${item.title} World Info${item.isLoading ? ' ⏳' : ''}`,
                icon: 'globe'
            })
        ).join('');
    }

    renderSummaries() {
        const summaries = this.app.state.summaries?.parts || {};
        const parts = this.app.state.manuscript.parts || [];

        // Get summaries that exist, in part order
        const summaryItems = parts
            .filter(part => summaries[part.id])
            .map(part => ({
                partId: part.id,
                partTitle: part.displayTitle || part.title,
                wordCount: summaries[part.id].wordCount || 0
            }));

        if (summaryItems.length === 0) {
            return '<div class="tree-item-empty">No summaries yet. Right-click a Part to generate.</div>';
        }

        return summaryItems.map(item =>
            this.renderItem({
                section: 'summaries',
                id: `summary-${item.partId}`,
                type: 'summary',
                label: `${item.partTitle} Summary`,
                icon: 'summary'
            })
        ).join('');
    }

    renderAnalysis() {
        const analyses = this.app.state.analysis?.parts || {};
        const parts = this.app.state.manuscript.parts || [];

        // Get analyses that exist, in part order
        const analysisItems = parts
            .filter(part => analyses[part.id])
            .map(part => ({
                partId: part.id,
                partTitle: part.displayTitle || part.title
            }));

        if (analysisItems.length === 0) {
            return '<div class="tree-item-empty">No analyses yet. Right-click a Part to generate.</div>';
        }

        return analysisItems.map(item =>
            this.renderItem({
                section: 'analysis',
                id: `analysis-${item.partId}`,
                type: 'analysis',
                label: `${item.partTitle} Analysis`,
                icon: 'analysis'
            })
        ).join('');
    }

    renderItem({ section, id, type, label, icon, depth = 0, parent = null, grandparent = null, draggable = false, collapsible = false, isCollapsed = false, moodArt = null }) {
        const icons = {
            book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
            part: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M12 6v7"/><path d="M8 9h8"/>',
            file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>',
            doc: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13,2 13,9 20,9"/>',
            grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
            list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="2" fill="currentColor"/><circle cx="4" cy="12" r="2" fill="currentColor"/><circle cx="4" cy="18" r="2" fill="currentColor"/>',
            users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
            user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
            summary: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/>',
            analysis: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/><path d="M14 14h.01"/>',
            globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
        };

        const paddingLeft = 12 + (depth * 16);
        const parentAttr = parent ? `data-parent="${parent}"` : '';
        const grandparentAttr = grandparent ? `data-grandparent="${grandparent}"` : '';
        const collapsedClass = isCollapsed ? ' collapsed' : '';

        // Collapse toggle arrow for collapsible items
        const collapseToggle = collapsible ? `
            <svg class="tree-collapse-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-toggle="${id}">
                <path d="M9 18l6-6-6-6"/>
            </svg>
        ` : '';

        // Mood art thumbnail for chapters
        const moodArtThumb = moodArt ? `<img class="chapter-mood-thumb" src="${moodArt}" alt="Mood" />` : '';

        return `
      <div class="tree-item ${type === 'book' ? 'tree-item-book' : ''} ${collapsible ? 'tree-item-collapsible' : ''}${collapsedClass}" 
           data-section="${section}" data-id="${id}" data-type="${type}" 
           ${parentAttr} ${grandparentAttr}
           style="padding-left: ${paddingLeft}px;"
           ${draggable ? 'draggable="true"' : ''}>
        ${collapseToggle}
        ${moodArtThumb}
        <svg class="tree-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${icons[icon] || icons.doc}
        </svg>
        <span class="tree-item-label">${label}</span>
        <button class="tree-item-menu-btn" title="Options">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
      </div>
    `;
    }

    // ========== MENUS ==========
    showSectionMenu(section, x, y) {
        let items = [];
        switch (section) {
            case 'plot':
                items = [
                    { label: 'Add Plot Line', onClick: () => this.addPlotLine() },
                    { label: 'Add Plot Grid', onClick: () => this.addPlotGrid() }
                ];
                break;
            case 'characters':
                items = [{ label: 'Add Cast', onClick: () => this.addCast() }];
                break;
            case 'notes':
                items = [{ label: 'Add Note', onClick: () => this.addNote() }];
                break;
            case 'worldinfo':
                // No menu for the section header itself
                break;
        }
        if (items.length) this.contextMenu.show(x, y, items);
    }

    showItemMenu(item, x, y) {
        const type = item.dataset.type;
        const id = item.dataset.id;
        const parent = item.dataset.parent;
        const grandparent = item.dataset.grandparent;
        let items = [];

        switch (type) {
            case 'book':
                items = [
                    { label: 'Edit Title Page', onClick: () => this.app.loadBookTitlePage() },
                    { divider: true },
                    { label: 'Add Part', onClick: () => this.addPart() }
                ];
                break;
            case 'part':
                const hasSummary = this.app.state.summaries?.parts?.[id];
                const hasAnalysis = this.app.state.analysis?.parts?.[id];
                const hasWorldInfo = this.app.state.worldInfo?.parts?.[id];
                items = [
                    { label: 'Add Chapter', onClick: () => this.addChapter(id) },
                    { divider: true },
                    { label: hasSummary ? '🔄 Regenerate Summary' : '📝 Generate Summary', onClick: () => this.generatePartSummary(id) },
                    { label: hasAnalysis ? '🔄 Regenerate Analysis' : '🔍 Agent Analysis', onClick: () => this.generatePartAnalysis(id) },
                    { label: hasWorldInfo ? '🔄 Update Details' : '📖 Extract Details', onClick: () => this.generateWorldInfo(id, hasWorldInfo) },
                    ...(hasWorldInfo ? [{ label: '🗑️ Delete World Info', onClick: () => this.deleteWorldInfo(id) }] : []),
                    { divider: true },
                    { label: 'Rename', onClick: () => this.rename('part', id) },
                    { label: 'Delete', onClick: () => this.deletePart(id) }
                ];
                break;
            case 'chapter':
                const chapter = this.findChapter(id, parent);
                const hasMoodArt = !!chapter?.moodArt;
                items = [
                    { label: 'Add Scene', onClick: () => this.addScene(id, parent) },
                    { divider: true },
                    { label: hasMoodArt ? '🎨 Regenerate Mood Art' : '🎨 Generate Mood Art', onClick: () => this.generateChapterMoodArt(id, parent) },
                    { label: '🖼️ Select from Gallery', onClick: () => this.openArtGallery(id, parent) },
                    ...(hasMoodArt ? [{ label: '❌ Remove Mood Art', onClick: () => this.removeMoodArt(id, parent) }] : []),
                    { divider: true },
                    { label: 'Rename', onClick: () => this.rename('chapter', id, parent) },
                    { label: 'Delete', onClick: () => this.deleteChapter(id, parent) }
                ];
                break;
            case 'scene':
                const scene = this.findScene(id, parent, grandparent);
                const hasSuggestions = scene?.suggestions?.items?.length > 0;
                items = [
                    {
                        label: '🤖 Novel Agent', submenu: [
                            { label: '📝 Expand', onClick: () => this.generateSuggestions(id, parent, grandparent, 'expand') },
                            { label: '✂️ Shorten', onClick: () => this.generateSuggestions(id, parent, grandparent, 'shorten') },
                            { label: '💬 Improve Dialogue', onClick: () => this.generateSuggestions(id, parent, grandparent, 'dialogue') },
                            { label: '🌿 Add Sensory Details', onClick: () => this.generateSuggestions(id, parent, grandparent, 'sensory') },
                            { label: '✏️ Grammar Check', onClick: () => this.generateSuggestions(id, parent, grandparent, 'grammar') },
                            { label: '✨ Prose Improvement', onClick: () => this.generateSuggestions(id, parent, grandparent, 'prose') },
                            { label: '🔍 General Review', onClick: () => this.generateSuggestions(id, parent, grandparent, 'review') },
                            { label: '⚓ Anchor Dialogue', onClick: () => this.generateSuggestions(id, parent, grandparent, 'anchor') }
                        ]
                    },
                    ...(hasSuggestions ? [{ label: '🗑️ Clear All Suggestions', onClick: () => this.clearSuggestions(id, parent, grandparent) }] : []),
                    { divider: true },
                    { label: 'Rename', onClick: () => this.rename('scene', id, parent, grandparent) },
                    { label: 'Duplicate', onClick: () => this.duplicateScene(id, parent, grandparent) },
                    { divider: true },
                    { label: 'Delete', onClick: () => this.deleteScene(id, parent, grandparent) }
                ];
                break;
            case 'plot-grid':
            case 'grid':
                if (id === 'plot-grid-default') {
                    items = [{ label: 'View Grid', onClick: () => this.loadPlotGrid(id) }];
                } else {
                    items = [
                        { label: 'View Grid', onClick: () => this.loadPlotGrid(id) },
                        { divider: true },
                        { label: 'Rename', onClick: () => this.renamePlotItem(id) },
                        { label: 'Delete', onClick: () => this.deletePlotItem(id) }
                    ];
                }
                break;
            case 'plotline':
                items = [
                    { label: 'View', onClick: () => this.loadPlotLine(id) },
                    { label: 'Rename', onClick: () => this.renamePlotItem(id) },
                    { label: 'Delete', onClick: () => this.deletePlotItem(id) }
                ];
                break;
            case 'cast':
                items = [
                    { label: 'Add Character', onClick: () => this.addCharacter(id) },
                    { divider: true },
                    { label: 'Rename Cast', onClick: () => this.renameCast(id) },
                    { label: 'Delete Cast', onClick: () => this.deleteCast(id) }
                ];
                break;
            case 'character':
                items = [
                    { label: 'Rename', onClick: () => this.renameCharacter(id) },
                    { label: 'Delete', onClick: () => this.deleteCharacter(id) }
                ];
                break;
            case 'note':
                items = [
                    { label: 'Rename', onClick: () => this.renameNote(id) },
                    { label: 'Delete', onClick: () => this.deleteNote(id) }
                ];
                break;
            case 'worldinfo':
                items = [
                    { label: '🔄 Update Details', onClick: () => this.generateWorldInfo(id, true) },
                    { label: '🗑️ Delete World Info', onClick: () => this.deleteWorldInfo(id) }
                ];
                break;
        }

        if (items.length) this.contextMenu.show(x, y, items);
    }

    // ========== SELECTION ==========
    selectItem(itemEl) {
        this.container.querySelectorAll('.tree-item.active').forEach(i => i.classList.remove('active'));
        itemEl.classList.add('active');

        const type = itemEl.dataset.type;
        const id = itemEl.dataset.id;
        const parent = itemEl.dataset.parent;
        const grandparent = itemEl.dataset.grandparent;

        switch (type) {
            case 'book': this.app.loadBookTitlePage(); break;
            case 'part': this.app.loadPartView(id); break;
            case 'chapter': this.app.loadChapterView(parent, id); break;
            case 'scene': this.app.loadSceneView(grandparent, parent, id); break;
            case 'plot-grid':
            case 'grid':
                this.loadPlotGrid(id);
                break;
            case 'plotline': this.loadPlotLine(id); break;
            case 'cast': this.loadCast(id); break;
            case 'character': this.loadCharacter(id); break;
            case 'note': this.loadNote(id); break;
            case 'summary': this.loadSummary(id); break;
            case 'analysis': this.loadAnalysis(id); break;
            case 'worldinfo': this.loadWorldInfo(id); break;
        }
    }

    // ========== PLOT ==========
    loadPlotGrid(gridId) {
        const state = this.app.state;
        const editor = document.getElementById('editor-content');
        this.app.currentContext = { type: 'plot-grid', gridId };

        const isDefault = gridId === 'plot-grid-default';

        if (!state.plot.gridData) state.plot.gridData = {};
        if (!state.plot.gridData[gridId]) state.plot.gridData[gridId] = {};
        const gridData = state.plot.gridData[gridId];

        let html = `<div class="plot-grid-container">
      <h1 class="plot-grid-header">${isDefault ? `Plot for ${state.metadata.title}` : (state.plot.plotLines.find(p => p.id === gridId)?.title || 'Plot Grid')}</h1>
      <div class="plot-grid-view">`;

        if (isDefault) {
            // Default grid: auto-linked to manuscript
            state.manuscript.parts.forEach(part => {
                html += `<div class="plot-part-group"><div class="plot-part-header">${part.title}</div>`;
                part.chapters.forEach(chapter => {
                    html += `<div class="plot-chapter-group"><div class="plot-chapter-header">${chapter.title}</div>`;
                    chapter.scenes.forEach(scene => {
                        const points = gridData[scene.id] || [];
                        html += `<div class="plot-scene-row" data-scene="${scene.id}">
              <div class="plot-scene-name">${scene.title}</div>
              <div class="plot-points-container">
                ${points.map((p, i) => `<div class="plot-point-card" data-index="${i}" contenteditable="true">${p}</div>`).join('')}
                <button class="plot-add-point-btn" data-scene="${scene.id}">+</button>
              </div>
            </div>`;
                    });
                    html += `</div>`;
                });
                html += `</div>`;
            });
        } else {
            // Custom grid: empty, user builds manually
            if (!gridData.rows) gridData.rows = [];

            html += `<div class="custom-grid-container">
        ${gridData.rows.map((row, i) => `
          <div class="custom-grid-row" data-row="${i}">
            <div class="custom-grid-label" contenteditable="true" data-row="${i}">${row.label || 'Row ' + (i + 1)}</div>
            <div class="custom-grid-points">
              ${(row.points || []).map((p, j) => `<div class="plot-point-card" data-row="${i}" data-index="${j}" contenteditable="true">${p}</div>`).join('')}
              <button class="custom-add-point-btn" data-row="${i}">+</button>
            </div>
          </div>
        `).join('')}
        <button class="custom-add-row-btn" id="add-custom-row">+ Add Row</button>
      </div>`;
        }

        html += `</div></div>`;
        editor.innerHTML = html;

        // Bind events
        if (isDefault) {
            editor.querySelectorAll('.plot-add-point-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sceneId = btn.dataset.scene;
                    if (!gridData[sceneId]) gridData[sceneId] = [];
                    gridData[sceneId].push('Plot point');
                    this.app.save();
                    this.loadPlotGrid(gridId);
                });
            });
            editor.querySelectorAll('.plot-point-card').forEach(card => {
                card.addEventListener('blur', () => {
                    const row = card.closest('.plot-scene-row');
                    const sceneId = row.dataset.scene;
                    const index = parseInt(card.dataset.index);
                    gridData[sceneId][index] = card.textContent;
                    this.app.save();
                });
            });
        } else {
            // Custom grid events
            const addRowBtn = document.getElementById('add-custom-row');
            if (addRowBtn) {
                addRowBtn.addEventListener('click', () => {
                    if (!gridData.rows) gridData.rows = [];
                    gridData.rows.push({ label: 'New Row', points: [] });
                    this.app.save();
                    this.loadPlotGrid(gridId);
                });
            }

            editor.querySelectorAll('.custom-add-point-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const rowIdx = parseInt(btn.dataset.row);
                    if (!gridData.rows[rowIdx].points) gridData.rows[rowIdx].points = [];
                    gridData.rows[rowIdx].points.push('Point');
                    this.app.save();
                    this.loadPlotGrid(gridId);
                });
            });

            editor.querySelectorAll('.custom-grid-label').forEach(el => {
                el.addEventListener('blur', () => {
                    const rowIdx = parseInt(el.dataset.row);
                    gridData.rows[rowIdx].label = el.textContent;
                    this.app.save();
                });
            });

            editor.querySelectorAll('.plot-point-card[data-row]').forEach(card => {
                card.addEventListener('blur', () => {
                    const rowIdx = parseInt(card.dataset.row);
                    const pointIdx = parseInt(card.dataset.index);
                    gridData.rows[rowIdx].points[pointIdx] = card.textContent;
                    this.app.save();
                });
            });
        }
    }

    loadPlotLine(id) {
        const plotLine = this.app.state.plot.plotLines.find(p => p.id === id);
        if (!plotLine) return;
        this.app.currentContext = { type: 'plotline', id };

        if (!plotLine.points) plotLine.points = [];

        const editor = document.getElementById('editor-content');
        editor.innerHTML = `
      <div class="plotline-view">
        <h1 class="plotline-title">${plotLine.title}</h1>
        <div class="plotline-points">
          ${plotLine.points.map((p, i) => `
            <div class="plotline-point-card">
              <div class="plotline-point-title" contenteditable="true" data-index="${i}">${p}</div>
              <div class="plotline-point-lines"></div>
            </div>
          `).join('')}
          <button class="plotline-add-btn" id="add-plot-point">+</button>
        </div>
      </div>
    `;

        document.getElementById('add-plot-point').addEventListener('click', () => {
            plotLine.points.push('New Plot Point');
            this.app.save();
            this.loadPlotLine(id);
        });

        editor.querySelectorAll('.plotline-point-title').forEach(el => {
            el.addEventListener('blur', () => {
                plotLine.points[parseInt(el.dataset.index)] = el.textContent;
                this.app.save();
            });
        });
    }

    // ========== CHARACTERS ==========
    loadCast(castId) {
        const castName = castId.replace('cast-', '').replace(/-/g, ' ');
        const chars = this.app.state.characters.filter(c =>
            c.role.toLowerCase().replace(/\s+/g, '-') === castId.replace('cast-', '')
        );
        this.app.currentContext = { type: 'cast', castId };

        const colors = ['#4DD0E1', '#FFB74D', '#81C784', '#E57373', '#BA68C8', '#64B5F6'];
        const editor = document.getElementById('editor-content');

        editor.innerHTML = `
      <div class="cast-view">
        <h1 class="cast-title">${chars[0]?.role || castName}</h1>
        <div class="character-cards">
          ${chars.map((c, i) => `
            <div class="character-card" data-id="${c.id}">
              <div class="character-card-header">
                <div class="character-avatar" style="background: ${colors[i % colors.length]}">${c.name.charAt(0).toUpperCase()}</div>
              </div>
              <div class="character-card-body">
                <div class="character-card-name">${c.name}</div>
              </div>
            </div>
          `).join('')}
          <div class="character-card character-card-add" id="add-char-card"><span>+</span></div>
        </div>
      </div>
    `;

        editor.querySelectorAll('.character-card[data-id]').forEach(card => {
            card.addEventListener('click', () => this.loadCharacter(card.dataset.id));
        });
        document.getElementById('add-char-card').addEventListener('click', () => this.addCharacter(castId));
    }

    loadCharacter(charId) {
        const char = this.app.state.characters.find(c => c.id === charId);
        if (!char) return;
        this.app.currentContext = { type: 'character', charId };

        const editor = document.getElementById('editor-content');
        editor.innerHTML = `
      <div class="profile-editor">
        <div class="profile-field">
          <label class="profile-label">Character Name</label>
          <input class="profile-input" type="text" value="${char.name}" data-field="name">
        </div>
        <div class="profile-field">
          <label class="profile-label">Role/Cast</label>
          <input class="profile-input" type="text" value="${char.role}" data-field="role">
        </div>
        <div class="profile-field">
          <label class="profile-label">Description</label>
          <textarea class="profile-textarea" data-field="description">${char.description || ''}</textarea>
        </div>
      </div>
    `;

        editor.querySelectorAll('[data-field]').forEach(f => {
            f.addEventListener('blur', () => {
                char[f.dataset.field] = f.value;
                this.app.save();
                this.render();
            });
        });
    }

    // ========== NOTES ==========
    loadNote(noteId) {
        const note = this.app.state.notes.items.find(n => n.id === noteId);
        if (!note) return;
        this.app.currentContext = { type: 'note', noteId };

        const editor = document.getElementById('editor-content');

        editor.innerHTML = `
      <div class="note-view">
        <h1 class="note-title" contenteditable="true" id="edit-note-title">${note.title}</h1>
        <div class="note-content" contenteditable="true" id="edit-note-content">${note.content || ''}</div>
      </div>
    `;

        const contentEl = document.getElementById('edit-note-content');
        if (!note.content) {
            contentEl.dataset.placeholder = 'Write your notes here...';
            contentEl.classList.add('empty');
        }

        document.getElementById('edit-note-title').addEventListener('blur', () => {
            note.title = document.getElementById('edit-note-title').textContent.trim() || 'Untitled Note';
            this.app.save();
            this.render();
        });

        contentEl.addEventListener('input', () => {
            contentEl.classList.remove('empty');
            note.content = contentEl.innerHTML;
            this.app.save();
        });
    }

    // ========== CRUD OPERATIONS ==========
    addPart() {
        const name = prompt('Enter part name:');
        if (!name) return;

        // Auto-create with chapter and scene
        const chapterId = crypto.randomUUID();
        const sceneId = crypto.randomUUID();

        this.app.state.manuscript.parts.push({
            id: crypto.randomUUID(),
            title: name,
            displayTitle: name,
            order: this.app.state.manuscript.parts.length,
            chapters: [{
                id: chapterId,
                title: `${name} - Chapter 1`,
                displayTitle: `${name} - Chapter 1`,
                order: 0,
                scenes: [{
                    id: sceneId,
                    title: 'Scene 1',
                    content: '',
                    order: 0,
                    wordCount: 0
                }]
            }]
        });
        this.app.save();
        this.render();
    }

    addChapter(partId) {
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        if (!part) return;
        const name = prompt('Enter chapter name:');
        if (!name) return;

        // Auto-create with scene
        const sceneId = crypto.randomUUID();

        part.chapters.push({
            id: crypto.randomUUID(),
            title: name,
            displayTitle: name,
            order: part.chapters.length,
            scenes: [{
                id: sceneId,
                title: 'Scene 1',
                content: '',
                order: 0,
                wordCount: 0
            }]
        });
        this.app.save();
        this.render();
    }

    addScene(chapterId, partId) {
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        const chapter = part?.chapters.find(c => c.id === chapterId);
        if (!chapter) return;
        const name = prompt('Enter scene name:');
        if (!name) return;
        chapter.scenes.push({
            id: crypto.randomUUID(),
            title: name,
            content: '',
            order: chapter.scenes.length,
            wordCount: 0
        });
        this.app.save();
        this.render();
    }

    rename(type, id, parent = null, grandparent = null) {
        let item;
        if (type === 'part') {
            item = this.app.state.manuscript.parts.find(p => p.id === id);
        } else if (type === 'chapter') {
            const part = this.app.state.manuscript.parts.find(p => p.id === parent);
            item = part?.chapters.find(c => c.id === id);
        } else if (type === 'scene') {
            const part = this.app.state.manuscript.parts.find(p => p.id === grandparent);
            const chapter = part?.chapters.find(c => c.id === parent);
            item = chapter?.scenes.find(s => s.id === id);
        }
        if (!item) return;
        const newName = prompt('Enter new name:', item.title);
        if (newName) {
            item.title = newName;
            // Don't change displayTitle - that stays independent
            this.app.save();
            this.render();
        }
    }

    deletePart(id) {
        if (!confirm('Delete this part and all its contents?')) return;
        this.app.state.manuscript.parts = this.app.state.manuscript.parts.filter(p => p.id !== id);
        this.app.save();
        this.render();
    }

    deleteChapter(id, partId) {
        if (!confirm('Delete this chapter and all its scenes?')) return;
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        if (part) {
            part.chapters = part.chapters.filter(c => c.id !== id);
            this.app.save();
            this.render();
        }
    }

    deleteScene(id, chapterId, partId) {
        if (!confirm('Delete this scene?')) return;
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        const chapter = part?.chapters.find(c => c.id === chapterId);
        if (chapter) {
            chapter.scenes = chapter.scenes.filter(s => s.id !== id);
            this.app.save();
            this.render();
        }
    }

    duplicateScene(id, chapterId, partId) {
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        const chapter = part?.chapters.find(c => c.id === chapterId);
        const scene = chapter?.scenes.find(s => s.id === id);
        if (!scene) return;
        chapter.scenes.push({
            ...JSON.parse(JSON.stringify(scene)),
            id: crypto.randomUUID(),
            title: scene.title + ' (Copy)'
        });
        this.app.save();
        this.render();
    }

    addPlotLine() {
        const name = prompt('Enter plot line name:');
        if (!name) return;
        this.app.state.plot.plotLines.push({
            id: crypto.randomUUID(),
            title: name,
            type: 'plotline',
            points: [],
            order: this.app.state.plot.plotLines.length
        });
        this.app.save();
        this.render();
    }

    addPlotGrid() {
        const name = prompt('Enter plot grid name:');
        if (!name) return;
        const id = crypto.randomUUID();
        this.app.state.plot.plotLines.push({
            id,
            title: name,
            type: 'grid',
            order: this.app.state.plot.plotLines.length
        });
        // Initialize empty grid data
        if (!this.app.state.plot.gridData) this.app.state.plot.gridData = {};
        this.app.state.plot.gridData[id] = { rows: [] };
        this.app.save();
        this.render();
    }

    renamePlotItem(id) {
        const item = this.app.state.plot.plotLines.find(p => p.id === id);
        if (!item) return;
        const newName = prompt('Enter new name:', item.title);
        if (newName) {
            item.title = newName;
            this.app.save();
            this.render();
        }
    }

    deletePlotItem(id) {
        if (!confirm('Delete this?')) return;
        this.app.state.plot.plotLines = this.app.state.plot.plotLines.filter(p => p.id !== id);
        this.app.save();
        this.render();
    }

    addCast() {
        const name = prompt('Enter cast name:');
        if (!name) return;
        this.app.state.characters.push({
            id: crypto.randomUUID(),
            name: 'New Character',
            role: name,
            description: ''
        });
        this.app.save();
        this.render();
    }

    addCharacter(castId) {
        const existing = this.app.state.characters.find(c => c.role.toLowerCase().replace(/\s+/g, '-') === castId.replace('cast-', ''));
        const role = existing?.role || castId.replace('cast-', '').replace(/-/g, ' ');
        const name = prompt('Enter character name:');
        if (!name) return;
        this.app.state.characters.push({
            id: crypto.randomUUID(),
            name,
            role,
            description: ''
        });
        this.app.save();
        this.render();
        this.loadCast(castId);
    }

    renameCast(castId) {
        const newName = prompt('Enter new cast name:');
        if (!newName) return;
        this.app.state.characters.forEach(c => {
            if (c.role.toLowerCase().replace(/\s+/g, '-') === castId.replace('cast-', '')) {
                c.role = newName;
            }
        });
        this.app.save();
        this.render();
    }

    deleteCast(castId) {
        if (!confirm('Delete cast and all characters?')) return;
        this.app.state.characters = this.app.state.characters.filter(c =>
            c.role.toLowerCase().replace(/\s+/g, '-') !== castId.replace('cast-', '')
        );
        this.app.save();
        this.render();
    }

    renameCharacter(id) {
        const char = this.app.state.characters.find(c => c.id === id);
        if (!char) return;
        const newName = prompt('Enter new name:', char.name);
        if (newName) {
            char.name = newName;
            this.app.save();
            this.render();
        }
    }

    deleteCharacter(id) {
        if (!confirm('Delete character?')) return;
        this.app.state.characters = this.app.state.characters.filter(c => c.id !== id);
        this.app.save();
        this.render();
    }

    addNote() {
        const name = prompt('Enter note title:');
        if (!name) return;
        this.app.state.notes.items.push({
            id: crypto.randomUUID(),
            title: name,
            content: '',
            order: this.app.state.notes.items.length
        });
        this.app.save();
        this.render();
    }

    renameNote(id) {
        const note = this.app.state.notes.items.find(n => n.id === id);
        if (!note) return;
        const newName = prompt('Enter new name:', note.title);
        if (newName) {
            note.title = newName;
            this.app.save();
            this.render();
        }
    }

    deleteNote(id) {
        if (!confirm('Delete note?')) return;
        this.app.state.notes.items = this.app.state.notes.items.filter(n => n.id !== id);
        this.app.save();
        this.render();
    }

    filter(query) {
        const items = this.container.querySelectorAll('.tree-item');
        const lowerQuery = query.toLowerCase();
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(lowerQuery) || !query ? '' : 'none';
        });
    }

    // ========== SUMMARIES ==========

    /**
     * Load a summary for viewing/editing
     */
    loadSummary(summaryId) {
        const partId = summaryId.replace('summary-', '');
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        const summary = this.app.state.summaries?.parts?.[partId];

        if (!part || !summary) return;

        this.app.currentContext = { type: 'summary', partId };

        const editor = document.getElementById('editor-content');
        editor.innerHTML = `
            <div class="summary-view">
                <h1 class="summary-title">${part.displayTitle || part.title} Summary</h1>
                <p class="summary-meta">Generated: ${new Date(summary.generatedAt).toLocaleDateString()} | ${summary.wordCount} words</p>
                <div class="summary-content" contenteditable="true" id="summary-editor">${summary.content}</div>
            </div>
        `;

        // Save on blur
        const summaryEditor = document.getElementById('summary-editor');
        summaryEditor.addEventListener('blur', () => {
            const newContent = summaryEditor.innerText;
            this.app.state.summaries.parts[partId].content = newContent;
            this.app.state.summaries.parts[partId].wordCount = newContent.trim().split(/\s+/).filter(w => w).length;
            this.app.save();
        });
    }

    /**
     * Generate or regenerate a part summary
     */
    async generatePartSummary(partId) {
        const state = this.app.state;
        const parts = state.manuscript.parts || [];
        const partIndex = parts.findIndex(p => p.id === partId);

        if (partIndex === -1) return;

        // Ensure summaries object exists
        if (!state.summaries) state.summaries = { parts: {} };
        if (!state.summaries.parts) state.summaries.parts = {};

        // Enforce ordered summarization: all previous parts must have summaries
        for (let i = 0; i < partIndex; i++) {
            const prevPart = parts[i];
            if (!state.summaries.parts[prevPart.id]) {
                alert(`Please summarize "${prevPart.displayTitle || prevPart.title}" first.\n\nSummaries must be generated in order.`);
                return;
            }
        }

        // Prompt for target word count
        const targetWords = prompt('Target word count for summary:', '500');
        if (!targetWords) return;
        const targetWordCount = parseInt(targetWords) || 500;

        // Build context: previous summaries + full current part content
        const part = parts[partIndex];
        let context = '';

        // Add previous part summaries
        for (let i = 0; i < partIndex; i++) {
            const prevPart = parts[i];
            const prevSummary = state.summaries.parts[prevPart.id];
            if (prevSummary) {
                context += `## Summary of ${prevPart.displayTitle || prevPart.title}\n`;
                context += prevSummary.content + '\n\n---\n\n';
            }
        }

        // Add full content of current part
        context += `## Full Content of ${part.displayTitle || part.title} (TO BE SUMMARIZED)\n\n`;
        part.chapters?.forEach(chapter => {
            context += `### ${chapter.displayTitle || chapter.title}\n\n`;
            chapter.scenes?.forEach(scene => {
                context += `#### ${scene.title}\n`;
                context += (scene.content?.replace(/<[^>]*>/g, '') || '') + '\n\n';
            });
        });

        // Build messages for LLM
        const systemPrompt = `You are a skilled editor creating a narrative summary of ONE SPECIFIC PART of a novel.

IMPORTANT: You will be given:
1. Summaries of PREVIOUS parts (for context only - DO NOT re-summarize these)
2. The FULL CONTENT of the part you need to summarize

Your task is to summarize ONLY the part labeled "TO BE SUMMARIZED". The previous summaries are just background context so you understand the story up to this point.

Your summary should:
- Cover ONLY the events in the part being summarized
- Capture key plot points, character developments, and important events
- Be written in present tense, narrative style  
- Stay within approximately ${targetWordCount} words
- NOT include meta-commentary or formatting, just the summary text
- NOT repeat or summarize the previous parts again`;

        const userPrompt = `Please write a ${targetWordCount}-word summary of ONLY "${part.displayTitle || part.title}".

${context}

Remember: Summarize ONLY the content under "TO BE SUMMARIZED". The previous summaries are just context.

Write a clear, narrative summary of the story events in this specific part:`;

        // Show loading state
        const editor = document.getElementById('editor-content');
        const originalContent = editor.innerHTML;
        editor.innerHTML = `
            <div class="summary-generating">
                <h2>✨ Generating Summary...</h2>
                <p>Summarizing "${part.displayTitle || part.title}" (target: ~${targetWordCount} words)</p>
                <div class="loading-spinner"></div>
            </div>
        `;

        try {
            // Send to AI
            let fullResponse = '';
            await this.app.aiService.sendMessageStream(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                (chunk, accumulated) => {
                    fullResponse = accumulated;
                }
            );

            // Save the summary
            state.summaries.parts[partId] = {
                content: fullResponse.trim(),
                wordCount: fullResponse.trim().split(/\s+/).filter(w => w).length,
                generatedAt: new Date().toISOString(),
                targetWords: targetWordCount
            };

            this.app.save();
            this.render();

            // Load the summary view
            this.loadSummary(`summary-${partId}`);

        } catch (error) {
            console.error('Summary generation failed:', error);
            editor.innerHTML = originalContent;
            alert('Failed to generate summary: ' + error.message);
        }
    }

    // ========== CHAPTER MOOD ART ==========
    findChapter(chapterId, partId) {
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        if (!part) return null;
        return part.chapters.find(c => c.id === chapterId);
    }

    async generateChapterMoodArt(chapterId, partId) {
        const chapter = this.findChapter(chapterId, partId);
        if (!chapter) {
            alert('Chapter not found');
            return;
        }

        // Gather all scene content for this chapter
        const chapterContent = chapter.scenes
            .map(s => s.content?.replace(/<[^>]*>/g, '') || '')
            .join('\n\n');

        if (!chapterContent.trim()) {
            alert('Chapter has no content. Add some scenes first.');
            return;
        }

        // Check Image API
        if (!this.app.imageService.isConfigured()) {
            alert('Image API not configured. Please add settings in API Configuration.');
            return;
        }

        // Check if file storage folder is set up (requires user gesture)
        const editor = document.getElementById('editor-content');
        const originalContent = editor.innerHTML;

        if (this.app.fileStorage?.isSupported() && !(await this.app.fileStorage.hasFolder())) {
            // Show setup prompt with button (user gesture required)
            editor.innerHTML = `
                <div class="mood-art-setup">
                    <h2>📁 Setup Images Folder</h2>
                    <p>To save mood art images to your computer (instead of bloating storage), please select a folder.</p>
                    <button id="setup-images-folder-btn" class="btn btn-primary">Select Images Folder</button>
                    <button id="skip-folder-setup-btn" class="btn btn-secondary">Skip (use browser storage)</button>
                </div>
            `;

            // Wait for user to click button
            const result = await new Promise((resolve) => {
                document.getElementById('setup-images-folder-btn').addEventListener('click', async () => {
                    try {
                        await this.app.fileStorage.pickFolder();
                        resolve('selected');
                    } catch (err) {
                        console.error('Folder selection failed:', err);
                        resolve('skipped');
                    }
                });
                document.getElementById('skip-folder-setup-btn').addEventListener('click', () => {
                    resolve('skipped');
                });
            });

            if (result === 'skipped') {
                // User skipped - will fall back to base64
                console.log('[TreeNav] User skipped folder setup, using base64 fallback');
            }
        }

        // Show loading state in editor
        editor.innerHTML = `
            <div class="mood-art-generating">
                <h2>🎨 Generating Mood Art...</h2>
                <p>Analyzing "${chapter.title}" and creating visual prompt...</p>
                <div class="loading-spinner"></div>
            </div>
        `;

        try {
            // Call ImageService two-step pipeline
            const result = await this.app.imageService.generateChapterArt(chapterContent, chapter.title);

            // Save to global gallery (use styled prompt for "View Prompt" feature)
            // Note: addToGallery now saves to file automatically
            const galleryItem = await this.app.imageService.addToGallery(result.imageData, result.styledPrompt, {
                chapterId,
                chapterTitle: chapter.title,
                originalPrompt: result.prompt
            });

            // Store mood art on chapter - reuse the gallery item's file
            chapter.moodArt = {
                filename: galleryItem.filename || null,
                imageData: galleryItem.filename ? null : result.imageData,
                prompt: result.prompt,
                styledPrompt: result.styledPrompt,
                generatedAt: result.generatedAt
            };

            this.app.save();
            this.render();

            // Show success with the generated art
            editor.innerHTML = `
                <div class="mood-art-result">
                    <h2>🎨 Mood Art Generated!</h2>
                    <div class="mood-art-preview">
                        <img src="${result.imageData}" alt="Chapter Mood Art" />
                    </div>
                    <div class="mood-art-prompt">
                        <strong>Generated Prompt:</strong>
                        <p>${result.styledPrompt}</p>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Mood art generation failed:', error);
            editor.innerHTML = originalContent;
            alert('Failed to generate mood art: ' + error.message);
        }
    }

    removeMoodArt(chapterId, partId) {
        const chapter = this.findChapter(chapterId, partId);
        if (chapter && chapter.moodArt) {
            if (confirm('Remove mood art from this chapter?')) {
                // Delete file if file-based
                if (chapter.moodArt.filename && this.app.fileStorage) {
                    this.app.fileStorage.deleteImage(chapter.moodArt.filename).catch(() => { });
                }
                delete chapter.moodArt;
                this.app.save();
                this.render();
                // Refresh chapter view if active
                if (this.app.currentContext?.chapterId === chapterId) {
                    this.app.loadChapterView(partId, chapterId);
                }
            }
        }
    }

    openArtGallery(chapterId, partId) {
        const chapter = this.findChapter(chapterId, partId);
        if (!chapter) return;

        const modal = document.getElementById('image-gallery-modal');
        const grid = document.getElementById('gallery-grid');
        const closeBtn = document.getElementById('close-image-gallery');
        const gallery = this.app.imageService.getGallery();

        // Close modal helper
        const closeModal = () => {
            modal.classList.remove('open');
            grid.innerHTML = '';
        };

        const renderGallery = async () => {
            const galleryItems = this.app.imageService.getGallery();
            if (galleryItems.length === 0) {
                grid.innerHTML = '<div class="gallery-empty">No images generated yet.</div>';
                return;
            }

            // Render placeholders first
            grid.innerHTML = galleryItems.map(item => `
                <div class="gallery-item" data-id="${item.id}">
                    <img src="" alt="Mood Art" loading="lazy" class="gallery-img" data-image-id="${item.id}" style="min-height: 100px; background: var(--bg-tertiary);">
                    <div class="gallery-item-info">
                        ${new Date(item.timestamp).toLocaleDateString()}
                    </div>
                    <div class="gallery-item-menu-btn" title="Options">⋮</div>
                    <div class="gallery-item-menu">
                        <div class="gallery-menu-option view-prompt" data-id="${item.id}">👀 View Prompt</div>
                        <div class="gallery-menu-option delete-image" data-id="${item.id}">🗑️ Delete</div>
                    </div>
                </div>
            `).join('');

            // Load images async
            for (const item of galleryItems) {
                const imgEl = grid.querySelector(`img[data-image-id="${item.id}"]`);
                if (imgEl) {
                    try {
                        const imageData = await this.app.imageService.loadGalleryImage(item);
                        if (imageData) {
                            imgEl.src = imageData;
                        }
                    } catch (err) {
                        console.error('Failed to load gallery image:', err);
                    }
                }
            }

            // Add click handlers for selection (on image)
            grid.querySelectorAll('.gallery-img').forEach(img => {
                img.addEventListener('click', async (e) => {
                    const id = e.target.closest('.gallery-item').dataset.id;
                    const item = galleryItems.find(i => i.id === id);
                    if (item) {
                        // Load the image data if needed
                        const imageData = await this.app.imageService.loadGalleryImage(item);
                        chapter.moodArt = {
                            imageData: item.filename ? null : imageData, // Don't store base64 if file-based
                            filename: item.filename || null,
                            prompt: item.meta?.originalPrompt || item.prompt,
                            styledPrompt: item.prompt,
                            generatedAt: item.timestamp
                        };
                        this.app.save();
                        this.render();
                        if (this.app.currentContext?.chapterId === chapterId) {
                            this.app.loadChapterView(partId, chapterId);
                        }
                        closeModal();
                    }
                });
            });

            // Menu handlers
            grid.querySelectorAll('.gallery-item-menu-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close other menus
                    grid.querySelectorAll('.gallery-item.show-menu').forEach(el => {
                        if (el !== e.target.closest('.gallery-item')) el.classList.remove('show-menu');
                    });
                    e.target.closest('.gallery-item').classList.toggle('show-menu');
                });
            });

            // View Prompt handler
            grid.querySelectorAll('.view-prompt').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = e.target.dataset.id;
                    const item = galleryItems.find(i => i.id === id);
                    if (item) {
                        alert(`Prompt:\n\n${item.prompt}`);
                    }
                    e.target.closest('.gallery-item').classList.remove('show-menu');
                });
            });

            // Delete handler
            grid.querySelectorAll('.delete-image').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = e.target.dataset.id;
                    if (confirm('Delete image from gallery?')) {
                        this.app.imageService.removeFromGallery(id);
                        renderGallery(); // Re-render
                    }
                });
            });
        };

        renderGallery();

        // Close menus when clicking elsewhere
        grid.onclick = (e) => {
            if (!e.target.closest('.gallery-item-menu-btn')) {
                grid.querySelectorAll('.gallery-item.show-menu').forEach(el => el.classList.remove('show-menu'));
            }
        };

        // Bind closing events
        closeBtn.onclick = closeModal;
        modal.querySelector('.modal-backdrop').onclick = closeModal;

        modal.classList.add('open');
    }

    // ========== SCENE SUGGESTIONS ==========
    findScene(sceneId, chapterId, partId) {
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        if (!part) return null;
        const chapter = part.chapters.find(c => c.id === chapterId);
        if (!chapter) return null;
        return chapter.scenes.find(s => s.id === sceneId);
    }

    async generateSuggestions(sceneId, chapterId, partId, suggestionType) {
        const scene = this.findScene(sceneId, chapterId, partId);
        if (!scene) {
            alert('Scene not found');
            return;
        }

        const content = scene.content?.replace(/<[^>]*>/g, '') || '';
        if (!content.trim()) {
            alert('Scene is empty. Add some content first.');
            return;
        }

        // Check API
        if (!this.app.aiService.isConfigured()) {
            alert('API not configured. Please add your API key in settings.');
            return;
        }

        // Prompt templates per type
        const prompts = {
            expand: 'Look for areas where the scene could be expanded with more description, detail, or depth.',
            shorten: 'Look for areas that are overly verbose or could be trimmed while keeping the essence.',
            dialogue: 'Focus on dialogue - suggest improvements for naturalness, subtext, and character voice.',
            sensory: 'Look for opportunities to add sensory details (sight, sound, smell, touch, taste).',
            grammar: 'Check for grammar, punctuation, and syntax issues.',
            prose: 'Suggest improvements to prose style, word choice, and sentence variety.',
            review: 'Provide a general review covering pacing, clarity, engagement, and any issues.',
            anchor: `Analyze dialogue for ANCHORING issues. A line is unanchored when:
1. The previous line was spoken by a different character, AND
2. There is no action, POV cue, spatial cue, or established alternation, AND
3. Multiple characters could plausibly speak it

For EACH unanchored line, suggest a contextual anchor using:
- Character action (fidgeting, drinking, looking away)
- Spatial context (position in room, proximity to objects)
- POV character's observation of the speaker
- Character-specific mannerisms from context
- Emotional state cues

IMPORTANT: Number suggestions SEQUENTIALLY (S1, S2, S3, S4...). Do NOT skip numbers.

DO NOT suggest "he said" / "she said". Suggest GRRM-style anchors like:
"Tyrion swirled his wine. 'That depends.'"
"From the doorway, Cersei's voice cut through. 'You're too late.'"`
        };

        const typeLabels = {
            expand: 'Expand', shorten: 'Shorten', dialogue: 'Improve Dialogue',
            sensory: 'Add Sensory Details', grammar: 'Grammar Check', prose: 'Prose Improvement', review: 'General Review',
            anchor: 'Anchor Dialogue'
        };

        const systemPrompt = `You are an editorial assistant. Analyze a scene and provide suggestions.

INSTRUCTIONS:
1. Return the ORIGINAL text with suggestions inserted
2. Use format: [S1: note], [S2: note], etc.
3. Number by importance: S1 = most impactful
4. In your suggestions, mark key words with **asterisks** for emphasis

TWO TYPES OF SUGGESTIONS:
- INLINE: Insert after the specific sentence it applies to
- GENERAL: Put at the very end after "---" for overall pacing, structure, or theme feedback

EXAMPLE OUTPUT:
John walked home. [S1: Describe his **emotional state** or **physical weariness**.] The night was dark. [S2: Add **sensory details** - sounds, smells.]

---
[S3: Consider adding **internal monologue** to increase reader connection.]

Your task: ${prompts[suggestionType]}`;

        const userPrompt = `Analyze this scene for "${typeLabels[suggestionType]}":

${content}

Provide 4-6 suggestions:
- Inline suggestions: right after the sentence they apply to
- General suggestions: at the end after "---" for overall feedback

Return the full text with suggestions:`;

        // Show loading
        const editor = document.getElementById('editor-content');
        const originalEditorContent = editor.innerHTML;
        editor.innerHTML = `
            <div class="suggestion-generating">
                <h2>🤖 Analyzing Scene...</h2>
                <p>${typeLabels[suggestionType]} suggestions for "${scene.title}"</p>
                <div class="loading-spinner"></div>
            </div>
        `;

        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            let fullResponse = '';
            await this.app.aiService.sendMessageStream(
                messages,
                (chunk, accumulated) => { fullResponse = accumulated; }
            );

            // DEBUG: Log raw AI response
            console.log('=== RAW AI RESPONSE ===');
            console.log(fullResponse);
            console.log('=== END RAW RESPONSE ===');

            // Parse suggestions from response
            const suggestions = this.parseSuggestions(fullResponse);

            // DEBUG: Log parsed suggestions
            console.log('=== PARSED SUGGESTIONS ===');
            console.log(suggestions);
            console.log('=== END PARSED ===');

            // Store BOTH the annotated text AND individual suggestions
            scene.suggestions = {
                type: suggestionType,
                annotatedText: fullResponse, // Full text with inline [S#: ...] blocks
                items: suggestions,
                generatedAt: new Date().toISOString()
            };

            this.app.save();

            // Re-load the scene to show suggestions
            this.selectItem(this.container.querySelector(`[data-id="${sceneId}"]`));

        } catch (error) {
            console.error('Suggestion generation failed:', error);
            editor.innerHTML = originalEditorContent;
            alert('Failed to generate suggestions: ' + error.message);
        }
    }

    parseSuggestions(responseText) {
        const suggestions = [];
        // Use a more robust regex that handles nested brackets/quotes
        // Match [S#: ...] where content can include anything except ]
        // followed by end-of-suggestion markers (newline, period+space, or end)
        const regex = /\[S(\d+):\s*((?:[^\[\]]|\[[^\]]*\])*)\]/g;
        let match;

        while ((match = regex.exec(responseText)) !== null) {
            suggestions.push({
                id: `s${match[1]}`,
                number: parseInt(match[1]),
                text: match[2].trim(),
                position: match.index
            });
        }

        return suggestions;
    }

    clearSuggestions(sceneId, chapterId, partId) {
        const scene = this.findScene(sceneId, chapterId, partId);
        if (scene) {
            // Delete suggestion data
            delete scene.suggestions;

            // Also strip any suggestion elements that may have been baked into scene.content
            if (scene.content) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = scene.content;
                tempDiv.querySelectorAll('.suggestion-inline, .suggestion-view-header, .suggestion-panel').forEach(el => el.remove());
                scene.content = tempDiv.innerHTML;
            }

            this.app.save();
            // Re-load scene
            this.selectItem(this.container.querySelector(`[data-id="${sceneId}"]`));
        }
    }

    // ========== PART ANALYSIS ==========
    async generatePartAnalysis(partId) {
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        if (!part) {
            alert('Part not found.');
            return;
        }

        // Build full manuscript content for context (strip HTML and suggestion markers)
        let manuscriptContent = '';
        let partContent = '';
        let sceneMap = {}; // Map scene titles to IDs for clickable links

        this.app.state.manuscript.parts.forEach(p => {
            const partTitle = p.displayTitle || p.title;
            manuscriptContent += `\n\n=== ${partTitle} ===\n\n`;

            p.chapters?.forEach(c => {
                manuscriptContent += `## ${c.title}\n\n`;
                c.scenes?.forEach(s => {
                    // Strip HTML and suggestion markers
                    let content = s.content?.replace(/<[^>]*>/g, ' ') || '';
                    content = content.replace(/\[S\d+:[^\]]+\]/g, ''); // Remove [S1: ...] markers
                    content = content.replace(/\s+/g, ' ').trim();

                    manuscriptContent += `### ${s.title}\n${content}\n\n`;

                    // Build scene map for the analyzed part
                    if (p.id === partId) {
                        const sceneKey = `${c.title}|${s.title}`;
                        sceneMap[sceneKey] = { sceneId: s.id, chapterId: c.id, partId: p.id };
                        partContent += `## ${c.title} > ${s.title}\n${content}\n\n`;
                    }
                });
            });
        });

        if (!partContent.trim()) {
            alert('This part has no content to analyze.');
            return;
        }

        const partTitle = part.displayTitle || part.title;

        // Initialize loading state
        if (!this.app.state.analysis) this.app.state.analysis = { parts: {} };
        this.app.state.analysis.parts[partId] = {
            isLoading: true,
            partTitle: partTitle,
            generatedAt: new Date().toISOString()
        };
        this.app.save();

        // Update tree and switch view immediately
        this.render();
        this.loadAnalysis(`analysis-${partId}`);

        // Build the comprehensive analysis prompt
        const systemPrompt = `You are a STRICT, UNCOMPROMISING manuscript editor at a top-tier publishing house. Your job is to provide HONEST, CRITICAL analysis. Writers come to you because they want the HARD TRUTH, not empty praise.

## RATING STANDARDS (BE HARSH)
- **10/10**: Masterpiece. Publishable as-is. You would rarely give this.
- **8-9/10**: Excellent. Minor polish needed. Reserved for genuinely strong work.
- **6-7/10**: Good foundation with notable issues that need fixing.
- **4-5/10**: Average/mediocre. Typical for early drafts. Multiple significant problems.
- **2-3/10**: Weak. Fundamental issues with craft. Needs major revision.
- **1/10**: Severe problems throughout. Back to the drawing board.

Most early-draft manuscripts should score in the 3-6 range. DO NOT inflate scores. If it reads like a first draft, rate it like a first draft.

## CRITICAL GUIDELINES
1. **CALL OUT EVERY WEAKNESS** - Do not hold back. If dialogue is stilted, say so. If pacing drags, point it out. If characters feel flat, be direct.
2. **NO SUGARCOATING** - Don't soften criticism with excessive praise. Be direct and professional.
3. **SPECIFIC REFERENCES** - Always cite specific scenes: "In Chapter X > Scene Y, the dialogue feels..."
4. **ACTIONABLE FEEDBACK** - Every criticism must come with concrete suggestions for improvement.
5. **STRENGTHS ONLY IF GENUINE** - Don't manufacture strengths to "balance" criticism. Empty praise is useless.
6. **ASSUME NOTHING IS BEYOND CRITIQUE** - Even good elements can be improved.

Your analysis must be USEFUL, not COMFORTABLE. The writer wants to improve, not feel good.

You must return your analysis in the following JSON structure:
{
  "characterVoice": {
    "rating": 5,
    "strengths": ["Only genuine strengths with scene references - can be empty"],
    "weaknesses": ["Every issue you find - be thorough"],
    "keyFeedback": ["Specific, actionable fixes"],
    "review": "Honest assessment - don't soften it"
  },
  "pacing": {
    "rating": 4,
    "strengths": ["..."],
    "weaknesses": ["..."],
    "keyFeedback": ["..."],
    "review": "..."
  },
  "consistency": {
    "rating": 6,
    "strengths": ["..."],
    "weaknesses": ["..."],
    "keyFeedback": ["..."],
    "review": "..."
  },
  "showVsTell": {
    "rating": 4,
    "strengths": ["..."],
    "weaknesses": ["..."],
    "keyFeedback": ["..."],
    "review": "..."
  },
  "writingStyle": {
    "passiveVoicePercent": 25,
    "adverbUsage": "overused",
    "sentenceVariety": "poor",
    "readabilityScore": "Grade 8",
    "strengths": ["..."],
    "weaknesses": ["..."],
    "review": "..."
  },
  "overall": {
    "rating": 5,
    "summary": "Blunt, honest overview - what's the real state of this manuscript?",
    "topPriorities": ["The biggest problem to fix first", "Second priority", "Third priority"],
    "finalNotes": "Honest closing - what does the writer NEED to hear?"
  }
}

When referencing scenes, ALWAYS use the format: "In [Chapter Title] > [Scene Title]..." so the writer can easily navigate there.`;

        const userPrompt = `Please analyze this part of my novel manuscript: "${partTitle}"

Here is the FULL MANUSCRIPT for context (so you understand the overall story):
${manuscriptContent}

---

Here is the SPECIFIC PART to analyze in detail:
${partContent}

Please provide a comprehensive analysis covering:
1. Character Voice Analysis - Do characters sound distinct? Is dialogue authentic?
2. Pacing Analysis - Is the pacing appropriate? Any rushed or slow sections?
3. Consistency Check - Any continuity issues with characters, timeline, or settings?
4. Show vs Tell Analysis - Are emotions and actions shown or just told?
5. Writing Style Report - Passive voice, adverbs, sentence variety, readability?

Return your analysis as a JSON object following the exact structure specified.`;

        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            let fullResponse = '';
            await this.app.aiService.sendMessageStream(
                messages,
                (chunk, accumulated) => {
                    fullResponse = accumulated;
                    // Could update loading text here if we wanted streaming updates
                }
            );

            // Parse the JSON response
            const analysis = this.parseAnalysisResponse(fullResponse, partId, partTitle, sceneMap);

            // Store the analysis
            if (!this.app.state.analysis) this.app.state.analysis = { parts: {} };
            this.app.state.analysis.parts[partId] = {
                generatedAt: new Date().toISOString(),
                partTitle: partTitle,
                sceneMap: sceneMap,
                ...analysis
            };

            this.app.save();

            // Refresh view
            this.loadAnalysis(`analysis-${partId}`);

            // Re-render tree (just in case title changed or something, though not needed really)
            this.render();

        } catch (error) {
            console.error('Analysis generation failed:', error);
            alert('Analysis generation failed: ' + error.message);

            // Clear loading state
            if (this.app.state.analysis?.parts?.[partId]) {
                delete this.app.state.analysis.parts[partId];
                this.app.save();
                this.render();
            }
        }
    }

    parseAnalysisResponse(response, partId, partTitle, sceneMap) {
        try {
            // Extract JSON from response (handle markdown code blocks)
            let jsonStr = response;
            const jsonMatch = response.match(/```json?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            } else {
                // Try to find JSON object directly
                const startIdx = response.indexOf('{');
                const endIdx = response.lastIndexOf('}');
                if (startIdx !== -1 && endIdx !== -1) {
                    jsonStr = response.substring(startIdx, endIdx + 1);
                }
            }

            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('Failed to parse analysis JSON:', error);
            // Return a fallback structure with the raw response
            return {
                parseError: true,
                rawResponse: response,
                characterVoice: { rating: 0, strengths: [], weaknesses: [], keyFeedback: [], review: 'Parse error' },
                pacing: { rating: 0, strengths: [], weaknesses: [], keyFeedback: [], review: 'Parse error' },
                consistency: { rating: 0, strengths: [], weaknesses: [], keyFeedback: [], review: 'Parse error' },
                showVsTell: { rating: 0, strengths: [], weaknesses: [], keyFeedback: [], review: 'Parse error' },
                writingStyle: { strengths: [], weaknesses: [], review: 'Parse error' },
                overall: { rating: 0, summary: 'Analysis parsing failed. Raw response saved.', topPriorities: [], finalNotes: '' }
            };
        }
    }

    // Load analysis into editor
    loadAnalysis(analysisId) {
        // ID format: analysis-{partId}
        const partId = analysisId.replace('analysis-', '');
        const analysis = this.app.state.analysis?.parts?.[partId];
        const editor = document.getElementById('editor-content');

        if (!analysis || !editor) return;

        // Set context
        this.app.currentContext = { type: 'analysis', analysisId, partId };

        // Handle loading state
        if (analysis.isLoading) {
            editor.innerHTML = `
                <div class="analysis-loading-container">
                    <div class="loading-spinner large"></div>
                    <h2>Analyzing "${analysis.partTitle}"...</h2>
                    <p class="loading-hint">The AI is reviewing character voices, pacing, consistency, and style. This allows for deep insights but takes about a minute.<br>You can switch to other documents while this runs background.</p>
                </div>
            `;
            return;
        }

        const renderStars = (rating) => {
            const filled = Math.round(rating);
            const empty = 10 - filled;
            return '⭐'.repeat(filled) + '☆'.repeat(empty);
        };

        const renderList = (items, className = '') => {
            if (!items || items.length === 0) return '<p class="analysis-none">None identified</p>';
            return `<ul class="${className}">${items.map(i => `<li>${this.linkifySceneReferences(i, analysis.sceneMap)}</li>`).join('')}</ul>`;
        };

        const renderCategory = (title, icon, data) => {
            return `
                <div class="analysis-category">
                    <div class="analysis-category-header">
                        <span class="analysis-category-icon">${icon}</span>
                        <span class="analysis-category-title">${title}</span>
                        <span class="analysis-rating" title="${data.rating}/10">${renderStars(data.rating)}</span>
                    </div>
                    <div class="analysis-category-body">
                        ${data.strengths?.length ? `<div class="analysis-subsection"><strong>✅ Strengths</strong>${renderList(data.strengths, 'analysis-strengths')}</div>` : ''}
                        ${data.weaknesses?.length ? `<div class="analysis-subsection"><strong>⚠️ Areas for Improvement</strong>${renderList(data.weaknesses, 'analysis-weaknesses')}</div>` : ''}
                        ${data.keyFeedback?.length ? `<div class="analysis-subsection"><strong>💡 Key Feedback</strong>${renderList(data.keyFeedback, 'analysis-feedback')}</div>` : ''}
                        <div class="analysis-review">${this.linkifySceneReferences(data.review || '', analysis.sceneMap)}</div>
                    </div>
                </div>
            `;
        };

        const writingStyleHtml = `
            <div class="analysis-category">
                <div class="analysis-category-header">
                    <span class="analysis-category-icon">📊</span>
                    <span class="analysis-category-title">Writing Style Report</span>
                </div>
                <div class="analysis-category-body">
                    <div class="analysis-metrics">
                        ${analysis.writingStyle?.passiveVoicePercent !== undefined ? `<span class="metric"><strong>Passive Voice:</strong> ${analysis.writingStyle.passiveVoicePercent}%</span>` : ''}
                        ${analysis.writingStyle?.adverbUsage ? `<span class="metric"><strong>Adverb Usage:</strong> ${analysis.writingStyle.adverbUsage}</span>` : ''}
                        ${analysis.writingStyle?.sentenceVariety ? `<span class="metric"><strong>Sentence Variety:</strong> ${analysis.writingStyle.sentenceVariety}</span>` : ''}
                        ${analysis.writingStyle?.readabilityScore ? `<span class="metric"><strong>Readability:</strong> ${analysis.writingStyle.readabilityScore}</span>` : ''}
                    </div>
                    ${analysis.writingStyle?.strengths?.length ? `<div class="analysis-subsection"><strong>✅ Strengths</strong>${renderList(analysis.writingStyle.strengths, 'analysis-strengths')}</div>` : ''}
                    ${analysis.writingStyle?.weaknesses?.length ? `<div class="analysis-subsection"><strong>⚠️ Areas for Improvement</strong>${renderList(analysis.writingStyle.weaknesses, 'analysis-weaknesses')}</div>` : ''}
                    <div class="analysis-review">${this.linkifySceneReferences(analysis.writingStyle?.review || '', analysis.sceneMap)}</div>
                </div>
            </div>
        `;

        const overallHtml = `
            <div class="analysis-overall">
                <div class="analysis-overall-header">
                    <span>📋 OVERALL ASSESSMENT</span>
                    <span class="analysis-rating-large" title="${analysis.overall?.rating || 0}/10">${renderStars(analysis.overall?.rating || 0)} (${analysis.overall?.rating || 0}/10)</span>
                </div>
                <div class="analysis-overall-body">
                    <div class="analysis-summary">${this.linkifySceneReferences(analysis.overall?.summary || '', analysis.sceneMap)}</div>
                    ${analysis.overall?.topPriorities?.length ? `
                        <div class="analysis-priorities">
                            <strong>🎯 Top Priorities:</strong>
                            <ol>${analysis.overall.topPriorities.map(p => `<li>${this.linkifySceneReferences(p, analysis.sceneMap)}</li>`).join('')}</ol>
                        </div>
                    ` : ''}
                    ${analysis.overall?.finalNotes ? `<div class="analysis-final-notes">${this.linkifySceneReferences(analysis.overall.finalNotes, analysis.sceneMap)}</div>` : ''}
                </div>
            </div>
        `;

        editor.innerHTML = `
            <div class="analysis-report-container">
                <div class="analysis-header main-view-header">
                    <h1>📊 ${analysis.partTitle} Analysis</h1>
                    <span class="analysis-timestamp">Generated: ${new Date(analysis.generatedAt).toLocaleString()}</span>
                </div>

                <div class="analysis-report-content">
                    ${renderCategory('Character Voice Analysis', '🎭', analysis.characterVoice || {})}
                    ${renderCategory('Pacing Analysis', '⏱️', analysis.pacing || {})}
                    ${renderCategory('Consistency Check', '🔍', analysis.consistency || {})}
                    ${renderCategory('Show vs Tell Analysis', '👁️', analysis.showVsTell || {})}
                    ${writingStyleHtml}
                    ${overallHtml}
                </div>
            </div>
        `;

        // Bind click handlers for scene links
        editor.querySelectorAll('.scene-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const { sceneId, chapterId, partId } = link.dataset;
                if (sceneId && chapterId && partId) {
                    this.app.loadSceneView(partId, chapterId, sceneId);
                    // Tree nav update is handled by loadSceneView and selectItem
                }
            });
        });
    }

    // Linkify helper remains the same
    linkifySceneReferences(text, sceneMap) {
        if (!text || !sceneMap) return text;

        let result = text;

        Object.keys(sceneMap).forEach(key => {
            const [chapterTitle, sceneTitle] = key.split('|');
            const sceneData = sceneMap[key];

            const patterns = [
                new RegExp(`${chapterTitle}\\s*>\\s*${sceneTitle}`, 'gi'),
                new RegExp(`\\[${chapterTitle}\\]\\s*>\\s*\\[${sceneTitle}\\]`, 'gi'),
                new RegExp(`"${chapterTitle}\\s*>\\s*${sceneTitle}"`, 'gi')
            ];

            patterns.forEach(pattern => {
                result = result.replace(pattern, (match) => {
                    return `<a href="#" class="scene-link" data-scene-id="${sceneData.sceneId}" data-chapter-id="${sceneData.chapterId}" data-part-id="${sceneData.partId}">${match}</a>`;
                });
            });
        });

        return result;
    }

    // ========== WORLD INFO ==========

    async generateWorldInfo(partId, isUpdate = false) {
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        if (!part) return;

        const partTitle = part.displayTitle || part.title;
        const previousInfo = isUpdate ? this.app.state.worldInfo?.parts?.[partId] : null;

        // Set loading state
        if (!this.app.state.worldInfo) this.app.state.worldInfo = { parts: {} };
        this.app.state.worldInfo.parts[partId] = { isLoading: true, generatedAt: new Date().toISOString() };
        this.app.save();
        this.render();
        this.loadWorldInfo(partId); // Show loading screen

        // Build full manuscript content
        let manuscriptContent = '';
        const parts = this.app.state.manuscript.parts || [];
        parts.forEach(p => {
            manuscriptContent += `\n\n## ${p.displayTitle || p.title}\n\n`;
            p.chapters.forEach(ch => {
                manuscriptContent += `### ${ch.displayTitle || ch.title}\n\n`;
                ch.scenes?.forEach(scene => {
                    const cleanContent = (scene.content || '').replace(/<[^>]*>/g, ' ').replace(/\[S\d+:.*?\]/g, '');
                    manuscriptContent += `**${scene.title}**\n${cleanContent}\n\n`;
                });
            });
        });

        // Build prompt - PLAIN TEXT format (no JSON)
        const systemPrompt = `You are a literary analyst extracting world information from a novel manuscript.

STOP. READ THIS FIRST:
1. Do NOT use markdown headers (like ### Characters).
2. Do NOT use bolding (**text**) for the section headers.
3. You MUST use EXACTLY the following section headers with simple bullet points.

TEMPLATE TO FOLLOW:

=== ESTABLISHED FACTS ===
- Fact 1
- Fact 2

=== KEY PLOT POINTS ===
- Plot point 1
- Plot point 2

=== IMPORTANT NAMES ===
- Name 1: Context
- Name 2: Context

=== TIMELINE ===
- Event 1: Time
- Event 2: Time

=== CHARACTER RELATIONSHIPS ===
- A and B: Relationship status

=== LOCATIONS ===
- Place 1: Description

Any other format will fail. Return ONLY the text matching this template.`;

        let userPrompt = `Extract world information ONLY from PART: "${partTitle}"

INSTRUCTIONS:
1. FOCUS ONLY on the events and details within "${partTitle}".
2. DO NOT include plot points or details that happen *outside* this part.
3. IGNORE any text labeled as "Suggestions", "Feedback", or content inside [brackets] or <!-- comments -->. These are not part of the story.

Full Manuscript (for context only):
${manuscriptContent}`;

        if (isUpdate && previousInfo) {
            userPrompt += `\n\nPrevious world info to update:\n${previousInfo.rawText || 'None'}`;
        }

        try {
            const response = await this.app.aiService.sendMessage([
                { role: 'user', content: userPrompt }
            ], {
                mode: 'quick',
                systemPrompt: systemPrompt
            });

            // Parse plain text response by section headers
            console.log('--- RAW AI RESPONSE ---');
            console.log(response);
            console.log('-----------------------');

            const parseSection = (text, sectionName) => {
                // Regex matches === HEADER === (content) until next === or end of string
                const regex = new RegExp(`===\\s*${sectionName}\\s*===\\s*([\\s\\S]*?)(?=\\n===|$)`, 'i');
                const match = text.match(regex);
                if (!match) return [];

                // Extract lines, remove empty ones, and clean up bullets
                const lines = match[1].split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith('('))
                    .map(line => line.replace(/^[-•*]\s*/, '').replace(/^\*\*(.*?)\*\*[:\s]*/, '$1: ')); // Clean bullets and bolding

                return lines;
            };

            const worldInfoData = {
                facts: parseSection(response, 'ESTABLISHED FACTS'),
                plotPoints: parseSection(response, 'KEY PLOT POINTS'),
                names: parseSection(response, 'IMPORTANT NAMES'),
                timeline: parseSection(response, 'TIMELINE'),
                relationships: parseSection(response, 'CHARACTER RELATIONSHIPS'),
                locations: parseSection(response, 'LOCATIONS'),
                rawText: response // Store raw text for updates
            };

            // Save to state
            this.app.state.worldInfo.parts[partId] = {
                ...worldInfoData,
                generatedAt: new Date().toISOString(),
                isLoading: false
            };

            this.app.save();
            this.render();
            this.loadWorldInfo(partId);

        } catch (error) {
            console.error('World info generation failed:', error);
            this.app.state.worldInfo.parts[partId] = {
                facts: ['Generation failed: ' + error.message],
                plotPoints: [],
                names: [],
                timeline: [],
                relationships: [],
                locations: [],
                generatedAt: new Date().toISOString(),
                isLoading: false
            };
            this.app.save();
            this.render();
            this.loadWorldInfo(partId);
        }
    }

    loadWorldInfo(partId) {
        const worldInfo = this.app.state.worldInfo?.parts?.[partId];
        const part = this.app.state.manuscript.parts.find(p => p.id === partId);
        const partTitle = part?.displayTitle || part?.title || 'Unknown Part';

        const editorContent = document.getElementById('editor-content');
        if (!editorContent) return;

        if (!worldInfo) {
            editorContent.innerHTML = `<div class="world-info-container">
                <div class="world-info-header">📖 ${partTitle} - World Info</div>
                <div class="world-info-empty">No world info yet. Right-click the part → "Extract Details"</div>
            </div>`;
            return;
        }

        if (worldInfo.isLoading) {
            editorContent.innerHTML = `<div class="world-info-container">
                <div class="world-info-header">📖 ${partTitle} - World Info</div>
                <div class="world-info-loading">
                    <div class="loading-spinner large"></div>
                    <div>Extracting world details...</div>
                    <div class="loading-subtext">Reading your manuscript and identifying key information</div>
                </div>
            </div>`;
            return;
        }

        const renderList = (items, emptyText = 'None') => {
            if (!items || items.length === 0) return `<div class="world-info-empty-section">${emptyText}</div>`;
            if (typeof items[0] === 'string') {
                return `<ul class="world-info-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
            }
            return `<ul class="world-info-list">${items.map(i => `<li><strong>${i.name || i.event || i.characters || ''}</strong>: ${i.context || i.when || i.status || i.description || ''}</li>`).join('')}</ul>`;
        };

        editorContent.innerHTML = `
            <div class="world-info-container">
                <div class="world-info-header main-view-header">
                    <span>📖 ${partTitle} - World Info</span>
                    <span class="world-info-date">Updated: ${new Date(worldInfo.generatedAt).toLocaleString()}</span>
                </div>
                
                <div class="world-info-section">
                    <h3>📌 Established Facts</h3>
                    ${renderList(worldInfo.facts, 'No established facts identified')}
                </div>

                <div class="world-info-section">
                    <h3>🎯 Key Plot Points</h3>
                    ${renderList(worldInfo.plotPoints, 'No major plot points in this part')}
                </div>

                <div class="world-info-section">
                    <h3>📛 Important Names</h3>
                    ${renderList(worldInfo.names, 'No new names introduced')}
                </div>

                <div class="world-info-section">
                    <h3>⏱️ Timeline</h3>
                    ${renderList(worldInfo.timeline, 'No timeline events')}
                </div>

                <div class="world-info-section">
                    <h3>💕 Character Relationships</h3>
                    ${renderList(worldInfo.relationships, 'No relationships identified')}
                </div>

                <div class="world-info-section">
                    <h3>📍 Locations</h3>
                    ${renderList(worldInfo.locations, 'No locations mentioned')}
                </div>
            </div>
        `;
    }

    deleteWorldInfo(partId) {
        if (!this.app.state.worldInfo?.parts?.[partId]) return;

        delete this.app.state.worldInfo.parts[partId];
        this.app.save();
        this.render();

        // If currently viewing this world info, clear the editor
        const currentView = document.querySelector('.world-info-header');
        if (currentView && currentView.textContent.includes('World Info')) {
            const editorContent = document.getElementById('editor-content');
            if (editorContent) {
                editorContent.innerHTML = '<div class="editor-empty-state">Select an item from the sidebar</div>';
            }
        }
    }

    // ========== BOOK DASHBOARD ==========
    loadDashboard() {
        const editor = document.getElementById('editor-content');
        const state = this.app.state;
        const parts = state.manuscript.parts || [];

        // Calculate stats
        let totalWords = 0;
        let totalScenes = 0;
        const tocItems = parts.map(part => {
            let partWords = 0;
            const chapters = part.chapters.map(ch => {
                let chapterWords = 0;
                ch.scenes?.forEach(scene => {
                    const text = (scene.content || '').replace(/<[^>]*>/g, '');
                    const words = text.trim().split(/\s+/).filter(w => w).length;
                    chapterWords += words;
                    totalScenes++;
                });
                partWords += chapterWords;
                return { title: ch.displayTitle || ch.title, words: chapterWords, id: ch.id, partId: part.id };
            });
            totalWords += partWords;
            return { title: part.displayTitle || part.title, words: partWords, chapters, id: part.id };
        });

        const synopsis = state.metadata.synopsis || '';

        editor.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-header">
                    <h1>📚 ${state.metadata.title || 'Untitled Book'}</h1>
                    <p class="dashboard-author">by ${state.metadata.author || 'Unknown Author'}</p>
                    <div class="dashboard-stats">
                        <span><strong>${parts.length}</strong> Parts</span>
                        <span><strong>${totalScenes}</strong> Scenes</span>
                        <span><strong>${totalWords.toLocaleString()}</strong> Words</span>
                    </div>
                </div>

                <div class="dashboard-section">
                    <div class="dashboard-section-header">
                        <h2>📝 Synopsis</h2>
                        <button class="btn-small btn-primary" id="btn-generate-synopsis">✨ Generate</button>
                    </div>
                    <textarea id="synopsis-editor" class="synopsis-textarea" placeholder="Write or generate a synopsis for your book...">${synopsis}</textarea>
                </div>

                <div class="dashboard-section">
                    <h2>📖 Table of Contents</h2>
                    <div class="toc-list">
                        ${tocItems.map((part, pIdx) => `
                            <div class="toc-part">
                                <div class="toc-part-header" data-part-id="${part.id}">
                                    <span class="toc-part-title">Part ${pIdx + 1}: ${part.title}</span>
                                    <span class="toc-words">${part.words.toLocaleString()} words</span>
                                </div>
                                <div class="toc-chapters">
                                    ${part.chapters.map((ch, cIdx) => `
                                        <div class="toc-chapter" data-chapter-id="${ch.id}" data-part-id="${ch.partId}">
                                            <span class="toc-chapter-title">Chapter ${cIdx + 1}: ${ch.title}</span>
                                            <span class="toc-words">${ch.words.toLocaleString()}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="dashboard-actions">
                    <button class="btn-large btn-secondary" id="btn-print-book">🖨️ Export / Print Book</button>
                </div>
            </div>
        `;

        // Bind events
        document.getElementById('btn-generate-synopsis').addEventListener('click', () => this.generateSynopsis());
        document.getElementById('btn-print-book').addEventListener('click', () => this.printBook());

        document.getElementById('synopsis-editor').addEventListener('input', (e) => {
            this.app.state.metadata.synopsis = e.target.value;
            this.app.save();
        });

        // ToC navigation
        editor.querySelectorAll('.toc-part-header').forEach(el => {
            el.addEventListener('click', () => this.app.loadPartView(el.dataset.partId));
        });
        editor.querySelectorAll('.toc-chapter').forEach(el => {
            el.addEventListener('click', () => this.app.loadChapterView(el.dataset.partId, el.dataset.chapterId));
        });
    }

    async generateSynopsis() {
        const state = this.app.state;
        const parts = state.manuscript.parts || [];

        // Check all parts have summaries
        const missingSummaries = parts.filter(p => !state.summaries?.parts?.[p.id]);
        if (missingSummaries.length > 0) {
            alert(`Cannot generate synopsis: The following parts are missing summaries:\n\n${missingSummaries.map(p => `- ${p.displayTitle || p.title}`).join('\n')}\n\nPlease generate summaries for all parts first.`);
            return;
        }

        const synopsisBtn = document.getElementById('btn-generate-synopsis');
        synopsisBtn.disabled = true;
        synopsisBtn.textContent = '⏳ Generating...';

        try {
            // Build context from summaries
            let context = `Book: ${state.metadata.title}\nAuthor: ${state.metadata.author}\n\nPart Summaries:\n`;
            parts.forEach(part => {
                const summary = state.summaries.parts[part.id];
                context += `\n## ${part.displayTitle || part.title}\n${summary.content}\n`;
            });

            const systemPrompt = `You are a book editor writing a synopsis for a novel.
Write a compelling, engaging 1-page synopsis (250-400 words) that covers:
- The main characters and their goals
- The central conflict
- The key plot points
- The emotional arc

Write in present tense, third person. Make it interesting enough to hook a reader.
Return ONLY the synopsis text, no headers or labels.`;

            const response = await this.app.aiService.sendMessage([
                { role: 'user', content: `Write a synopsis for this novel:\n\n${context}` }
            ], { systemPrompt });

            state.metadata.synopsis = response;
            this.app.save();

            document.getElementById('synopsis-editor').value = response;
        } catch (error) {
            alert('Failed to generate synopsis: ' + error.message);
        } finally {
            synopsisBtn.disabled = false;
            synopsisBtn.textContent = '✨ Generate';
        }
    }

    printBook() {
        const state = this.app.state;
        const parts = state.manuscript.parts || [];
        const synopsis = state.metadata.synopsis || '';

        let bookHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${state.metadata.title || 'Book'}</title>
                <style>
                    body {
                        font-family: Georgia, 'Times New Roman', serif;
                        font-size: 12pt;
                        line-height: 1.7;
                        color: #1a1a1a;
                        max-width: 6.5in;
                        margin: 0 auto;
                        padding: 0;
                    }
                    
                    .cover-page {
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        padding-top: 3in;
                        page-break-after: always;
                    }
                    .cover-title {
                        font-family: Georgia, serif;
                        font-size: 42pt;
                        font-weight: bold;
                        margin-bottom: 0.3em;
                    }
                    .cover-subtitle {
                        font-family: Georgia, serif;
                        font-size: 14pt;
                        font-weight: normal;
                        color: #555;
                        text-transform: uppercase;
                        letter-spacing: 0.1em;
                        margin-bottom: 1em;
                    }
                    .cover-author {
                        font-family: Georgia, serif;
                        font-size: 14pt;
                        font-style: italic;
                        margin-top: 2em;
                    }
                    .cover-synopsis {
                        margin-top: 2em;
                        max-width: 85%;
                        font-style: italic;
                        font-size: 10pt;
                        color: #444;
                        line-height: 1.5;
                        text-align: justify;
                        margin-bottom: 3em;
                    }
                    
                    .aesthetic-line {
                        border: 0;
                        height: 1px;
                        background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0));
                        margin: 2em auto;
                        width: 60%;
                    }
                    
                    .part-title {
                        text-align: center;
                        page-break-before: always;
                        padding-top: 30vh;
                    }
                    .part-title h2 { 
                        font-family: Georgia, serif;
                        font-size: 20pt; 
                        font-weight: normal;
                        text-transform: uppercase;
                        letter-spacing: 0.15em;
                    }
                    
                    .chapter {
                        page-break-before: always;
                        margin-top: 2in;
                    }
                    .chapter h3 {
                        font-size: 20pt;
                        text-align: center;
                        margin-bottom: 1em;
                        font-weight: normal;
                    }
                    
                    .scene { margin-bottom: 1.5em; }
                    .scene-break { text-align: center; margin: 2em 0; font-size: 1.2em; color: #888; }
                    .scene-break::before { content: "❖"; }
                    
                    p { text-indent: 1.5em; margin: 0; text-align: justify; }
                    p:first-of-type { text-indent: 0; }
                    
                    @media print {
                        body { padding: 0; margin: 0; }
                        .cover-page { height: 100vh; }
                        @page { margin: 1in; }
                    }
                </style>
            </head>
            <body>
                <div class="cover-page">
                    <div>
                        <div class="cover-title">${state.metadata.title || 'Untitled'}</div>
                        ${state.metadata.subtitle ? `<div class="cover-subtitle">${state.metadata.subtitle}</div>` : ''}
                    </div>
                    ${synopsis ? `<div class="cover-synopsis">${synopsis.replace(/\n/g, '<br>')}</div>` : ''}
                    <div class="cover-author">${state.metadata.author || ''}</div>
                    <hr class="aesthetic-line">
                </div>
        `;

        parts.forEach((part, pIdx) => {
            // PARTS HIDDEN: We iterate but do NOT print a Part Title page.

            part.chapters.forEach((chapter, cIdx) => {
                bookHtml += `<div class="chapter">
                    <h3>Chapter ${cIdx + 1}<br>${chapter.displayTitle || chapter.title}</h3>`;

                chapter.scenes?.forEach((scene, sIdx) => {
                    if (sIdx > 0) bookHtml += '<div class="scene-break"></div>';

                    // SAFE CONTENT PROCESSING
                    // 1. Get raw content or empty string
                    let content = scene.content || '';

                    // 2. Remove suggestion blocks [S1:...]
                    content = content.replace(/\[S\d+:.*?\]/g, '');

                    // 3. Remove dangerous tags but KEEP internal HTML structure (b, i, em, strong, span)
                    content = content.replace(/<\/?(script|style|link|meta).*?>/gi, '');

                    // 4. Flatten DIVs? No, some editors use divs for paragraphs. 
                    // Let's replace <div> with <p> if they don't have classes, or just leave them.
                    // Actually, the main issue was likely empty content strings or regex failures.
                    // Let's ensure we have paragraphs.

                    // If content has NO tags, wrap in <p>
                    if (!content.trim().startsWith('<')) {
                        content = content.split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('');
                    }
                    // If content has <div> but no <p>, convert divs to p? 
                    // Safest is to just dump the content. The browser print engine handles text nodes reasonably well.
                    // But to enforce indent, we usually need <p>.

                    // Quick fix for "text nodes without p":
                    // If the content is just text, wrap it.

                    bookHtml += `<div class="scene">${content}</div>`;
                });

                // Aesthetic line at the END of the chapter
                bookHtml += `<hr class="aesthetic-line"></div>`;
            });
        });

        bookHtml += '</body></html>';

        // Open print window
        const printWindow = window.open('', '_blank');
        printWindow.document.write(bookHtml);
        printWindow.document.close();

        // Wait for fonts to load, then print
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }

}
