/**
 * TextUtils - Shared text processing utilities
 */

/**
 * Strips HTML and inline suggestions from content.
 * Removes both HTML tags and elements with class 'suggestion-inline'.
 * Also removes [S1: ...] style text patterns as a fallback.
 * 
 * @param {string} html - The content to clean
 * @returns {string} The cleaned text
 */
export function stripContent(html) {
    if (!html) return '';

    let text = '';

    // 1. DOM Parsing (Best for stripping specific elements)
    if (typeof DOMParser !== 'undefined') {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Remove suggestions entirely (including their text)
            doc.querySelectorAll('.suggestion-inline').forEach(el => el.remove());

            text = doc.body.textContent || '';
        } catch (e) {
            console.warn('DOMParser failed in stripContent, falling back to regex', e);
            // Fallthrough to regex
            text = html;
        }
    } else {
        text = html;
    }

    // 2. Regex Cleanups (Fallback and extra patterns)
    // If DOMParser didn't run or failed, text equals html here.
    // If DOMParser ran, text is plain text.

    // If text still looks like HTML (fallback case), try to strip specific suggestion spans via regex
    if (text.includes('<')) {
        text = text.replace(/<span class="suggestion-inline"[^>]*>[\s\S]*?<\/span>/gi, '');
        text = text.replace(/<[^>]*>/g, ''); // Strip remaining tags
    }

    // 3. Remove legacy/markup suggestion patterns [S1: ...]
    text = text.replace(/\[S\d+:[^\]]+\]/g, '');

    return text.trim();
}
