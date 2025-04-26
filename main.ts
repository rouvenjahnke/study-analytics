import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile } from 'obsidian';

const VIEW_TYPE_STUDY_FLOW = 'study-flow-view';

interface StudyAnalyticsSettings {
    pomodoroTime: number;
    shortBreakTime: number;
    longBreakTime: number;
    longBreakInterval: number;
    notesFolder: string;
    focusPath: string;
    categories: string[];
    tags: string[];
    autoStartBreaks: boolean;
    autoStartPomodoros: boolean;
    showDifficulty: boolean;
    trackModifiedFiles: boolean;
}

const DEFAULT_SETTINGS: StudyAnalyticsSettings = {
    pomodoroTime: 25,
    shortBreakTime: 5,
    longBreakTime: 15,
    longBreakInterval: 4,
    notesFolder: 'Study Sessions',
    focusPath: '',
    categories: ['Study', 'Work', 'Reading', 'Project', 'Break'],
    tags: ['#important', '#question', '#difficult', '#review'],
    autoStartBreaks: true,
    autoStartPomodoros: false,
    showDifficulty: true,
    trackModifiedFiles: true
};

interface DistractionNote {
    time: Date;
    note: string;
}

interface LineNote {
    time: Date;
    line: string;
    file: string;
    tag: string;
    note: string;
    lineNumber: number;
}

interface ReflectionNote {
    time: Date;
    text: string;
}

interface CompletedTask {
    time: Date;
    task: string;
}

interface SessionData {
    category: string;
    startTime: Date;
    duration: number;
    pomodoros: number;
    difficulty: number;
    notes: string;
    distractions: DistractionNote[];
    lineNotes: LineNote[];
    modifiedFiles: string[];
    completedTasks: CompletedTask[];
    reflections: ReflectionNote[];
    date: string;
    completed: boolean;
    isBreak: boolean;
    pauseDuration: number;
}

class StudySession {
    category: string;
    startTime: Date;
    endTime: Date | null;
    pomodorosCompleted: number;
    difficulty: number;
    notes: string;
    distractions: DistractionNote[];
    lineNotes: LineNote[];
    modifiedFiles: Set<string>;
    completed: boolean;
    completedTasks: CompletedTask[];
    reflections: ReflectionNote[];
    pauseStartTime: Date | null;
    totalPauseDuration: number;
    isBreak: boolean;

    constructor(category: string) {
        this.category = category;
        this.startTime = new Date();
        this.endTime = null;
        this.pomodorosCompleted = 0;
        this.difficulty = 1;
        this.notes = "";
        this.distractions = [];
        this.lineNotes = [];
        this.modifiedFiles = new Set<string>();
        this.completed = false;
        this.completedTasks = [];
        this.reflections = [];
        this.pauseStartTime = null;
        this.totalPauseDuration = 0;
        this.isBreak = category === 'Break';
    }

    pause(): void {
        if (!this.pauseStartTime) {
            this.pauseStartTime = new Date();
        }
    }

    resume(): void {
        if (this.pauseStartTime) {
            this.totalPauseDuration += (Number(new Date()) - Number(this.pauseStartTime));
            this.pauseStartTime = null;
        }
    }

    addDistraction(note: string): void {
        this.distractions.push({
            time: new Date(),
            note: note
        });
    }

    addLineNote(line: string, file: string, tag: string, note: string, lineNumber: number): void {
        this.lineNotes.push({
            time: new Date(),
            line: line,
            file: file,
            tag: tag,
            note: note,
            lineNumber: lineNumber
        });
    }

    addReflection(text: string): void {
        this.reflections.push({
            time: new Date(),
            text: text
        });
    }

    addCompletedTask(task: string): void {
        this.completedTasks.push({
            time: new Date(),
            task: task
        });
    }

    trackModifiedFile(file: string): void {
        this.modifiedFiles.add(file);
    }

    getDuration(): number {
        const end = this.endTime || new Date();
        let duration = Math.round((Number(end) - Number(this.startTime)) / 60000); // in minutes
        if (this.pauseStartTime) {
            duration -= Math.round((Number(new Date()) - Number(this.pauseStartTime)) / 60000);
        }
        duration -= Math.round(this.totalPauseDuration / 60000);
        return Math.max(0, duration);
    }

    end(): SessionData {
        this.endTime = new Date();
        return {
            category: this.category,
            startTime: this.startTime,
            duration: this.getDuration(),
            pomodoros: this.pomodorosCompleted,
            difficulty: this.difficulty,
            notes: this.notes,
            distractions: this.distractions,
            lineNotes: this.lineNotes,
            modifiedFiles: Array.from(this.modifiedFiles),
            completedTasks: this.completedTasks,
            reflections: this.reflections,
            date: this.startTime.toISOString().split('T')[0],
            completed: this.completed,
            isBreak: this.isBreak,
            pauseDuration: Math.round(this.totalPauseDuration / 60000)
        };
    }
}

class StudyFlowView extends ItemView {
    plugin: StudyAnalyticsPlugin;
    timeLeft: number;
    isRunning: boolean;
    isBreak: boolean;
    pomodoroCount: number;
    timerStartTime: number | null;
    lastUpdate: number | null;
    isStopwatch: boolean;
    stopwatchStartTime: number | null;
    stopwatchElapsed: number;
    interval: number | null;
    timerDisplay: HTMLElement;
    endTimeDisplay: HTMLElement;
    stopwatchToggle: HTMLButtonElement;
    startButton: HTMLButtonElement;
    categorySelect: HTMLSelectElement;
    difficultySlider: HTMLInputElement;
    notesArea: HTMLTextAreaElement;
    distractionInput: HTMLInputElement;
    dailyTimeDisplay: HTMLElement;
    statusBarItem: HTMLElement;
    endTime: number;
    startTime: number;

    constructor(leaf: WorkspaceLeaf, plugin: StudyAnalyticsPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.timeLeft = this.plugin.settings.pomodoroTime * 60;
        this.isRunning = false;
        this.isBreak = false;
        this.pomodoroCount = 0;
        this.timerStartTime = null;
        this.lastUpdate = null;
        this.isStopwatch = false;
        this.stopwatchStartTime = null;
        this.stopwatchElapsed = 0;
        this.interval = null;
    }

    getViewType(): string {
        return VIEW_TYPE_STUDY_FLOW;
    }

    getDisplayText(): string {
        return "Study Flow";
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();

        // Daily Total Study Time Display
        const dailyStatsContainer = container.createEl('div', {
            cls: 'study-flow-daily-stats'
        });
        this.dailyTimeDisplay = dailyStatsContainer.createEl('div', {
            cls: 'study-flow-daily-time',
            text: 'Today\'s Study Time: Loading...'
        });

        // Initial update and regular updates
        await this.updateDailyTime();
        this.registerInterval(
            window.setInterval(async () => await this.updateDailyTime(), 60000)
        );

        // Timer Display
        this.timerDisplay = container.createEl('div', { cls: 'timer-display' });
        this.endTimeDisplay = container.createEl('div', { cls: 'end-time-display' });
        this.updateTimerDisplay();

        // Stopwatch Toggle
        const stopwatchDiv = container.createEl('div', { cls: 'stopwatch-section' });
        this.stopwatchToggle = stopwatchDiv.createEl('button', {
            text: 'Switch to Stopwatch',
            cls: 'stopwatch-toggle'
        });
        this.stopwatchToggle.onclick = () => this.toggleStopwatchMode();

        // Controls
        const controls = container.createEl('div', { cls: 'controls' });

        // Start Button
        this.startButton = controls.createEl('button', {
            text: 'Start',
            cls: 'control-button start-button'
        });
        this.startButton.onclick = () => this.toggleTimer();

        // New Session Button
        const newSessionButton = controls.createEl('button', {
            text: 'New Session',
            cls: 'control-button new-session-button'
        });
        newSessionButton.onclick = async () => {
            if (this.plugin.currentSession) {
                this.plugin.currentSession.notes = this.notesArea.value;
                if (this.plugin.settings.showDifficulty) {
                    this.plugin.currentSession.difficulty = parseInt(this.difficultySlider.value);
                }
                const sessionData = this.plugin.currentSession.end();
                await this.plugin.saveSessionToFile(sessionData);
            }

            const category = this.categorySelect.value;
            this.plugin.startNewSession(category);

            this.notesArea.value = '';
            this.distractionInput.value = '';
            if (this.difficultySlider) {
                this.difficultySlider.value = '1';
            }

            new Notice('New session started - Timer continues');
        };

        // End Button
        const endButton = controls.createEl('button', {
            text: 'End',
            cls: 'control-button end-button'
        });
        endButton.onclick = () => this.plugin.endCurrentSession();

        // Category Selection
        const categoryDiv = container.createEl('div', { cls: 'category-section' });
        categoryDiv.createEl('label', { text: 'Category: ' });
        this.categorySelect = categoryDiv.createEl('select');
        this.updateCategorySelect();

        // Difficulty Slider
        if (this.plugin.settings.showDifficulty) {
            const difficultyDiv = container.createEl('div', { cls: 'difficulty-section' });
            difficultyDiv.createEl('label', { text: 'Difficulty: ' });
            this.difficultySlider = difficultyDiv.createEl('input', {
                type: 'range',
                attr: {
                    min: '1',
                    max: '5',
                    value: '1'
                },
                cls: 'difficulty-slider'
            });
        }

        // Session Notes
        const notesDiv = container.createEl('div', { cls: 'notes-section' });
        notesDiv.createEl('label', { text: 'Session Notes:' });
        this.notesArea = notesDiv.createEl('textarea', {
            cls: 'notes-area',
            attr: { rows: '4', placeholder: 'Enter session notes here...' }
        });

        // Add Reflection Note Button
        const reflectionDiv = container.createEl('div', { cls: 'reflection-section' });
        const reflectionButton = reflectionDiv.createEl('button', {
            text: 'Add Reflection',
            cls: 'reflection-button'
        });
        reflectionButton.onclick = () => this.addReflection();

        // Distraction Reporter
        const distractionDiv = container.createEl('div', { cls: 'distraction-section' });
        const distractionButton = distractionDiv.createEl('button', {
            text: 'Report Distraction',
            cls: 'distraction-button'
        });
        this.distractionInput = distractionDiv.createEl('input', {
            type: 'text',
            attr: {
                placeholder: 'What distracted you?'
            },
            cls: 'distraction-input'
        });
        distractionButton.onclick = () => this.reportDistraction();

        // Add styles
        container.createEl('style').textContent = this.getStyles();
    }

    async updateDailyTime(): Promise<void> {
        const today = new Date().toLocaleDateString();
        let totalMinutes = 0;
        const tempFolderPath = `${this.plugin.settings.notesFolder}/temp`;

        try {
            // Read temporary JSON files
            if (await this.app.vault.adapter.exists(tempFolderPath)) {
                const tempFiles = await this.app.vault.adapter.list(tempFolderPath);

                for (const file of tempFiles.files) {
                    const content = await this.app.vault.adapter.read(file);
                    const sessionData = JSON.parse(content);

                    // Check if the session is from today and NOT a break
                    const sessionDate = new Date(sessionData.startTime).toLocaleDateString();
                    if (sessionDate === today && !sessionData.isBreak) {
                        totalMinutes += sessionData.duration;
                    }
                }
            }

            // Add the time of the current session, if it's not a break
            if (this.plugin.currentSession && !this.plugin.currentSession.isBreak) {
                totalMinutes += this.plugin.currentSession.getDuration();
            }

            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            this.dailyTimeDisplay.setText(`Today's Study Time: ${hours}h ${minutes}m`);
        } catch (error) {
            console.error('Error calculating total study time:', error);
            this.dailyTimeDisplay.setText("Today's Study Time: Error");
        }
    }

    getStyles(): string {
        return `
            .study-flow-daily-stats {
                background: var(--background-secondary);
                padding: 10px;
                border-radius: 5px;
                margin: 10px 20px;
                text-align: center;
            }
            
            .study-flow-daily-time {
                font-size: 1.2em;
                font-weight: bold;
                color: var(--text-accent);
            }

            .timer-display {
                font-size: 3em;
                text-align: center;
                margin: 20px;
                font-family: monospace;
            }
            .end-time-display {
                text-align: center;
                margin-top: -15px;
                margin-bottom: 20px;
                font-size: 0.9em;
                color: var(--text-muted);
            }
            .stopwatch-section {
                text-align: center;
                margin: 10px 0;
            }
            .stopwatch-toggle {
                padding: 5px 15px;
                margin: 5px;
            }
            .controls {
                text-align: center;
                margin: 20px;
                display: flex;
                justify-content: center;
                gap: 10px;
            }
            .control-button {
                padding: 5px 15px;
                min-width: 80px;
            }
            .end-button {
                background-color: #ff4444;
                color: white;
            }
            .category-section, .difficulty-section, 
            .reflection-section, .distraction-section, .notes-section {
                margin: 20px;
            }
            .notes-area, .distraction-input {
                width: 100%;
                margin-top: 10px;
            }
            .difficulty-slider {
                width: 200px;
            }
            .reflection-button {
                width: 100%;
                margin-top: 10px;
                padding: 5px;
            }
        `;
    }

    updateCategorySelect(): void {
        this.categorySelect.empty();
        this.plugin.settings.categories.forEach(cat => {
            if (!this.isBreak || cat === 'Break') {
                const option = this.categorySelect.createEl('option', {
                    text: cat,
                    value: cat
                });
                if (cat === 'Break') {
                    option.disabled = !this.isBreak;
                }
            }
        });
    }

    toggleStopwatchMode(): void {
        if (this.isRunning) {
            this.pauseTimer();
        }
        this.isStopwatch = !this.isStopwatch;
        this.stopwatchToggle.textContent = this.isStopwatch ?
            'Switch to Pomodoro' : 'Switch to Stopwatch';
        this.resetSession();
        this.updateCategorySelect();
    }

    updateTimerDisplay(): void {
        if (this.isStopwatch) {
            const totalSeconds = Math.floor(this.stopwatchElapsed / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.timerDisplay.textContent = display;
            this.endTimeDisplay.textContent = '';
        } else {
            const minutes = Math.floor(this.timeLeft / 60);
            const seconds = this.timeLeft % 60;
            const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.timerDisplay.textContent = display;

            if (this.isRunning) {
                const endTime = new Date(Date.now() + (this.timeLeft * 1000));
                const endTimeStr = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                this.endTimeDisplay.textContent = `Ends at ${endTimeStr}`;
            } else {
                this.endTimeDisplay.textContent = '';
            }
        }

        if (this.plugin) {
            this.plugin.updateStatusBar(this.timerDisplay.textContent);
        }
    }

    resetSession(): void {
        if (this.isStopwatch) {
            this.stopwatchElapsed = 0;
        } else {
            this.timeLeft = this.plugin.settings.pomodoroTime * 60;
            this.isBreak = false;
            this.pomodoroCount = 0;
        }

        this.isRunning = false;
        this.timerStartTime = null;
        this.lastUpdate = null;

        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        this.startButton.textContent = 'Start';
        this.updateTimerDisplay();

        this.notesArea.value = '';
        this.distractionInput.value = '';
        if (this.difficultySlider) {
            this.difficultySlider.value = '1';
        }

        if (this.categorySelect && this.categorySelect.options.length > 0) {
            this.categorySelect.selectedIndex = 0;
        }
    }

    toggleTimer(): void {
        if (this.isRunning) {
            this.pauseTimer();
        } else {
            this.startTimer();
        }
    }

    startTimer(): void {
        if (!this.plugin.currentSession) {
            const category = this.categorySelect.value;
            this.plugin.startNewSession(category);
        }

        if (this.plugin.currentSession) {
            this.plugin.currentSession.resume();
        }

        this.isRunning = true;
        this.startButton.textContent = 'Pause';

        if (this.isStopwatch) {
            if (!this.stopwatchStartTime) {
                this.stopwatchStartTime = Date.now() - this.stopwatchElapsed;
            }
            this.interval = window.setInterval(() => {
                this.stopwatchElapsed = Date.now() - this.stopwatchStartTime;
                this.updateTimerDisplay();
                this.updateDailyTime();
            }, 100);
        } else {
            if (!this.interval) {
                this.startTime = Date.now();
                this.endTime = this.startTime + (this.timeLeft * 1000);
                this.lastUpdate = this.startTime;

                this.interval = window.setInterval(() => {
                    const now = Date.now();
                    const elapsed = now - this.lastUpdate;

                    if (elapsed > 2000) {
                        this.timeLeft = Math.max(0, Math.ceil((this.endTime - now) / 1000));
                    } else {
                        const remaining = Math.max(0, Math.ceil((this.endTime - now) / 1000));
                        if (remaining !== this.timeLeft) {
                            this.timeLeft = remaining;
                        }
                    }

                    this.lastUpdate = now;
                    this.updateTimerDisplay();
                    this.updateDailyTime();

                    if (this.timeLeft <= 0) {
                        this.completeTimer();
                    }
                }, 100);
            }
        }
    }

    pauseTimer(): void {
        this.isRunning = false;
        this.startButton.textContent = 'Start';

        if (this.plugin.currentSession) {
            this.plugin.currentSession.pause();
        }

        if (this.interval) {
            window.clearInterval(this.interval);
            this.interval = null;
        }

        if (!this.isStopwatch) {
            const now = Date.now();
            this.timeLeft = Math.max(0, Math.ceil((this.endTime - now) / 1000));
        }

        this.endTimeDisplay.textContent = '';
        this.updateDailyTime();
    }

    async completeTimer(): Promise<void> {
        this.pauseTimer();
        if (!this.isBreak) {
            this.pomodoroCount++;
            if (this.plugin.currentSession) {
                this.plugin.currentSession.pomodorosCompleted++;
                const sessionData = this.plugin.currentSession.end();
                await this.plugin.saveSessionToFile(sessionData);

                const isLongBreak = this.pomodoroCount % this.plugin.settings.longBreakInterval === 0;
                const breakTime = isLongBreak ?
                    this.plugin.settings.longBreakTime :
                    this.plugin.settings.shortBreakTime;

                if (document.hidden) {
                    new Notification('Pomodoro Timer', {
                        body: `Pomodoro completed! Time for a ${isLongBreak ? 'long' : 'short'} break.`
                    });
                }

                new Notice(`Pomodoro completed! Take a ${isLongBreak ? 'long' : 'short'} break.`);
                this.timeLeft = breakTime * 60;
                this.isBreak = true;

                this.plugin.startNewSession('Break');
                this.categorySelect.value = 'Break';

                if (this.plugin.settings.autoStartBreaks) {
                    this.startTimer();
                }
            }
        } else {
            if (document.hidden) {
                new Notification('Pomodoro Timer', {
                    body: 'Break completed! Ready to start working?'
                });
            }

            new Notice('Break completed!');
            this.timeLeft = this.plugin.settings.pomodoroTime * 60;
            this.isBreak = false;

            if (this.plugin.currentSession) {
                const sessionData = this.plugin.currentSession.end();
                await this.plugin.saveSessionToFile(sessionData);
            }

            if (this.plugin.settings.autoStartPomodoros) {
                const category = this.plugin.settings.categories.find(c => c !== 'Break') || 'Study';
                this.plugin.startNewSession(category);
                this.categorySelect.value = category;
                this.startTimer();
            }
        }
        this.updateTimerDisplay();
        await this.updateDailyTime();
    }

    onLayoutReady(): void {
        if (this.isRunning && this.interval) {
            const now = Date.now();
            if (this.isStopwatch) {
                this.stopwatchElapsed = now - this.stopwatchStartTime;
            } else {
                const elapsed = Math.floor((now - this.lastUpdate) / 1000);
                if (elapsed > 0) {
                    this.timeLeft = Math.max(0, this.timeLeft - elapsed);
                    this.lastUpdate = now;
                    if (this.timeLeft <= 0) {
                        this.completeTimer();
                    }
                }
            }
            this.updateTimerDisplay();
            this.updateDailyTime();
        }
    }

    addReflection(): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText('Add Reflection');

        const contentEl = modal.contentEl;

        const statsEl = contentEl.createEl('div', { cls: 'reflection-stats' });
        if (this.plugin.currentSession) {
            const session = this.plugin.currentSession;
            statsEl.innerHTML = `
                <div class="stats-overview">
                    <p>📊 Current Session Stats:</p>
                    <ul>
                        <li>⏱️ Duration: ${session.getDuration()} minutes</li>
                        <li>🍅 Pomodoros: ${session.pomodorosCompleted}</li>
                        <li>⚠️ Distractions: ${session.distractions.length}</li>
                        <li>📝 Modified Files: ${session.modifiedFiles.size}</li>
                        <li>✅ Completed Tasks: ${session.completedTasks.length}</li>
                    </ul>
                </div>
            `;
        }

        contentEl.createEl('p', { text: '💭 What are your thoughts on this study session so far?' });

        const reflectionInput = contentEl.createEl('textarea', {
            attr: {
                rows: '6',
                placeholder: 'Enter your reflection here...'
            }
        });

        const buttonDiv = contentEl.createEl('div', { cls: 'button-section' });
        const submitButton = buttonDiv.createEl('button', {
            text: 'Add Reflection',
            cls: 'mod-cta'
        });

        submitButton.onclick = () => {
            if (reflectionInput.value.trim()) {
                if (this.plugin.currentSession) {
                    this.plugin.currentSession.addReflection(reflectionInput.value);
                    const timestamp = new Date().toLocaleTimeString();
                    const currentNotes = this.notesArea.value;
                    const reflection = `\n\n##### Reflection (${timestamp})\n${reflectionInput.value}`;
                    this.notesArea.value = currentNotes + reflection;
                }
                modal.close();
                new Notice('Reflection added');
            }
        };

        modal.open();
    }

    reportDistraction(): void {
        if (this.distractionInput.value.trim()) {
            if (this.plugin.currentSession) {
                this.plugin.currentSession.addDistraction(this.distractionInput.value);
                this.distractionInput.value = '';
                new Notice('Distraction recorded');
            }
        }
    }
}

class StudyFlowSettingTab extends PluginSettingTab {
    plugin: StudyAnalyticsPlugin;

    constructor(app: App, plugin: StudyAnalyticsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h3', { text: 'Timer Settings' });

        new Setting(containerEl)
            .setName('Pomodoro Duration')
            .setDesc('Duration in minutes')
            .addText(text => text
                .setValue(String(this.plugin.settings.pomodoroTime))
                .onChange(async (value) => {
                    this.plugin.settings.pomodoroTime = parseInt(value) || 25;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Short Break Duration')
            .setDesc('Duration in minutes')
            .addText(text => text
                .setValue(String(this.plugin.settings.shortBreakTime))
                .onChange(async (value) => {
                    this.plugin.settings.shortBreakTime = parseInt(value) || 5;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Long Break Duration')
            .setDesc('Duration in minutes')
            .addText(text => text
                .setValue(String(this.plugin.settings.longBreakTime))
                .onChange(async (value) => {
                    this.plugin.settings.longBreakTime = parseInt(value) || 15;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Long Break Interval')
            .setDesc('Number of pomodoros before long break')
            .addText(text => text
                .setValue(String(this.plugin.settings.longBreakInterval))
                .onChange(async (value) => {
                    this.plugin.settings.longBreakInterval = parseInt(value) || 4;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Tags' });

        const tagInput = new Setting(containerEl)
            .setName('Add new tag')
            .addText(text => text
                .setPlaceholder('Add new tag'))
            .addButton(button => button
                .setButtonText('Add Tag')
                .onClick(() => {
                    let value = tagInput.components[0] as any;
                    value = value?.inputEl?.value;
                    if (value) {
                        if (!value.startsWith('#')) {
                            value = '#' + value;
                        }
                        this.plugin.settings.tags.push(value);
                        this.plugin.saveSettings();
                        (tagInput.components[0] as any).inputEl.value = '';
                        this.display();
                    }
                }));

        this.plugin.settings.tags.forEach((tag, index) => {
            new Setting(containerEl)
                .setName(tag)
                .addButton(button => button
                    .setIcon('trash')
                    .onClick(async () => {
                        this.plugin.settings.tags.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        });

        containerEl.createEl('h3', { text: 'Categories' });

        const categoryInput = new Setting(containerEl)
            .setName('Add new category')
            .addText(text => text
                .setPlaceholder('Add new category'))
            .addButton(button => button
                .setButtonText('Add Category')
                .onClick(() => {
                    let value = categoryInput.components[0] as any;
                    value = value?.inputEl?.value;
                    if (value && value !== 'Break') {
                        this.plugin.settings.categories.push(value);
                        this.plugin.saveSettings();
                        (categoryInput.components[0] as any).inputEl.value = '';
                        this.display();
                    }
                }));

        this.plugin.settings.categories.forEach((category, index) => {
            const setting = new Setting(containerEl)
                .setName(category);

            if (category !== 'Break') {
                setting.addButton(button => button
                    .setIcon('trash')
                    .onClick(async () => {
                        this.plugin.settings.categories.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }));
            }
        });

        containerEl.createEl('h3', { text: 'Other Settings' });

        new Setting(containerEl)
            .setName('Notes Folder')
            .setDesc('Folder for session notes')
            .addText(text => text
                .setValue(this.plugin.settings.notesFolder)
                .onChange(async (value) => {
                    this.plugin.settings.notesFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Focus Path')
            .setDesc('Path for tracking modified files')
            .addText(text => text
                .setValue(this.plugin.settings.focusPath)
                .onChange(async (value) => {
                    this.plugin.settings.focusPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-start breaks')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoStartBreaks)
                .onChange(async (value) => {
                    this.plugin.settings.autoStartBreaks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-start pomodoros')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoStartPomodoros)
                .onChange(async (value) => {
                    this.plugin.settings.autoStartPomodoros = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show difficulty slider')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDifficulty)
                .onChange(async (value) => {
                    this.plugin.settings.showDifficulty = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Track modified files')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.trackModifiedFiles)
                .onChange(async (value) => {
                    this.plugin.settings.trackModifiedFiles = value;
                    await this.plugin.saveSettings();
                }));
    }
}

export default class StudyAnalyticsPlugin extends Plugin {
    settings: StudyAnalyticsSettings;
    currentSession: StudySession | null = null;
    statusBarItem: HTMLElement;

    async onload() {
        await this.loadSettings();

        // Request notification permissions
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
            try {
                await Notification.requestPermission();
            } catch (e) {
                console.log('Notification permission denied');
            }
        }

        this.registerView(
            VIEW_TYPE_STUDY_FLOW,
            (leaf) => new StudyFlowView(leaf, this)
        );

        this.addCommand({
            id: 'show-study-flow',
            name: 'Show Study Flow',
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'create-daily-summary',
            name: 'Create Daily Summary',
            callback: async () => {
                await this.createDailySummary();
                new Notice('Daily summary created');
            }
        });

        // Automatically open the sidebar on startup
        this.app.workspace.onLayoutReady(() => {
            this.activateView();
        });
        
        // Event listener for focus changes
        document.addEventListener('visibilitychange', () => {
            const view = this.getStudyFlowView();
            if (view && !document.hidden) {
                view.onLayoutReady();
            }
        });

        this.addCommand({
            id: 'add-line-note',
            name: 'Add Line Note',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                if (!this.currentSession) {
                    new Notice('No active study session!');
                    return;
                }

                const line = editor.getLine(editor.getCursor().line);
                const lineNumber = editor.getCursor().line + 1;

                const modal = new Modal(this.app);
                modal.titleEl.setText('Add Line Note');

                const contentEl = modal.contentEl;

                const lineDiv = contentEl.createEl('div', { cls: 'line-note-section' });
                lineDiv.createEl('strong', { text: 'Selected Line:' });
                lineDiv.createEl('pre', { text: line });

                const tagDiv = contentEl.createEl('div', { cls: 'tag-section' });
                tagDiv.createEl('strong', { text: 'Select Tag:' });
                const tagSelect = tagDiv.createEl('select');
                this.settings.tags.forEach(tag => {
                    tagSelect.createEl('option', { value: tag, text: tag });
                });

                const noteDiv = contentEl.createEl('div', { cls: 'note-section' });
                noteDiv.createEl('strong', { text: 'Your Note:' });
                const noteInput = contentEl.createEl('textarea', {
                    attr: {
                        rows: '4',
                        placeholder: 'Add your note here...'
                    }
                });

                const buttonDiv = contentEl.createEl('div', { cls: 'button-section' });
                const submitButton = buttonDiv.createEl('button', {
                    text: 'Save Note',
                    cls: 'mod-cta'
                });

                submitButton.onclick = () => {
                    if (tagSelect.value) {
                        this.currentSession.addLineNote(
                            line,
                            view.file.path,
                            tagSelect.value,
                            noteInput.value,
                            lineNumber
                        );
                        new Notice('Line note added');
                        modal.close();
                    } else {
                        new Notice('Please select a tag');
                    }
                };

                modal.open();
            }
        });

        this.addSettingTab(new StudyFlowSettingTab(this.app, this));

        this.statusBarItem = this.addStatusBarItem();
        this.updateStatusBar('25:00');

        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (this.currentSession && this.settings.trackModifiedFiles) {
                    if (!this.settings.focusPath || file.path.startsWith(this.settings.focusPath)) {
                        this.currentSession.trackModifiedFile(file.path);

                        const content = await this.app.vault.cachedRead(file as TFile);
                        const newTasks = this.findNewlyCompletedTasks(content, file.path);
                        newTasks.forEach(task => {
                            this.currentSession.addCompletedTask(task);
                        });
                    }
                }
            })
        );
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        if (this.app.workspace.getLeavesOfType(VIEW_TYPE_STUDY_FLOW).length === 0) {
            await this.app.workspace.getRightLeaf(false).setViewState({
                type: VIEW_TYPE_STUDY_FLOW,
                active: true,
            });
        }
        this.app.workspace.revealLeaf(
            this.app.workspace.getLeavesOfType(VIEW_TYPE_STUDY_FLOW)[0]
        );
    }

    getStudyFlowView(): StudyFlowView | null {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_STUDY_FLOW);
        if (leaves.length > 0) {
            return leaves[0].view as StudyFlowView;
        }
        return null;
    }

    startNewSession(category: string) {
        this.currentSession = new StudySession(category);
    }

    async endCurrentSession() {
        if (this.currentSession) {
            const view = this.getStudyFlowView();
            if (view) {
                this.currentSession.notes = view.notesArea.value;
                if (this.settings.showDifficulty) {
                    this.currentSession.difficulty = parseInt(view.difficultySlider.value);
                }
            }

            const sessionData = this.currentSession.end();
            await this.saveSessionToFile(sessionData);
            this.currentSession = null;

            if (view) {
                view.resetSession();
            }

            new Notice('Session ended and saved');
        }
    }

    async saveSessionToFile(sessionData: SessionData) {
        const tempFileName = `temp_${new Date().getTime()}.json`;
        const tempFolderPath = `${this.settings.notesFolder}/temp`;

        if (!(await this.app.vault.adapter.exists(tempFolderPath))) {
            await this.app.vault.createFolder(tempFolderPath);
        }

        await this.app.vault.adapter.write(
            `${tempFolderPath}/${tempFileName}`,
            JSON.stringify(sessionData, null, 2)
        );
    }

    async createDailySummary() {
        const date = new Date().toISOString().split('T')[0];
        const tempFolderPath = `${this.settings.notesFolder}/temp`;
        const summaryFileName = `${date}_daily_summary.md`;
        const summaryFilePath = `${this.settings.notesFolder}/${summaryFileName}`;

        try {
            if (!(await this.app.vault.adapter.exists(tempFolderPath))) {
                return new Notice('No study sessions found for today');
            }
            
            const tempFiles = await this.app.vault.adapter.list(tempFolderPath);
            const sessions: SessionData[] = [];
            let totalTime = 0;
            let totalPomodoros = 0;
            let totalDistractions = 0;
            const modifiedFiles = new Set<string>();
            let totalTasks = 0;
            const difficulties: number[] = [];

            // Collect data from all temporary files
            for (const file of tempFiles.files) {
                const content = await this.app.vault.adapter.read(file);
                const sessionData = JSON.parse(content) as SessionData;
                sessions.push(sessionData);

                totalTime += sessionData.duration;
                totalPomodoros += sessionData.pomodoros;
                totalDistractions += sessionData.distractions.length;
                sessionData.modifiedFiles.forEach(f => modifiedFiles.add(f));
                totalTasks += sessionData.completedTasks.length;
                difficulties.push(sessionData.difficulty);
            }

            const avgDifficulty = difficulties.length > 0
                ? (difficulties.reduce((a, b) => a + b) / difficulties.length).toFixed(1)
                : '0';

            // Create the summary
            let summaryContent = `# Daily Study Summary - ${date}\n\n`;

            // Daily statistics
            summaryContent += `## 📊 Daily Statistics\n`;
            summaryContent += `- ⏱️ Total Study Time: ${totalTime} minutes\n`;
            summaryContent += `- 🍅 Total Pomodoros: ${totalPomodoros}\n`;
            summaryContent += `- ⚠️ Total Distractions: ${totalDistractions}\n`;
            summaryContent += `- 📝 Modified Files: ${modifiedFiles.size}\n`;
            summaryContent += `- ✅ Completed Tasks: ${totalTasks}\n`;
            summaryContent += `- 📈 Average Difficulty: ${avgDifficulty}/5\n\n`;

            // Modified Files Overview
            if (modifiedFiles.size > 0) {
                summaryContent += `## 📝 Modified Files Overview\n`;
                modifiedFiles.forEach(file => {
                    summaryContent += `- [[${file}|${file.split('/').pop()}]]\n`;
                });
                summaryContent += '\n';
            }

            // Individual Sessions
            sessions.forEach((session, index) => {
                summaryContent += `## Study Session ${index + 1}: ${session.category}\n`;
                summaryContent += `- Start Time: ${new Date(session.startTime).toLocaleTimeString()}\n`;
                summaryContent += `- Duration: ${session.duration} minutes\n`;
                summaryContent += `- Pomodoros: ${session.pomodoros}\n`;
                summaryContent += `- Difficulty: ${session.difficulty}/5\n\n`;

                if (session.notes) {
                    summaryContent += `### Notes\n${session.notes}\n\n`;
                }

                if (session.reflections.length > 0) {
                    session.reflections.forEach(r => {
                        summaryContent += `##### Reflection - ${new Date(r.time).toLocaleTimeString()}\n${r.text}\n\n`;
                    });
                }

                if (session.distractions.length > 0) {
                    summaryContent += `### Distractions\n`;
                    session.distractions.forEach(d => {
                        summaryContent += `- ${new Date(d.time).toLocaleTimeString()}: ${d.note}\n`;
                    });
                    summaryContent += '\n';
                }

                if (session.lineNotes.length > 0) {
                    summaryContent += `### Line Notes\n`;
                    session.lineNotes.forEach(n => {
                        summaryContent += `#### [[${n.file}#${n.lineNumber}|${n.file.split('/').pop()}:${n.lineNumber}]]\n`;
                        summaryContent += `${n.tag}\n\`\`\`\n${n.line}\n\`\`\`\n${n.note}\n\n`;
                    });
                }
            });

            // Save the summary
            if (!(await this.app.vault.adapter.exists(this.settings.notesFolder))) {
                await this.app.vault.createFolder(this.settings.notesFolder);
            }
            
            await this.app.vault.create(summaryFilePath, summaryContent);

            // Delete temporary files
            for (const file of tempFiles.files) {
                await this.app.vault.adapter.remove(file);
            }

            new Notice('Daily summary created successfully!');
        } catch (error) {
            console.error('Error creating daily summary:', error);
            new Notice('Error creating daily summary');
        }
    }

    findNewlyCompletedTasks(content: string, filePath: string): string[] {
        const lines = content.split('\n');
        const completedTasks: string[] = [];

        lines.forEach((line) => {
            if (line.match(/^- \[([xX])\] /)) {
                const taskText = line.replace(/^- \[([xX])\] /, '');
                completedTasks.push(`${filePath}: ${taskText}`);
            }
        });

        return completedTasks;
    }

    updateStatusBar(time: string) {
        this.statusBarItem.setText(`🍅 ${time}`);
    }

    onunload() {
        this.app.workspace
            .getLeavesOfType(VIEW_TYPE_STUDY_FLOW)
            .forEach(leaf => leaf.detach());
    }
}