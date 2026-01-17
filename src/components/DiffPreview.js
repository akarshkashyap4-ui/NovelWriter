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
                    return `<p>${this.escapeHtml(p).replace(/\n/g, '<br>')}</p>`;
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
        // Simple "Find and Replace" Patching Strategy
        // 1. Parse diff to find "Modify" blocks (Remove followed by Add)
        // 2. Ignore pure context for matching if possible, but use extended context if needed?
        //    Simpler: Just look for the "Removed" block in the editor text.

        const changes = this.parseDiff(diffText);
        let editorText = editor.innerText;
        let originalText = editorText;
        let success = false;

        // We'll process changes in chunks.
        // Identify contiguous Remove/Add blocks.

        let i = 0;
        while (i < changes.length) {
            const block = changes[i];

            // Check for strict "Modify" pattern: Remove -> Add
            if (block.type === 'remove') {
                const searchStr = block.lines.join('\n');
                let replaceStr = '';

                // Look ahead for Add
                if (i + 1 < changes.length && changes[i + 1].type === 'add') {
                    replaceStr = changes[i + 1].lines.join('\n');
                    i++; // Skip next
                } else {
                    // Just a deletion
                    replaceStr = '';
                }

                // Perform replacement
                // Simple string replace (first occurrence? uniqueness check?)
                if (editorText.includes(searchStr)) {
                    // Verify uniqueness to be safe?
                    if (editorText.indexOf(searchStr) !== editorText.lastIndexOf(searchStr)) {
                        console.warn('Ambiguous patch: defined text found multiple times.');
                        // proceed with first? or fail?
                        // Fail for safety
                        return false;
                    }

                    editorText = editorText.replace(searchStr, replaceStr);
                    success = true;
                } else {
                    console.warn('Patch failed: Could not find original text block:', searchStr);
                    return false;
                }
            } else if (block.type === 'add') {
                // Pure addition (not following remove)
                // This usually requires Context to know WHERE to add.
                // Naive: We can't handle pure additions safely without context matching.
                // But often AI gives "Context - Add - Context".
                // We'd need to look at previous context block.

                // If previous block was context, append to that context?
                // This starts getting complex for a "Basic" patcher.
                // Let's assume most AI edits are Rewrites (Remove+Add).
                console.warn('Pure addition not supported in basic patcher yet.');
            }
            i++;
        }

        if (success) {
            // Apply text back to editor (preserves paragraphs if we wrap carefully?)
            // Editor is contentEditable. innerText assignment usually strips tags.
            // We should try to preserve basic structure.
            // For now, mapping newlines into <p> or <br> is best effort.
            const paragraphs = editorText.split(/\n\n+/);
            const html = paragraphs.map(p => {
                if (!p.trim()) return '';
                // Simple escaping
                return `<p>${this.escapeHtml(p).replace(/\n/g, '<br>')}</p>`;
            }).join('');

            editor.innerHTML = html;
        }

        return success;
    }
}
