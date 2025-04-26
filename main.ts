import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface StudyAnalyticsSettings {
	trackingEnabled: boolean;
}

const DEFAULT_SETTINGS: StudyAnalyticsSettings = {
	trackingEnabled: true
};

export default class StudyAnalyticsPlugin extends Plugin {
	settings: StudyAnalyticsSettings;

	async onload() {
		console.log('Loading Study Analytics plugin');

		await this.loadSettings();

		// Add a ribbon icon to start analysis
		this.addRibbonIcon('bar-chart', 'Study Analytics', () => {
			new Notice('Study Analytics is working!');
		});

		// Add a command to start analysis
		this.addCommand({
			id: 'run-study-analytics',
			name: 'Run Study Analytics',
			callback: () => {
				new Notice('Running study analytics...');
			}
		});

		// Add a settings tab
		this.addSettingTab(new StudyAnalyticsSettingTab(this.app, this));
	}

	onunload() {
		console.log('Unloading Study Analytics plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class StudyAnalyticsSettingTab extends PluginSettingTab {
	plugin: StudyAnalyticsPlugin;

	constructor(app: App, plugin: StudyAnalyticsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Study Analytics Settings'});

		new Setting(containerEl)
			.setName('Enable tracking')
			.setDesc('Enable tracking of study habits and notes')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.trackingEnabled)
				.onChange(async (value) => {
					this.plugin.settings.trackingEnabled = value;
					await this.plugin.saveSettings();
				}));
	}
}
