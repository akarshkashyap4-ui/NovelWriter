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

        // Initialize collapsed items from state (persisted)
        this.initCollapseState();

        this.bindEvents();
    }

    initCollapseState() {
        // Ensure state has collapsedItems array
        if (!this.app.state.ui) this.app.state.ui = {};
        if (!this.app.state.ui.collapsedItems) this.app.state.ui.collapsedItems = [];

        // Use a Set for quick lookup
        this.collapsedItems = new Set(this.app.state.ui.collapsedItems);
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
        // Persist to state
        this.app.state.ui.collapsedItems = Array.from(this.collapsedItems);
        this.app.save();
    }

    bindEvents() {
        this.filterInput.addEventListener('input', (e) => this.filter(e.target.value));
    }

    render() {
        const state = this.app.state;

        this.container.innerHTML = `
      ${this.renderSection('MANUSCRIPT', 'manuscript', this.renderManuscript())}
      ${this.renderSection('SUMMARIES', 'summaries', this.renderSummaries())}
      ${this.renderSection('PLOT', 'plot', this.renderPlot(), true)}
      ${this.renderSection('CHARACTERS', 'characters', this.renderCharacters(), true)}
      ${this.renderSection('STORY NOTES', 'notes', this.renderNotes(), true)}
    `;

        this.bindTreeEvents();
    }

    bindTreeEvents() {
        // Section headers
        this.container.querySelectorAll('.tree-section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (!e.target.closest('.tree-section-menu-btn')) {
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
        const menuBtn = hasMenu ? `
      <button class="tree-section-menu-btn icon-btn icon-btn-sm" title="Options">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
        </svg>
      </button>
    ` : '';

        return `
      <div class="tree-section" data-section="${id}">
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
                html += this.renderItem({ section: 'manuscript', id: chapter.id, type: 'chapter', label: chapter.title, icon: 'file', depth: 2, parent: part.id, draggable: true, collapsible: true, isCollapsed: chapterCollapsed });

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

    renderNotes() {
        const notes = this.app.state.notes.items || [];
        if (notes.length === 0) {
            return '<div class="tree-item-empty">No notes yet</div>';
        }
        return notes.map(note =>
            this.renderItem({ section: 'notes', id: note.id, type: 'note', label: note.title, icon: 'doc' })
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

    renderItem({ section, id, type, label, icon, depth = 0, parent = null, grandparent = null, draggable = false, collapsible = false, isCollapsed = false }) {
        const icons = {
            book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
            part: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M12 6v7"/><path d="M8 9h8"/>',
            file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>',
            doc: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13,2 13,9 20,9"/>',
            grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
            list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="2" fill="currentColor"/><circle cx="4" cy="12" r="2" fill="currentColor"/><circle cx="4" cy="18" r="2" fill="currentColor"/>',
            users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
            user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
            summary: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/>'
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

        return `
      <div class="tree-item ${type === 'book' ? 'tree-item-book' : ''} ${collapsible ? 'tree-item-collapsible' : ''}${collapsedClass}" 
           data-section="${section}" data-id="${id}" data-type="${type}" 
           ${parentAttr} ${grandparentAttr}
           style="padding-left: ${paddingLeft}px;"
           ${draggable ? 'draggable="true"' : ''}>
        ${collapseToggle}
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
                items = [
                    { label: 'Add Chapter', onClick: () => this.addChapter(id) },
                    { divider: true },
                    { label: hasSummary ? '🔄 Regenerate Summary' : '📝 Generate Summary', onClick: () => this.generatePartSummary(id) },
                    { divider: true },
                    { label: 'Rename', onClick: () => this.rename('part', id) },
                    { label: 'Delete', onClick: () => this.deletePart(id) }
                ];
                break;
            case 'chapter':
                items = [
                    { label: 'Add Scene', onClick: () => this.addScene(id, parent) },
                    { divider: true },
                    { label: 'Rename', onClick: () => this.rename('chapter', id, parent) },
                    { label: 'Delete', onClick: () => this.deleteChapter(id, parent) }
                ];
                break;
            case 'scene':
                items = [
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
}
