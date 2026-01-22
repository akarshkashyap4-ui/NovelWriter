/**
 * NovelWriter - Main Application Entry Point
 * With multi-project support, reading mode, and project management
 */

import { Storage } from './storage/LocalStorage.js';
import { FileStorage } from './storage/FileStorage.js';
import { BackupService } from './storage/BackupService.js';
import { TreeNav } from './navigation/TreeNav.js';
import { Toolbar } from './editor/Toolbar.js';
import { Settings } from './settings/ThemeSettings.js';
import { AIService } from './ai/AIService.js';
import { APIConfig } from './ai/APIConfig.js';
import { AgentPanel } from './ai/AgentPanel.js';
import { ImageService } from './ai/ImageService.js';
import { StoryPulse } from './analytics/StoryPulse.js';
import { PlotTracker } from './analytics/PlotTracker.js';
import { AliveEditor } from './alive/AliveEditor.js';
import { EchoChamber } from './alive/EchoChamber.js';
import { ConnectionWeb } from './graph/ConnectionWeb.js';
import { EventLine } from './graph/EventLine.js';

class NovelWriterApp {
  constructor() {
    this.storage = new Storage();

    // Migrate old storage if needed
    this.storage.migrateOldStorage();

    this.state = this.storage.load();
    this.currentContext = null;

    // Initialize modules
    this.treeNav = new TreeNav(this);
    this.toolbar = new Toolbar(this);
    this.settings = new Settings(this);
    this.aiService = new AIService(this);
    this.imageService = new ImageService(this);
    this.fileStorage = new FileStorage(this);  // External image storage
    this.apiConfig = new APIConfig(this);
    this.agentPanel = new AgentPanel(this);
    this.storyPulse = new StoryPulse(this);
    this.plotTracker = new PlotTracker(this);
    this.echoChamber = new EchoChamber(this);
    this.aliveEditor = new AliveEditor(this);
    this.connectionWeb = new ConnectionWeb(this);
    this.eventLine = new EventLine(this);
    this.backupService = new BackupService(this);

    this.bindEvents();
    this.bindSelectionEvents();
    this.render();
    this.applyTheme(this.state.settings.theme);

    console.log('NovelWriter initialized with AI service!');
  }

  bindEvents() {
    // Theme toggle
    document.getElementById('btn-theme').addEventListener('click', () => {
      const newTheme = this.state.settings.theme === 'light' ? 'dark' : 'light';
      this.state.settings.theme = newTheme;
      this.applyTheme(newTheme);
      this.save();
    });

    // New Project
    document.getElementById('btn-new-project').addEventListener('click', () => {
      this.newProject();
    });

    // Save Project (export to file)
    document.getElementById('btn-save-project').addEventListener('click', () => {
      this.storage.exportToFile(this.state);
    });

    // Open Project (show project selector)
    document.getElementById('btn-open-project').addEventListener('click', () => {
      this.openProjectsModal();
    });

    // Close projects modal
    document.getElementById('close-projects').addEventListener('click', () => {
      this.closeProjectsModal();
    });
    document.getElementById('projects-backdrop').addEventListener('click', () => {
      this.closeProjectsModal();
    });

    // Import from file
    document.getElementById('import-project-btn').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.storage.importFromFile(file).then(data => {
          this.state = data;
          this.render();
          this.loadBookTitlePage();
          this.closeProjectsModal();
          alert('Project imported successfully!');
        }).catch(err => {
          alert('Failed to import project: ' + err.message);
        });
        e.target.value = '';
      }
    });

    // Reading Mode
    document.getElementById('btn-reading-mode').addEventListener('click', () => {
      this.openReadingMode();
    });

    document.getElementById('close-reading').addEventListener('click', () => {
      this.closeReadingMode();
    });

    // Book Dashboard
    document.getElementById('btn-dashboard').addEventListener('click', () => {
      this.treeNav.loadDashboard();
    });

    // Settings modal
    document.getElementById('btn-settings').addEventListener('click', () => {
      this.settings.openModal();
    });

    document.getElementById('close-settings').addEventListener('click', () => {
      this.settings.closeModal();
    });

    // API Configuration modal
    document.getElementById('btn-api-config').addEventListener('click', () => {
      this.apiConfig.openModal();
    });

    document.querySelector('.modal-backdrop').addEventListener('click', () => {
      this.settings.closeModal();
    });

    // Thesaurus modal
    this.thesaurusMode = 'synonyms'; // 'synonyms' or 'antonyms'

    document.getElementById('btn-thesaurus').addEventListener('click', () => {
      document.getElementById('thesaurus-modal').classList.add('open');
      document.getElementById('thesaurus-input').focus();
    });

    document.getElementById('close-thesaurus').addEventListener('click', () => {
      document.getElementById('thesaurus-modal').classList.remove('open');
    });

    // Focus Mode toggle
    document.getElementById('btn-focus-mode').addEventListener('click', () => {
      this.toggleFocusMode();
    });

    // Escape key to exit focus mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) {
        this.toggleFocusMode();
      }
      // F11 to toggle focus mode
      if (e.key === 'F11') {
        e.preventDefault();
        this.toggleFocusMode();
      }
    });

    document.getElementById('thesaurus-modal').addEventListener('click', (e) => {
      if (e.target.id === 'thesaurus-modal' || e.target.id === 'thesaurus-backdrop') {
        document.getElementById('thesaurus-modal').classList.remove('open');
      }
    });

    document.getElementById('toggle-synonyms').addEventListener('click', () => {
      this.thesaurusMode = 'synonyms';
      document.getElementById('toggle-synonyms').classList.add('active');
      document.getElementById('toggle-antonyms').classList.remove('active');
      // Re-search if there's a word
      const word = document.getElementById('thesaurus-input').value.trim();
      if (word) this.searchThesaurus(word);
    });

    document.getElementById('toggle-antonyms').addEventListener('click', () => {
      this.thesaurusMode = 'antonyms';
      document.getElementById('toggle-antonyms').classList.add('active');
      document.getElementById('toggle-synonyms').classList.remove('active');
      // Re-search if there's a word
      const word = document.getElementById('thesaurus-input').value.trim();
      if (word) this.searchThesaurus(word);
    });

    document.getElementById('thesaurus-search-btn').addEventListener('click', () => {
      const word = document.getElementById('thesaurus-input').value.trim();
      if (word) this.searchThesaurus(word);
    });

    document.getElementById('thesaurus-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const word = e.target.value.trim();
        if (word) this.searchThesaurus(word);
      }
    });

    // Auto-save on content change
    const editorContent = document.getElementById('editor-content');
    let saveTimeout;
    editorContent.addEventListener('input', () => {
      if (!this.currentContext) return;
      if (this.currentContext.type !== 'scene' && this.currentContext.type !== 'note') return;

      clearTimeout(saveTimeout);
      document.getElementById('save-status').textContent = 'Saving...';
      saveTimeout = setTimeout(() => {
        this.saveCurrentContent();
        document.getElementById('save-status').textContent = 'Saved';
      }, 1000);

      this.updateWordCount(editorContent.innerText);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            this.saveCurrentContent();
            document.getElementById('save-status').textContent = 'Saved';
            break;
          case 'b':
            e.preventDefault();
            this.toolbar.toggleFormat('bold');
            break;
          case 'i':
            e.preventDefault();
            this.toolbar.toggleFormat('italic');
            break;
          case 'u':
            e.preventDefault();
            this.toolbar.toggleFormat('underline');
            break;
        }
      }
      if (e.key === 'Escape') {
        this.closeReadingMode();
        this.closeProjectsModal();
      }
    });
  }

  // ========== PROJECT MANAGEMENT ==========
  bindSelectionEvents() {
    // Selection toolbar disabled - quick actions moved to scene context menu
    return;

    // Show toolbar on selection
    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if (!selection.rangeCount || selection.isCollapsed || !editor.contains(selection.anchorNode)) {
        toolbar.classList.remove('visible');
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Position toolbar centered above selection
      // Calculate relative to viewport
      const toolbarHeight = 40; // Approx
      const top = rect.top - toolbarHeight - 10;
      const left = rect.left + (rect.width / 2) - (toolbar.offsetWidth / 2);

      toolbar.style.top = `${Math.max(10, top + window.scrollY)}px`;
      toolbar.style.left = `${Math.max(10, left + window.scrollX)}px`;
      toolbar.classList.add('visible');
    });

    // Handle toolbar actions
    toolbar.addEventListener('mousedown', (e) => {
      // Prevent losing selection focus
      e.preventDefault();
    });

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-action-btn');
      if (!btn) return;

      const action = btn.dataset.action;
      const selection = window.getSelection();
      const text = selection.toString();

      if (text) {
        this.handleSelectionAction(action, text);
        toolbar.classList.remove('visible');
      }
    });
  }

  handleSelectionAction(action, text) {
    if (!this.agentPanel) return;

    // Open panel if closed
    if (!this.agentPanel.isExpanded) {
      this.agentPanel.togglePanel();
    }

    // 'ask' is the only action that shows user input
    if (action === 'ask') {
      this.agentPanel.inputField.value = `I have a question about this text:\n"${text}"\n\nMy question: `;
      this.agentPanel.inputField.focus();
      return;
    }

    // All other actions use the silent request (no visible prompt)
    this.agentPanel.sendSilentRequest(action, text);
  }

  openProjectsModal() {
    const modal = document.getElementById('projects-modal');
    const list = document.getElementById('projects-list');
    const projects = this.storage.getProjectList();

    if (projects.length === 0) {
      list.innerHTML = '<div class="projects-empty">No saved projects yet. Create your first project!</div>';
    } else {
      // Sort by modified date, newest first
      projects.sort((a, b) => new Date(b.modified) - new Date(a.modified));

      list.innerHTML = projects.map(p => {
        const isCurrent = p.id === this.state.id;
        const modified = new Date(p.modified).toLocaleDateString();
        return `
          <div class="project-item ${isCurrent ? 'current' : ''}" data-id="${p.id}">
            <div class="project-info">
              <div class="project-name">${p.title}</div>
              <div class="project-date">Last modified: ${modified}</div>
            </div>
            <div class="project-actions">
              ${isCurrent ? '<span class="project-current-badge">Current</span>' : `
                <button class="btn btn-sm btn-primary project-open-btn" data-id="${p.id}">Open</button>
              `}
              <button class="btn btn-sm btn-danger project-delete-btn" data-id="${p.id}">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      // Bind open buttons
      list.querySelectorAll('.project-open-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.switchProject(btn.dataset.id);
        });
      });

      // Bind delete buttons
      list.querySelectorAll('.project-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteProject(btn.dataset.id);
        });
      });
    }

    modal.classList.add('open');
  }

  closeProjectsModal() {
    document.getElementById('projects-modal').classList.remove('open');
  }

  switchProject(projectId) {
    this.state = this.storage.switchToProject(projectId);
    this.currentContext = null;
    this.render();
    this.loadBookTitlePage();
    this.closeProjectsModal();

    // Reload agent panel conversations for the new project
    if (this.agentPanel) {
      this.agentPanel.loadActiveConversation();
    }
  }

  deleteProject(projectId) {
    const project = this.storage.getProjectList().find(p => p.id === projectId);
    if (!project) return;

    if (projectId === this.state.id) {
      alert('Cannot delete the currently open project. Switch to another project first.');
      return;
    }

    if (confirm(`Delete "${project.title}"? This cannot be undone.`)) {
      this.storage.deleteProject(projectId);
      this.openProjectsModal(); // Refresh the list
    }
  }

  newProject() {
    if (confirm('Create a new project? Your current project is auto-saved.')) {
      this.state = this.storage.createNewProject();
      this.currentContext = null;
      this.render();
      this.loadBookTitlePage();

      // Clear agent panel conversations for new project
      if (this.agentPanel) {
        this.agentPanel.loadActiveConversation();
      }
    }
  }

  openReadingMode() {
    const modal = document.getElementById('reading-modal');
    const content = document.getElementById('reading-content');
    const title = document.getElementById('reading-title');

    title.textContent = this.state.metadata.title;

    let html = `<div class="reading-book">
      <h1 class="reading-book-title">${this.state.metadata.title}</h1>
      <p class="reading-book-author">by ${this.state.metadata.author}</p>
    `;

    this.state.manuscript.parts.forEach(part => {
      html += `<div class="reading-part">
        <h2 class="reading-part-title">${part.displayTitle || part.title}</h2>`;

      part.chapters.forEach(chapter => {
        // Add mood art if exists
        const moodArtHtml = chapter.moodArt ? `
          <div class="reading-chapter-mood-art">
            <img src="${chapter.moodArt.imageData}" alt="Chapter Mood" />
          </div>
        ` : '';

        html += `<div class="reading-chapter">
          <h3 class="reading-chapter-title">${chapter.displayTitle || chapter.title}</h3>
          ${moodArtHtml}`;

        chapter.scenes.forEach((scene, i) => {
          html += `<div class="reading-scene">
            <div class="reading-scene-content">${scene.content || '<p><em>Empty scene</em></p>'}</div>
          </div>`;
          if (i < chapter.scenes.length - 1) {
            html += '<div class="reading-separator">* * *</div>';
          }
        });

        html += `</div>`;
      });

      html += `</div>`;
    });

    html += `</div>`;
    content.innerHTML = html;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  closeReadingMode() {
    const modal = document.getElementById('reading-modal');
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    const themeBtn = document.getElementById('btn-theme');
    if (theme === 'dark') {
      themeBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      `;
    } else {
      themeBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      `;
    }
  }

  render(loadContent = true) {
    document.getElementById('project-title').textContent = this.state.metadata.title;
    this.treeNav.render();
    if (loadContent) {
      this.loadBookTitlePage();
    }
  }

  toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
  }

  // ========== CONTENT LOADERS ==========

  loadBookTitlePage() {
    this.currentContext = { type: 'book' };
    const editor = document.getElementById('editor-content');

    // Ensure subtitle exists
    if (!this.state.metadata.subtitle) {
      this.state.metadata.subtitle = 'A Novel';
    }

    editor.innerHTML = `
      <div class="title-page">
        <div class="title-field">
          <input type="text" class="book-title-input" id="edit-book-title" 
                 value="${this.state.metadata.title}" 
                 placeholder="Enter book title...">
        </div>
        <div class="subtitle-field">
          <input type="text" class="book-subtitle-input" id="edit-book-subtitle" 
                 value="${this.state.metadata.subtitle}" 
                 placeholder="Enter subtitle (e.g., A Novel)...">
        </div>
        <p class="book-author-label">by</p>
        <div class="author-field">
          <input type="text" class="book-author-input" id="edit-book-author" 
                 value="${this.state.metadata.author}" 
                 placeholder="Enter author name...">
        </div>
      </div>
    `;

    const titleInput = document.getElementById('edit-book-title');
    const subtitleInput = document.getElementById('edit-book-subtitle');
    const authorInput = document.getElementById('edit-book-author');

    // Title handlers
    titleInput.addEventListener('input', () => {
      this.state.metadata.title = titleInput.value.trim() || 'Untitled Book';
      document.getElementById('project-title').textContent = this.state.metadata.title;
    });

    titleInput.addEventListener('blur', () => {
      this.state.metadata.title = titleInput.value.trim() || 'Untitled Book';
      document.getElementById('project-title').textContent = this.state.metadata.title;
      this.save();
      this.treeNav.render();
      const bookItem = document.querySelector('[data-type="book"]');
      if (bookItem) bookItem.classList.add('active');
    });

    // Subtitle handlers
    subtitleInput.addEventListener('input', () => {
      this.state.metadata.subtitle = subtitleInput.value.trim() || 'A Novel';
    });

    subtitleInput.addEventListener('blur', () => {
      this.state.metadata.subtitle = subtitleInput.value.trim() || 'A Novel';
      this.save();
    });

    // Author handlers
    authorInput.addEventListener('input', () => {
      this.state.metadata.author = authorInput.value.trim() || 'Unknown Author';
    });

    authorInput.addEventListener('blur', () => {
      this.state.metadata.author = authorInput.value.trim() || 'Unknown Author';
      this.save();
    });
  }

  loadPartView(partId) {
    this.currentContext = { type: 'part', partId };
    const part = this.state.manuscript.parts.find(p => p.id === partId);
    if (!part) return;

    const editor = document.getElementById('editor-content');
    if (!part.displayTitle) part.displayTitle = part.title;

    let html = `<div class="part-view">
      <input type="text" class="part-title-input" id="edit-part-title" 
             value="${part.displayTitle}" placeholder="Enter part title...">
      <div class="part-chapters-preview">
    `;

    part.chapters.forEach(chapter => {
      html += `<div class="chapter-card clickable" data-chapter-id="${chapter.id}" data-part-id="${partId}">
        <h2 class="chapter-card-title">${chapter.displayTitle || chapter.title}</h2>
        <div class="chapter-card-scenes">`;

      chapter.scenes.forEach(scene => {
        const preview = scene.content ?
          scene.content.replace(/<[^>]*>/g, '').substring(0, 100) + '...' :
          'No content yet';
        html += `<div class="scene-card clickable" data-scene-id="${scene.id}" data-chapter-id="${chapter.id}" data-part-id="${partId}">
          <span class="scene-card-title">${scene.title}</span>
          <span class="scene-card-preview">${preview}</span>
        </div>`;
      });

      html += `</div></div>`;
    });

    html += `</div></div>`;
    editor.innerHTML = html;

    // Title input handler
    const titleInput = document.getElementById('edit-part-title');
    titleInput.addEventListener('blur', () => {
      part.displayTitle = titleInput.value.trim() || part.title;
      this.save();
    });

    // Chapter card click handlers - navigate to chapter
    editor.querySelectorAll('.chapter-card.clickable').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.scene-card')) return; // Let scene clicks handle themselves
        const chapterId = card.dataset.chapterId;
        const pId = card.dataset.partId;
        this.loadChapterView(pId, chapterId);
        // Update sidebar selection
        const chapterItem = document.querySelector(`[data-type="chapter"][data-id="${chapterId}"]`);
        if (chapterItem) {
          document.querySelectorAll('.tree-item.active').forEach(i => i.classList.remove('active'));
          chapterItem.classList.add('active');
        }
      });
    });

    // Scene card click handlers - navigate to scene
    editor.querySelectorAll('.scene-card.clickable').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const sceneId = card.dataset.sceneId;
        const chapterId = card.dataset.chapterId;
        const pId = card.dataset.partId;
        this.loadSceneView(pId, chapterId, sceneId);
        // Update sidebar selection
        const sceneItem = document.querySelector(`[data-type="scene"][data-id="${sceneId}"]`);
        if (sceneItem) {
          document.querySelectorAll('.tree-item.active').forEach(i => i.classList.remove('active'));
          sceneItem.classList.add('active');
        }
      });
    });
  }

  loadChapterView(partId, chapterId) {
    this.currentContext = { type: 'chapter', partId, chapterId };
    const part = this.state.manuscript.parts.find(p => p.id === partId);
    const chapter = part?.chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    const editor = document.getElementById('editor-content');
    if (!chapter.displayTitle) chapter.displayTitle = chapter.title;

    // Build mood art section if exists (image will be loaded async)
    const moodArtSection = chapter.moodArt ? `
      <div class="chapter-mood-art-display">
        <img src="" alt="Chapter Mood Art" class="chapter-mood-art-image" id="chapter-mood-art-img" style="min-height: 100px; background: var(--bg-tertiary);" />
        <div class="chapter-mood-art-caption">
          <span class="mood-art-label">🎨 Mood Art</span>
          <span class="mood-art-prompt-preview" title="${chapter.moodArt.prompt}">${chapter.moodArt.prompt?.substring(0, 60)}...</span>
        </div>
      </div>
    ` : '';

    let html = `<div class="chapter-view">
      <input type="text" class="chapter-title-input" id="edit-chapter-title" 
             value="${chapter.displayTitle}" placeholder="Enter chapter title...">
      ${moodArtSection}
      <div class="chapter-scenes-list">
    `;

    chapter.scenes.forEach((scene, index) => {
      const preview = scene.content ?
        scene.content.replace(/<[^>]*>/g, '').substring(0, 200) + '...' :
        'No content yet. Click to start writing...';
      html += `
        <div class="scene-card-large clickable" data-scene-id="${scene.id}" data-chapter-id="${chapterId}" data-part-id="${partId}">
          <h3 class="scene-card-large-title">${scene.title}</h3>
          <p class="scene-card-large-preview">${preview}</p>
        </div>
      `;
      if (index < chapter.scenes.length - 1) {
        html += '<div class="scene-separator">* * *</div>';
      }
    });

    html += `</div></div>`;
    editor.innerHTML = html;

    // Load mood art image asynchronously if file-based
    if (chapter.moodArt) {
      const moodArtImg = document.getElementById('chapter-mood-art-img');
      if (moodArtImg) {
        (async () => {
          let imageData = chapter.moodArt.imageData;
          if (!imageData && chapter.moodArt.filename && this.fileStorage) {
            try {
              imageData = await this.fileStorage.loadImage(chapter.moodArt.filename);
            } catch (err) {
              console.error('Failed to load mood art:', err);
            }
          }
          if (imageData) {
            moodArtImg.src = imageData;
          }
        })();
      }
    }

    // Title input handler
    const titleInput = document.getElementById('edit-chapter-title');
    titleInput.addEventListener('blur', () => {
      chapter.displayTitle = titleInput.value.trim() || chapter.title;
      this.save();
    });

    // Scene card click handlers - navigate to scene
    editor.querySelectorAll('.scene-card-large.clickable').forEach(card => {
      card.addEventListener('click', () => {
        const sceneId = card.dataset.sceneId;
        const cId = card.dataset.chapterId;
        const pId = card.dataset.partId;
        this.loadSceneView(pId, cId, sceneId);
        // Update sidebar selection
        const sceneItem = document.querySelector(`[data-type="scene"][data-id="${sceneId}"]`);
        if (sceneItem) {
          document.querySelectorAll('.tree-item.active').forEach(i => i.classList.remove('active'));
          sceneItem.classList.add('active');
        }
      });
    });
  }

  loadSceneView(partId, chapterId, sceneId) {
    this.loadScene(partId, chapterId, sceneId);
  }

  loadScene(partId, chapterId, sceneId) {
    this.currentContext = { type: 'scene', partId, chapterId, sceneId };
    const part = this.state.manuscript.parts.find(p => p.id === partId);
    const chapter = part?.chapters.find(c => c.id === chapterId);
    const scene = chapter?.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const editor = document.getElementById('editor-content');

    if (scene.content && scene.content.trim()) {
      editor.innerHTML = scene.content;
      editor.classList.remove('empty');
    } else {
      editor.innerHTML = '';
      editor.dataset.placeholder = `Start writing "${scene.title}"...`;
      editor.classList.add('empty');
    }

    // Render suggestion blocks if any exist
    if (scene.suggestions?.items?.length > 0) {
      this.renderSuggestions(editor, scene);
    }

    const handleFocus = () => {
      if (editor.classList.contains('empty')) {
        editor.classList.remove('empty');
        editor.innerHTML = '<p></p>';
      }
    };
    editor.removeEventListener('focus', handleFocus);
    editor.addEventListener('focus', handleFocus);

    this.updateWordCount(editor.innerText);
  }

  renderSuggestions(editor, scene) {
    const suggestions = scene.suggestions.items;
    const annotatedText = scene.suggestions.annotatedText;
    const typeLabels = {
      expand: 'Expand', shorten: 'Shorten', dialogue: 'Dialogue',
      sensory: 'Sensory', grammar: 'Grammar', prose: 'Prose', review: 'Review'
    };

    // Add header showing suggestion mode (non-destructive - prepended)
    const header = document.createElement('div');
    header.className = 'suggestion-view-header';
    header.innerHTML = `
      <span class="suggestion-type">🤖 ${typeLabels[scene.suggestions.type] || 'Suggestions'} Mode</span>
      <span class="suggestion-count">${suggestions.length} inline suggestion${suggestions.length > 1 ? 's' : ''}</span>
    `;
    editor.insertBefore(header, editor.firstChild);

    // ===== SURGICAL INSERTION: Insert suggestion markers into existing styled DOM =====
    // Parse the annotated text to find where each suggestion was placed
    // Pattern: Text before [S#: suggestion] Text after
    if (annotatedText) {
      // Extract pairs of (anchor text, suggestion)
      // We look for sentences/phrases immediately before each [S#:...] tag
      const suggestionPlacements = this.parseSuggestionPlacements(annotatedText);

      for (const placement of suggestionPlacements) {
        // Find the anchor text in the DOM and insert suggestion after it
        const inserted = this.insertSuggestionMarker(
          editor,
          placement.anchor,
          placement.number,
          placement.text
        );
        if (!inserted) {
          console.warn(`Could not find anchor for S${placement.number}:`, placement.anchor);
        }
      }
    }

    // Bind right-click handlers for inline suggestion blocks
    editor.querySelectorAll('.suggestion-inline').forEach(block => {
      block.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const suggestionId = block.dataset.id;
        const suggestionNumber = block.dataset.number;

        this.treeNav.contextMenu.show(e.clientX, e.clientY, [
          { label: '💬 Expand in Chat', onClick: () => this.expandSuggestionInChat(scene, suggestionId, suggestionNumber) },
          { divider: true },
          { label: '🗑️ Remove This Suggestion', onClick: () => this.removeInlineSuggestion(scene, suggestionId) }
        ]);
      });
    });

    // Add general suggestions at the end (after "---" separator) as a panel
    const generalSuggestions = this.extractGeneralSuggestions(annotatedText);
    if (generalSuggestions.length > 0) {
      const generalPanel = document.createElement('div');
      generalPanel.className = 'suggestion-panel';
      generalPanel.innerHTML = `
        <hr style="border: 1px dashed var(--border-color); margin: 24px 0;">
        <div class="suggestion-list">
          ${generalSuggestions.map(s => `
            <div class="suggestion-block" data-id="${s.id}" data-number="${s.number}">
              <span class="suggestion-number">S${s.number}</span>
              <span class="suggestion-text">${s.text}</span>
            </div>
          `).join('')}
        </div>
      `;
      editor.appendChild(generalPanel);
    }
  }

  /**
   * Parse the annotated text to extract suggestion placements
   * Format: "Anchor sentence. [S1: suggestion text]"
   */
  parseSuggestionPlacements(annotatedText) {
    const placements = [];
    // Capture everything on the line before [S#: ...], using multiline mode
    // This ensures we get full multi-sentence dialogue as the anchor
    const regex = /^(.+?)\s*\[S(\d+):\s*([^\]]+)\]/gm;
    let match;

    while ((match = regex.exec(annotatedText)) !== null) {
      const anchor = match[1].trim();
      const number = parseInt(match[2]);
      const text = match[3].trim().replace(/\*\*([^*]+)\*\*/g, '<span class="suggestion-keyword">$1</span>');

      // Only use inline suggestions (general ones appear after ---)
      if (!annotatedText.substring(0, match.index).includes('---')) {
        placements.push({ anchor, number, text });
      }
    }

    return placements;
  }

  /**
   * Insert a suggestion marker after the anchor text in the DOM
   */
  insertSuggestionMarker(container, anchorText, number, suggestionText) {
    if (!anchorText || !anchorText.trim()) return false;

    // Find the anchor in the DOM
    const range = this.findTextRange(container, anchorText);
    if (!range) return false;

    // Create the suggestion marker
    const marker = document.createElement('span');
    marker.className = 'suggestion-inline';
    marker.dataset.id = `s${number}`;
    marker.dataset.number = number;
    marker.title = 'Right-click for options';
    marker.innerHTML = `<span class="suggestion-label">S${number}</span>: ${suggestionText}`;

    // Insert after the anchor (collapse range to end, then insert)
    range.collapse(false);
    range.insertNode(document.createTextNode(' ')); // Small space
    range.insertNode(marker);

    return true;
  }

  /**
   * Find a text string in the DOM and return a Range
   */
  findTextRange(container, searchText) {
    const fullText = container.textContent;

    // Normalize function for comparison
    const normalize = (str) => str
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");

    const normalizedFull = normalize(fullText);
    const normalizedSearch = normalize(searchText);

    // Try to find in normalized text
    let startIndex = normalizedFull.indexOf(normalizedSearch);

    // If not found, try fuzzy matching
    if (startIndex === -1) {
      const result = this.fuzzyFindSubstring(normalizedFull, normalizedSearch, 0.85);
      if (result) {
        startIndex = result.index;
      } else {
        console.warn('findTextRange: No match found for:', searchText.substring(0, 50));
        return null;
      }
    }

    // Find the matching text in the original (for correct length)
    const endIndex = startIndex + normalizedSearch.length;

    // Now walk the DOM to find these character positions
    const range = document.createRange();
    let startFound = false;
    let endFound = false;
    let charsCount = 0;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let node;

    while ((node = walker.nextNode())) {
      const nodeText = node.textContent;
      const normalizedNodeText = normalize(nodeText);
      const nodeLength = normalizedNodeText.length;
      const nodeStart = charsCount;
      const nodeEnd = charsCount + nodeLength;

      if (!startFound && startIndex >= nodeStart && startIndex < nodeEnd) {
        // Map from normalized position to actual node position
        const offsetInNode = startIndex - nodeStart;
        range.setStart(node, Math.min(offsetInNode, nodeText.length));
        startFound = true;
      }

      if (!endFound && endIndex > nodeStart && endIndex <= nodeEnd) {
        const offsetInNode = endIndex - nodeStart;
        range.setEnd(node, Math.min(offsetInNode, nodeText.length));
        endFound = true;
        break;
      }

      charsCount += nodeLength;
    }

    return (startFound && endFound) ? range : null;
  }

  /**
   * Fuzzy substring search - finds best matching substring above threshold
   */
  fuzzyFindSubstring(haystack, needle, threshold) {
    if (needle.length < 5) return null; // Too short for fuzzy matching

    const needleLen = needle.length;
    let bestMatch = null;
    let bestScore = threshold;

    // Slide a window of needle length across haystack
    for (let i = 0; i <= haystack.length - needleLen; i++) {
      const candidate = haystack.substring(i, i + needleLen);
      const score = this.similarity(candidate, needle);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { index: i, length: needleLen, score };
      }
    }

    // Also try slightly shorter/longer windows
    for (let lenOffset = -5; lenOffset <= 5; lenOffset++) {
      const windowLen = needleLen + lenOffset;
      if (windowLen < 5 || windowLen > haystack.length) continue;

      for (let i = 0; i <= haystack.length - windowLen; i++) {
        const candidate = haystack.substring(i, i + windowLen);
        const score = this.similarity(candidate, needle);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = { index: i, length: windowLen, score };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calculate similarity ratio between two strings (0-1)
   */
  similarity(a, b) {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Simple character-level similarity
    let matches = 0;
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;

    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] === longer[i]) matches++;
    }

    return matches / longer.length;
  }

  /**
   * Extract general suggestions (after ---) from annotated text
   */
  extractGeneralSuggestions(annotatedText) {
    if (!annotatedText || !annotatedText.includes('---')) return [];

    const afterSeparator = annotatedText.split('---')[1] || '';
    const suggestions = [];
    const regex = /\[S(\d+):\s*([^\]]+)\]/g;
    let match;

    while ((match = regex.exec(afterSeparator)) !== null) {
      suggestions.push({
        id: `s${match[1]}`,
        number: parseInt(match[1]),
        text: match[2].trim().replace(/\*\*([^*]+)\*\*/g, '<span class="suggestion-keyword">$1</span>')
      });
    }

    return suggestions;
  }

  removeInlineSuggestion(scene, suggestionId) {
    const { partId, chapterId, sceneId } = this.currentContext || {};
    if (!partId || !chapterId || !sceneId) return;

    const part = this.state.manuscript.parts.find(p => p.id === partId);
    const chapter = part?.chapters.find(c => c.id === chapterId);
    const freshScene = chapter?.scenes.find(s => s.id === sceneId);

    if (freshScene?.suggestions) {
      // Remove from items array
      freshScene.suggestions.items = freshScene.suggestions.items.filter(s => s.id !== suggestionId);

      // Also remove from annotated text
      const num = suggestionId.replace('s', '');
      freshScene.suggestions.annotatedText = freshScene.suggestions.annotatedText.replace(
        new RegExp(`\\[S${num}:\\s*[^\\]]+\\]`, 'g'), ''
      );

      if (freshScene.suggestions.items.length === 0) {
        delete freshScene.suggestions;
      }
      this.save();
      this.loadScene(partId, chapterId, sceneId);
    }
  }

  expandSuggestionInChat(scene, suggestionId, suggestionNumber) {
    const suggestion = scene.suggestions?.items?.find(s => s.id === suggestionId);
    if (!suggestion) {
      console.error('Suggestion not found:', suggestionId);
      return;
    }

    // Open agent panel if not already expanded
    if (this.agentPanel && !this.agentPanel.isExpanded) {
      this.agentPanel.togglePanel();
    }

    // Pre-fill and focus input
    setTimeout(() => {
      const input = document.getElementById('agent-input');
      if (input) {
        input.value = `Help me implement suggestion S${suggestionNumber} in "${scene.title}": "${suggestion.text}"`;
        input.focus();
      }
    }, 200);
  }

  removeSuggestion(scene, suggestionId) {
    console.log('removeSuggestion called:', suggestionId);

    // Get fresh scene reference from state
    const { partId, chapterId, sceneId } = this.currentContext || {};
    if (!partId || !chapterId || !sceneId) {
      console.error('No current context for removeSuggestion');
      return;
    }

    const part = this.state.manuscript.parts.find(p => p.id === partId);
    const chapter = part?.chapters.find(c => c.id === chapterId);
    const freshScene = chapter?.scenes.find(s => s.id === sceneId);

    console.log('Fresh scene found:', !!freshScene, 'Has suggestions:', !!freshScene?.suggestions?.items);

    if (freshScene?.suggestions?.items) {
      const originalCount = freshScene.suggestions.items.length;
      freshScene.suggestions.items = freshScene.suggestions.items.filter(s => s.id !== suggestionId);
      console.log('Filtered suggestions:', originalCount, '->', freshScene.suggestions.items.length);

      if (freshScene.suggestions.items.length === 0) {
        delete freshScene.suggestions;
        console.log('Deleted all suggestions');
      }
      this.save();
      // Re-load scene
      this.loadScene(partId, chapterId, sceneId);
    } else {
      console.error('No suggestions to remove');
    }
  }

  loadPlotGrid(gridId) {
    this.treeNav.loadPlotGrid(gridId);
  }

  saveCurrentContent() {
    if (!this.currentContext) return;

    const { type, partId, chapterId, sceneId, noteId } = this.currentContext;
    const editor = document.getElementById('editor-content');

    // Clone editor to strip suggestion elements without affecting the displayed DOM
    const clone = editor.cloneNode(true);

    // Remove all suggestion-related elements before saving
    clone.querySelectorAll('.suggestion-inline, .suggestion-view-header, .suggestion-panel').forEach(el => el.remove());

    // Get clean content
    const cleanContent = clone.innerHTML;

    if (type === 'scene') {
      const part = this.state.manuscript.parts.find(p => p.id === partId);
      const chapter = part?.chapters.find(c => c.id === chapterId);
      const scene = chapter?.scenes.find(s => s.id === sceneId);
      if (scene) {
        scene.content = cleanContent;
        scene.wordCount = clone.innerText.trim().split(/\s+/).filter(w => w).length;
      }
    } else if (type === 'note') {
      const note = this.state.notes.items.find(n => n.id === noteId);
      if (note) {
        note.content = cleanContent;
      }
    }

    this.state.metadata.modified = new Date().toISOString();
    this.save();
  }

  updateWordCount(text) {
    const words = text.trim().split(/\s+/).filter(w => w).length;
    document.getElementById('word-count').textContent = `${words} words`;
  }

  save() {
    this.storage.save(this.state);
  }

  /**
   * Search thesaurus using Datamuse API
   */
  async searchThesaurus(word) {
    const resultsContainer = document.getElementById('thesaurus-results');
    resultsContainer.innerHTML = '<p class="thesaurus-loading">Searching...</p>';

    try {
      // Datamuse API endpoints
      // ml = means like (synonyms), rel_ant = antonyms
      const endpoint = this.thesaurusMode === 'synonyms'
        ? `https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=50`
        : `https://api.datamuse.com/words?rel_ant=${encodeURIComponent(word)}&max=50`;

      const response = await fetch(endpoint);
      const data = await response.json();

      if (data.length === 0) {
        resultsContainer.innerHTML = `<p class="thesaurus-no-results">No ${this.thesaurusMode} found for "${word}"</p>`;
        return;
      }

      // Render results as clickable word chips
      const words = data.map(item => item.word);
      resultsContainer.innerHTML = `
        <ul class="thesaurus-word-list">
          ${words.map(w => `<li class="thesaurus-word" data-word="${w}">${w}</li>`).join('')}
        </ul>
      `;

      // Add click handlers to copy word to clipboard
      resultsContainer.querySelectorAll('.thesaurus-word').forEach(el => {
        el.addEventListener('click', () => {
          const selectedWord = el.dataset.word;
          navigator.clipboard.writeText(selectedWord).then(() => {
            // Visual feedback
            const original = el.textContent;
            el.textContent = '✓ Copied!';
            el.style.background = 'var(--accent-primary)';
            el.style.color = 'white';
            setTimeout(() => {
              el.textContent = original;
              el.style.background = '';
              el.style.color = '';
            }, 1000);
          });
        });
      });

    } catch (error) {
      console.error('Thesaurus search failed:', error);
      resultsContainer.innerHTML = '<p class="thesaurus-error">Search failed. Please check your internet connection.</p>';
    }
  }

  /**
   * Get the currently active scene being edited
   */
  getCurrentScene() {
    if (!this.currentContext || this.currentContext.type !== 'scene') return null;
    const { partId, chapterId, sceneId } = this.currentContext;
    const part = this.state.manuscript.parts.find(p => p.id === partId);
    const chapter = part?.chapters.find(c => c.id === chapterId);
    return chapter?.scenes.find(s => s.id === sceneId) || null;
  }

  /**
   * Get the currently active part (containing the current scene)
   */
  getCurrentPart() {
    if (!this.currentContext) return null;
    return this.state.manuscript.parts.find(p => p.id === this.currentContext.partId) || null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new NovelWriterApp();
});
