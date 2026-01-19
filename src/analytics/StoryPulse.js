
import { stripContent } from '../utils/TextUtils.js';

export class StoryPulse {
    constructor(app) {
        this.app = app;
        this.modal = document.getElementById('story-pulse-modal');
        this.graphContainer = document.getElementById('pulse-graph-container');
        this.notesContainer = document.getElementById('pulse-notes-container');
        this.btnRun = document.getElementById('btn-run-pulse');
        this.checkboxes = document.querySelectorAll('.pulse-controls input[type="checkbox"]');

        this.isAnalyzing = false;

        this.metrics = ['pacing', 'engagement', 'enjoyability', 'emotional', 'tension', 'atmosphere', 'depth'];

        this.colors = {
            pacing: '#FF5733',
            engagement: '#28B463',
            enjoyability: '#F1C40F',
            emotional: '#8E44AD',
            tension: '#C0392B',
            atmosphere: '#2980B9',
            depth: '#797D7F'
        };

        this.metricLabels = {
            pacing: 'Pacing',
            engagement: 'Engagement',
            enjoyability: 'Enjoyability',
            emotional: 'Emotional Impact',
            tension: 'Tension',
            atmosphere: 'Atmosphere',
            depth: 'Depth'
        };

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-story-pulse').addEventListener('click', () => this.open());
        document.getElementById('close-story-pulse').addEventListener('click', () => this.close());
        document.getElementById('close-story-pulse-btn').addEventListener('click', () => this.close());
        document.getElementById('story-pulse-backdrop').addEventListener('click', () => this.close());

        this.btnRun.addEventListener('click', () => this.runAnalysis());

        this.checkboxes.forEach(cb => {
            cb.addEventListener('change', () => this.renderGraph());
        });
    }

    open() {
        this.modal.classList.add('open');

        // Render existing data if available
        if (this.app.state.analytics && this.app.state.analytics.pulse) {
            this.renderGraph();
            this.renderNotes();
        }
    }

    close() {
        this.modal.classList.remove('open');
    }

    /**
     * Build the full manuscript with chapter markers
     */
    buildManuscript() {
        const parts = this.app.state.manuscript.parts || [];
        const chapters = [];
        let manuscriptText = '';

        parts.forEach((part, pIdx) => {
            part.chapters.forEach((chapter, cIdx) => {
                // Format: "ChapterName (Part X)"
                const chapterLabel = `${chapter.title} (Part ${pIdx + 1})`;
                chapters.push(chapterLabel);

                const content = chapter.scenes?.map(s => {
                    return stripContent(s.content);
                }).join('\n\n') || '';
                manuscriptText += `\n\n=== ${chapterLabel} ===\n\n${content}`;
            });
        });

        return { chapters, manuscriptText };
    }

    async runAnalysis() {
        if (this.isAnalyzing) return;

        const parts = this.app.state.manuscript.parts || [];
        if (parts.length === 0) {
            alert('No manuscript to analyze!');
            return;
        }

        this.isAnalyzing = true;
        this.btnRun.disabled = true;

        const { chapters, manuscriptText } = this.buildManuscript();

        if (chapters.length === 0) {
            alert('No chapters found!');
            this.isAnalyzing = false;
            this.btnRun.disabled = false;
            return;
        }

        // Initialize pulse data structure
        const pulseData = {
            chapters: chapters,
            metrics: {}
        };

        try {
            // Analyze each metric separately
            for (let i = 0; i < this.metrics.length; i++) {
                const metric = this.metrics[i];
                this.btnRun.innerText = `Analyzing ${this.metricLabels[metric]} (${i + 1}/${this.metrics.length})...`;

                const result = await this.analyzeMetric(metric, chapters, manuscriptText);
                pulseData.metrics[metric] = result;
            }

            // Save results
            if (!this.app.state.analytics) this.app.state.analytics = {};
            this.app.state.analytics.pulse = pulseData;
            this.app.save();

            this.renderGraph();
            this.renderNotes();

        } catch (err) {
            console.error(err);
            alert('Analysis failed: ' + err.message);
        } finally {
            this.isAnalyzing = false;
            this.btnRun.innerText = 'Run Analysis (Whole Book)';
            this.btnRun.disabled = false;
        }
    }

    async analyzeMetric(metric, chapters, manuscriptText) {
        const prompt = `
You are a critical literary analyst. Analyze the following manuscript and rate EACH CHAPTER on "${this.metricLabels[metric]}" from 1-10.

Be COMPARATIVE - your scores should reflect how chapters compare to EACH OTHER within this story. High variance is good (don't just give everything 6-8).

Chapters to rate:
${chapters.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Respond with ONLY valid JSON in this exact format:
{
    "scores": [7, 5, 8, 6, ...],
    "justification": "A 2-3 sentence explanation of what drove your ratings and which chapters stood out."
}

The "scores" array must have exactly ${chapters.length} numbers (one per chapter in order).

=== MANUSCRIPT ===
${manuscriptText}
`;

        const response = await this.app.aiService.sendMessage(
            [{ role: 'user', content: prompt }],
            {
                systemPrompt: 'You are a literary analyst. Output valid JSON only. No markdown.',
                temperature: 0.4
            }
        );

        // Parse JSON
        try {
            const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);

            // Validate
            if (!Array.isArray(parsed.scores) || parsed.scores.length !== chapters.length) {
                throw new Error('Invalid scores array length');
            }

            return {
                scores: parsed.scores.map(s => Math.max(1, Math.min(10, parseInt(s) || 5))),
                justification: parsed.justification || 'No justification provided.'
            };
        } catch (e) {
            console.error('Failed to parse metric score', metric, response);
            // Fallback
            return {
                scores: chapters.map(() => 5),
                justification: 'Analysis failed to parse. Default scores applied.'
            };
        }
    }

    renderNotes() {
        const data = this.app.state.analytics?.pulse;
        if (!data || !data.metrics) {
            this.notesContainer.innerHTML = '<div class="pulse-placeholder">Run analysis to see notes.</div>';
            return;
        }

        let html = '<div class="pulse-notes-list">';

        this.metrics.forEach(metric => {
            const metricData = data.metrics[metric];
            if (!metricData) return;

            html += `
                <div class="pulse-note-item">
                    <div class="pulse-note-header" style="border-left: 4px solid ${this.colors[metric]}">
                        <span class="pulse-note-label">${this.metricLabels[metric]}</span>
                    </div>
                    <div class="pulse-note-body">${metricData.justification}</div>
                </div>
            `;
        });

        html += '</div>';
        this.notesContainer.innerHTML = html;
    }

    renderGraph() {
        const data = this.app.state.analytics?.pulse;
        if (!data || !data.chapters || !data.metrics) {
            this.graphContainer.innerHTML = '<div class="pulse-placeholder">Click "Run Analysis" to generate the story arc.</div>';
            return;
        }

        const activeMetrics = Array.from(this.checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        if (activeMetrics.length === 0) {
            this.graphContainer.innerHTML = '<div class="pulse-placeholder">Select metrics to view graph.</div>';
            return;
        }

        const chapters = data.chapters;
        const count = chapters.length;

        // Dynamic width: minimum 120px per chapter, or container width if smaller
        const containerWidth = this.graphContainer.clientWidth || 800;
        const minWidthPerChapter = 120;
        const calculatedWidth = Math.max(containerWidth, count * minWidthPerChapter);

        const height = 400;
        const padding = { top: 30, right: 40, bottom: 100, left: 50 };
        const graphW = calculatedWidth - padding.left - padding.right;
        const graphH = height - padding.top - padding.bottom;
        const xStep = graphW / (count - 1 || 1);

        const getY = (score) => {
            const n = Math.max(1, Math.min(10, score));
            return padding.top + graphH - ((n - 1) / 9) * graphH;
        };

        let svgHtml = `<div class="pulse-graph-inner" style="width: ${calculatedWidth}px; height: ${height}px;">`;
        svgHtml += `<svg class="pulse-svg" width="${calculatedWidth}" height="${height}">`;

        // Grid Lines
        for (let i = 1; i <= 10; i++) {
            const y = getY(i);
            svgHtml += `<line x1="${padding.left}" y1="${y}" x2="${calculatedWidth - padding.right}" y2="${y}" class="pulse-grid-line" />`;
            if (i % 2 === 0 || i === 10 || i === 1) {
                svgHtml += `<text x="${padding.left - 8}" y="${y + 3}" class="pulse-axis-text" text-anchor="end">${i}</text>`;
            }
        }

        // X Labels (Chapter names - horizontal, simple)
        chapters.forEach((ch, i) => {
            const x = padding.left + i * xStep;
            // Just use the raw chapter label (already formatted with Part info)
            let label = ch;
            if (label.length > 12) label = label.substring(0, 10) + '..';
            svgHtml += `<text x="${x}" y="${padding.top + graphH + 20}" class="pulse-axis-text" text-anchor="middle" style="font-size: 10px;">${label}</text>`;
        });

        // Draw Lines for each active metric
        activeMetrics.forEach(metric => {
            const metricData = data.metrics[metric];
            if (!metricData || !metricData.scores) return;

            const color = this.colors[metric];
            const scores = metricData.scores;
            let points = [];

            scores.forEach((score, i) => {
                points.push({ x: padding.left + i * xStep, y: getY(score), val: score, ch: chapters[i] });
            });

            if (points.length === 0) return;

            // Curvy path
            let dPath = `M ${points[0].x} ${points[0].y}`;

            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i];
                const p1 = points[i + 1];
                const cp1x = p0.x + (p1.x - p0.x) * 0.4;
                const cp1y = p0.y;
                const cp2x = p1.x - (p1.x - p0.x) * 0.4;
                const cp2y = p1.y;
                dPath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
            }

            svgHtml += `<path d="${dPath}" class="pulse-line-path" stroke="${color}" />`;

            // Draw Dots
            points.forEach(p => {
                svgHtml += `<circle cx="${p.x}" cy="${p.y}" class="pulse-point" stroke="${color}" data-val="${this.metricLabels[metric]}: ${p.val}\n${p.ch}" />`;
            });
        });

        svgHtml += `</svg></div>`;
        svgHtml += `<div id="pulse-tooltip" class="pulse-tooltip"></div>`;

        this.graphContainer.innerHTML = svgHtml;

        // Tooltip events
        this.graphContainer.querySelectorAll('.pulse-point').forEach(dot => {
            dot.addEventListener('mouseenter', (e) => {
                const tip = document.getElementById('pulse-tooltip');
                tip.innerText = e.target.getAttribute('data-val');
                tip.classList.add('visible');
                const rect = this.graphContainer.getBoundingClientRect();
                tip.style.left = (e.clientX - rect.left + 10) + 'px';
                tip.style.top = (e.clientY - rect.top - 30) + 'px';
            });
            dot.addEventListener('mouseleave', () => {
                document.getElementById('pulse-tooltip').classList.remove('visible');
            });
        });
    }
}
