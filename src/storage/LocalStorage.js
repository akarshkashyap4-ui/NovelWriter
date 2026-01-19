/**
 * LocalStorage - Data persistence layer
 * Now supports multiple projects with auto-save
 */

export class Storage {
  constructor() {
    this.projectsKey = 'novelwriter_projects'; // List of all project IDs
    this.currentProjectKey = 'novelwriter_current'; // Currently active project ID
  }

  // Get list of all saved projects (metadata only)
  getProjectList() {
    try {
      const list = localStorage.getItem(this.projectsKey);
      return list ? JSON.parse(list) : [];
    } catch (e) {
      return [];
    }
  }

  saveProjectList(list) {
    localStorage.setItem(this.projectsKey, JSON.stringify(list));
  }

  getCurrentProjectId() {
    return localStorage.getItem(this.currentProjectKey);
  }

  setCurrentProjectId(id) {
    localStorage.setItem(this.currentProjectKey, id);
  }

  // Load specific project or current project
  load(projectId = null) {
    try {
      const id = projectId || this.getCurrentProjectId();
      if (id) {
        const saved = localStorage.getItem(`novelwriter_project_${id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          return this.mergeWithDefaults(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load project:', e);
    }

    // No existing project - create new one
    const newProject = this.createNewProject();
    return newProject;
  }

  save(state) {
    try {
      const id = state.id || this.getCurrentProjectId();
      if (!id) return;

      state.metadata.modified = new Date().toISOString();
      localStorage.setItem(`novelwriter_project_${id}`, JSON.stringify(state));

      // Update project list
      const list = this.getProjectList();
      const existing = list.find(p => p.id === id);
      if (existing) {
        existing.title = state.metadata.title;
        existing.modified = state.metadata.modified;
      } else {
        list.push({
          id,
          title: state.metadata.title,
          created: state.metadata.created,
          modified: state.metadata.modified
        });
      }
      this.saveProjectList(list);
    } catch (e) {
      console.error('Failed to save project:', e);
    }
  }

  createNewProject() {
    const id = crypto.randomUUID();
    const state = this.getDefaultState();
    state.id = id;

    this.setCurrentProjectId(id);
    this.save(state);

    return state;
  }

  switchToProject(projectId) {
    this.setCurrentProjectId(projectId);
    return this.load(projectId);
  }

  deleteProject(projectId) {
    localStorage.removeItem(`novelwriter_project_${projectId}`);
    const list = this.getProjectList().filter(p => p.id !== projectId);
    this.saveProjectList(list);
  }

  // Migrate from old single-project storage
  migrateOldStorage() {
    const oldData = localStorage.getItem('novelwriter_project');
    if (oldData) {
      try {
        const parsed = JSON.parse(oldData);
        const id = crypto.randomUUID();
        parsed.id = id;
        localStorage.setItem(`novelwriter_project_${id}`, JSON.stringify(parsed));

        const list = this.getProjectList();
        list.push({
          id,
          title: parsed.metadata?.title || 'Migrated Project',
          created: parsed.metadata?.created || new Date().toISOString(),
          modified: parsed.metadata?.modified || new Date().toISOString()
        });
        this.saveProjectList(list);
        this.setCurrentProjectId(id);

        // Remove old storage
        localStorage.removeItem('novelwriter_project');
        console.log('Migrated old project to new storage format');
      } catch (e) {
        console.error('Failed to migrate old storage:', e);
      }
    }
  }

  // Migrate from old chapters-only structure to Parts hierarchy
  migrateIfNeeded(saved) {
    if (saved.manuscript && saved.manuscript.chapters && !saved.manuscript.parts) {
      saved.manuscript.parts = [{
        id: crypto.randomUUID(),
        title: 'Part 1',
        displayTitle: 'Part 1',
        order: 0,
        chapters: saved.manuscript.chapters.map(ch => ({
          ...ch,
          displayTitle: ch.displayTitle || ch.title
        }))
      }];
      delete saved.manuscript.chapters;
    }
    return saved;
  }

  mergeWithDefaults(saved) {
    const migrated = this.migrateIfNeeded(saved);
    const defaults = this.getDefaultState();
    return {
      ...defaults,
      ...migrated,
      id: migrated.id || defaults.id,
      metadata: { ...defaults.metadata, ...migrated.metadata },
      manuscript: migrated.manuscript || defaults.manuscript,
      plot: { ...defaults.plot, ...migrated.plot },
      characters: migrated.characters || defaults.characters,
      notes: migrated.notes || defaults.notes,
      settings: { ...defaults.settings, ...migrated.settings },
      currentView: migrated.currentView || defaults.currentView,
      // Part Summaries
      summaries: { ...defaults.summaries, ...migrated.summaries },
      // Agent Analysis
      analysis: { ...defaults.analysis, ...migrated.analysis },
      // World Info (Phase 5)
      worldInfo: { ...defaults.worldInfo, ...migrated.worldInfo },
      // AI Conversations
      conversations: migrated.conversations || defaults.conversations,
      activeConversationId: migrated.activeConversationId || defaults.activeConversationId
    };
  }

  getDefaultState() {
    const chapterId = crypto.randomUUID();
    const sceneId = crypto.randomUUID();

    return {
      id: crypto.randomUUID(),
      metadata: {
        title: 'Untitled Book',
        subtitle: 'A Novel',
        author: 'Unknown Author',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      },
      manuscript: {
        parts: [
          {
            id: crypto.randomUUID(),
            title: 'Part 1',
            displayTitle: 'Part 1',
            order: 0,
            chapters: [
              {
                id: chapterId,
                title: 'Chapter 1',
                displayTitle: 'Chapter 1',
                order: 0,
                scenes: [
                  {
                    id: sceneId,
                    title: 'Scene 1',
                    content: '',
                    order: 0,
                    wordCount: 0
                  }
                ]
              }
            ]
          }
        ]
      },
      plot: {
        plotLines: [],
        gridData: {}
      },
      characters: [],
      notes: {
        items: []
      },
      settings: {
        theme: 'light',
        font: 'Merriweather',
        fontSize: 16,
        textColor: '#000000',
        backgroundColor: null,
        currentFont: 'Merriweather',
        currentFontSize: 16,
        currentTextColor: '#000000',
        aiProvider: '',
        aiApiKey: '',
        aiModel: '',
        contextStrategy: 'smart' // 'smart' (summaries) or 'full' (all content)
      },
      currentView: {
        section: 'manuscript',
        itemId: null
      },
      // Part Summaries (for token-efficient context)
      summaries: {
        parts: {} // { partId: { content: "...", wordCount: 123, generatedAt: "...", targetWords: 500 } }
      },
      // Agent Analysis (Phase 2)
      analysis: {
        parts: {}
      },
      // World Info (Phase 5)
      worldInfo: {
        parts: {} // { partId: { generatedAt, facts, plotPoints, names, timeline, relationships, locations } }
      },
      // AI Agent Conversations (per-project)
      conversations: [],
      activeConversationId: null
    };
  }

  exportToFile(state) {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.metadata.title.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const id = crypto.randomUUID();
          data.id = id;
          const migrated = this.migrateIfNeeded(data);

          localStorage.setItem(`novelwriter_project_${id}`, JSON.stringify(migrated));

          const list = this.getProjectList();
          list.push({
            id,
            title: migrated.metadata?.title || 'Imported Project',
            created: migrated.metadata?.created || new Date().toISOString(),
            modified: new Date().toISOString()
          });
          this.saveProjectList(list);
          this.setCurrentProjectId(id);

          resolve(this.load(id));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
}
