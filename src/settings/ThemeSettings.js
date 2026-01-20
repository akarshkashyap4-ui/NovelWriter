/**
 * ThemeSettings - Settings and theme management
 * Appearance settings only (AI config is separate)
 */

export class Settings {
    constructor(app) {
        this.app = app;
        this.modal = document.getElementById('settings-modal');

        // Appearance settings
        this.themeSelect = document.getElementById('setting-theme');
        this.fontSelect = document.getElementById('setting-font');
        this.contextStrategySelect = document.getElementById('setting-ai-context-strategy');
        this.saveBtn = document.getElementById('save-settings');

        // Alive Editor settings (Mood and Remarks only - Echo is controlled from its own modal)
        this.aliveMoodEnabled = document.getElementById('setting-alive-mood-enabled');
        this.aliveMoodTrigger = document.getElementById('setting-alive-mood-trigger');
        this.aliveRemarksEnabled = document.getElementById('setting-alive-remarks-enabled');
        this.aliveRemarksTrigger = document.getElementById('setting-alive-remarks-trigger');

        this.bindEvents();
    }

    bindEvents() {
        this.saveBtn.addEventListener('click', () => {
            this.saveSettings();
        });

        const backdrop = this.modal.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => {
                this.closeModal();
            });
        }
    }

    openModal() {
        const state = this.app.state;
        this.themeSelect.value = state.settings.theme;
        this.fontSelect.value = state.settings.font;
        this.contextStrategySelect.value = state.settings.contextStrategy || 'smart';

        // Load Alive Editor settings (Mood and Remarks only)
        const alive = state.settings.alive || {};
        if (this.aliveMoodEnabled) this.aliveMoodEnabled.checked = alive.moodEnabled !== false;
        if (this.aliveMoodTrigger) this.aliveMoodTrigger.value = alive.moodTrigger || 50;
        if (this.aliveRemarksEnabled) this.aliveRemarksEnabled.checked = alive.remarksEnabled || false;
        if (this.aliveRemarksTrigger) this.aliveRemarksTrigger.value = alive.remarksTrigger || 300;

        this.modal.classList.add('open');
    }

    closeModal() {
        this.modal.classList.remove('open');
    }

    saveSettings() {
        const state = this.app.state;

        // Update theme
        const newTheme = this.themeSelect.value;
        if (newTheme !== state.settings.theme) {
            state.settings.theme = newTheme;
            this.app.applyTheme(newTheme);
        }

        // Update font
        state.settings.font = this.fontSelect.value;

        // Update context strategy
        state.settings.contextStrategy = this.contextStrategySelect.value;

        // Update Alive Editor settings (Mood and Remarks only - Echo is separate)
        state.settings.alive = {
            moodEnabled: this.aliveMoodEnabled?.checked ?? true,
            moodTrigger: parseInt(this.aliveMoodTrigger?.value) || 50,
            remarksEnabled: this.aliveRemarksEnabled?.checked || false,
            remarksTrigger: parseInt(this.aliveRemarksTrigger?.value) || 300
        };

        // Update AliveEditor if it exists
        if (this.app.aliveEditor) {
            this.app.aliveEditor.updateSettings(state.settings.alive);
        }

        // Apply font to editor
        const editor = document.getElementById('editor-content');
        editor.style.fontFamily = `'${state.settings.font}', serif`;

        // Save and close
        this.app.save();
        this.closeModal();
    }
}
