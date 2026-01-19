/**
 * ContextManager - Builds manuscript context for AI
 * 
 * Provides the AI with awareness of the manuscript structure
 * and retrieves relevant content based on the current context
 */

export class ContextManager {
    constructor(app) {
        this.app = app;
    }

    /**
     * Get manuscript structure overview (lightweight)
     * Used to give AI a bird's eye view without full content
     */
    getStructureOverview() {
        const state = this.app.state;
        const parts = state.manuscript.parts || [];

        let overview = `# Manuscript Structure\n`;
        overview += `Title: ${state.metadata.title}\n`;
        overview += `Author: ${state.metadata.author}\n`;
        overview += `Subtitle: ${state.metadata.subtitle || 'N/A'}\n\n`;

        parts.forEach((part, pIdx) => {
            overview += `## Part ${pIdx + 1}: ${part.displayTitle || part.title}\n`;

            part.chapters.forEach((chapter, cIdx) => {
                const sceneCount = chapter.scenes?.length || 0;
                const wordCount = chapter.scenes?.reduce((sum, s) => {
                    const text = s.content?.replace(/<[^>]*>/g, '') || '';
                    return sum + text.trim().split(/\s+/).filter(w => w).length;
                }, 0) || 0;

                overview += `  - Chapter ${cIdx + 1}: ${chapter.displayTitle || chapter.title} (${sceneCount} scenes, ~${wordCount} words)\n`;

                chapter.scenes?.forEach((scene, sIdx) => {
                    overview += `    - Scene ${sIdx + 1}: ${scene.title}\n`;
                });
            });
        });

        return overview;
    }

    /**
     * Get the active writing context with content
     * Returns content for the current scene, chapter, part, or full book
     */
    getActiveContentContext() {
        const ctx = this.app.currentContext;
        if (!ctx) return null;

        // Determine the current part ID based on context type
        let currentPartId = null;
        let focusInfo = null;  // What specific item is the user focused on

        if (ctx.type === 'scene') {
            currentPartId = ctx.partId;
            const part = this.app.state.manuscript.parts.find(p => p.id === ctx.partId);
            const chapter = part?.chapters.find(c => c.id === ctx.chapterId);
            const scene = chapter?.scenes.find(s => s.id === ctx.sceneId);
            focusInfo = {
                type: 'scene',
                title: scene?.title,
                chapterTitle: chapter?.title,
                partTitle: part?.displayTitle || part?.title,
                fullPath: `${part?.displayTitle || part?.title} > ${chapter?.title} > ${scene?.title}`
            };
        } else if (ctx.type === 'chapter') {
            currentPartId = ctx.partId;
            const part = this.app.state.manuscript.parts.find(p => p.id === ctx.partId);
            const chapter = part?.chapters.find(c => c.id === ctx.chapterId);
            focusInfo = {
                type: 'chapter',
                title: chapter?.title,
                partTitle: part?.displayTitle || part?.title,
                fullPath: `${part?.displayTitle || part?.title} > ${chapter?.title}`
            };
        } else if (ctx.type === 'part') {
            currentPartId = ctx.partId;
            const part = this.app.state.manuscript.parts.find(p => p.id === ctx.partId);
            focusInfo = {
                type: 'part',
                title: part?.displayTitle || part?.title,
                fullPath: part?.displayTitle || part?.title
            };
        } else if (ctx.type === 'book') {
            // For book context, use special handling
            return this.getFullBookContext();
        }

        if (!currentPartId) return null;

        // Get the full part content and collect suggestions
        const part = this.app.state.manuscript.parts.find(p => p.id === currentPartId);
        if (!part) return null;

        let content = '';
        const allSuggestions = [];

        part.chapters?.forEach(chapter => {
            content += `# ${chapter.displayTitle || chapter.title}\n\n`;
            chapter.scenes?.forEach(s => {
                content += `## ${s.title}\n`;
                // Add content
                content += (s.content?.replace(/<[^>]*>/g, '') || '') + '\n\n';

                // Collect suggestions if present
                if (s.suggestions && s.suggestions.items && s.suggestions.items.length > 0) {
                    allSuggestions.push({
                        sceneTitle: s.title,
                        chapterTitle: chapter.title,
                        type: s.suggestions.type,
                        items: s.suggestions.items
                    });
                }
            });
        });

        return {
            type: 'part',
            partId: currentPartId,
            title: part.displayTitle || part.title,
            focusInfo: focusInfo,
            content: content,
            wordCount: content.trim().split(/\s+/).filter(w => w).length,
            allSuggestions: allSuggestions
        };
    }

    /**
     * Get full book context (for when book title is selected)
     */
    getFullBookContext() {
        let content = '';
        const parts = this.app.state.manuscript.parts || [];

        parts.forEach(part => {
            content += `# ${part.displayTitle || part.title}\n\n`;
            part.chapters?.forEach(chapter => {
                content += `## ${chapter.displayTitle || chapter.title}\n\n`;
                chapter.scenes?.forEach(s => {
                    content += `### ${s.title}\n`;
                    content += (s.content?.replace(/<[^>]*>/g, '') || '') + '\n\n';
                });
            });
        });

        const wordCount = content.trim().split(/\s+/).filter(w => w).length;

        // If the manuscript is too large, provide a truncated version
        const MAX_WORDS = 5000;
        if (wordCount > MAX_WORDS) {
            const words = content.split(/\s+/);
            content = words.slice(0, MAX_WORDS).join(' ') + '\n\n[... content truncated for context limits ...]';
        }

        return {
            type: 'book',
            title: this.app.state.metadata.title,
            content: content,
            wordCount: wordCount,
            truncated: wordCount > MAX_WORDS
        };
    }

    /**
     * Get summaries of all parts EXCEPT the current one
     * Returns summaries of parts before and after the current part
     */
    getOtherPartSummaries(currentPartId) {
        const parts = this.app.state.manuscript.parts || [];
        const summaries = this.app.state.summaries?.parts || {};

        let beforeSummaries = '';
        let afterSummaries = '';
        let foundCurrent = false;

        for (const part of parts) {
            if (part.id === currentPartId) {
                foundCurrent = true;
                continue;
            }

            const summary = summaries[part.id];
            if (summary) {
                const summaryText = `### Summary: ${part.displayTitle || part.title}\n${summary.content}\n\n`;
                if (foundCurrent) {
                    afterSummaries += summaryText;
                } else {
                    beforeSummaries += summaryText;
                }
            }
        }

        return { beforeSummaries, afterSummaries };
    }

    /**
     * Get full content of ALL parts (for "Full Manuscript" context strategy)
     */
    getAllPartsContent() {
        const parts = this.app.state.manuscript.parts || [];
        let content = '';

        parts.forEach(part => {
            content += `# ${part.displayTitle || part.title}\n\n`;
            part.chapters?.forEach(chapter => {
                content += `## ${chapter.displayTitle || chapter.title}\n\n`;
                chapter.scenes?.forEach(s => {
                    content += `### ${s.title}\n`;
                    content += (s.content?.replace(/<[^>]*>/g, '') || '') + '\n\n';
                });
            });
            content += '---\n\n';
        });

        return content;
    }

    /**
     * Get chapter content (all scenes combined)
     */
    getChapterContent(chapterId) {
        for (const part of this.app.state.manuscript.parts) {
            const chapter = part.chapters.find(c => c.id === chapterId);
            if (chapter) {
                let content = `# ${chapter.displayTitle || chapter.title}\n\n`;
                chapter.scenes?.forEach(scene => {
                    content += `## ${scene.title}\n`;
                    content += (scene.content?.replace(/<[^>]*>/g, '') || '') + '\n\n';
                });
                return content;
            }
        }
        return null;
    }

    /**
     * Get character profiles
     */
    getCharacterProfiles() {
        const characters = this.app.state.characters || [];

        if (characters.length === 0) {
            return `# Character Profiles\n\nNo characters defined yet.\n\n`;
        }

        let profiles = `# Character Profiles\n\n`;

        // Group characters by role (cast)
        const casts = {};
        characters.forEach(char => {
            const role = char.role || 'Other';
            if (!casts[role]) casts[role] = [];
            casts[role].push(char);
        });

        // Build output grouped by cast
        Object.entries(casts).forEach(([castName, chars]) => {
            profiles += `## ${castName}\n\n`;
            chars.forEach(char => {
                profiles += `### ${char.name}\n`;
                if (char.description) profiles += `${char.description}\n`;
                if (char.notes) profiles += `Notes: ${char.notes}\n`;
                profiles += '\n';
            });
        });

        return profiles;
    }

    /**
     * Get plot data (plot lines and grids)
     */
    getPlotNotes() {
        const plotLines = this.app.state.plot?.plotLines || [];
        const gridData = this.app.state.plot?.gridData || {};

        let output = `# Plot Data\n\n`;

        // Plot Lines
        if (plotLines.length > 0) {
            output += `## Plot Lines\n\n`;
            plotLines.forEach(line => {
                output += `### ${line.title || 'Untitled Plot Line'}\n`;
                output += (line.content?.replace(/<[^>]*>/g, '') || 'No content yet.') + '\n';
                if (line.points && line.points.length > 0) {
                    output += `**Key Points:**\n`;
                    line.points.forEach((point, i) => {
                        output += `${i + 1}. ${point}\n`;
                    });
                }
                output += '\n';
            });
        }

        // Plot Grids
        const gridKeys = Object.keys(gridData);
        if (gridKeys.length > 0) {
            output += `## Plot Grids\n\n`;
            gridKeys.forEach(gridId => {
                const grid = gridData[gridId];
                if (grid && typeof grid === 'object') {
                    output += `### Grid: ${gridId}\n`;
                    // Grid data is typically scene -> plotline -> content mapping
                    Object.entries(grid).forEach(([sceneId, plotPoints]) => {
                        if (plotPoints && Object.keys(plotPoints).length > 0) {
                            output += `Scene ${sceneId}: `;
                            output += Object.values(plotPoints).filter(p => p).join(', ') + '\n';
                        }
                    });
                    output += '\n';
                }
            });
        }

        if (plotLines.length === 0 && gridKeys.length === 0) {
            output += 'No plot data defined yet.\n';
        }

        return output;
    }

    /**
     * Get story notes
     */
    getStoryNotes() {
        const items = this.app.state.notes?.items || [];
        let notes = `# Story Notes\n\n`;

        items.forEach(item => {
            notes += `## ${item.title}\n`;
            notes += (item.content?.replace(/<[^>]*>/g, '') || 'No content yet.') + '\n\n';
        });

        return notes;
    }

    /**
     * Build full context for AI based on what's relevant
     * @param {Object} options - What to include
     */
    buildContext(options = {}) {
        const {
            includeStructure = true,
            includeCurrentScene = true,
            includeCharacters = false,
            includePlot = false,
            includeNotes = false,
            includeAnalysis = false,
            customChapterId = null
        } = options;

        let context = '';

        // Add USER'S CURRENT FOCUS at the very beginning
        const activeForFocus = this.getActiveContentContext();
        if (activeForFocus?.focusInfo?.fullPath) {
            context += `# 📍 USER'S CURRENT FOCUS\n`;
            context += `The user is currently viewing: **${activeForFocus.focusInfo.fullPath}**\n`;
            context += `When the user says "here", "this scene", "this chapter", etc., they are referring to this location.\n`;
            context += `\n---\n\n`;
        }

        if (includeStructure) {
            context += this.getStructureOverview() + '\n---\n\n';
        }

        if (includeCurrentScene) {
            const active = this.getActiveContentContext();
            if (active) {
                const strategy = this.app.state.settings.contextStrategy || 'smart';

                if (strategy === 'full') {
                    // FULL CONTEXT STRATEGY: Include entire manuscript
                    context += `# FULL MANUSCRIPT CONTENT\n\n`;
                    context += this.getAllPartsContent();
                    context += `\n---\n\n`;

                    // Add current focus info
                    context += `# Current Focus: ${active.title}\n`;
                    if (active.focusInfo && active.focusInfo.type !== 'part') {
                        context += `(Working on ${active.focusInfo.type}: ${active.focusInfo.title})\n`;
                    }
                    context += `\n---\n\n`;

                } else {
                    // SMART STRATEGY (Default): Summaries + Current Part

                    // Add summaries of parts BEFORE the current part
                    if (active.partId) {
                        const { beforeSummaries, afterSummaries } = this.getOtherPartSummaries(active.partId);

                        if (beforeSummaries) {
                            context += `# Story So Far (Previous Parts)\n${beforeSummaries}\n---\n\n`;
                        }
                    }

                    // Add current part info with focus details
                    context += `# Current Part: ${active.title}`;
                    if (active.focusInfo && active.focusInfo.type !== 'part') {
                        context += ` (focused on ${active.focusInfo.type}: ${active.focusInfo.title})`;
                    }
                    context += `\n\n`;
                    context += `## Full Part Content (${active.wordCount} words):\n${active.content}\n\n---\n\n`;

                    // Add summaries of parts AFTER the current part
                    if (active.partId) {
                        const { afterSummaries } = this.getOtherPartSummaries(active.partId);
                        if (afterSummaries) {
                            context += `# Future Parts (Summaries)\n${afterSummaries}\n---\n\n`;
                        }
                    }
                }

                // Add existing suggestions for current part (Always include for both strategies)
                if (active.allSuggestions && active.allSuggestions.length > 0) {
                    context += `# Existing AI Suggestions in this Part\n\n`;
                    active.allSuggestions.forEach(item => {
                        context += `### Scene: ${item.sceneTitle} (${item.type} mode)\n`;
                        item.items.forEach(s => {
                            context += `- [S${s.number}]: ${s.text}\n`;
                        });
                        context += '\n';
                    });
                    context += '---\n\n';
                }
            } else if (active && active.type === 'book') {
                // Book-level context (no summaries needed, full manuscript)
                context += `# Full Manuscript: ${active.title}\n`;
                if (active.truncated) context += `> Note: Manuscript truncated to ~5000 words for context limits.\n\n`;
                context += `## Content (${active.wordCount} words):\n${active.content}\n\n---\n\n`;
            }
        }

        if (customChapterId) {
            const chapterContent = this.getChapterContent(customChapterId);
            if (chapterContent) {
                context += chapterContent + '\n---\n\n';
            }
        }

        if (includeCharacters) {
            context += this.getCharacterProfiles() + '\n---\n\n';
        }

        if (includePlot) {
            context += this.getPlotNotes() + '\n---\n\n';
        }

        if (includeNotes) {
            context += this.getStoryNotes() + '\n---\n\n';
        }

        if (includeAnalysis) {
            context += this.getAnalysisContext() + '\n---\n\n';
        }

        return context;
    }

    /**
     * Get a brief summary of the manuscript (for system prompt)
     */
    getManuscriptSummary() {
        const state = this.app.state;
        const parts = state.manuscript.parts || [];

        let totalWords = 0;
        let totalScenes = 0;
        let totalChapters = 0;

        parts.forEach(part => {
            part.chapters.forEach(chapter => {
                totalChapters++;
                chapter.scenes?.forEach(scene => {
                    totalScenes++;
                    const text = scene.content?.replace(/<[^>]*>/g, '') || '';
                    totalWords += text.trim().split(/\s+/).filter(w => w).length;
                });
            });
        });

        return {
            title: state.metadata.title,
            author: state.metadata.author,
            partCount: parts.length,
            chapterCount: totalChapters,
            sceneCount: totalScenes,
            wordCount: totalWords
        };
    }

    /**
     * Get analysis context (triggered by {analysis} macro)
     */
    getAnalysisContext() {
        const state = this.app.state;
        const analyses = state.analysis?.parts || {};

        if (Object.keys(analyses).length === 0) {
            return '# Agent Analysis\nNo analysis reports available yet.';
        }

        let context = '# 📊 Agent Analysis Reports\n\n';

        // Get parts in order
        const parts = state.manuscript.parts || [];
        parts.forEach(part => {
            const analysis = analyses[part.id];
            if (!analysis || analysis.isLoading) return;

            const partTitle = part.displayTitle || part.title;
            context += `## ${partTitle} Analysis\n`;
            context += `*Generated: ${new Date(analysis.generatedAt).toLocaleString()}*\n\n`;

            // Overall rating
            if (analysis.overall) {
                context += `**Overall Rating:** ${analysis.overall.rating}/10\n`;
                context += `**Summary:** ${analysis.overall.summary}\n\n`;

                if (analysis.overall.topPriorities?.length) {
                    context += `**Top Priorities:**\n`;
                    analysis.overall.topPriorities.forEach((p, i) => {
                        context += `${i + 1}. ${p}\n`;
                    });
                    context += '\n';
                }
            }

            // Category summaries (condensed)
            const categories = [
                { key: 'characterVoice', label: 'Character Voice' },
                { key: 'pacing', label: 'Pacing' },
                { key: 'consistency', label: 'Consistency' },
                { key: 'showVsTell', label: 'Show vs Tell' },
                { key: 'writingStyle', label: 'Writing Style' }
            ];

            categories.forEach(cat => {
                const data = analysis[cat.key];
                if (data) {
                    context += `### ${cat.label}`;
                    if (data.rating !== undefined) context += ` (${data.rating}/10)`;
                    context += '\n';

                    if (data.weaknesses?.length) {
                        context += `- **Issues:** ${data.weaknesses.join('; ')}\n`;
                    }
                    if (data.keyFeedback?.length) {
                        context += `- **Feedback:** ${data.keyFeedback.join('; ')}\n`;
                    }
                    context += '\n';
                }
            });

            context += '---\n\n';
        });

        return context;
    }
}
