/**
 * DiffPreview Component
 * Handles parsing, visualizing, and applying text changes
 */

export class DiffPreview {
    constructor(app) {
        this.app = app;
        this.modal = document.getElementById('diff-preview-modal');
        this.container = document.getElementById('diff-body');
        this.cancelBtn = document.getElementById('diff-cancel');
        this.applyBtn = document.getElementById('diff-apply');

        this.currentDiff = null;
        this.currentSource = null; // 'agent' or 'selection'

        this.bindEvents();
    }

    bindEvents() {
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.hide());
        }

        if (this.applyBtn) {
            this.applyBtn.addEventListener('click', () => this.applyChanges());
        }

        // Close on backdrop click
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.hide();
            });

            // Close button
            const closeBtn = this.modal.querySelector('.close-modal');
            if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
        }
    }

    /**
     * Parse a unified diff string into structured blocks
     * Expects standard git diff format or code blocks with diff language
     */
    parseDiff(diffText) {
        const lines = diffText.split('\n');
        const changes = [];
        let currentBlock = { type: 'context', lines: [] };

        for (const line of lines) {
            // Skip diff headers if present
            if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
                continue;
            }

            // Hunk header
            if (line.startsWith('@@')) {
                if (currentBlock.lines.length > 0) {
                    changes.push(currentBlock);
                }
                currentBlock = { type: 'context', lines: [] };
                changes.push({ type: 'header', content: line });
                continue;
            }

            if (line.startsWith('+')) {
                // Addition
                if (currentBlock.type !== 'add') {
                    if (currentBlock.lines.length > 0) changes.push(currentBlock);
                    currentBlock = { type: 'add', lines: [] };
                }
                currentBlock.lines.push(line.substring(1));
            } else if (line.startsWith('-')) {
                // Deletion
                if (currentBlock.type !== 'remove') {
                    if (currentBlock.lines.length > 0) changes.push(currentBlock);
                    currentBlock = { type: 'remove', lines: [] };
                }
                currentBlock.lines.push(line.substring(1));
            } else {
                // Context (unchanged)
                if (currentBlock.type !== 'context') {
                    if (currentBlock.lines.length > 0) changes.push(currentBlock);
                    currentBlock = { type: 'context', lines: [] };
                }
                // Handle space at start of context line if present, but be robust if missing
                currentBlock.lines.push(line.startsWith(' ') ? line.substring(1) : line);
            }
        }

        if (currentBlock.lines.length > 0) {
            changes.push(currentBlock);
        }

        return changes;
    }

    /**
     * Show the diff preview modal
     * @param {string} diffContent - The raw diff text or replacement text
     * @param {Object} context - Metadata about where to apply changes
     */
    show(diffContent, context = {}) {
        this.currentDiff = diffContent;
        this.currentContext = context;

        let changes;
        if (context.type === 'replacement') {
            // Full replacement mode
            // Get current editor content to show what will be removed
            const editor = document.getElementById('editor-content');
            const currentText = editor ? editor.innerText : '';

            changes = [
                { type: 'header', content: '@@ Full Rewrite / Replacement @@' },
                { type: 'remove', lines: currentText.split('\n') },
                { type: 'add', lines: diffContent.split('\n') }
            ];

            this.currentSource = 'replacement';
        } else {
            // Standard Diff mode
            changes = this.parseDiff(diffContent);
            this.currentSource = 'diff';
        }

        this.renderDiff(changes);

        // Show modal
        if (this.modal) {
            this.modal.classList.add('visible');
        }
    }

    hide() {
        if (this.modal) {
            this.modal.classList.remove('visible');
        }
        this.currentDiff = null;
    }

    renderDiff(changes) {
        if (!this.container) return;

        this.container.innerHTML = '';

        changes.forEach(block => {
            const blockEl = document.createElement('div');
            blockEl.className = `diff-block diff-${block.type}`;

            if (block.type === 'header') {
                blockEl.textContent = block.content;
                blockEl.className = 'diff-header-line';
            } else {
                blockEl.innerHTML = block.lines.map(line =>
                    // Escape HTML to prevent injection, then preserve spaces
                    `<div>${this.escapeHtml(line) || '&nbsp;'}</div>`
                ).join('');
            }

            this.container.appendChild(blockEl);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Parse markdown to HTML (basic support for bold, italic, etc.)
     * This prevents AI formatting from being stripped
     */
    parseMarkdown(text) {
        if (!text) return '';
        let html = this.escapeHtml(text);

        // Bold (**text** or __text__)
        html = html.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

        // Italic (*text* or _text_)
        html = html.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

        // Headers
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

        return html;
    }

    /**
     * Apply the changes to the actual editor/manuscript
     */
    applyChanges() {
        // Find the active editor
        const editor = document.getElementById('editor-content');
        if (!editor || !this.currentDiff) return;

        // Verify we're applying to the correct content type (usually scene)
        if (!this.app.currentContext || this.app.currentContext.type !== 'scene') {
            // Allow applying to notes or other contexts too if possible
            // But warn if no context
            console.warn('Applying changes with no explicit context tracked.');
        }

        // 1. Save current state for Undo
        // TODO: Implement proper Undo Stack in App or Editor

        // 2. Parse diff and apply to content
        // For Phase 1, we will implement a simple "Fuzzy Patch" or "Block Replace"
        // If it's a diff, we try to locate the "-" lines and replace with "+" lines.

        try {
            if (this.currentSource === 'replacement') {
                // Simple overwrite
                // Preserve basic paragraphs if possible, or just set text
                // formatting might assume markdown -> HTML conversion needed?
                // For now, simple text replacement.
                // We'll split by newline and wrap in <p> if it looks like paragraphs
                const paragraphs = this.currentDiff.split(/\n\n+/);
                const html = paragraphs.map(p => {
                    if (!p.trim()) return '';
                    // Use markdown parser instead of simple escape
                    return `<p>${this.parseMarkdown(p).replace(/\n/g, '<br>')}</p>`;
                }).join('');

                editor.innerHTML = html;
                this.finalizeApply();
            } else {
                // Diff Patching
                const success = this.applyPatchToEditor(editor, this.currentDiff);
                if (success) {
                    this.finalizeApply();
                } else {
                    alert('Could not auto-apply diff. The text might have changed since the suggestion was made.');
                }
            }
        } catch (e) {
            console.error('Failed to apply diff:', e);
            alert('Error applying changes: ' + e.message);
        }
    }

    finalizeApply() {
        this.app.saveCurrentContent();
        // Notify user
        const status = document.getElementById('save-status');
        if (status) {
            const original = status.textContent;
            status.textContent = 'Changes Applied';
            status.style.color = 'var(--accent-primary)';
            setTimeout(() => {
                status.textContent = original;
                status.style.color = '';
            }, 2000);
        }
        this.hide();
    }

    applyPatchToEditor(editor, diffText) {
        const changes = this.parseDiff(diffText);
        let successCount = 0;

        // Process changes
        for (let i = 0; i < changes.length; i++) {
            const block = changes[i];

            if (block.type === 'remove') {
                const searchStr = block.lines.join('\n');
                let replaceStr = '';

                if (i + 1 < changes.length && changes[i + 1].type === 'add') {
                    replaceStr = changes[i + 1].lines.join('\n');
                    i++; // Skip next
                }

                if (this.replaceTextInDOM(editor, searchStr, replaceStr)) {
                    successCount++;
                } else {
                    console.warn('Could not find text block to replace:', searchStr);
                }
            }
        }

        return successCount > 0;
    }

    /**
     * Find text in DOM and replace it while preserving surrounding structure
     * AND explicitly copying styles to the new element.
     */
    replaceTextInDOM(container, searchStr, replaceStr) {
        if (!searchStr) return false;

        const range = this.findTextRange(container, searchStr);
        if (!range) return false;

        // Capture styles from the start of the range
        // We use the parent element of the text node if it's a text node
        const startNode = range.startContainer.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : range.startContainer;

        const computedStyle = window.getComputedStyle(startNode);
        const styleProps = ['color', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'backgroundColor', 'fontFamily'];
        const capturedStyles = {};

        styleProps.forEach(prop => {
            const val = computedStyle[prop];
            // Copy distinct styles
            if (val) capturedStyles[prop] = val;
        });

        // Prepare new content wrapped in span with captured styles
        const newContent = document.createDocumentFragment();
        const wrapper = document.createElement('span');

        // Apply captured styles
        Object.assign(wrapper.style, capturedStyles);

        // Use class list if source had them
        if (startNode.classList.length > 0) {
            wrapper.className = startNode.className;
        }

        wrapper.innerHTML = this.parseMarkdown(replaceStr).replace(/\n/g, '<br>');
        newContent.appendChild(wrapper);

        // Apply replacement
        range.deleteContents();
        range.insertNode(newContent);

        // Collapse to end of insertion
        range.collapse(false);

        return true;
    }

    /**
     * Locate a text string across multiple text nodes and return a DOM Range
     */
    findTextRange(container, searchText) {
        const fullText = container.textContent;
        const startIndex = fullText.indexOf(searchText);
        if (startIndex === -1) return null;

        const endIndex = startIndex + searchText.length;

        const range = document.createRange();
        let startFound = false;
        let endFound = false;
        let charsCount = 0;

        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while ((node = walker.nextNode())) {
            const nodeLength = node.textContent.length;
            const nodeStart = charsCount;
            const nodeEnd = charsCount + nodeLength;

            // Check for start
            if (!startFound && startIndex >= nodeStart && startIndex < nodeEnd) {
                range.setStart(node, startIndex - nodeStart);
                startFound = true;
            }

            // Check for end
            if (!endFound && endIndex > nodeStart && endIndex <= nodeEnd) {
                range.setEnd(node, endIndex - nodeStart);
                endFound = true;
                break;
            }

            charsCount += nodeLength;
        }

        return (startFound && endFound) ? range : null;
    }
}
