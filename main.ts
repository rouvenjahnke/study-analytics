import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile, TextComponent } from 'obsidian';

const VIEW_TYPE_STUDY_FLOW = 'study-flow-view';

interface RecurringGoal {
    timeGoal: number; // Goal time in minutes
    period: 'daily' | 'weekly'; // Whether the goal is daily or weekly
    achieved?: boolean; // Whether the goal has been achieved in the current period
    timeSpent?: number; // Time spent in the current period (minutes)
}

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
    enableRecurringSessions: boolean; // Enable recurring sessions feature
    recurringSessionGoals: Record<string, RecurringGoal>; // Maps category names to goals
    prorateWeeklyGoals: boolean; // Divide weekly goals by days remaining in the week
    darkenReflectionBackground: boolean; // Darken the background when adding reflections
    useCompactDesign: boolean; // Use a more compact design for the sidebar
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
    enableRecurringSessions: false, // Enable recurring sessions feature
    recurringSessionGoals: {}, // Maps category names to goals
    prorateWeeklyGoals: false, // Divide weekly goals by days remaining in the week
    darkenReflectionBackground: false, // Darken the background when adding reflections
    useCompactDesign: false, // Use a more compact design for the sidebar
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
    breakDuration: number;
    wordCount: number;
    createdLinks: string[]; // Links created during the session
    id?: string; // Unique identifier for the session
}

interface SessionsData {
    sessions: SessionData[];
    lastUpdated: string;
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
    breakStartTime: Date | null;
    totalBreakDuration: number;
    isBreak: boolean;
    wordCount: number;
    initialWordCounts: Map<string, number>;
    createdLinks: Set<string>;
    initialLinkCounts: Map<string, number>;
    id: string;

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
        this.breakStartTime = null;
        this.totalBreakDuration = 0;
        this.isBreak = category === '~Break~';
        this.wordCount = 0;
        this.initialWordCounts = new Map<string, number>();
        this.createdLinks = new Set<string>();
        this.initialLinkCounts = new Map<string, number>();
        this.id = crypto.randomUUID ? crypto.randomUUID() : `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    break(): void {
        if (!this.breakStartTime) {
            this.breakStartTime = new Date();
        }
    }

    resume(): void {
        if (this.breakStartTime) {
            this.totalBreakDuration += (Number(new Date()) - Number(this.breakStartTime));
            this.breakStartTime = null;
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
        if (this.breakStartTime) {
            duration -= Math.round((Number(new Date()) - Number(this.breakStartTime)) / 60000);
        }
        duration -= Math.round(this.totalBreakDuration / 60000);
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
            breakDuration: Math.round(this.totalBreakDuration / 60000),
            wordCount: this.wordCount,
            createdLinks: Array.from(this.createdLinks),
            id: this.id
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
    isRecurringSession: boolean;
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
    goalTimeRemaining: number; // For recurring sessions

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
        this.isRecurringSession = false;
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
        let toggleText = 'Switch to Stopwatch';
        
        if (this.isStopwatch) {
            toggleText = this.plugin.settings.useCompactDesign ? 
                'Switch to Rec. Sess.' : 'Switch to Recurring Sessions';
        } else if (this.isRecurringSession) {
            toggleText = 'Switch to Pomodoro';
        }
        
        this.stopwatchToggle = stopwatchDiv.createEl('button', {
            text: toggleText,
            cls: 'stopwatch-toggle'
        });
        this.stopwatchToggle.onclick = () => this.toggleTimerMode();

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
            text: this.plugin.settings.useCompactDesign ? 'New' : 'New Session',
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
                    this.breakTimer();
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
            text: 'Add reflection',
            cls: 'reflection-button'
        });
        reflectionButton.onclick = () => this.addReflection();

        // Distraction Reporter
        const distractionDiv = container.createEl('div', { cls: 'distraction-section' });
        const distractionButton = distractionDiv.createEl('button', {
            text: 'Report distraction',
            cls: 'distraction-button'
        });
        this.distractionInput = distractionDiv.createEl('input', {
            type: 'text',
            attr: {
                placeholder: 'What distracted you?'
            },
            cls: 'distraction-input'
        });
        
        // Add event listener for Enter key
        this.distractionInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.reportDistraction();
            }
        });
        
        distractionButton.onclick = () => this.reportDistraction();

    }

    async updateDailyTime(): Promise<void> {
        const today = new Date().toISOString().split('T')[0];
        let totalMinutes = 0;

        try {
            // Lese Sitzungsdaten aus der konsolidierten Speicherung
            this.plugin.sessionsData.sessions.forEach(session => {
                // Überprüfe, ob die Sitzung von heute ist und KEINE Break
                if (session.date === today && !session.isBreak) {
                    totalMinutes += session.duration;
                }
            });

            // Füge die Zeit der aktuellen Sitzung hinzu, wenn es keine Break ist
            if (this.plugin.currentSession && !this.plugin.currentSession.isBreak) {
                totalMinutes += this.plugin.currentSession.getDuration();
            }

            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            
            // Only empty and recreate elements if they don't exist yet
            if (!this.dailyTimeDisplay.querySelector('.daily-time-total')) {
                this.dailyTimeDisplay.empty();
                this.dailyTimeDisplay.createEl('div', {
                    text: `Today's Study Time: ${hours}h ${minutes}m`,
                    cls: 'daily-time-total'
                });
                
                // Only create the goals container if recurring sessions are enabled
                if (this.plugin.settings.enableRecurringSessions) {
                    // Create container for goals
                    const goalsContainer = this.dailyTimeDisplay.createEl('div', {
                        cls: 'recurring-goals-container'
                    });
                    
                    goalsContainer.createEl('div', {
                        text: 'Category Goals:',
                        cls: 'goals-heading'
                    });
                }
            } else {
                // Just update the text content of existing elements
                const totalTimeEl = this.dailyTimeDisplay.querySelector('.daily-time-total');
                if (totalTimeEl) {
                    totalTimeEl.textContent = `Today's Study Time: ${hours}h ${minutes}m`;
                }
            }
            
            // Only process goals if recurring sessions are enabled
            if (this.plugin.settings.enableRecurringSessions) {
                const goalsContainer = this.dailyTimeDisplay.querySelector('.recurring-goals-container');
                if (!goalsContainer) return;
                
                // Get today's study time per category
                const categoryTimes = await this.getCategoryTimes(today);
                
                // Calculate remaining days in week for prorating weekly goals
                const now = new Date();
                const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
                // Days remaining including today (for Sunday, 7 days remain; for Saturday, 1 day remains)
                const daysRemaining = this.plugin.settings.weeklySummaryDay === currentDay ? 7 : 
                                     (7 + this.plugin.settings.weeklySummaryDay - currentDay) % 7 || 7;
                
                // Clear existing goal rows except the heading
                const heading = goalsContainer.querySelector('.goals-heading');
                if (goalsContainer && heading) {
                    goalsContainer.innerHTML = '';
                    goalsContainer.appendChild(heading);
                }
                
                // Loop through all categories with goals
                Object.entries(this.plugin.settings.recurringSessionGoals).forEach(([category, goal]) => {
                    if (!goal.timeGoal) return; // Skip if no goal set
                    
                    const timeSpent = categoryTimes[category] || 0;
                    
                    // For daily goals, show time spent of daily goal
                    if (goal.period === 'daily') {
                        const timeRemaining = Math.max(0, goal.timeGoal - timeSpent);
                        const remainingHours = Math.floor(timeRemaining);
                        const remainingMinutes = Math.round((timeRemaining - remainingHours) * 60);
                        
                        // Add category row
                        const row = goalsContainer.createEl('div', {
                            cls: 'goal-row'
                        });
                        
                        // Category name
                        row.createEl('span', {
                            text: category,
                            cls: 'goal-category'
                        });
                        
                        // Remaining time
                        row.createEl('span', {
                            text: `${remainingHours}h ${remainingMinutes}m left (daily)`,
                            cls: timeRemaining <= 0 ? 'goal-complete' : 'goal-remaining'
                        });
                    }
                    // For weekly goals, show prorated or total remaining
                    else if (goal.period === 'weekly') {
                        // Get goal and time spent
                        const timeSpentThisWeek = goal.timeSpent || 0;
                        const remainingTotal = Math.max(0, goal.timeGoal - timeSpentThisWeek);
                        
                        // Create row
                        const row = goalsContainer.createEl('div', {
                            cls: 'goal-row'
                        });
                        
                        // Category name
                        row.createEl('span', {
                            text: category,
                            cls: 'goal-category'
                        });
                        
                        // If prorating is enabled, show daily target
                        if (this.plugin.settings.prorateWeeklyGoals && daysRemaining > 0) {
                            const dailyTarget = remainingTotal / daysRemaining;
                            const dailyHours = Math.floor(dailyTarget);
                            const dailyMinutes = Math.round((dailyTarget - dailyHours) * 60);
                            
                            // Remaining time (daily prorated)
                            row.createEl('span', {
                                text: `${dailyHours}h ${dailyMinutes}m/day (weekly)`,
                                cls: remainingTotal <= 0 ? 'goal-complete' : 'goal-remaining'
                            });
                        } else {
                            // Just show total remaining for the week
                            const remainingHours = Math.floor(remainingTotal);
                            const remainingMinutes = Math.round((remainingTotal - remainingHours) * 60);
                            
                            // Remaining time (weekly total)
                            row.createEl('span', {
                                text: `${remainingHours}h ${remainingMinutes}m left (weekly)`,
                                cls: remainingTotal <= 0 ? 'goal-complete' : 'goal-remaining'
                            });
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error calculating total study time:', error);
            this.dailyTimeDisplay.setText("Today's Study Time: Error");
        }
    }
    
    // Helper function to get study time per category for a specific date
    async getCategoryTimes(date: string): Promise<Record<string, number>> {
        const categoryTimes: Record<string, number> = {};
        
        try {
            // Lese Sitzungsdaten aus der konsolidierten Speicherung
            this.plugin.sessionsData.sessions.forEach(session => {
                // Überprüfe, ob die Sitzung vom angegebenen Datum ist und keine Break
                if (session.date === date && !session.isBreak) {
                    // Initialisiere Kategorie, falls nötig
                    if (!categoryTimes[session.category]) {
                        categoryTimes[session.category] = 0;
                    }
                    
                    // Füge die Dauer hinzu (Umrechnung von Minuten in Stunden)
                    categoryTimes[session.category] += session.duration / 60;
                }
            });
            
            // Füge die Zeit der aktuellen Sitzung hinzu, wenn es keine Break ist
            if (this.plugin.currentSession && !this.plugin.currentSession.isBreak) {
                const category = this.plugin.currentSession.category;
                const duration = this.plugin.currentSession.getDuration() / 60; // Umrechnung von Minuten in Stunden
                
                if (!categoryTimes[category]) {
                    categoryTimes[category] = 0;
                }
                
                categoryTimes[category] += duration;
            }
            
            // Für Kategorien mit wiederkehrenden Zielen den timeSpent-Wert hinzufügen
            Object.entries(this.plugin.settings.recurringSessionGoals).forEach(([category, goal]) => {
                // Für wöchentliche Ziele sicherstellen, dass wir den timeSpent-Wert miteinbeziehen
                if (goal.period === 'weekly' && goal.timeSpent && goal.timeSpent > 0) {
                    if (!categoryTimes[category]) {
                        categoryTimes[category] = 0;
                    }
                    
                    // Wir müssen timeSpent hier nicht hinzufügen, da es bereits separat im Ziel selbst verfolgt wird
                }
            });
        } catch (error) {
            console.error('Error calculating category times:', error);
        }
        
        return categoryTimes;
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
        this.toggleTimerMode();
    }

    updateTimerDisplay(): void {
        if (this.isStopwatch) {
            const totalSeconds = Math.floor(this.stopwatchElapsed / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.timerDisplay.textContent = display;
            this.endTimeDisplay.textContent = '';
        } else if (this.isRecurringSession) {
            // Für Recurring Sessions, zeige die Zeit an, die bis zum Ziel verbleibt
            const category = this.categorySelect.value;
            const goal = this.plugin.settings.recurringSessionGoals[category];
            
            if (goal) {
                // Berechne Minuten und Sekunden aus goalTimeRemaining (als Integer)
                const totalSeconds = Math.floor(this.goalTimeRemaining);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = Math.floor(totalSeconds % 60);
                const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                this.timerDisplay.textContent = display;
                
                // Berechne die gesamte Zielzeit in Stunden und Minuten für die Anzeige
                // Zielwert ist in Stunden
                const goalHours = Math.floor(goal.timeGoal);
                const goalMinutes = Math.floor((goal.timeGoal - goalHours) * 60);
                const goalTimeDisplay = `${goalHours}h ${goalMinutes}m`;
                
                // Zeige Periode (täglich/wöchentlich) und Gesamtzielzeit an
                let endDisplay = `${goal.period === 'daily' ? 'Daily' : 'Weekly'} Goal (${goalTimeDisplay})`;
                
                // Füge Endzeit hinzu, wenn der Timer läuft
                if (this.isRunning) {
                    const endTime = new Date(Date.now() + (totalSeconds * 1000));
                    const endTimeStr = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    endDisplay += ` - Ends at ${endTimeStr}`;
                }
                
                this.endTimeDisplay.textContent = endDisplay;
            } else {
                this.timerDisplay.textContent = "00:00";
                this.endTimeDisplay.textContent = "No goal set";
            }
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
        } else if (this.isRecurringSession) {
            // Für Recurring Sessions, setze die goalTimeRemaining auf das volle Ziel (ohne bisherige Zeit)
            const category = this.categorySelect?.value;
            if (category && this.plugin.settings.recurringSessionGoals[category]) {
                const goal = this.plugin.settings.recurringSessionGoals[category];
                // Setze auf die volle Zielzeit in Sekunden (goal.timeGoal ist in Stunden)
                this.goalTimeRemaining = Math.floor(goal.timeGoal * 3600);
            } else {
                this.goalTimeRemaining = 0;
            }
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
        
        // Make sure to update the goal display
        if (this.isRecurringSession) {
            this.updateDailyTime();
        }

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
            this.breakTimer();
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
            const isRecurringSessionBackup = this.isRecurringSession;
            
            // Wenn wir im Recurring-Session-Modus sind, aktualisiere die Zeit für die aktuelle Kategorie
            if (isRecurringSessionBackup && !this.plugin.currentSession.isBreak) {
                const category = this.plugin.currentSession.category;
                const sessionDuration = this.plugin.currentSession.getDuration() / 60; // Minuten zu Stunden
                
                // Wenn es ein Ziel für diese Kategorie gibt, aktualisiere den Fortschritt
                if (this.plugin.settings.recurringSessionGoals[category]) {
                    const goal = this.plugin.settings.recurringSessionGoals[category];
                    if (!goal.timeSpent) goal.timeSpent = 0;
                    
                    // Zeit hinzufügen
                    goal.timeSpent += sessionDuration;
                    
                    // Prüfen, ob das Ziel erreicht wurde
                    if (!goal.achieved && goal.timeSpent >= goal.timeGoal) {
                        goal.achieved = true;
                        new Notice(`Goal for ${category} reached!`);
                    }
                    
                    // Einstellungen speichern
                    this.plugin.saveSettings();
                }
            }
            
            if (wasRunning) {
                this.breakTimer();
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
                this.isStopwatch = true;
                this.isRecurringSession = false;
                this.stopwatchElapsed = stopwatchElapsedBackup;
            } else if (isRecurringSessionBackup) {
                this.isStopwatch = false;
                this.isRecurringSession = true;
                
                // Recalculate goal time remaining for the new category
                if (this.plugin.settings.recurringSessionGoals[newCategory]) {
                    const goal = this.plugin.settings.recurringSessionGoals[newCategory];
                    // Setze immer auf die volle Zielzeit, nicht die verbleibende
                    this.goalTimeRemaining = Math.floor(goal.timeGoal * 3600);
                } else {
                    this.goalTimeRemaining = 0;
                }
                
                // Sofort die Timerdarstellung aktualisieren
                this.updateTimerDisplay();
                
                // Sofort die Zielanzeige aktualisieren
                this.updateDailyTime();
            } else {
                this.isStopwatch = false;
                this.isRecurringSession = false;
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
        this.startButton.textContent = 'Break';

        if (this.isStopwatch) {
            if (!this.stopwatchStartTime) {
                this.stopwatchStartTime = Date.now() - this.stopwatchElapsed;
            }
            this.interval = window.setInterval(() => {
                this.stopwatchElapsed = Date.now() - this.stopwatchStartTime;
                this.updateTimerDisplay();
                this.updateDailyTime();
            }, 100);
        } else if (this.isRecurringSession) {
            // Start the recurring session countdown timer
            if (!this.interval) {
                // Prüfe, ob wir die goalTimeRemaining neu berechnen müssen
                const category = this.categorySelect.value;
                if (category && this.plugin.settings.recurringSessionGoals[category]) {
                    // Wenn wir eine Session neu starten, müssen wir mit der vollen Zielzeit beginnen
                    if (this.timerStartTime === null) {
                        // Setze auf die volle Zielzeit
                        const goal = this.plugin.settings.recurringSessionGoals[category];
                        this.goalTimeRemaining = Math.floor(goal.timeGoal * 3600);
                    }
                }
                
                // Set up end time for the current goal
                this.startTime = Date.now();
                this.endTime = this.startTime + (this.goalTimeRemaining * 1000);
                this.lastUpdate = this.startTime;
                
                this.interval = window.setInterval(() => {
                    const now = Date.now();
                    const elapsed = now - this.lastUpdate;
                    
                    // Similar approach to pomodoro timer for smoother countdown
                    if (elapsed > 2000) { // If more than 2 seconds have passed (e.g., after sleep)
                        this.goalTimeRemaining = Math.max(0, Math.floor((this.endTime - now) / 1000));
                    } else {
                        const remaining = Math.max(0, Math.floor((this.endTime - now) / 1000));
                        if (remaining !== this.goalTimeRemaining) {
                            this.goalTimeRemaining = remaining;
                        }
                    }
                    
                    this.lastUpdate = now;
                    this.updateTimerDisplay();
                    
                    // Only update daily time and goal progress every 60 seconds to avoid excessive calculations
                    if (Math.floor(this.goalTimeRemaining) % 60 === 0 || this.goalTimeRemaining <= 0) {
                        this.updateDailyTime();
                        
                        // Wir aktualisieren hier NICHT goal.timeSpent, da wir dies später beim Beenden der
                        // Session tun. Das hilft, inkorrektes Addieren der Zeit zu vermeiden.
                    }
                    
                    // Check if timer has reached zero
                    if (this.goalTimeRemaining <= 0) {
                        this.breakTimer();
                        const category = this.categorySelect.value;
                        // Only show completion message if the goal was actually achieved during this session
                        // and wasn't already displayed
                        const goal = this.plugin.settings.recurringSessionGoals[category];
                        if (goal && !goal.achieved) {
                            new Notice(`Goal for ${category} reached!`);
                            goal.achieved = true;
                            this.plugin.saveSettings();
                        }
                    }
                }, 100); // Update more frequently for smoother countdown
            }
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

    breakTimer(): void {
        this.isRunning = false;
        this.startButton.textContent = 'Start';

        if (this.plugin.currentSession) {
            this.plugin.currentSession.break();
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
        this.breakTimer();
        
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

        // Add a class to the modal for styling when background blur is enabled
        if (this.plugin.settings.darkenReflectionBackground) {
            modal.containerEl.addClass('study-analytics-blurred-modal');
        }

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
            statsList.createEl('li', { text: `📝 Modified files: ${session.modifiedFiles.size}` });
            statsList.createEl('li', { text: `✅ Completed tasks: ${session.completedTasks.length}` });
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
            text: 'Add reflection',
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

    toggleTimerMode(): void {
        if (this.isRunning) {
            this.breakTimer();
        }
        
        // Remember current category
        const currentCategory = this.categorySelect.value;
        
        // Cycle through the 3 modes: Pomodoro -> Stopwatch -> Recurring Sessions -> Pomodoro
        if (!this.isStopwatch && !this.isRecurringSession) {
            // Pomodoro -> Stopwatch
            this.isStopwatch = true;
            this.isRecurringSession = false;
            this.stopwatchToggle.textContent = this.plugin.settings.useCompactDesign ? 
                'Switch to Rec. Sess.' : 'Switch to Recurring Sessions';
        } else if (this.isStopwatch && !this.isRecurringSession) {
            // Stopwatch -> Recurring Sessions (only if enabled in settings)
            if (this.plugin.settings.enableRecurringSessions) {
                this.isStopwatch = false;
                this.isRecurringSession = true;
                this.stopwatchToggle.textContent = 'Switch to pomodoro';
                
                // Beim Wechsel in den Recurring-Sessions-Modus, setze die volle Zielzeit für die aktuelle Kategorie
                if (this.plugin.settings.recurringSessionGoals[currentCategory]) {
                    const goal = this.plugin.settings.recurringSessionGoals[currentCategory];
                    this.goalTimeRemaining = Math.floor(goal.timeGoal * 3600);
                }
            } else {
                // If recurring sessions disabled, go directly to Pomodoro
                this.isStopwatch = false;
                this.isRecurringSession = false;
                this.stopwatchToggle.textContent = 'Switch to stopwatch';
            }
        } else {
            // Recurring Sessions -> Pomodoro
            this.isStopwatch = false;
            this.isRecurringSession = false;
            this.stopwatchToggle.textContent = 'Switch to stopwatch';
        }
        
        this.resetSession();
        this.updateCategorySelect();
        
        // Restore the previously selected category
        if (this.categorySelect.querySelector(`option[value="${currentCategory}"]`)) {
            this.categorySelect.value = currentCategory;
            if (this.isRecurringSession) {
                // If in recurring sessions mode, update goal display
                this.updateDailyTime();
                this.updateTimerDisplay(); // Aktualisiere auch die Timer-Anzeige
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

        new Setting(containerEl).setName('Timer').setHeading();

        new Setting(containerEl)
            .setName('Pomodoro duration')
            .setDesc('Duration in minutes')
            .addText(text => text
                .setValue(String(this.plugin.settings.pomodoroTime))
                .onChange(async (value) => {
                    this.plugin.settings.pomodoroTime = parseInt(value) || 25;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Short break duration')
            .setDesc('Duration in minutes')
            .addText(text => text
                .setValue(String(this.plugin.settings.shortBreakTime))
                .onChange(async (value) => {
                    this.plugin.settings.shortBreakTime = parseInt(value) || 5;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Long break duration')
            .setDesc('Duration in minutes')
            .addText(text => text
                .setValue(String(this.plugin.settings.longBreakTime))
                .onChange(async (value) => {
                    this.plugin.settings.longBreakTime = parseInt(value) || 15;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Long break interval')
            .setDesc('Number of pomodoros before long break')
            .addText(text => text
                .setValue(String(this.plugin.settings.longBreakInterval))
                .onChange(async (value) => {
                    this.plugin.settings.longBreakInterval = parseInt(value) || 4;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Tags').setHeading();

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

        new Setting(containerEl).setName('Categories').setHeading();

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
            .setName('Focus path')
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
            .setName('Darken background for reflections')
            .setDesc('Blurs the background behind the reflection modal to help focus on your thoughts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.darkenReflectionBackground)
                .onChange(async (value) => {
                    this.plugin.settings.darkenReflectionBackground = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Use compact design')
            .setDesc('Makes the sidebar view more compact to save screen space')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useCompactDesign)
                .onChange(async (value) => {
                    this.plugin.settings.useCompactDesign = value;
                    await this.plugin.saveSettings();
                    // Aktualisiere die Ansicht sofort
                    const view = this.plugin.getStudyFlowView();
                    if (view) {
                        view.containerEl.classList.toggle('study-analytics-compact', value);
                    }
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
                
        new Setting(containerEl).setName('Summary').setHeading();
        
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

        new Setting(containerEl).setName('Recurring sessions').setHeading();

        new Setting(containerEl)
            .setName('Enable Recurring Sessions')
            .setDesc('Enable the recurring sessions feature for goal-based time tracking')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableRecurringSessions)
                .onChange(async (value) => {
                    this.plugin.settings.enableRecurringSessions = value;
                    await this.plugin.saveSettings();
                    
                    // If the view is active, update the mode button
                    const view = this.plugin.getStudyFlowView();
                    if (view) {
                        // If recurring sessions is disabled and we're in that mode, switch to pomodoro
                        if (!value && view.isRecurringSession) {
                            view.isRecurringSession = false;
                            view.isStopwatch = false;
                            view.stopwatchToggle.textContent = 'Switch to Stopwatch';
                            view.resetSession();
                        }
                    }
                    
                    // Refresh the settings panel to show/hide recurring goals settings
                    this.display();
                }));

        // Only show recurring goal settings if enabled
        if (this.plugin.settings.enableRecurringSessions) {
            new Setting(containerEl)
                .setName('Prorate Weekly Goals')
                .setDesc('Divide weekly goals by days remaining in the week, to show how much is needed per day')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.prorateWeeklyGoals)
                    .onChange(async (value) => {
                        this.plugin.settings.prorateWeeklyGoals = value;
                        await this.plugin.saveSettings();
                        
                        // Update the view if necessary
                        const view = this.plugin.getStudyFlowView();
                        if (view && view.isRecurringSession) {
                            view.updateDailyTime();
                        }
                    }));

            containerEl.createEl('h4', { text: 'Recurring Goals' });
            
            // For each category, add a goal setting
            this.plugin.settings.categories.forEach((category) => {
                if (category !== '~Break~') {
                    const goalSetting = new Setting(containerEl)
                        .setName(`${category} Goal`)
                        .setDesc(`Set a time goal for ${category}`);
                    
                    // Time goal input
                    goalSetting.addText(text => {
                        const goal = this.plugin.settings.recurringSessionGoals[category] || { timeGoal: 0, period: 'daily' };
                        text.setValue(String(goal.timeGoal || 0))
                            .setPlaceholder('Hours')
                            .onChange(async (value) => {
                                const timeGoal = parseFloat(value) || 0;
                                if (!this.plugin.settings.recurringSessionGoals[category]) {
                                    this.plugin.settings.recurringSessionGoals[category] = { 
                                        timeGoal, 
                                        period: 'daily', 
                                        achieved: false,
                                        timeSpent: 0
                                    };
                                } else {
                                    this.plugin.settings.recurringSessionGoals[category].timeGoal = timeGoal;
                                }
                                await this.plugin.saveSettings();
                            });
                    });
                    
                    // Period selector (daily/weekly)
                    goalSetting.addDropdown(dropdown => {
                        const goal = this.plugin.settings.recurringSessionGoals[category] || { timeGoal: 0, period: 'daily' };
                        dropdown.addOption('daily', 'Daily')
                            .addOption('weekly', 'Weekly')
                            .setValue(goal.period || 'daily')
                            .onChange(async (value: 'daily' | 'weekly') => {
                                if (!this.plugin.settings.recurringSessionGoals[category]) {
                                    this.plugin.settings.recurringSessionGoals[category] = { 
                                        timeGoal: 0, 
                                        period: value,
                                        achieved: false,
                                        timeSpent: 0
                                    };
                                } else {
                                    this.plugin.settings.recurringSessionGoals[category].period = value;
                                }
                                await this.plugin.saveSettings();
                            });
                    });
                    
                    // Add reset button
                    goalSetting.addButton(button => {
                        button.setIcon('reset')
                            .setTooltip('Reset progress')
                            .onClick(async () => {
                                if (this.plugin.settings.recurringSessionGoals[category]) {
                                    this.plugin.settings.recurringSessionGoals[category].achieved = false;
                                    this.plugin.settings.recurringSessionGoals[category].timeSpent = 0;
                                    await this.plugin.saveSettings();
                                    new Notice(`Progress for ${category} has been reset`);
                                    
                                    // Update the view if necessary
                                    const view = this.plugin.getStudyFlowView();
                                    if (view) {
                                        // Check if this is the current active category in recurring session mode
                                        if (view.isRecurringSession && view.categorySelect.value === category) {
                                            // If timer is running, break it
                                            const wasRunning = view.isRunning;
                                            if (wasRunning) {
                                                view.breakTimer();
                                            }
                                            
                                            // Reset the timer with full category goal time
                                            const goal = this.plugin.settings.recurringSessionGoals[category];
                                            // Convert goal (hours) to seconds
                                            view.goalTimeRemaining = Math.floor(goal.timeGoal * 3600);
                                            
                                            // Update the display
                                            view.updateTimerDisplay();
                                            
                                            // Update goal display
                                            view.updateDailyTime();
                                            
                                            // If the timer was running, restart it
                                            if (wasRunning) {
                                                view.startTimer();
                                            }
                                        } else {
                                            // Otherwise, just update the goals display
                                            view.updateDailyTime();
                                        }
                                    }
                                }
                            });
                    });
                }
            });
        }
    }
}

export default class StudyAnalyticsPlugin extends Plugin {
    settings: StudyAnalyticsSettings;
    currentSession: StudySession | null = null;
    statusBarItem: HTMLElement;
    sessionsData: SessionsData = { sessions: [], lastUpdated: new Date().toISOString() };
    sessionsFilePath: string = '';

    async onload() {
        // Load settings
        await this.loadSettings();
        
        // Set up sessions file path
        this.sessionsFilePath = `${this.settings.notesFolder}/study_sessions_data.json`;
        
        // Load existing sessions data
        await this.loadSessionsData();
        
        // Migrate any existing temp files to consolidated storage
        await this.migrateTempFilesToConsolidated();
        
        // Show a notice about the storage change
        new Notice("Study Analytics now uses consolidated storage for all sessions");

        // Register view
        this.registerView(
            VIEW_TYPE_STUDY_FLOW,
            (leaf) => new StudyFlowView(leaf, this)
        );
        
        // Automatically open the sidebar on startup
        this.app.workspace.onLayoutReady(() => {
            this.activateView();
            this.checkWeeklySummary();
            this.startAutoTracking();
        });

        // Add ribbon icon
        this.addRibbonIcon('stopwatch', 'Study Analytics', async () => {
            await this.activateView();
        });

        // Add status bar item
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.setText('🍅 00:00');
        this.statusBarItem.onClickEvent(() => {
            this.activateView();
        });

        // Register events for tracking

        // Track file modifications
        if (this.settings.trackModifiedFiles || this.settings.trackCreatedNotes) {
        this.registerEvent(
                this.app.vault.on('modify', (file) => {
                    if (this.currentSession && !this.currentSession.isBreak) {
                        // Only track files that match the focus path (if set)
                        if (this.settings.focusPath && !file.path.startsWith(this.settings.focusPath)) {
                            return;
                        }
                        
                            this.currentSession.trackModifiedFile(file.path);
                        
                        // Auto-update category if enabled
                        if (this.settings.autoSetCategoryByFolder) {
                            this.updateCategoryByFolder(file.path);
                        }
                        
                        // Track word count if enabled
                        if (this.settings.trackWordCount && file instanceof TFile && file.extension === 'md') {
                            this.app.vault.read(file).then(content => {
                            const wordCount = this.countWords(content);
                                this.currentSession?.updateWordCount(file.path, wordCount);
                                
                                // Track links created
                                const fileCache = this.app.metadataCache.getFileCache(file);
                                if (fileCache && fileCache.links) {
                                    this.currentSession?.updateLinkCount(file.path, fileCache.links.length);
                                }
                            });
                        }
                    }
                })
            );
        }
        
        // Track newly created files
        if (this.settings.trackCreatedNotes) {
            this.registerEvent(
                this.app.vault.on('create', (file) => {
                    if (this.currentSession && !this.currentSession.isBreak && file instanceof TFile) {
                        // Only track markdown files or all files based on settings
                        if (file.extension === 'md') {
                            this.currentSession.trackCreatedFile(file.path);
                            
                            // Auto-update category if enabled
                        if (this.settings.autoSetCategoryByFolder) {
                            this.updateCategoryByFolder(file.path);
                        }
                    }
                }
            })
        );
        }
        
        // Track opened files
        if (this.settings.trackOpenedFiles) {
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                    if (this.currentSession && !this.currentSession.isBreak && file) {
                        // Only track files that match the focus path (if set)
                        if (this.settings.focusPath && !file.path.startsWith(this.settings.focusPath)) {
                            return;
                        }
                        
                        this.currentSession.trackOpenedFile(file.path);
                        
                        // Auto-update category if enabled
                        if (this.settings.autoSetCategoryByFolder) {
                            this.updateCategoryByFolder(file.path);
                    }
                }
            })
        );
        }

        // Add settings tab
        this.addSettingTab(new StudyFlowSettingTab(this.app, this));

        // Commands
        this.addCommand({
            id: 'start-new-session',
            name: 'Start new study session',
            callback: async () => {
                await this.activateView();
                const view = this.getStudyFlowView();
                if (view) {
                    const currentCategory = view.categorySelect.value || 'Study';
                    this.startNewSession(currentCategory);
                    view.startTimer();
                }
            }
        });

        this.addCommand({
            id: 'end-current-session',
            name: 'End current study session',
            callback: () => this.endCurrentSession()
        });

        this.addCommand({
            id: 'create-daily-summary',
            name: 'Create daily study summary',
            callback: () => this.createDailySummary()
        });

        this.addCommand({
            id: 'create-weekly-summary',
            name: 'Create weekly study summary',
            callback: () => this.createWeeklySummary()
        });

        // Command to toggle timer state
        this.addCommand({
            id: 'toggle-timer',
            name: 'Toggle timer (Start/Break)',
            callback: () => {
                const view = this.getStudyFlowView();
                if (view) {
                    view.toggleTimer();
                }
            }
        });
        
        // Set up daily midnight reset for recurring goals
        this.registerInterval(
            window.setInterval(async () => {
                const now = new Date();
                // Check if it's midnight (within a minute to avoid missing it)
                if (now.getHours() === 0 && now.getMinutes() < 1) {
                    // Reset daily goals
                    await this.resetRecurringGoals('daily');
                    
                    // Create daily summary if enabled
                    if (this.settings.autoDailySummary) {
                        // Get yesterday's date
                        const yesterday = new Date(now);
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yesterdayString = yesterday.toISOString().split('T')[0];
                        
                        await this.createDailySummary(yesterdayString);
                    }
                }
                
                // Weekly reset on the configured day
                if (this.settings.enableWeeklySummary && 
                    this.settings.autoWeeklySummary && 
                    now.getDay() === this.settings.weeklySummaryDay && 
                    now.getHours() === 0 && 
                    now.getMinutes() < 1) {
                    
                    // Reset weekly goals
                    await this.resetRecurringGoals('weekly');
                    
                    // Create weekly summary
                    await this.checkWeeklySummary();
                }
            }, 60000) // Check every minute
        );
        
        // Start auto tracking if enabled
        if (this.settings.autoTrackSessionOnStartup) {
            setTimeout(() => {
                this.startAutoTracking();
            }, 2000); // Delay to ensure app is fully loaded
        }
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

                // Wenn wir im Recurring-Sessions-Modus sind, aktualisiere die Zielzeit der Kategorie
                if (view.isRecurringSession && !this.currentSession.isBreak) {
                    const category = this.currentSession.category;
                    const sessionDuration = this.currentSession.getDuration() / 60; // Minuten zu Stunden
                    
                    // Wenn es ein Ziel für diese Kategorie gibt, aktualisiere den Fortschritt
                    if (this.settings.recurringSessionGoals[category]) {
                        const goal = this.settings.recurringSessionGoals[category];
                        if (!goal.timeSpent) goal.timeSpent = 0;
                        
                        // Zeit hinzufügen
                        goal.timeSpent += sessionDuration;
                        
                        // Prüfen, ob das Ziel erreicht wurde
                        if (!goal.achieved && goal.timeSpent >= goal.timeGoal) {
                            goal.achieved = true;
                            new Notice(`Goal for ${category} reached!`);
                        }
                        
                        // Einstellungen speichern
                        await this.saveSettings();
                    }
                }
            }

            const sessionData = this.currentSession.end();
            await this.saveSessionToFile(sessionData);
            this.currentSession = null;

            if (view) {
                view.resetSession();
                // Aktualisiere die Zielanzeige, nachdem die Session beendet wurde
                view.updateDailyTime();
            }

            new Notice('Session ended and saved');
        }
    }

    async saveSessionToFile(sessionData: SessionData) {
        try {
            // Ensure the sessions folder exists
            if (!(await this.app.vault.adapter.exists(this.settings.notesFolder))) {
                await this.app.vault.createFolder(this.settings.notesFolder);
            }
            
            // Add the session to our sessions data array
            this.sessionsData.sessions.push(sessionData);
            this.sessionsData.lastUpdated = new Date().toISOString();
            
            // Save the updated sessions data to the file
            await this.saveSessionsData();
        } catch (error) {
            console.error("Error saving session:", error);
            new Notice("Error saving session data");
        }
    }

    async createDailySummary(date?: string) {
        const summaryDate = date || new Date().toISOString().split('T')[0];
        const summaryFileName = `${summaryDate}_daily_summary.md`;
        const summaryFilePath = `${this.settings.notesFolder}/${summaryFileName}`;
        let studySessions: SessionData[] = [];
        let breakSessions: SessionData[] = [];

        try {
            // Filter sessions from the specified date
            this.sessionsData.sessions.forEach(session => {
                if (session.date === summaryDate) {
                    if (session.isBreak) {
                        breakSessions.push(session);
                    } else {
                        studySessions.push(session);
                    }
                }
            });
            
            if (studySessions.length === 0) {
                new Notice(`No study sessions found for ${summaryDate}`);
                return null;
            }
            
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

            // Collect data from all sessions for the specified date
            studySessions.forEach(session => {
                totalStudyTime += session.duration;
                totalPomodoros += session.pomodoros;
                totalDistractions += session.distractions.length;
                session.modifiedFiles.forEach(f => modifiedFiles.add(f));
                session.openedFiles?.forEach(f => openedFiles.add(f));
                session.createdFiles?.forEach(f => createdFiles.add(f));
                session.createdLinks?.forEach(l => createdLinks.add(l));
                totalTasks += session.completedTasks.length;
                difficulties.push(session.difficulty);
                totalWordCount += session.wordCount || 0;
            });
            
            breakSessions.forEach(session => {
                totalBreakTime += session.duration;
            });
            
            totalCreatedFiles = createdFiles.size;
            totalCreatedLinks = createdLinks.size;

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
            summaryContent += `## 📊 Daily statistics\n`;
            summaryContent += `- ⏱️ Study Time: ${studyHours}h ${studyMinutes}m\n`;
            summaryContent += `- ⏸️ Break Time: ${breakHours}h ${breakMinutes}m\n`;
            summaryContent += `- 🕙 Total Time: ${totalTimeHours}h ${totalTimeMinutes}m\n`;
            summaryContent += `- 🍅 Total Pomodoros: ${totalPomodoros}\n`;
            summaryContent += `- ⚠️ Total Distractions: ${totalDistractions}\n`;
            summaryContent += `- 📝 Modified Files: ${modifiedFiles.size}\n`;
            summaryContent += `- 📖 Opened Files: ${openedFiles.size}\n`;
            summaryContent += `- 📄 Created Files: ${totalCreatedFiles}\n`;
            summaryContent += `- 🔗 Created Links: ${totalCreatedLinks}\n`;
            summaryContent += `- ✅ Completed tasks: ${totalTasks}\n`;
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
                
                // Prominently display word count
                if (session.wordCount) {
                    summaryContent += `- **Words Written: ${session.wordCount}**\n`;
                } else {
                    summaryContent += `- Words Written: 0\n`;
                }
                
                // Prominently display created files and notes
                const createdNotes = (session.createdFiles || []).filter(file => file.endsWith('.md')).length;
                const createdOtherFiles = (session.createdFiles || []).length - createdNotes;
                
                if (createdNotes > 0) {
                    summaryContent += `- **Created Notes: ${createdNotes}**\n`;
                }
                
                if (createdOtherFiles > 0) {
                    summaryContent += `- Created Other Files: ${createdOtherFiles}\n`;
                }
                
                if (session.createdLinks && session.createdLinks.length > 0) {
                    summaryContent += `- Created Links: ${session.createdLinks.length}\n`;
                }
                
                // Display modified files count
                if (session.modifiedFiles && session.modifiedFiles.length > 0) {
                    const modifiedNotes = session.modifiedFiles.filter(file => file.endsWith('.md')).length;
                    const modifiedOtherFiles = session.modifiedFiles.length - modifiedNotes;
                    
                    if (modifiedNotes > 0) {
                        summaryContent += `- Modified Notes: ${modifiedNotes}\n`;
                    }
                    
                    if (modifiedOtherFiles > 0) {
                        summaryContent += `- Modified Other Files: ${modifiedOtherFiles}\n`;
                    }
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
                
                // Add details for created files if available
                if (session.createdFiles && session.createdFiles.length > 0) {
                    summaryContent += `### Created Files\n`;
                    session.createdFiles.forEach(file => {
                        summaryContent += `- [[${file}|${file.split('/').pop()}]]\n`;
                    });
                    summaryContent += '\n';
                }
            });

            // Add recurring session goals information
            if (this.settings.enableRecurringSessions) {
                summaryContent += `## 🎯 Recurring Session Goals\n`;
                
                // Calculate category totals for the day
                const categoryTotals: Record<string, number> = {};
                studySessions.forEach(session => {
                    if (!categoryTotals[session.category]) {
                        categoryTotals[session.category] = 0;
                    }
                    categoryTotals[session.category] += session.duration;
                });
                
                let goalsAchieved = 0;
                let totalGoals = 0;
                
                // List each category with a daily goal
                Object.entries(this.settings.recurringSessionGoals).forEach(([category, goal]) => {
                    if (goal.period === 'daily') {
                        totalGoals++;
                        const timeSpent = Math.round(categoryTotals[category] || 0);
                        const timeGoalMinutes = goal.timeGoal * 60;
                        const achieved = timeSpent >= timeGoalMinutes;
                        if (achieved) goalsAchieved++;
                        
                        const spentHours = Math.floor(timeSpent / 60);
                        const spentMinutes = timeSpent % 60;
                        const goalHours = Math.floor(goal.timeGoal / 60);
                        const goalMinutes = goal.timeGoal % 60;
                        
                        summaryContent += `- ${category}: ${spentHours}h ${spentMinutes}m / ${goalHours}h ${goalMinutes}m `;
                        summaryContent += achieved ? '✅' : `❌ (${Math.round((timeSpent / timeGoalMinutes) * 100)}%)`;
                        summaryContent += '\n';
                    }
                });
                
                if (totalGoals > 0) {
                    summaryContent += `\nDaily Goals: ${goalsAchieved}/${totalGoals} achieved (${Math.round((goalsAchieved / totalGoals) * 100)}%)\n\n`;
                } else {
                    summaryContent += '\nNo daily goals set.\n\n';
                }
            }

            // Write the summary to the file
            if (!(await this.app.vault.adapter.exists(this.settings.notesFolder))) {
                await this.app.vault.createFolder(this.settings.notesFolder);
            }
            
            await this.app.vault.adapter.write(summaryFilePath, summaryContent);

            // Unless preserving temp files is enabled, delete them
            if (!this.settings.preserveTempFiles) {
                // Don't delete temp files anymore since we're storing everything in one file
                console.log("Using consolidated storage - no temp files to delete");
            }

            new Notice(`Daily summary for ${summaryDate} created`);
            
            // Return the same data structure as before for compatibility
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
            console.error("Error creating daily summary:", error);
            new Notice("Error creating daily summary");
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
            summaryContent += `## 📊 Weekly statistics\n`;
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
            summaryContent += `- ✅ Completed tasks: ${weeklyTasks}\n`;
            summaryContent += `- 📏 Words Written: ${weeklyWordCount}\n`;
            summaryContent += `- 📈 Average Difficulty: ${avgDifficulty}/5\n\n`;
            
            // Add recurring session goals for weekly goals
            if (this.settings.enableRecurringSessions) {
                summaryContent += `## 🎯 Weekly Recurring Goals\n`;
                
                // Calculate category totals for the week
                const categoryTotals: Record<string, number> = {};
                
                // Go through all study sessions to get category breakdown
                for (const date of weekDates) {
                    const tempFolderPath = `${this.settings.notesFolder}/temp`;
                    if (await this.app.vault.adapter.exists(tempFolderPath)) {
                        const tempFiles = await this.app.vault.adapter.list(tempFolderPath);
                        
                        for (const file of tempFiles.files) {
                            const content = await this.app.vault.adapter.read(file);
                            const sessionData = JSON.parse(content) as SessionData;
                            
                            // Only include sessions from this week that aren't breaks
                            if (sessionData.date === date && !sessionData.isBreak) {
                                if (!categoryTotals[sessionData.category]) {
                                    categoryTotals[sessionData.category] = 0;
                                }
                                categoryTotals[sessionData.category] += sessionData.duration;
                            }
                        }
                    }
                }
                
                let goalsAchieved = 0;
                let totalGoals = 0;
                
                // List each category with a weekly goal
                Object.entries(this.settings.recurringSessionGoals).forEach(([category, goal]) => {
                    if (goal.period === 'weekly') {
                        totalGoals++;
                        const timeSpent = Math.round(categoryTotals[category] || 0);
                        const timeGoalMinutes = goal.timeGoal * 60;
                        const achieved = timeSpent >= timeGoalMinutes;
                        if (achieved) goalsAchieved++;
                        
                        const spentHours = Math.floor(timeSpent / 60);
                        const spentMinutes = timeSpent % 60;
                        const goalHours = Math.floor(goal.timeGoal / 60);
                        const goalMinutes = goal.timeGoal % 60;
                        
                        summaryContent += `- ${category}: ${spentHours}h ${spentMinutes}m / ${goalHours}h ${goalMinutes}m `;
                        summaryContent += achieved ? '✅' : `❌ (${Math.round((timeSpent / timeGoalMinutes) * 100)}%)`;
                        summaryContent += '\n';
                    }
                });
                
                if (totalGoals > 0) {
                    summaryContent += `\nWeekly Goals: ${goalsAchieved}/${totalGoals} achieved (${Math.round((goalsAchieved / totalGoals) * 100)}%)\n\n`;
                } else {
                    summaryContent += '\nNo weekly goals set.\n\n';
                }
            }
            
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

    async onunload() {
        this.app.workspace
            .getLeavesOfType(VIEW_TYPE_STUDY_FLOW)
            .forEach(leaf => leaf.detach());
    }

    // Reset recurring goals based on their period
    async resetRecurringGoals(period: 'daily' | 'weekly') {
        if (!this.settings.enableRecurringSessions) {
            return;
        }
        
        let goalCount = 0;
        
        // Reset each goal of the specified period
        Object.entries(this.settings.recurringSessionGoals).forEach(([category, goal]) => {
            if (goal.period === period) {
                goal.timeSpent = 0;
                goal.achieved = false;
                goalCount++;
            }
        });
        
        await this.saveSettings();
        
        if (goalCount > 0) {
            // If view is active and in recurring session mode, update the display
            const view = this.getStudyFlowView();
            if (view) {
                // If currently in recurring sessions mode, reset the session
                if (view.isRecurringSession) {
                    // If timer is running, break it
                    const wasRunning = view.isRunning;
                    if (wasRunning) {
                        view.breakTimer();
                    }
                    
                    // Recalculate goal time for the current category
                    const currentCategory = view.categorySelect.value;
                    if (currentCategory && this.settings.recurringSessionGoals[currentCategory]) {
                        const goal = this.settings.recurringSessionGoals[currentCategory];
                        
                        // If this goal's period matches the reset period, update the timer
                        if (goal.period === period) {
                            // Convert goal (hours) to seconds
                            view.goalTimeRemaining = Math.floor(goal.timeGoal * 3600);
                            
                            // Update timer display
                            view.updateTimerDisplay();
                            
                            // Update goals display
                            view.updateDailyTime();
                            
                            // If timer was running, restart it
                            if (wasRunning) {
                                view.startTimer();
                            }
                        }
                    }
                }
            }
            
            new Notice(`Reset ${goalCount} ${period} goals`);
        }
    }
    
    async loadSessionsData() {
        try {
            // Check if the sessions file exists
            if (await this.app.vault.adapter.exists(this.sessionsFilePath)) {
                // Read the file
                const data = await this.app.vault.adapter.read(this.sessionsFilePath);
                
                // Parse the JSON data
                const sessionsData = JSON.parse(data) as SessionsData;
                
                // Convert date strings back to Date objects for startTime
                sessionsData.sessions.forEach(session => {
                    session.startTime = new Date(session.startTime);
                    
                    // Convert date strings in distractions
                    if (session.distractions) {
                        session.distractions.forEach(distraction => {
                            distraction.time = new Date(distraction.time);
                        });
                    }
                    
                    // Convert date strings in lineNotes
                    if (session.lineNotes) {
                        session.lineNotes.forEach(note => {
                            note.time = new Date(note.time);
                        });
                    }
                    
                    // Convert date strings in reflections
                    if (session.reflections) {
                        session.reflections.forEach(reflection => {
                            reflection.time = new Date(reflection.time);
                        });
                    }
                    
                    // Convert date strings in completedTasks
                    if (session.completedTasks) {
                        session.completedTasks.forEach(task => {
                            task.time = new Date(task.time);
                        });
                    }
                });
                
                this.sessionsData = sessionsData;
            }
        } catch (error) {
            console.error("Error loading sessions data:", error);
            new Notice("Error loading sessions data");
            // Initialize with empty data if there was an error
            this.sessionsData = { sessions: [], lastUpdated: new Date().toISOString() };
        }
    }

    async saveSessionsData() {
        try {
            // Ensure the sessions folder exists
            if (!(await this.app.vault.adapter.exists(this.settings.notesFolder))) {
                await this.app.vault.createFolder(this.settings.notesFolder);
            }
            
            // Save the sessions data to the file
            await this.app.vault.adapter.write(
                this.sessionsFilePath,
                JSON.stringify(this.sessionsData, null, 2)
            );
        } catch (error) {
            console.error("Error saving sessions data:", error);
            new Notice("Error saving sessions data");
        }
    }
    
    async migrateTempFilesToConsolidated() {
        const tempFolderPath = `${this.settings.notesFolder}/temp`;
        
        try {
            // Check if temp folder exists
            if (!(await this.app.vault.adapter.exists(tempFolderPath))) {
                console.log("No temp folder found, no migration needed");
                return;
            }
            
            // Get list of temp files
            const tempFiles = await this.app.vault.adapter.list(tempFolderPath);
            
            if (tempFiles.files.length === 0) {
                console.log("No temp files found, no migration needed");
                return;
            }
            
            let migratedCount = 0;
            
            // Read each temp file and add it to the consolidated storage
            for (const file of tempFiles.files) {
                try {
                    const content = await this.app.vault.adapter.read(file);
                    const sessionData = JSON.parse(content) as SessionData;
                    
                    // Add ID if it doesn't have one
                    if (!sessionData.id) {
                        sessionData.id = `migrated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    }
                    
                    // Convert date strings to Date objects
                    sessionData.startTime = new Date(sessionData.startTime);
                    
                    // Convert nested date strings
                    if (sessionData.distractions) {
                        sessionData.distractions.forEach(d => {
                            d.time = new Date(d.time);
                        });
                    }
                    
                    if (sessionData.lineNotes) {
                        sessionData.lineNotes.forEach(n => {
                            n.time = new Date(n.time);
                        });
                    }
                    
                    if (sessionData.completedTasks) {
                        sessionData.completedTasks.forEach(t => {
                            t.time = new Date(t.time);
                        });
                    }
                    
                    if (sessionData.reflections) {
                        sessionData.reflections.forEach(r => {
                            r.time = new Date(r.time);
                        });
                    }
                    
                    // Add to consolidated storage
                    this.sessionsData.sessions.push(sessionData);
                    migratedCount++;
                    
                    // Delete the temp file
                    await this.app.vault.adapter.remove(file);
                } catch (error) {
                    console.error(`Error migrating file ${file}:`, error);
                }
            }
            
            if (migratedCount > 0) {
                // Update the last updated time
                this.sessionsData.lastUpdated = new Date().toISOString();
                
                // Save the consolidated data
                await this.saveSessionsData();
                
                // Try to remove the temp folder
                try {
                    await this.app.vault.adapter.rmdir(tempFolderPath, false);
                } catch (error) {
                    console.log("Could not remove temp folder, it may not be empty");
                }
                
                new Notice(`Migrated ${migratedCount} session files to consolidated storage`);
            }
        } catch (error) {
            console.error("Error during migration:", error);
            new Notice("Error migrating session data");
        }
    }
}