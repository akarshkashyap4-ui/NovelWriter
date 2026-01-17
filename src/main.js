/**
 * NovelWriter - Main Application Entry Point
 * With multi-project support, reading mode, and project management
 */

import { Storage } from './storage/LocalStorage.js';
import { TreeNav } from './navigation/TreeNav.js';
import { Toolbar } from './editor/Toolbar.js';
import { Settings } from './settings/ThemeSettings.js';
import { AIService } from './ai/AIService.js';
import { APIConfig } from './ai/APIConfig.js';
import { AgentPanel } from './ai/AgentPanel.js';

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
    this.apiConfig = new APIConfig(this);
    this.agentPanel = new AgentPanel(this);

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
    const editor = document.getElementById('editor-content');
    const toolbar = document.getElementById('selection-toolbar');

    if (!editor || !toolbar) return;

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
        html += `<div class="reading-chapter">
          <h3 class="reading-chapter-title">${chapter.displayTitle || chapter.title}</h3>`;

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

    let html = `<div class="chapter-view">
      <input type="text" class="chapter-title-input" id="edit-chapter-title" 
             value="${chapter.displayTitle}" placeholder="Enter chapter title...">
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

  loadPlotGrid(gridId) {
    this.treeNav.loadPlotGrid(gridId);
  }

  saveCurrentContent() {
    if (!this.currentContext) return;

    const { type, partId, chapterId, sceneId, noteId } = this.currentContext;
    const editor = document.getElementById('editor-content');

    if (type === 'scene') {
      const part = this.state.manuscript.parts.find(p => p.id === partId);
      const chapter = part?.chapters.find(c => c.id === chapterId);
      const scene = chapter?.scenes.find(s => s.id === sceneId);
      if (scene) {
        scene.content = editor.innerHTML;
        scene.wordCount = editor.innerText.trim().split(/\s+/).filter(w => w).length;
      }
    } else if (type === 'note') {
      const note = this.state.notes.items.find(n => n.id === noteId);
      if (note) {
        note.content = editor.innerHTML;
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
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new NovelWriterApp();
});
