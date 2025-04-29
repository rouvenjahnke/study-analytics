import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile, TextComponent } from 'obsidian';

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
    enableWeeklySummary: boolean;
    weeklySummaryDay: number; // 0-6 (Sunday-Saturday)
    createDailySummary: boolean;
    trackOpenedFiles: boolean;
    trackWordCount: boolean;
    lastWeeklySummary?: string; // Last date when weekly summary was created
    resetTimerOnNewSession: boolean; // If enabled, timer resets when new session starts
    autoTrackSessionOnStartup: boolean; // If enabled, automatically starts tracking when Obsidian opens
    autoSetCategoryByFolder: boolean; // If enabled, automatically sets category based on folder
    folderCategoryMappings: Record<string, string>; // Maps folder paths to categories
    preserveTempFiles: boolean; // If enabled, don't delete temp files after daily summary
    tagsToTrack: string[]; // Tags to specifically track in summaries
    trackCreatedNotes: boolean; // Track newly created notes
    trackWithoutSession: boolean; // Track Obsidian usage without explicit session (until 23:59)
    autoDailySummary: boolean; // Automatically create daily summary at midnight
    autoWeeklySummary: boolean; // Automatically create weekly summary on specified day
    keepLongTermData: boolean; // Keep session data long-term instead of deleting after summaries
    trackTaggedNotes: boolean; // Track notes with specific tags
}

const DEFAULT_SETTINGS: StudyAnalyticsSettings = {
    pomodoroTime: 25,
    shortBreakTime: 5,
    longBreakTime: 15,
    longBreakInterval: 4,
    notesFolder: 'Study Sessions',
    focusPath: '',
    categories: ['Study', 'Work', 'Reading', 'Project', '~Break~'],
    tags: ['#important', '#question', '#difficult', '#review'],
    autoStartBreaks: true,
    autoStartPomodoros: false,
    showDifficulty: true,
    trackModifiedFiles: true,
    enableWeeklySummary: true,
    weeklySummaryDay: 0, // Sunday by default
    createDailySummary: true,
    trackOpenedFiles: true,
    trackWordCount: true,
    resetTimerOnNewSession: false,
    autoTrackSessionOnStartup: false,
    autoSetCategoryByFolder: false,
    folderCategoryMappings: {},
    preserveTempFiles: true,
    tagsToTrack: [],
    trackCreatedNotes: true,
    trackWithoutSession: false, // Track Obsidian usage without explicit session (until 23:59)
    autoDailySummary: false, // Automatically create daily summary at midnight
    autoWeeklySummary: false, // Automatically create weekly summary on specified day
    keepLongTermData: true, // Keep session data long-term instead of deleting after summaries
    trackTaggedNotes: false, // Track notes with specific tags
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
    openedFiles: string[];
    createdFiles: string[]; // Files created during the session
    completedTasks: CompletedTask[];
    reflections: ReflectionNote[];
    date: string;
    completed: boolean;
    isBreak: boolean;
    pauseDuration: number;
    wordCount: number;
    createdLinks: string[]; // Links created during the session
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
    openedFiles: Set<string>;
    createdFiles: Set<string>;
    completed: boolean;
    completedTasks: CompletedTask[];
    reflections: ReflectionNote[];
    pauseStartTime: Date | null;
    totalPauseDuration: number;
    isBreak: boolean;
    wordCount: number;
    initialWordCounts: Map<string, number>;
    createdLinks: Set<string>;
    initialLinkCounts: Map<string, number>;

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
        this.openedFiles = new Set<string>();
        this.createdFiles = new Set<string>();
        this.completed = false;
        this.completedTasks = [];
        this.reflections = [];
        this.pauseStartTime = null;
        this.totalPauseDuration = 0;
        this.isBreak = category === '~Break~';
        this.wordCount = 0;
        this.initialWordCounts = new Map<string, number>();
        this.createdLinks = new Set<string>();
        this.initialLinkCounts = new Map<string, number>();
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
    
    trackOpenedFile(file: string): void {
        this.openedFiles.add(file);
    }
    
    updateWordCount(filePath: string, currentWordCount: number): void {
        if (!this.initialWordCounts.has(filePath)) {
            this.initialWordCounts.set(filePath, currentWordCount);
            return;
        }
        
        const initialCount = this.initialWordCounts.get(filePath) || 0;
        if (currentWordCount > initialCount) {
            this.wordCount += (currentWordCount - initialCount);
            this.initialWordCounts.set(filePath, currentWordCount);
        }
    }
    
    trackCreatedFile(file: string): void {
        this.createdFiles.add(file);
    }
    
    updateLinkCount(filePath: string, currentLinkCount: number): void {
        if (!this.initialLinkCounts.has(filePath)) {
            this.initialLinkCounts.set(filePath, currentLinkCount);
            return;
        }
        
        const initialCount = this.initialLinkCounts.get(filePath) || 0;
        if (currentLinkCount > initialCount) {
            // Add each new link to the created links set
            const newLinks = currentLinkCount - initialCount;
            for (let i = 0; i < newLinks; i++) {
                this.createdLinks.add(`${filePath}:${initialCount + i + 1}`);
            }
            this.initialLinkCounts.set(filePath, currentLinkCount);
        }
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
            openedFiles: Array.from(this.openedFiles),
            createdFiles: Array.from(this.createdFiles),
            completedTasks: this.completedTasks,
            reflections: this.reflections,
            date: this.startTime.toISOString().split('T')[0],
            completed: this.completed,
            isBreak: this.isBreak,
            pauseDuration: Math.round(this.totalPauseDuration / 60000),
            wordCount: this.wordCount,
            createdLinks: Array.from(this.createdLinks)
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

            // Reset input fields
            this.notesArea.value = '';
            this.distractionInput.value = '';
            
            // Always reset difficulty to 1 for new sessions
            if (this.difficultySlider) {
                this.difficultySlider.value = '1';
            }
            
            // Optionally reset timer based on settings
            if (this.plugin.settings.resetTimerOnNewSession) {
                if (!this.isStopwatch) {
                    this.timeLeft = this.plugin.settings.pomodoroTime * 60;
                } else {
                    this.stopwatchElapsed = 0;
                    this.stopwatchStartTime = null;
                }
                
                // If timer was running, restart it with the reset time
                const wasRunning = this.isRunning;
                if (wasRunning) {
                    this.pauseTimer();
                    this.startTimer();
                }
                
                this.updateTimerDisplay();
                new Notice('New session started - Timer reset');
            } else {
                new Notice('New session started - Timer continues');
            }
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
        this.categorySelect.onchange = () => {
            // When selection changes, start a new session with the selected category
            this.changeCategory(this.categorySelect.value);
        };
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
            if (!this.isBreak || cat === '~Break~') {
                const option = this.categorySelect.createEl('option', {
                    text: cat,
                    value: cat
                });
                if (cat === '~Break~') {
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
    
    changeCategory(newCategory: string): void {
        // Only change if different from current category
        if (this.plugin.currentSession && this.plugin.currentSession.category !== newCategory) {
            // Save current session
            this.plugin.currentSession.notes = this.notesArea.value;
            if (this.plugin.settings.showDifficulty) {
                this.plugin.currentSession.difficulty = parseInt(this.difficultySlider.value);
            }
            
            const wasRunning = this.isRunning;
            
            // Remember timer state for continuity
            const timeLeftBackup = this.timeLeft;
            const stopwatchElapsedBackup = this.stopwatchElapsed;
            const isStopwatchBackup = this.isStopwatch;
            
            if (wasRunning) {
                this.pauseTimer();
            }
            
            const sessionData = this.plugin.currentSession.end();
            this.plugin.saveSessionToFile(sessionData);
            
            // Start new session with new category
            this.plugin.startNewSession(newCategory);
            this.categorySelect.value = newCategory;
            
            // Reset difficulty slider if shown
            if (this.difficultySlider) {
                this.difficultySlider.value = '1';
            }
            
            // Keep notes if continuing same work in different category
            // this.notesArea.value = ''; // Uncomment to clear notes on category change
            
            // Restore timer state for continuity
            if (isStopwatchBackup) {
                this.stopwatchElapsed = stopwatchElapsedBackup;
            } else {
                this.timeLeft = timeLeftBackup;
            }
            
            if (wasRunning) {
                this.startTimer();
            }
            
            new Notice(`Category changed to ${newCategory}`);
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
                // Save session notes before ending the session
                this.plugin.currentSession.notes = this.notesArea.value;
                if (this.plugin.settings.showDifficulty) {
                    this.plugin.currentSession.difficulty = parseInt(this.difficultySlider.value);
                }
                
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

                // Clear input fields after ending the session
                this.notesArea.value = '';
                this.distractionInput.value = '';
                
                // Reset difficulty slider
                if (this.difficultySlider) {
                    this.difficultySlider.value = '1';
                }
                
                this.plugin.startNewSession('~Break~');
                this.categorySelect.value = '~Break~';

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
                // Save break notes before ending
                this.plugin.currentSession.notes = this.notesArea.value;
                
                const sessionData = this.plugin.currentSession.end();
                await this.plugin.saveSessionToFile(sessionData);
                
                // Clear input fields after ending the break
                this.notesArea.value = '';
                this.distractionInput.value = '';
                
                // Reset difficulty slider
                if (this.difficultySlider) {
                    this.difficultySlider.value = '1';
                }
            }

            if (this.plugin.settings.autoStartPomodoros) {
                const category = this.plugin.settings.categories.find(c => c !== '~Break~') || 'Study';
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
            const statsOverview = statsEl.createEl('div', { cls: 'stats-overview' });
            statsOverview.createEl('p', { text: '📊 Current Session Stats:' });
            const statsList = statsOverview.createEl('ul');
            statsList.createEl('li', { text: `⏱️ Duration: ${session.getDuration()} minutes` });
            statsList.createEl('li', { text: `🍅 Pomodoros: ${session.pomodorosCompleted}` });
            statsList.createEl('li', { text: `⚠️ Distractions: ${session.distractions.length}` });
            statsList.createEl('li', { text: `📝 Modified Files: ${session.modifiedFiles.size}` });
            statsList.createEl('li', { text: `✅ Completed Tasks: ${session.completedTasks.length}` });
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
                    const textComponent = tagInput.components[0] as TextComponent;
                    let value = textComponent.getValue();
                    if (value) {
                        if (!value.startsWith('#')) {
                            value = '#' + value;
                        }
                        this.plugin.settings.tags.push(value);
                        this.plugin.saveSettings();
                        textComponent.setValue('');
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
                    const textComponent = categoryInput.components[0] as TextComponent;
                    const value = textComponent.getValue();
                    if (value && value !== '~Break~') {
                        this.plugin.settings.categories.push(value);
                        this.plugin.saveSettings();
                        textComponent.setValue('');
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
                
        new Setting(containerEl)
            .setName('Track opened files')
            .setDesc('Track files that are opened during a study session')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.trackOpenedFiles)
                .onChange(async (value) => {
                    this.plugin.settings.trackOpenedFiles = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Track word count')
            .setDesc('Track the number of words written during study sessions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.trackWordCount)
                .onChange(async (value) => {
                    this.plugin.settings.trackWordCount = value;
                    await this.plugin.saveSettings();
                }));
                
        containerEl.createEl('h3', { text: 'Summary Settings' });
        
        new Setting(containerEl)
            .setName('Create daily summary')
            .setDesc('Create a daily summary note at the end of the day')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.createDailySummary)
                .onChange(async (value) => {
                    this.plugin.settings.createDailySummary = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Enable weekly summary')
            .setDesc('Automatically create a weekly summary note')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWeeklySummary)
                .onChange(async (value) => {
                    this.plugin.settings.enableWeeklySummary = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Weekly summary day')
            .setDesc('Day of the week to create the weekly summary')
            .addDropdown(dropdown => dropdown
                .addOption('0', 'Sunday')
                .addOption('1', 'Monday')
                .addOption('2', 'Tuesday')
                .addOption('3', 'Wednesday')
                .addOption('4', 'Thursday')
                .addOption('5', 'Friday')
                .addOption('6', 'Saturday')
                .setValue(String(this.plugin.settings.weeklySummaryDay))
                .onChange(async (value) => {
                    this.plugin.settings.weeklySummaryDay = parseInt(value);
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Preserve temporary session files')
            .setDesc('Keep temporary session data files even after creating summaries (for historical data)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.preserveTempFiles)
                .onChange(async (value) => {
                    this.plugin.settings.preserveTempFiles = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Keep long-term session data')
            .setDesc('Store session data long-term instead of deleting after summaries')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.keepLongTermData)
                .onChange(async (value) => {
                    this.plugin.settings.keepLongTermData = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Track tagged notes')
            .setDesc('Track notes with specific tags in summaries')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.trackTaggedNotes)
                .onChange(async (value) => {
                    this.plugin.settings.trackTaggedNotes = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Reset timer on new session')
            .setDesc('Reset the timer when starting a new session')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.resetTimerOnNewSession)
                .onChange(async (value) => {
                    this.plugin.settings.resetTimerOnNewSession = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Auto-track sessions on startup')
            .setDesc('Automatically start tracking when Obsidian opens')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoTrackSessionOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.autoTrackSessionOnStartup = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Auto-create daily summary')
            .setDesc('Automatically create daily summary at midnight')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoDailySummary)
                .onChange(async (value) => {
                    this.plugin.settings.autoDailySummary = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Auto-create weekly summary')
            .setDesc('Automatically create weekly summary on the specified day')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoWeeklySummary)
                .onChange(async (value) => {
                    this.plugin.settings.autoWeeklySummary = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Auto-set category by folder')
            .setDesc('Automatically set category based on folder')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSetCategoryByFolder)
                .onChange(async (value) => {
                    this.plugin.settings.autoSetCategoryByFolder = value;
                    await this.plugin.saveSettings();
                }));
                
        // Folder-Category mapping
        if (this.plugin.settings.autoSetCategoryByFolder) {
            containerEl.createEl('h4', { text: 'Folder-Category Mappings' });
            
            // Add existing mappings
            for (const folderPath in this.plugin.settings.folderCategoryMappings) {
                const category = this.plugin.settings.folderCategoryMappings[folderPath];
                
                const mappingSetting = new Setting(containerEl)
                    .setName(folderPath)
                    .setDesc(`Category: ${category}`);
                    
                mappingSetting.addButton(button => button
                    .setIcon('trash')
                    .setTooltip('Delete mapping')
                    .onClick(async () => {
                        delete this.plugin.settings.folderCategoryMappings[folderPath];
                        await this.plugin.saveSettings();
                        this.display();
                    }));
            }
            
            // Add new mapping
            const newMappingSetting = new Setting(containerEl)
                .setName('Add Folder-Category Mapping')
                .setDesc('Map a folder path to a specific category');
                
            let folderPathInput: HTMLInputElement;
            let categoryDropdown: HTMLSelectElement;
            
            newMappingSetting.addText(text => {
                folderPathInput = text.inputEl;
                return text
                    .setPlaceholder('Folder path (e.g., folder/subfolder)')
                    .setValue('');
            });
            
            newMappingSetting.addDropdown(dropdown => {
                categoryDropdown = dropdown.selectEl;
                
                // Add all non-break categories as options
                this.plugin.settings.categories.forEach(cat => {
                    if (cat !== '~Break~') {
                        dropdown.addOption(cat, cat);
                    }
                });
                
                return dropdown
                    .setValue(this.plugin.settings.categories[0] || 'Study');
            });
            
            newMappingSetting.addButton(button => button
                .setIcon('plus')
                .setTooltip('Add mapping')
                .onClick(async () => {
                    const folderPath = folderPathInput.value.trim();
                    const category = categoryDropdown.value;
                    
                    if (folderPath && category) {
                        this.plugin.settings.folderCategoryMappings[folderPath] = category;
                        await this.plugin.saveSettings();
                        // Reset input field
                        folderPathInput.value = '';
                        // Refresh display
                        this.display();
                    }
                }));
        }

        // Tags to track
        containerEl.createEl('h4', { text: 'Tags to Track' });
        
        const tagsToTrackSetting = new Setting(containerEl)
            .setName('Tags to Track')
            .setDesc('Track notes with these tags in weekly summaries (comma-separated, include # if needed)');
            
        tagsToTrackSetting.addText(text => text
            .setPlaceholder('#tag1, #tag2')
            .setValue(this.plugin.settings.tagsToTrack.join(', '))
            .onChange(async (value) => {
                this.plugin.settings.tagsToTrack = value.split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0);
                await this.plugin.saveSettings();
            }));
            
        new Setting(containerEl)
            .setName('Track created notes')
            .setDesc('Track newly created notes during sessions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.trackCreatedNotes)
                .onChange(async (value) => {
                    this.plugin.settings.trackCreatedNotes = value;
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
        
        // Check if we need to create a weekly summary and start auto-tracking
        this.app.workspace.onLayoutReady(() => {
            this.checkWeeklySummary();
            this.startAutoTracking();
        });

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
            }
        });
        
        this.addCommand({
            id: 'create-weekly-summary',
            name: 'Create Weekly Summary',
            callback: async () => {
                await this.createWeeklySummary();
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

        // Track file modifications
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (this.currentSession && file instanceof TFile) {
                    // Always track files (if focusPath is empty, track all files)
                    const shouldTrack = !this.settings.focusPath || file.path.startsWith(this.settings.focusPath);
                    
                    if (shouldTrack) {
                        // Track modified files
                        if (this.settings.trackModifiedFiles) {
                            this.currentSession.trackModifiedFile(file.path);
                        }
                        
                        // Get content of modified file
                        const content = await this.app.vault.cachedRead(file);
                        
                        // Track completed tasks
                        const newTasks = this.findNewlyCompletedTasks(content, file.path);
                        newTasks.forEach(task => {
                            this.currentSession.addCompletedTask(task);
                        });
                        
                        // Track word count if enabled
                        if (this.settings.trackWordCount) {
                            const wordCount = this.countWords(content);
                            this.currentSession.updateWordCount(file.path, wordCount);
                        }
                        
                        // Auto-set category based on folder if enabled
                        if (this.settings.autoSetCategoryByFolder) {
                            this.updateCategoryByFolder(file.path);
                        }
                    }
                }
            })
        );
        
        // Track opened files
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (this.currentSession && file && this.settings.trackOpenedFiles) {
                    // Always track files (if focusPath is empty, track all files)
                    const shouldTrack = !this.settings.focusPath || file.path.startsWith(this.settings.focusPath);
                    
                    if (shouldTrack) {
                        this.currentSession.trackOpenedFile(file.path);
                        
                        // Auto-set category based on folder if enabled
                        if (this.settings.autoSetCategoryByFolder) {
                            this.updateCategoryByFolder(file.path);
                        }
                    }
                }
            })
        );
        
        // Track file creation
        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (this.currentSession && file instanceof TFile && this.settings.trackCreatedNotes) {
                    // Always track files (if focusPath is empty, track all files)
                    const shouldTrack = !this.settings.focusPath || file.path.startsWith(this.settings.focusPath);
                    
                    if (shouldTrack) {
                        this.currentSession.trackModifiedFile(file.path);
                        this.currentSession.trackOpenedFile(file.path);
                        this.currentSession.trackCreatedFile(file.path);
                        
                        // Reset link count for new files
                        this.currentSession.initialLinkCounts.set(file.path, 0);
                    }
                }
            })
        );
        
        // Track link creation through modify events
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (this.currentSession && file instanceof TFile) {
                    const shouldTrack = !this.settings.focusPath || file.path.startsWith(this.settings.focusPath);
                    
                    if (shouldTrack) {
                        const cache = this.app.metadataCache.getFileCache(file);
                        if (cache) {
                            const linkCount = (cache.links || []).length + (cache.embeds || []).length;
                            this.currentSession.updateLinkCount(file.path, linkCount);
                        }
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

    async createDailySummary(date?: string) {
        const summaryDate = date || new Date().toISOString().split('T')[0];
        const tempFolderPath = `${this.settings.notesFolder}/temp`;
        const summaryFileName = `${summaryDate}_daily_summary.md`;
        const summaryFilePath = `${this.settings.notesFolder}/${summaryFileName}`;
        let studySessions: SessionData[] = [];
        let breakSessions: SessionData[] = [];

        try {
            if (!(await this.app.vault.adapter.exists(tempFolderPath))) {
                new Notice('No study sessions found for the specified date');
                return null;
            }
            
            const tempFiles = await this.app.vault.adapter.list(tempFolderPath);
            let totalStudyTime = 0;
            let totalBreakTime = 0;
            let totalPomodoros = 0;
            let totalDistractions = 0;
            const modifiedFiles = new Set<string>();
            const openedFiles = new Set<string>();
            const createdFiles = new Set<string>();
            const createdLinks = new Set<string>();
            let totalTasks = 0;
            let totalWordCount = 0;
            let totalCreatedFiles = 0;
            let totalCreatedLinks = 0;
            const difficulties: number[] = [];

            // Collect data from all temporary files for the specified date
            for (const file of tempFiles.files) {
                const content = await this.app.vault.adapter.read(file);
                const sessionData = JSON.parse(content) as SessionData;
                
                // Only include sessions from the specified date
                if (sessionData.date === summaryDate) {
                    if (sessionData.isBreak) {
                        breakSessions.push(sessionData);
                        totalBreakTime += sessionData.duration;
                    } else {
                        studySessions.push(sessionData);
                        totalStudyTime += sessionData.duration;
                        totalPomodoros += sessionData.pomodoros;
                        totalDistractions += sessionData.distractions.length;
                        sessionData.modifiedFiles.forEach(f => modifiedFiles.add(f));
                        sessionData.openedFiles?.forEach(f => openedFiles.add(f));
                        sessionData.createdFiles?.forEach(f => createdFiles.add(f));
                        sessionData.createdLinks?.forEach(l => createdLinks.add(l));
                        totalTasks += sessionData.completedTasks.length;
                        difficulties.push(sessionData.difficulty);
                        totalWordCount += sessionData.wordCount || 0;
                    }
                }
            }
            
            totalCreatedFiles = createdFiles.size;
            totalCreatedLinks = createdLinks.size;
            
            if (studySessions.length === 0) {
                new Notice(`No study sessions found for ${summaryDate}`);
                return null;
            }

            const avgDifficulty = difficulties.length > 0
                ? (difficulties.reduce((a, b) => a + b) / difficulties.length).toFixed(1)
                : '0';
                
            // Calculate hours and minutes for better readability
            const studyHours = Math.floor(totalStudyTime / 60);
            const studyMinutes = totalStudyTime % 60;
            const breakHours = Math.floor(totalBreakTime / 60);
            const breakMinutes = totalBreakTime % 60;
            const totalTimeHours = Math.floor((totalStudyTime + totalBreakTime) / 60);
            const totalTimeMinutes = (totalStudyTime + totalBreakTime) % 60;

            // Create the summary with inline frontmatter
            let summaryContent = `# Daily Study Summary - ${summaryDate}\n\n`;
            summaryContent += `Study time:: ${studyHours}h ${studyMinutes}m\n`;
            summaryContent += `Break time:: ${breakHours}h ${breakMinutes}m\n`;
            summaryContent += `Total time:: ${totalTimeHours}h ${totalTimeMinutes}m\n`;
            summaryContent += `Pomodoros:: ${totalPomodoros}\n`;
            summaryContent += `Modified files:: ${modifiedFiles.size}\n`;
            summaryContent += `Created files:: ${totalCreatedFiles}\n`;
            summaryContent += `Created links:: ${totalCreatedLinks}\n`;
            summaryContent += `Words written:: ${totalWordCount}\n\n`;

            // Daily statistics
            summaryContent += `## 📊 Daily Statistics\n`;
            summaryContent += `- ⏱️ Study Time: ${studyHours}h ${studyMinutes}m\n`;
            summaryContent += `- ⏸️ Break Time: ${breakHours}h ${breakMinutes}m\n`;
            summaryContent += `- 🕙 Total Time: ${totalTimeHours}h ${totalTimeMinutes}m\n`;
            summaryContent += `- 🍅 Total Pomodoros: ${totalPomodoros}\n`;
            summaryContent += `- ⚠️ Total Distractions: ${totalDistractions}\n`;
            summaryContent += `- 📝 Modified Files: ${modifiedFiles.size}\n`;
            summaryContent += `- 📖 Opened Files: ${openedFiles.size}\n`;
            summaryContent += `- 📄 Created Files: ${totalCreatedFiles}\n`;
            summaryContent += `- 🔗 Created Links: ${totalCreatedLinks}\n`;
            summaryContent += `- ✅ Completed Tasks: ${totalTasks}\n`;
            summaryContent += `- 📏 Words Written: ${totalWordCount}\n`;
            summaryContent += `- 📈 Average Difficulty: ${avgDifficulty}/5\n\n`;

            // Modified Files Overview
            if (modifiedFiles.size > 0) {
                summaryContent += `## 📝 Modified Files Overview\n`;
                modifiedFiles.forEach(file => {
                    summaryContent += `- [[${file}|${file.split('/').pop()}]]\n`;
                });
                summaryContent += '\n';
            }
            
            // Opened Files Overview
            if (openedFiles.size > 0) {
                summaryContent += `## 📖 Opened Files Overview\n`;
                openedFiles.forEach(file => {
                    summaryContent += `- [[${file}|${file.split('/').pop()}]]\n`;
                });
                summaryContent += '\n';
            }
            
            // Created Files Overview
            if (createdFiles.size > 0) {
                summaryContent += `## 📄 Created Files Overview\n`;
                createdFiles.forEach(file => {
                    summaryContent += `- [[${file}|${file.split('/').pop()}]]\n`;
                });
                summaryContent += '\n';
            }
            
            // Created Links Overview
            if (createdLinks.size > 0) {
                summaryContent += `## 🔗 Created Links Overview\n`;
                createdLinks.forEach(link => {
                    if (typeof link === 'string') {
                        const parts = link.split(':');
                        if (parts.length === 2) {
                            const [filePath, index] = parts;
                            summaryContent += `- Link ${index} in [[${filePath}|${filePath.split('/').pop()}]]\n`;
                        } else {
                            summaryContent += `- ${link}\n`;
                        }
                    } else {
                        summaryContent += `- Unknown link format\n`;
                    }
                });
                summaryContent += '\n';
            }

            // Individual Sessions
            studySessions.forEach((session, index) => {
                summaryContent += `## Study Session ${index + 1}: ${session.category}\n`;
                summaryContent += `- Start Time: ${new Date(session.startTime).toLocaleTimeString()}\n`;
                summaryContent += `- Duration: ${Math.floor(session.duration / 60)}h ${session.duration % 60}m\n`;
                summaryContent += `- Pomodoros: ${session.pomodoros}\n`;
                if (session.wordCount) {
                    summaryContent += `- Words Written: ${session.wordCount}\n`;
                }
                if (session.createdFiles && session.createdFiles.length > 0) {
                    summaryContent += `- Created Files: ${session.createdFiles.length}\n`;
                }
                if (session.createdLinks && session.createdLinks.length > 0) {
                    summaryContent += `- Created Links: ${session.createdLinks.length}\n`;
                }
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

            // Save the summary if requested
            if (this.settings.createDailySummary || !date) {
                if (!(await this.app.vault.adapter.exists(this.settings.notesFolder))) {
                    await this.app.vault.createFolder(this.settings.notesFolder);
                }
                
                await this.app.vault.create(summaryFilePath, summaryContent);
                
                if (!date && !this.settings.preserveTempFiles && !this.settings.keepLongTermData) {
                    // Only delete temp files if:
                    // 1. We're creating a summary for today, and
                    // 2. preserveTempFiles setting is OFF, and
                    // 3. keepLongTermData setting is OFF
                    for (const file of tempFiles.files) {
                        const content = await this.app.vault.adapter.read(file);
                        const sessionData = JSON.parse(content) as SessionData;
                        if (sessionData.date === summaryDate) {
                            await this.app.vault.adapter.remove(file);
                        }
                    }
                }
                
                new Notice('Daily summary created successfully!');
            }
            
            return {
                studySessions,
                breakSessions,
                totalStudyTime,
                totalBreakTime,
                totalPomodoros,
                totalDistractions,
                totalTasks,
                totalWordCount,
                avgDifficulty,
                modifiedFiles: Array.from(modifiedFiles),
                openedFiles: Array.from(openedFiles),
                createdFiles: Array.from(createdFiles),
                createdLinks: Array.from(createdLinks)
            };
            
        } catch (error) {
            console.error('Error creating daily summary:', error);
            new Notice('Error creating daily summary');
            return null;
        }
    }
    
    async createWeeklySummary() {
        try {
            // Determine the start and end dates of the current week
            const now = new Date();
            const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1); // Adjust for Sunday
            const monday = new Date(now.setDate(diff));
            monday.setHours(0,0,0,0);
            
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);
            
            // Generate an array of dates for the week
            const weekDates: string[] = [];
            const currentDate = new Date(monday);
            
            while (currentDate <= sunday) {
                weekDates.push(currentDate.toISOString().split('T')[0]);
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // Collect data for each day
            let weeklyStudyTime = 0;
            let weeklyBreakTime = 0;
            let weeklyPomodoros = 0;
            let weeklyDistractions = 0;
            let weeklyTasks = 0;
            let weeklyWordCount = 0;
            let totalCreatedFiles = 0;
            let totalCreatedLinks = 0;
            let totalCreatedNotes = 0;
            let totalModifiedNotes = 0;
            
            const allDifficulties: number[] = [];
            const modifiedFiles = new Set<string>();
            const openedFiles = new Set<string>();
            const createdFiles = new Set<string>();
            const createdLinks = new Set<string>();
            const taggedNotes = new Map<string, Set<string>>();
            
            // Initialize tag tracking
            if (this.settings.trackTaggedNotes && this.settings.tagsToTrack) {
                for (const tag of this.settings.tagsToTrack) {
                    taggedNotes.set(tag, new Set<string>());
                }
            }
            
            const dayReports: { 
                date: string, 
                studyTime: number, 
                breakTime: number,
                pomodoros: number,
                wordCount: number,
                createdNotes: number,
                modifiedNotes: number 
            }[] = [];
            
            // Process each day of the week
            for (const date of weekDates) {
                const dayData = await this.createDailySummary(date);
                
                // Process this day's data whether or not we have study sessions
                // This ensures we still add entries with zeros for days with no activity
                {
                    // Count created and modified markdown files for this day
                    let dayCreatedNotes = 0;
                    let dayModifiedNotes = 0;
                    
                    // Create a placeholder day report even if no study sessions exist
                    if (!dayData) {
                        dayReports.push({
                            date,
                            studyTime: 0,
                            breakTime: 0,
                            pomodoros: 0,
                            wordCount: 0,
                            createdNotes: 0,
                            modifiedNotes: 0
                        });
                    } else {
                        weeklyStudyTime += dayData.totalStudyTime;
                        weeklyBreakTime += dayData.totalBreakTime;
                        weeklyPomodoros += dayData.totalPomodoros;
                        weeklyDistractions += dayData.totalDistractions;
                        weeklyTasks += dayData.totalTasks;
                        weeklyWordCount += dayData.totalWordCount;
                        
                        // Process modified files
                        dayData.modifiedFiles.forEach(file => {
                            modifiedFiles.add(file);
                            if (file.endsWith('.md')) {
                                dayModifiedNotes++;
                                totalModifiedNotes++;
                            }
                        });
                        
                        dayData.openedFiles.forEach(file => openedFiles.add(file));
                        
                        // Extract created files and links data from daily reports if available
                        if (Array.isArray(dayData.createdFiles)) {
                            dayData.createdFiles.forEach(file => {
                                createdFiles.add(file);
                                if (file.endsWith('.md')) {
                                    dayCreatedNotes++;
                                    totalCreatedNotes++;
                                }
                            });
                            totalCreatedFiles = createdFiles.size;
                        }
                        
                        if (Array.isArray(dayData.createdLinks)) {
                            dayData.createdLinks.forEach(link => createdLinks.add(link));
                            totalCreatedLinks = createdLinks.size;
                        }
                        
                        // Track tagged notes if enabled
                        if (this.settings.trackTaggedNotes && 
                            this.settings.tagsToTrack && 
                            this.settings.tagsToTrack.length > 0) {
                            
                            // Find all markdown files that were modified during this day
                            const possibleTaggedFiles = dayData.modifiedFiles
                                .filter(file => file.endsWith('.md'));
                                
                            // Check each file for the tracked tags
                            for (const file of possibleTaggedFiles) {
                                const tfile = this.app.vault.getAbstractFileByPath(file);
                                if (tfile instanceof TFile) {
                                    const cache = this.app.metadataCache.getFileCache(tfile);
                                    if (cache && cache.tags) {
                                        const fileTags = cache.tags.map(t => t.tag);
                                        
                                        // Check against each tracked tag
                                        for (const trackedTag of this.settings.tagsToTrack) {
                                            if (fileTags.includes(trackedTag)) {
                                                const tagSet = taggedNotes.get(trackedTag);
                                                if (tagSet) {
                                                    tagSet.add(file);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (dayData.avgDifficulty && parseFloat(dayData.avgDifficulty) > 0) {
                            allDifficulties.push(parseFloat(dayData.avgDifficulty));
                        }
                        
                        // Add to daily reports
                        dayReports.push({
                            date,
                            studyTime: dayData.totalStudyTime,
                            breakTime: dayData.totalBreakTime,
                            pomodoros: dayData.totalPomodoros,
                            wordCount: dayData.totalWordCount,
                            createdNotes: dayCreatedNotes,
                            modifiedNotes: dayModifiedNotes
                        });
                    }
                }
            }
            
            if (dayReports.length === 0) {
                new Notice('No study data found for this week');
                return;
            }
            
            // Calculate weekly averages and statistics
            const avgDifficulty = allDifficulties.length > 0
                ? (allDifficulties.reduce((a, b) => a + b) / allDifficulties.length).toFixed(1)
                : '0';
                
            // Calculate hours and minutes
            const studyHours = Math.floor(weeklyStudyTime / 60);
            const studyMinutes = weeklyStudyTime % 60;
            const breakHours = Math.floor(weeklyBreakTime / 60);
            const breakMinutes = weeklyBreakTime % 60;
            const totalTimeHours = Math.floor((weeklyStudyTime + weeklyBreakTime) / 60);
            const totalTimeMinutes = (weeklyStudyTime + weeklyBreakTime) % 60;
            
            // Format the date range for the title
            const mondayStr = monday.toISOString().split('T')[0];
            const sundayStr = sunday.toISOString().split('T')[0];
            const weekRange = `${mondayStr} to ${sundayStr}`;
            
            let summaryContent = `# Weekly Study Summary - ${weekRange}\n\n`;
            summaryContent += `Study time:: ${studyHours}h ${studyMinutes}m\n`;
            summaryContent += `Break time:: ${breakHours}h ${breakMinutes}m\n`;
            summaryContent += `Total time:: ${totalTimeHours}h ${totalTimeMinutes}m\n`;
            summaryContent += `Pomodoros:: ${weeklyPomodoros}\n`;
            summaryContent += `Modified files:: ${modifiedFiles.size}\n`;
            summaryContent += `Words written:: ${weeklyWordCount}\n\n`;
            
            // Weekly Statistics
            summaryContent += `## 📊 Weekly Statistics\n`;
            summaryContent += `- ⏱️ Study Time: ${studyHours}h ${studyMinutes}m\n`;
            summaryContent += `- ⏸️ Break Time: ${breakHours}h ${breakMinutes}m\n`;
            summaryContent += `- 🕙 Total Time: ${totalTimeHours}h ${totalTimeMinutes}m\n`;
            summaryContent += `- 🍅 Total Pomodoros: ${weeklyPomodoros}\n`;
            summaryContent += `- ⚠️ Total Distractions: ${weeklyDistractions}\n`;
            summaryContent += `- 📝 Modified Files: ${modifiedFiles.size}\n`;
            summaryContent += `- 📖 Opened Files: ${openedFiles.size}\n`;
            summaryContent += `- 📄 Created Files: ${totalCreatedFiles}\n`;
            summaryContent += `- 📔 Created Notes: ${totalCreatedNotes}\n`;
            summaryContent += `- 📝 Modified Notes: ${totalModifiedNotes}\n`;
            summaryContent += `- 🔗 Created Links: ${totalCreatedLinks}\n`;
            summaryContent += `- ✅ Completed Tasks: ${weeklyTasks}\n`;
            summaryContent += `- 📏 Words Written: ${weeklyWordCount}\n`;
            summaryContent += `- 📈 Average Difficulty: ${avgDifficulty}/5\n\n`;
            
            // Daily Breakdown
            summaryContent += `## 📆 Daily Breakdown\n`;
            summaryContent += `| Date | Study Time | Break Time | Pomodoros | Words Written | Created Notes | Modified Notes |\n`;
            summaryContent += `| ---- | ---------- | ---------- | --------- | ------------- | ------------ | -------------- |\n`;
            
            dayReports.forEach(day => {
                const dayStudyHours = Math.floor(day.studyTime / 60);
                const dayStudyMinutes = day.studyTime % 60;
                const dayBreakHours = Math.floor(day.breakTime / 60);
                const dayBreakMinutes = day.breakTime % 60;
                
                summaryContent += `| ${day.date} | ${dayStudyHours}h ${dayStudyMinutes}m | ${dayBreakHours}h ${dayBreakMinutes}m | ${day.pomodoros} | ${day.wordCount} | ${day.createdNotes} | ${day.modifiedNotes} |\n`;
            });
            
            summaryContent += '\n';
            
            // Modified Files Overview - limited to 10 for brevity
            if (modifiedFiles.size > 0) {
                summaryContent += `## 📝 Most Modified Files\n`;
                const fileArray = Array.from(modifiedFiles);
                const limitedFiles = fileArray.slice(0, 10);
                limitedFiles.forEach(file => {
                    summaryContent += `- [[${file}|${file.split('/').pop()}]]\n`;
                });
                
                if (fileArray.length > 10) {
                    summaryContent += `- ... and ${fileArray.length - 10} more files\n`;
                }
                
                summaryContent += '\n';
            }
            
            // Created Files Overview - limited to 10 for brevity
            if (totalCreatedFiles > 0) {
                summaryContent += `## 📄 Created Files\n`;
                const createdFilesArray = Array.from(createdFiles);
                const limitedCreatedFiles = createdFilesArray.slice(0, 10);
                limitedCreatedFiles.forEach(file => {
                    if (typeof file === 'string') {
                        summaryContent += `- [[${file}|${file.split('/').pop()}]]\n`;
                    } else {
                        summaryContent += `- Unknown file format\n`;
                    }
                });
                
                if (createdFilesArray.length > 10) {
                    summaryContent += `- ... and ${createdFilesArray.length - 10} more files\n`;
                }
                
                summaryContent += '\n';
            }
            
            // Create the weekly summary file
            // Add created/modified notes count per day to the dayReports
            const createdNotes = new Map<string, Set<string>>();
            const tagsTracking = new Map<string, Set<string>>();
            
            // Add data for tag tracking
            if (this.settings.tagsToTrack.length > 0) {
                // Initialize the tag tracking for each tag
                this.settings.tagsToTrack.forEach(tag => {
                    tagsTracking.set(tag, new Set<string>());
                });
                
                // Go through all vault files to find notes with tracked tags
                const markdownFiles = this.app.vault.getMarkdownFiles();
                for (const file of markdownFiles) {
                    const fileCache = this.app.metadataCache.getFileCache(file);
                    if (fileCache && fileCache.tags) {
                        // Check if file has any of the tracked tags
                        const fileTags = fileCache.tags.map(t => t.tag);
                        for (const trackedTag of this.settings.tagsToTrack) {
                            if (fileTags.includes(trackedTag)) {
                                // Add file to this tag's tracking set
                                const tagSet = tagsTracking.get(trackedTag);
                                if (tagSet) {
                                    tagSet.add(file.path);
                                }
                            }
                        }
                    }
                }
            }
            
            // Generate some visualization data for the charts
            const wordsData = dayReports.map(day => [day.date, day.wordCount]);
            const timeData = dayReports.map(day => [day.date, day.studyTime]);
            
            // Add weekly data in frontmatter format
            summaryContent += `weekly_study_time:: ${studyHours}h ${studyMinutes}m\n`;
            summaryContent += `weekly_break_time:: ${breakHours}h ${breakMinutes}m\n`;
            summaryContent += `weekly_total_time:: ${totalTimeHours}h ${totalTimeMinutes}m\n`;
            summaryContent += `weekly_pomodoros:: ${weeklyPomodoros}\n`;
            summaryContent += `weekly_words_written:: ${weeklyWordCount}\n`;
            summaryContent += `weekly_modified_files:: ${modifiedFiles.size}\n`;
            summaryContent += `weekly_created_files:: ${totalCreatedFiles}\n`;
            summaryContent += `weekly_created_notes:: ${totalCreatedNotes}\n`;
            summaryContent += `weekly_modified_notes:: ${totalModifiedNotes}\n`;
            summaryContent += `weekly_created_links:: ${totalCreatedLinks}\n`;
            summaryContent += `weekly_tasks_completed:: ${weeklyTasks}\n`;
            summaryContent += `weekly_distractions:: ${weeklyDistractions}\n\n`;
            
            // Add charts if there's data
            if (dayReports.length > 0) {
                // Add word count chart
                summaryContent += '## 📊 Word Count Chart\n\n';
                summaryContent += '```chart\n';
                summaryContent += 'type: bar\n';
                summaryContent += 'labels: [' + dayReports.map(d => `"${d.date}"`).join(', ') + ']\n';
                summaryContent += 'series:\n';
                summaryContent += '  - title: Words Written\n';
                summaryContent += '    data: [' + dayReports.map(d => d.wordCount).join(', ') + ']\n';
                summaryContent += 'width: 100%\n';
                summaryContent += 'labelColors: true\n';
                summaryContent += '```\n\n';
                
                // Add study time chart
                summaryContent += '## ⏱️ Study Time Chart\n\n';
                summaryContent += '```chart\n';
                summaryContent += 'type: bar\n';
                summaryContent += 'labels: [' + dayReports.map(d => `"${d.date}"`).join(', ') + ']\n';
                summaryContent += 'series:\n';
                summaryContent += '  - title: Study Minutes\n';
                summaryContent += '    data: [' + dayReports.map(d => d.studyTime).join(', ') + ']\n';
                summaryContent += 'width: 100%\n';
                summaryContent += 'labelColors: true\n';
                summaryContent += '```\n\n';
                
                // Add notes created/modified chart
                summaryContent += '## 📝 Notes Created & Modified Chart\n\n';
                summaryContent += '```chart\n';
                summaryContent += 'type: bar\n';
                summaryContent += 'labels: [' + dayReports.map(d => `"${d.date}"`).join(', ') + ']\n';
                summaryContent += 'series:\n';
                summaryContent += '  - title: Notes Created\n';
                summaryContent += '    data: [' + dayReports.map(d => d.createdNotes).join(', ') + ']\n';
                summaryContent += '  - title: Notes Modified\n';
                summaryContent += '    data: [' + dayReports.map(d => d.modifiedNotes).join(', ') + ']\n';
                summaryContent += 'width: 100%\n';
                summaryContent += 'labelColors: true\n';
                summaryContent += 'stacked: true\n';
                summaryContent += '```\n\n';
                
                // Add tracked tags information if any are configured
                if (this.settings.tagsToTrack.length > 0) {
                    summaryContent += '## 🏷️ Tracked Tags\n\n';
                    
                    for (const [tag, files] of tagsTracking.entries()) {
                        summaryContent += `### ${tag} (${files.size} files)\n\n`;
                        if (files.size > 0) {
                            for (const file of files) {
                                summaryContent += `- [[${file}|${file.split('/').pop()}]]\n`;
                            }
                            summaryContent += '\n';
                        } else {
                            summaryContent += '*No files with this tag*\n\n';
                        }
                    }
                }
            }
            
            const weeklyFileName = `${mondayStr}_weekly_summary.md`;
            const weeklyFilePath = `${this.settings.notesFolder}/${weeklyFileName}`;
            
            if (!(await this.app.vault.adapter.exists(this.settings.notesFolder))) {
                await this.app.vault.createFolder(this.settings.notesFolder);
            }
            
            await this.app.vault.create(weeklyFilePath, summaryContent);
            new Notice('Weekly summary created successfully!');
            
        } catch (error) {
            console.error('Error creating weekly summary:', error);
            new Notice('Error creating weekly summary');
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
    
    // Auto-update category based on current folder
    updateCategoryByFolder(filePath: string): void {
        if (!this.currentSession || this.currentSession.isBreak) return;
        
        // If no folder mappings defined, don't change anything
        if (Object.keys(this.settings.folderCategoryMappings).length === 0) return;
        
        const view = this.getStudyFlowView();
        if (!view) return;
        
        // Extract folder path from file path
        const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
        
        // Try to find the longest matching folder path in the mappings
        let bestMatch = '';
        let bestMatchCategory = '';
        
        for (const path in this.settings.folderCategoryMappings) {
            // If this path is a prefix of the current folder and longer than current best match
            if (folderPath.startsWith(path) && path.length > bestMatch.length) {
                bestMatch = path;
                bestMatchCategory = this.settings.folderCategoryMappings[path];
            }
        }
        
        // If we found a match and it's different from current category, change category
        if (bestMatchCategory && this.currentSession.category !== bestMatchCategory) {
            view.changeCategory(bestMatchCategory);
        }
    }
    
    // Count words in text content
    countWords(text: string): number {
        // Remove markdown formatting, code blocks, and other non-word content
        const cleanedText = text
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/`[^`]*`/g, '')       // Remove inline code
            .replace(/\[.*?\]\(.*?\)/g, '') // Remove link syntax
            .replace(/\!\[.*?\]\(.*?\)/g, '') // Remove image syntax
            .replace(/\[\[.*?\]\]/g, '')    // Remove wikilinks
            .replace(/#[\w-]+/g, '')        // Remove tags
            .replace(/^\s*[-+*]\s+/gm, '')  // Remove list markers
            .replace(/^\s*\d+\.\s+/gm, '')  // Remove numbered list markers
            .replace(/^\s*>\s+/gm, '')      // Remove blockquote markers
            .replace(/^#+\s+/gm, '')       // Remove header markers
            .replace(/\*\*|\*|~~|__|_/g, ''); // Remove emphasis markers
        
        // Count words by splitting on whitespace and filtering empty strings
        return cleanedText.split(/\s+/).filter(word => word.length > 0).length;
    }
    
    // Start auto-tracking when Obsidian opens
    startAutoTracking(): void {
        if (!this.currentSession && this.settings.autoTrackSessionOnStartup) {
            const defaultCategory = this.settings.categories.find(c => c !== '~Break~') || 'Study';
            this.startNewSession(defaultCategory);
            
            const view = this.getStudyFlowView();
            if (view) {
                view.categorySelect.value = defaultCategory;
                
                // Optionally start the timer
                if (!view.isRunning) {
                    view.startTimer();
                }
            }
            
            new Notice(`Auto-tracking started - Category: ${defaultCategory}`);
        }
    }
    
    // Function to check if it's time to create the weekly summary
    async checkWeeklySummary() {
        if (!this.settings.enableWeeklySummary) return;
        
        const now = new Date();
        const today = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        
        // If today matches the configured weekly summary day
        if (today === this.settings.weeklySummaryDay) {
            // Check if we already created the weekly summary today
            const lastWeeklySummaryDate = this.settings.lastWeeklySummary || '';
            const todayStr = now.toISOString().split('T')[0];
            
            if (lastWeeklySummaryDate !== todayStr) {
                // Create the weekly summary
                await this.createWeeklySummary();
                
                // Update the last summary date
                this.settings.lastWeeklySummary = todayStr;
                await this.saveSettings();
            }
        }
    }

    onunload() {
        this.app.workspace
            .getLeavesOfType(VIEW_TYPE_STUDY_FLOW)
            .forEach(leaf => leaf.detach());
    }
}