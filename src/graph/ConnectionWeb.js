/**
 * ConnectionWeb - AI-powered relationship graph visualization
 * Phase 8: Connection Web feature
 */

import { stripContent } from '../utils/TextUtils.js';

export class ConnectionWeb {
    constructor(app) {
        this.app = app;

        // Edge type definitions
        this.EDGE_TYPES = {
            family: [
                'Parent', 'Child', 'Sibling', 'Spouse', 'Cousin', 'Grandparent', 'Grandchild',
                'Uncle/Aunt', 'Nephew/Niece', 'In-law', 'Step-relative', 'Adopted', 'Twin'
            ],
            romantic: [
                'Married', 'Engaged', 'Dating', 'Ex', 'Crush', 'Unrequited', 'Affair',
                'Betrothed', 'Widowed', 'Rivals-to-Lovers'
            ],
            professional: [
                'Boss', 'Employee', 'Colleague', 'Partner', 'Mentor', 'Apprentice',
                'Successor', 'Predecessor', 'Rival'
            ],
            social: [
                'Friend', 'Best Friend', 'Acquaintance', 'Neighbor', 'Childhood Friend',
                'Ally', 'Confidant'
            ],
            conflict: [
                'Enemy', 'Rival', 'Nemesis', 'Betrayed', 'Betrayer', 'Murderer', 'Victim',
                'Bully', 'Target', 'Framed'
            ],
            mystical: [
                'Clone', 'Alter-ego', 'Reincarnation', 'Host', 'Possessor', 'Creator',
                'Creation', 'Bound to'
            ],
            membership: [
                'Leader', 'Founder', 'Member', 'Former Member', 'Defector', 'Spy',
                'Infiltrator', 'Prisoner', 'Target', 'Protector', 'Exile', 'Recruit'
            ],
            location: [
                'Lives in', 'Born in', 'Died in', 'Visited', 'Rules', 'Imprisoned in',
                'Fled from', 'Protects', 'Destroyed', 'Discovered', 'Haunts', 'Buried at',
                'Headquarters', 'Territory', 'Contested', 'Conquered', 'Occupies'
            ],
            plot: [
                'Caused', 'Witnessed', 'Affected by', 'Survived', 'Died in', 'Prevented',
                'Unaware of', 'Orchestrated', 'Victim of', 'Benefited from', 'Foreshadows',
                'Result of', 'Related', 'Sequel to'
            ],
            item: [
                'Owns', 'Created', 'Destroyed', 'Seeks', 'Stole', 'Gifted', 'Inherited',
                'Cursed by', 'Bound to', 'Wielder of', 'Located at', 'Key to'
            ],
            political: [
                'Allied', 'At War', 'Truce', 'Trading Partners', 'Merged', 'Splinter of',
                'Vassal', 'Protectorate', 'Absorbed'
            ],
            spatial: [
                'Near', 'Connected', 'Part of', 'Portal to', 'Trade Route', 'Border',
                'Separated by'
            ]
        };

        // Node type colors
        this.NODE_COLORS = {
            character: '#4A90D9',
            faction: '#D94A4A',
            location: '#4AD97A',
            plotPoint: '#D9A84A',
            item: '#9B4AD9'
        };

        // Edge category colors
        this.EDGE_COLORS = {
            family: '#8B4513',
            romantic: '#E91E63',
            professional: '#607D8B',
            social: '#4CAF50',
            conflict: '#F44336',
            mystical: '#9C27B0',
            membership: '#FF9800',
            location: '#00BCD4',
            plot: '#795548',
            item: '#FFEB3B',
            political: '#3F51B5',
            spatial: '#009688'
        };

        // State
        this.isGenerating = false;
        this.cy = null; // Cytoscape instance
        this.selectedElement = null;

        // UI Elements
        this.modal = document.getElementById('connection-web-modal');
        this.canvas = document.getElementById('connection-web-canvas');
        this.inspector = document.getElementById('inspector-content');
        this.generateBtn = document.getElementById('btn-generate-web');
        this.generateText = document.getElementById('generate-web-text');
        this.zoomLevel = document.getElementById('zoom-level');

        this.bindEvents();
        this.loadCytoscape();
    }

    bindEvents() {
        // Modal controls
        document.getElementById('btn-connection-web')?.addEventListener('click', () => this.open());
        document.getElementById('close-connection-web')?.addEventListener('click', () => this.close());
        document.getElementById('connection-web-backdrop')?.addEventListener('click', () => this.close());

        // Toolbar
        this.generateBtn?.addEventListener('click', () => this.generate());
        document.getElementById('btn-add-node')?.addEventListener('click', () => this.addNodeManual());
        document.getElementById('btn-add-node')?.addEventListener('click', () => this.addNodeManual());
        document.getElementById('btn-add-edge')?.addEventListener('click', () => this.toggleLinkingMode());
        document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.zoom(1.2));
        document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.zoom(0.8));
        document.getElementById('btn-zoom-fit')?.addEventListener('click', () => this.fit());
    }

    async loadCytoscape() {
        // Load Cytoscape.js from CDN if not already loaded
        if (typeof cytoscape === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/cytoscape@3.28.1/dist/cytoscape.min.js';
            script.onload = () => {
                console.log('Cytoscape.js loaded');
                this.initGraph();
            };
            document.head.appendChild(script);
        } else {
            this.initGraph();
        }
    }

    initGraph() {
        // Only initialize if we have data
        const webData = this.app.state.connectionWeb;
        if (webData && webData.nodes && webData.nodes.length > 0) {
            this.renderGraph();
        }
    }

    // ===== MODAL CONTROLS =====

    open() {
        if (!this.modal) return;
        this.modal.classList.add('open');

        // Render existing graph if available
        if (this.app.state.connectionWeb?.nodes?.length > 0) {
            this.renderGraph();
            this.updateGenerateButton(false);
            document.getElementById('btn-add-node').disabled = false;
            document.getElementById('btn-add-edge').disabled = false;
        }
    }

    close() {
        this.modal?.classList.remove('open');
    }

    // ===== GRAPH RENDERING =====

    renderGraph() {
        const webData = this.app.state.connectionWeb;
        if (!webData || !this.canvas) return;

        // Clear placeholder
        const placeholder = this.canvas.querySelector('.connection-web-placeholder');
        if (placeholder) placeholder.style.display = 'none';

        // Convert data to Cytoscape format
        const elements = [];

        // Nodes
        webData.nodes.forEach(node => {
            elements.push({
                data: {
                    id: node.id,
                    label: node.label,
                    type: node.type,
                    color: this.NODE_COLORS[node.type] || '#888'
                },
                position: node.x && node.y ? { x: node.x, y: node.y } : undefined
            });
        });

        // Edges
        webData.edges.forEach(edge => {
            elements.push({
                data: {
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    label: edge.label,
                    category: edge.type,
                    color: this.EDGE_COLORS[edge.type] || '#888'
                }
            });
        });

        // Check if any nodes have saved positions
        const hasPositions = webData.nodes.some(n => n.x != null && n.y != null);

        // Initialize Cytoscape
        if (typeof cytoscape !== 'undefined') {
            this.cy = cytoscape({
                container: this.canvas,
                elements: elements,
                style: this.getGraphStyle(),
                layout: {
                    name: hasPositions ? 'preset' : 'cose',
                    animate: !hasPositions, // Only animate if arranging for first time
                    animationDuration: 1000,
                    nodeRepulsion: 50000,
                    idealEdgeLength: 200,
                    nodeOverlap: 50,
                    gravity: 0.1,
                    randomize: false,
                    padding: 80
                },
                minZoom: 0.2,
                maxZoom: 3
            });

            // Bind graph events
            this.cy.on('tap', 'node', (e) => {
                if (this.linkingMode) {
                    this.handleLinkStep(e.target);
                } else {
                    this.selectNode(e.target);
                }
            });
            this.cy.on('tap', 'edge', (e) => this.selectEdge(e.target));
            this.cy.on('tap', (e) => {
                if (e.target === this.cy) this.clearSelection();
            });

            // Hover effects
            this.cy.on('mouseover', 'node', (e) => {
                if (e.target.grabbed()) return;
                const node = e.target;
                this.cy.elements().addClass('dimmed');
                node.removeClass('dimmed');
                node.neighborhood().removeClass('dimmed');
            });
            this.cy.on('mouseout', 'node', () => {
                this.cy.elements().removeClass('dimmed');
            });

            this.cy.on('zoom', () => this.updateZoomLevel());
            this.cy.on('dragfree', 'node', (e) => this.onNodeDragged(e.target));

            this.updateZoomLevel();
        }
    }

    getGraphStyle() {
        return [
            {
                selector: 'node',
                style: {
                    'background-color': 'data(color)',
                    'label': 'data(label)',
                    'color': '#fff',
                    'font-family': 'Inter, sans-serif',
                    'font-weight': 600,
                    'text-valign': 'bottom',
                    'text-margin-y': 6,
                    'font-size': '13px',
                    'text-background-color': '#0f111a',
                    'text-background-opacity': 0.7,
                    'text-background-padding': '3px',
                    'text-background-shape': 'roundrectangle',
                    'text-background-border-width': 0,

                    'width': 48,
                    'height': 48,
                    'border-width': 2,
                    'border-color': 'rgba(255,255,255,0.2)',

                    'shadow-blur': 25,
                    'shadow-color': 'data(color)',
                    'shadow-opacity': 0.4,
                    'transition-property': 'opacity, shadow-opacity',
                    'transition-duration': '0.2s'
                }
            },
            {
                selector: '.dimmed',
                style: {
                    'opacity': 0.15,
                    'shadow-opacity': 0,
                    'text-opacity': 0.5,
                    'z-index': 0
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-width': 3,
                    'border-color': '#fff',
                    'border-opacity': 1,
                    'shadow-blur': 40,
                    'shadow-opacity': 0.8,
                    'z-index': 999
                }
            },
            {
                selector: 'edge',
                style: {
                    'line-color': 'data(color)',
                    'target-arrow-color': 'data(color)',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'width': 2,
                    'opacity': 0.6,
                    'label': 'data(label)',
                    'font-size': '12px',
                    'font-weight': 'bold',
                    'color': '#ffffff',
                    'text-rotation': 'autorotate',
                    'text-background-color': '#0f111a',
                    'text-background-opacity': 1,
                    'text-background-padding': '3px',
                    'text-background-shape': 'roundrectangle',
                    'text-border-width': 1,
                    'text-border-opacity': 0.3,
                    'text-border-color': '#fff',
                    'text-margin-y': -8,
                    'transition-property': 'opacity',
                    'transition-duration': '0.2s'
                }
            },
            {
                selector: 'edge.dimmed',
                style: {
                    'opacity': 0.05
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'width': 4,
                    'opacity': 1,
                    'shadow-blur': 10,
                    'shadow-color': 'data(color)'
                }
            }
        ];
    }

    // ===== INTERACTION =====

    selectNode(node) {
        this.selectedElement = { type: 'node', data: node.data() };
        this.renderInspector();
    }

    selectEdge(edge) {
        this.selectedElement = { type: 'edge', data: edge.data() };
        this.renderInspector();
    }

    clearSelection() {
        this.selectedElement = null;
        if (this.inspector) {
            this.inspector.innerHTML = '<div class="inspector-empty">Select a node or edge to view details.</div>';
        }
    }

    renderInspector() {
        if (!this.inspector || !this.selectedElement) return;

        const { type, data } = this.selectedElement;

        if (type === 'node') {
            this.inspector.innerHTML = `
                <div class="inspector-node">
                    <div class="inspector-row">
                        <label>Type</label>
                        <span class="inspector-badge" style="background: ${this.NODE_COLORS[data.type]}">${data.type}</span>
                    </div>
                    <div class="inspector-row">
                        <label>Name</label>
                        <input type="text" id="inspector-name" value="${data.label}" />
                    </div>
                    <div class="inspector-actions">
                        <button class="btn btn-secondary btn-sm" id="inspector-save">Save</button>
                        <button class="btn btn-danger btn-sm" id="inspector-delete">Delete</button>
                    </div>
                </div>
            `;

            document.getElementById('inspector-save')?.addEventListener('click', () => this.saveNodeEdit(data.id));
            document.getElementById('inspector-delete')?.addEventListener('click', () => this.deleteNode(data.id));
        } else if (type === 'edge') {
            this.inspector.innerHTML = `
                <div class="inspector-edge">
                    <div class="inspector-row">
                        <label>Connection</label>
                        <span>${this.getNodeLabel(data.source)} → ${this.getNodeLabel(data.target)}</span>
                    </div>
                    <div class="inspector-row">
                        <label>Type</label>
                        <span class="inspector-badge" style="background: ${this.EDGE_COLORS[data.category]}">${data.category}</span>
                    </div>
                    <div class="inspector-row">
                        <label>Label</label>
                        <input type="text" id="inspector-label" value="${data.label}" />
                    </div>
                    <div class="inspector-actions">
                        <button class="btn btn-secondary btn-sm" id="inspector-save">Save</button>
                        <button class="btn btn-danger btn-sm" id="inspector-delete">Delete</button>
                    </div>
                </div>
            `;

            document.getElementById('inspector-save')?.addEventListener('click', () => this.saveEdgeEdit(data.id));
            document.getElementById('inspector-delete')?.addEventListener('click', () => this.deleteEdge(data.id));
        }
    }

    getNodeLabel(nodeId) {
        const node = this.app.state.connectionWeb?.nodes?.find(n => n.id === nodeId);
        return node?.label || nodeId;
    }

    // ===== EDIT OPERATIONS =====

    saveNodeEdit(nodeId) {
        const newLabel = document.getElementById('inspector-name')?.value;
        if (!newLabel) return;

        const node = this.app.state.connectionWeb?.nodes?.find(n => n.id === nodeId);
        if (node) {
            node.label = newLabel;
            this.cy?.getElementById(nodeId).data('label', newLabel);
            this.app.save();
        }
    }

    saveEdgeEdit(edgeId) {
        const newLabel = document.getElementById('inspector-label')?.value;
        if (!newLabel) return;

        const edge = this.app.state.connectionWeb?.edges?.find(e => e.id === edgeId);
        if (edge) {
            edge.label = newLabel;
            this.cy?.getElementById(edgeId).data('label', newLabel);
            this.app.save();
        }
    }

    deleteNode(nodeId) {
        if (!confirm('Delete this node and all its connections?')) return;

        const webData = this.app.state.connectionWeb;
        if (!webData) return;

        // Remove node
        webData.nodes = webData.nodes.filter(n => n.id !== nodeId);
        // Remove connected edges
        webData.edges = webData.edges.filter(e => e.source !== nodeId && e.target !== nodeId);

        this.cy?.getElementById(nodeId).remove();
        this.clearSelection();
        this.app.save();
    }

    deleteEdge(edgeId) {
        if (!confirm('Delete this connection?')) return;

        const webData = this.app.state.connectionWeb;
        if (!webData) return;

        webData.edges = webData.edges.filter(e => e.id !== edgeId);
        this.cy?.getElementById(edgeId).remove();
        this.clearSelection();
        this.app.save();
    }

    onNodeDragged(node) {
        const nodeData = this.app.state.connectionWeb?.nodes?.find(n => n.id === node.id());
        if (nodeData) {
            const pos = node.position();
            nodeData.x = pos.x;
            nodeData.y = pos.y;
            nodeData.pinned = true;
            this.app.save();
        }
    }

    // ===== ZOOM CONTROLS =====

    zoom(factor) {
        if (this.cy) {
            const currentZoom = this.cy.zoom();
            this.cy.zoom(currentZoom * factor);
            this.cy.center();
            this.updateZoomLevel();
        }
    }

    fit() {
        if (this.cy) {
            this.cy.fit(undefined, 50);
            this.updateZoomLevel();
        }
    }

    updateZoomLevel() {
        if (this.cy && this.zoomLevel) {
            const zoom = Math.round(this.cy.zoom() * 100);
            this.zoomLevel.textContent = `${zoom}%`;
        }
    }

    // ===== AI GENERATION =====

    async generate() {
        if (this.isGenerating) return;

        this.isGenerating = true;
        this.updateGenerateButton(true);

        try {
            // Build context from manuscript + world info
            const context = this.buildContext();
            const prompt = this.buildPrompt(context);

            const response = await this.app.aiService.sendAliveRequest(
                prompt,
                'You are an expert at analyzing narratives and extracting relationship graphs. Return only valid JSON.'
            );

            console.log('Connection Web response:', response);

            // Parse response
            const graphData = this.parseResponse(response);

            if (graphData) {
                // Save to state
                this.app.state.connectionWeb = {
                    ...graphData,
                    lastGenerated: new Date().toISOString()
                };
                this.app.save();

                // Enable add buttons
                document.getElementById('btn-add-node').disabled = false;
                document.getElementById('btn-add-edge').disabled = false;

                // Render
                this.renderGraph();
            }

        } catch (err) {
            console.error('Connection Web generation failed:', err);
            alert('Failed to generate Connection Web. Please check your API configuration.');
        }

        this.isGenerating = false;
        this.updateGenerateButton(false);
    }

    updateGenerateButton(generating) {
        if (this.generateText) {
            if (generating) {
                this.generateText.textContent = 'Generating...';
                this.generateBtn.disabled = true;
            } else {
                const hasData = this.app.state.connectionWeb?.nodes?.length > 0;
                this.generateText.textContent = hasData ? 'Update Web' : 'Generate Web';
                this.generateBtn.disabled = false;
            }
        }
    }

    buildContext() {
        // Gather manuscript text
        let manuscriptText = '';
        const parts = this.app.state.manuscript?.parts || [];

        parts.forEach(part => {
            manuscriptText += `\n=== ${part.title} ===\n`;
            part.chapters?.forEach(chapter => {
                manuscriptText += `\n--- ${chapter.title} ---\n`;
                chapter.scenes?.forEach(scene => {
                    const content = stripContent(scene.content || '');
                    manuscriptText += content + '\n';
                });
            });
        });

        // Gather world info
        const worldInfo = this.app.state.manuscript?.worldInfo || {};
        let worldInfoText = '';

        if (worldInfo.cast?.length > 0) {
            worldInfoText += '\n=== CHARACTERS (Cast) ===\n';
            worldInfo.cast.forEach(cast => {
                worldInfoText += `\nCast: ${cast.name}\n`;
                cast.characters?.forEach(char => {
                    worldInfoText += `- ${char.name}: ${char.description || ''}\n`;
                });
            });
        }

        if (worldInfo.locations?.length > 0) {
            worldInfoText += '\n=== LOCATIONS ===\n';
            worldInfo.locations.forEach(loc => {
                worldInfoText += `- ${loc.name}: ${loc.description || ''}\n`;
            });
        }

        if (worldInfo.lore?.length > 0) {
            worldInfoText += '\n=== LORE (Factions, History, etc.) ===\n';
            worldInfo.lore.forEach(item => {
                worldInfoText += `- ${item.name}: ${item.description || ''}\n`;
            });
        }

        if (worldInfo.items?.length > 0) {
            worldInfoText += '\n=== ITEMS ===\n';
            worldInfo.items.forEach(item => {
                worldInfoText += `- ${item.name}: ${item.description || ''}\n`;
            });
        }

        return { manuscriptText, worldInfoText };
    }

    buildPrompt(context) {
        return `Analyze the following manuscript and world information to extract a relationship graph.

=== MANUSCRIPT ===
${context.manuscriptText}

=== WORLD INFORMATION ===
${context.worldInfoText}

=== YOUR TASK ===

Extract ALL entities and their relationships from the text above. Return a JSON object with this EXACT structure:

{
  "nodes": [
    { "id": "unique_id", "type": "character", "label": "Character Name" },
    { "id": "unique_id", "type": "faction", "label": "Faction Name" },
    { "id": "unique_id", "type": "location", "label": "Location Name" },
    { "id": "unique_id", "type": "plotPoint", "label": "Major Event" },
    { "id": "unique_id", "type": "item", "label": "Item Name" }
  ],
  "edges": [
    { "id": "edge_id", "source": "node_id_1", "target": "node_id_2", "type": "romantic", "label": "Married" }
  ]
}

=== RULES ===

1. Node types must be one of: character, faction, location, plotPoint, item
2. Edge types must be one of: family, romantic, professional, social, conflict, mystical, membership, location, plot, item, political, spatial
3. Edge labels should be specific (e.g., "Parent", "Enemy", "Leader of", "Lives in")
4. Include ALL named characters, organizations, and significant locations
5. Include implicit relationships (e.g., if A killed B's father, A and B have a "conflict" type edge)
6. For major plot events that connect multiple characters, create a plotPoint node
7. Generate unique IDs (e.g., "char_1", "faction_1", "loc_1", etc.)

Return ONLY the JSON object, no other text.`;
    }

    parseResponse(response) {
        try {
            // Try to extract JSON from response
            let jsonStr = response;

            // Handle markdown code blocks
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            // Parse JSON
            const data = JSON.parse(jsonStr.trim());

            // Validate structure
            if (!data.nodes || !Array.isArray(data.nodes)) {
                throw new Error('Invalid response: missing nodes array');
            }
            if (!data.edges || !Array.isArray(data.edges)) {
                data.edges = [];
            }

            // Ensure all nodes have required fields
            data.nodes = data.nodes.map((node, i) => ({
                id: node.id || `node_${i}`,
                type: node.type || 'character',
                label: node.label || 'Unknown',
                x: null,
                y: null,
                pinned: false
            }));

            // Ensure all edges have required fields
            data.edges = data.edges.map((edge, i) => ({
                id: edge.id || `edge_${i}`,
                source: edge.source,
                target: edge.target,
                type: edge.type || 'social',
                label: edge.label || 'Connected'
            }));

            // Filter out edges with invalid node references
            const nodeIds = new Set(data.nodes.map(n => n.id));
            data.edges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

            console.log(`Parsed ${data.nodes.length} nodes and ${data.edges.length} edges`);

            return data;

        } catch (err) {
            console.error('Failed to parse Connection Web response:', err);
            console.error('Raw response:', response);
            return null;
        }
    }

    // ===== MANUAL ADD =====

    addNodeManual() {
        const label = prompt('Enter node name:');
        if (!label) return;

        const type = prompt('Enter type (character, faction, location, plotPoint, item):', 'character');
        if (!type) return;

        const webData = this.app.state.connectionWeb || { nodes: [], edges: [] };

        // Find best position (center of view)
        let posX = 0, posY = 0;
        if (this.cy) {
            const pan = this.cy.pan();
            const zoom = this.cy.zoom();
            const w = this.cy.width();
            const h = this.cy.height();
            posX = (-pan.x + w / 2) / zoom;
            posY = (-pan.y + h / 2) / zoom;
        }

        const newNode = {
            id: `node_${Date.now()}`,
            type: type,
            label: label,
            x: posX,
            y: posY,
            pinned: true
        };

        webData.nodes.push(newNode);
        this.app.state.connectionWeb = webData;
        this.app.save();

        // Add to graph
        if (this.cy) {
            this.cy.add({
                data: {
                    id: newNode.id,
                    label: newNode.label,
                    type: newNode.type,
                    color: this.NODE_COLORS[newNode.type] || '#888'
                },
                position: { x: posX, y: posY }
            });
        }
    }

    toggleLinkingMode() {
        this.linkingMode = !this.linkingMode;
        this.linkSource = null;

        const btn = document.getElementById('btn-add-edge');
        if (!btn) return;

        if (this.linkingMode) {
            btn.classList.add('btn-active');
            btn.innerHTML = '<span class="btn-icon">❌</span> Cancel Link';
            this.clearSelection();
            if (this.inspector) {
                this.inspector.innerHTML = `
                    <div class="inspector-empty">
                        <p><strong>🔗 Linking Mode</strong></p>
                        <p>Select the <b>SOURCE</b> node to start.</p>
                    </div>`;
            }
        } else {
            btn.classList.remove('btn-active');
            btn.innerHTML = '<span class="btn-icon">🔗</span> Link Nodes';
            if (this.inspector) {
                this.inspector.innerHTML = '<div class="inspector-empty">Select a node or edge to view details.</div>';
            }
            this.cy.nodes().removeClass('selected');
        }
    }

    handleLinkStep(node) {
        if (!this.linkSource) {
            // Step 1: Source Selected
            this.linkSource = node;
            node.addClass('selected');
            if (this.inspector) {
                this.inspector.innerHTML = `
                    <div class="inspector-empty">
                        <p><strong>🔗 Linking Mode</strong></p>
                        <p>Source: <strong style="color: ${this.NODE_COLORS[node.data('type')] || '#fff'}">${node.data('label')}</strong></p>
                        <p>Now select the <b>TARGET</b> node.</p>
                    </div>`;
            }
        } else {
            // Step 2: Target Selected
            if (node.id() === this.linkSource.id()) {
                alert('Cannot link a node to itself.');
                return;
            }

            const source = this.linkSource;
            const target = node;

            // Exit linking mode state but keep context for form
            this.linkingMode = false;
            const btn = document.getElementById('btn-add-edge');
            if (btn) {
                btn.classList.remove('btn-active');
                btn.innerHTML = '<span class="btn-icon">🔗</span> Link Nodes';
            }
            this.cy.nodes().removeClass('selected');

            this.renderNewEdgeForm(source, target);
        }
    }

    renderNewEdgeForm(source, target) {
        if (!this.inspector) return;

        // Pre-select category based on node types? Default to social.
        const defaultCat = 'social';

        this.inspector.innerHTML = `
            <div class="inspector-edge">
                <div class="inspector-header" style="background: transparent; padding: 0 0 16px 0; border: none;">
                    <h3>🔗 New Connection</h3>
                </div>
                <div class="inspector-row">
                    <label>From</label>
                    <div style="padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                        ${source.data('label')}
                    </div>
                </div>
                <div class="inspector-row">
                    <label>To</label>
                    <div style="padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                        ${target.data('label')}
                    </div>
                </div>
                <div class="inspector-row">
                    <label>Type</label>
                    <select id="new-edge-type" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
                        ${Object.keys(this.EDGE_TYPES).map(t => `<option value="${t}" ${t === defaultCat ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>
                <div class="inspector-row">
                    <label>Label</label>
                    <input type="text" id="new-edge-label" value="Connected" placeholder="e.g. Friend, Enemy" />
                </div>
                <div class="inspector-actions">
                    <button class="btn btn-primary btn-sm" id="btn-create-edge-confirm" style="width: 100%;">Create Connection</button>
                    <button class="btn btn-secondary btn-sm" id="btn-cancel-edge" style="width: 100%;">Cancel</button>
                </div>
            </div>
        `;

        document.getElementById('btn-create-edge-confirm')?.addEventListener('click', () => {
            const type = document.getElementById('new-edge-type').value;
            const label = document.getElementById('new-edge-label').value || 'Connected';
            this.createEdge(source.id(), target.id(), type, label);
        });

        document.getElementById('btn-cancel-edge')?.addEventListener('click', () => {
            this.inspector.innerHTML = '<div class="inspector-empty">Select a node or edge to view details.</div>';
        });
    }

    createEdge(sourceId, targetId, type, label) {
        const webData = this.app.state.connectionWeb;
        if (!webData) return;

        const newEdge = {
            id: `edge_${Date.now()}`,
            source: sourceId,
            target: targetId,
            type: type,
            label: label
        };

        webData.edges.push(newEdge);
        this.app.save();

        if (this.cy) {
            this.cy.add({
                data: {
                    id: newEdge.id,
                    source: newEdge.source,
                    target: newEdge.target,
                    label: newEdge.label,
                    category: newEdge.type,
                    color: this.EDGE_COLORS[newEdge.type] || '#888'
                }
            });
        }

        // Show success/select new edge
        this.selectEdge(this.cy.getElementById(newEdge.id));
    }
}
