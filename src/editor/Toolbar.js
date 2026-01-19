/**
 * Toolbar - Formatting toolbar component
 * 
 * BEHAVIOR:
 * - Bold/Italic/Underline: work on selection (standard execCommand)
 * - Font/Size/Color: 
 *   - If text is SELECTED: apply to that selection only
 *   - If NO selection (cursor only): apply to text typed FROM THIS POINT ON
 *   - NEVER affects pre-written unselected text or other pages
 */

export class Toolbar {
    constructor(app) {
        this.app = app;

        this.btnBold = document.getElementById('btn-bold');
        this.btnItalic = document.getElementById('btn-italic');
        this.btnUnderline = document.getElementById('btn-underline');
        this.fontFamily = document.getElementById('font-family');
        this.fontSize = document.getElementById('font-size');

        this.currentColor = this.app.state.settings.currentTextColor || '#000000';
        this.savedSelection = null;

        // Typing mode - when these are set, new typing will use these styles
        this.pendingFont = null;
        this.pendingSize = null;
        this.pendingColor = null;

        this.fontFamily.value = this.app.state.settings.currentFont || 'Merriweather';
        this.fontSize.value = this.app.state.settings.currentFontSize || 16;

        this.bindEvents();
        this.addColorPicker();
    }

    bindEvents() {
        // Format buttons (bold/italic/underline) - work correctly with execCommand
        this.btnBold.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.toggleFormat('bold');
        });
        this.btnItalic.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.toggleFormat('italic');
        });
        this.btnUnderline.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.toggleFormat('underline');
        });

        // Font family
        this.fontFamily.addEventListener('mousedown', () => this.saveSelection());
        this.fontFamily.addEventListener('change', (e) => {
            const value = e.target.value;

            // Save as default
            this.app.state.settings.currentFont = value;
            this.app.save();

            this.restoreSelection();
            if (this.hasSelection()) {
                // Apply to selection
                document.execCommand('fontName', false, value);
            } else {
                // Set pending style for new typing
                this.pendingFont = value;
                this.insertStyledCursor();
            }
        });

        // Font size
        this.fontSize.addEventListener('mousedown', () => this.saveSelection());
        this.fontSize.addEventListener('change', (e) => {
            const value = e.target.value;

            // Save as default
            this.app.state.settings.currentFontSize = parseInt(value);
            this.app.save();

            this.restoreSelection();
            if (this.hasSelection()) {
                // Apply to selection
                this.applyFontSizeToSelection(value);
            } else {
                // Set pending style for new typing
                this.pendingSize = value;
                this.insertStyledCursor();
            }
        });
    }

    hasSelection() {
        const selection = window.getSelection();
        return selection.rangeCount > 0 && !selection.isCollapsed;
    }

    saveSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            this.savedSelection = selection.getRangeAt(0).cloneRange();
        }
    }

    restoreSelection() {
        if (this.savedSelection) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(this.savedSelection);
        }
    }

    // Insert a styled span at cursor position for new typing
    insertStyledCursor() {
        const editor = document.getElementById('editor-content');
        editor.focus();

        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // Create a styled span with a zero-width space so cursor can be placed inside
        const span = document.createElement('span');
        span.innerHTML = '\u200B'; // Zero-width space

        if (this.pendingFont) {
            span.style.fontFamily = `'${this.pendingFont}', serif`;
        }
        if (this.pendingSize) {
            span.style.fontSize = this.pendingSize + 'px';
        }
        if (this.pendingColor) {
            span.style.color = this.pendingColor;
        }

        range.insertNode(span);

        // Move cursor inside the span after the zero-width space
        range.setStart(span.firstChild, 1);
        range.setEnd(span.firstChild, 1);
        selection.removeAllRanges();
        selection.addRange(range);

        // Clear pending styles (they're now in the span)
        this.pendingFont = null;
        this.pendingSize = null;
        this.pendingColor = null;
    }

    addColorPicker() {
        const toolbarGroup = document.createElement('div');
        toolbarGroup.className = 'toolbar-group';

        const divider = document.createElement('div');
        divider.className = 'toolbar-divider';

        const colorPickerHtml = `
      <div class="toolbar-color-picker">
        <button class="toolbar-color-btn" id="btn-text-color" title="Text Color">
          <span class="color-icon">A</span>
          <span class="color-bar" style="background: ${this.currentColor};"></span>
        </button>
        <div class="color-picker-dropdown" id="color-dropdown">
          <div class="color-picker-grid">
            ${this.generateColorSwatches()}
          </div>
        </div>
      </div>
    `;

        toolbarGroup.innerHTML = colorPickerHtml;

        const fontSizeParent = this.fontSize.parentElement;
        fontSizeParent.after(divider);
        divider.after(toolbarGroup);

        const colorBtn = document.getElementById('btn-text-color');
        const dropdown = document.getElementById('color-dropdown');

        colorBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.saveSelection();
            dropdown.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.toolbar-color-picker')) {
                dropdown.classList.remove('open');
            }
        });

        dropdown.querySelectorAll('.color-picker-swatch').forEach(swatch => {
            swatch.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const color = swatch.dataset.color;

                this.currentColor = color === 'auto' ? '#000000' : color;
                this.app.state.settings.currentTextColor = this.currentColor;
                this.app.save();

                colorBtn.querySelector('.color-bar').style.background = this.currentColor;
                dropdown.classList.remove('open');

                this.restoreSelection();

                if (color === 'auto') {
                    if (this.hasSelection()) {
                        // TARGETED REMOVAL: 'removeFormat' kills bold/italic.
                        // We use the "Marker Trick":
                        // 1. Apply a unique color (#fe1234)
                        document.execCommand('foreColor', false, '#fe1234');

                        // 2. Find and strip it
                        const editor = document.getElementById('editor-content');

                        // Handle <font color="#fe1234">
                        const fonts = editor.querySelectorAll('font[color="#fe1234"]');
                        fonts.forEach(f => {
                            f.removeAttribute('color');
                            // If no other attributes, unwrap (optional, but cleaner)
                            if (!f.attributes.length) {
                                const parent = f.parentNode;
                                while (f.firstChild) parent.insertBefore(f.firstChild, f);
                                parent.removeChild(f);
                            }
                        });

                        // Handle <span style="color: rgb(254, 18, 52)"> (approx)
                        // Browsers might convert hex to rgb. #fe1234 = rgb(254, 18, 52)
                        const spans = editor.querySelectorAll('span');
                        spans.forEach(s => {
                            if (s.style.color === 'rgb(254, 18, 52)' || s.style.color === '#fe1234') {
                                s.style.color = '';
                                if (!s.getAttribute('style') && !s.className) {
                                    // Unwrap if empty
                                    const parent = s.parentNode;
                                    while (s.firstChild) parent.insertBefore(s.firstChild, s);
                                    parent.removeChild(s);
                                }
                            }
                        });
                    } else {
                        // New typing
                        this.pendingColor = null;
                        this.insertStyledCursor(); // Will use null -> default color
                    }
                } else {
                    if (this.hasSelection()) {
                        document.execCommand('foreColor', false, color);
                    } else {
                        this.pendingColor = color;
                        this.insertStyledCursor();
                    }
                }
            });
        });
    }

    generateColorSwatches() {
        const colors = [
            'auto', // Special value for default/reset
            '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
            '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#9900ff', '#ff00ff',
            '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#674ea7', '#a64d79',
            '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#351c75', '#741b47',
            '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#20124d', '#4c1130'
        ];

        return colors.map(color => {
            let extraClass = '';
            let title = color;
            let style = `background: ${color};`;

            if (color === 'auto') {
                extraClass = ' highlight-auto';
                title = 'Auto (Adapts to Theme)';
                // diagonal line pattern to represent "transparent/auto"
                style = `background: repeating-linear-gradient(45deg, #fff, #fff 5px, #eee 5px, #eee 10px); color: black; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold;`;
            } else if (color === '#000000') {
                extraClass = ' highlight-black';
                title = 'Black (Static)';
            } else if (color === '#ffffff') {
                extraClass = ' highlight-white';
                title = 'White (Static)';
            }

            // If auto, render "A" text inside, else just color
            const content = color === 'auto' ? 'A' : '';

            return `<div class="color-picker-swatch${extraClass}" data-color="${color}" title="${title}" style="${style}">${content}</div>`;
        }).join('');
    }

    toggleFormat(format) {
        document.execCommand(format, false, null);
        const btn = document.getElementById(`btn-${format}`);
        if (btn) {
            btn.classList.toggle('active', document.queryCommandState(format));
        }
    }

    applyFontSizeToSelection(size) {
        // Use fontSize command with size 7, then update the elements
        document.execCommand('fontSize', false, '7');
        const editor = document.getElementById('editor-content');
        const fonts = editor.querySelectorAll('font[size="7"]');
        fonts.forEach(font => {
            font.removeAttribute('size');
            font.style.fontSize = size + 'px';
        });
    }
}
