import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile, TextComponent } from 'obsidian';
import { TimerService } from './src/services/timer/TimerService';
import type { TimerMode } from './src/services/timer/TimerTypes';
import { TrackingService } from './src/services/tracking/TrackingService';
import { SchedulerService } from './src/services/scheduler/SchedulerService';
import { AnalyticsService } from './src/services/analytics/AnalyticsService';
import { SummaryService } from './src/services/summary/SummaryService';
import { SessionService } from './src/services/session/SessionService';
import { TagIndexService } from './src/services/tags/TagIndexService';

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
    showTagStatsInDaily?: boolean; // Show tracked tag breakdown in daily summary
    simplifyContinuousUI?: boolean; // Hide non-essential controls in continuous mode
    liveAnalyticsCategories?: string[]; // Up to 2 categories for live chart
    resumePromptOnStartup?: boolean; // Offer to resume from live snapshot on startup
    autoResumeWithoutPrompt?: boolean; // Immediately resume snapshot on startup (legacy)
    autoResumeStartTimer?: boolean; // If auto-resuming, start timer immediately (legacy)
    promptRestoreOnAbruptExit?: boolean; // Offer to restore previous session on startup if not ended cleanly
    autosaveIntervalSec?: number; // Interval for live snapshot
    jsonPollIntervalSec?: number; // Interval for re-reading sessions JSON
    liveAnalyticsIncludeTags?: boolean; // Show tags breakdown in live analytics when enabled
    liveAnalyticsRefreshSec?: number; // Refresh interval for live modal
    timeZoneMode?: 'system' | 'utc' | 'fixed';
    timeZoneOffsetMinutes?: number; // for fixed offset, minutes from UTC (e.g., +120)
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
    showTagStatsInDaily: false,
    simplifyContinuousUI: false,
    liveAnalyticsCategories: [],
    resumePromptOnStartup: true,
    autoResumeWithoutPrompt: false,
    autoResumeStartTimer: false,
    autosaveIntervalSec: 10,
    jsonPollIntervalSec: 10,
    liveAnalyticsIncludeTags: true,
    liveAnalyticsRefreshSec: 1,
    promptRestoreOnAbruptExit: true,
    timeZoneMode: 'system',
    timeZoneOffsetMinutes: 0,
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
    duration: number; // minutes
    durationSec?: number; // seconds (added for precision)
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
    liveSession?: SessionData; // ongoing session snapshot for crash-safe persistence
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

    getDurationSec(): number {
        const end = this.endTime || new Date();
        let ms = (Number(end) - Number(this.startTime));
        if (this.breakStartTime) {
            ms -= (Number(new Date()) - Number(this.breakStartTime));
        }
        ms -= this.totalBreakDuration;
        return Math.max(0, Math.floor(ms / 1000));
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
        // Keep legacy minutes value for analytics/summary
        return Math.floor(this.getDurationSec() / 60);
    }

    end(): SessionData {
        this.endTime = new Date();
        return {
            category: this.category,
            startTime: this.startTime,
            duration: this.getDuration(),
            durationSec: this.getDurationSec(),
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
    timeLeft: number; // retained for compatibility; sourced from timer service
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
    lastGoalsUpdateTs: number = 0;
    stopwatchToggle: HTMLButtonElement;
    startButton: HTMLButtonElement;
    newSessionButton: HTMLButtonElement;
    endButton: HTMLButtonElement;
    categorySelect: HTMLSelectElement;
    difficultySlider: HTMLInputElement;
    difficultySectionEl: HTMLDivElement;
    notesArea: HTMLTextAreaElement;
    notesSectionEl: HTMLDivElement;
    distractionInput: HTMLInputElement;
    dailyTimeDisplay: HTMLElement;
    statusBarItem: HTMLElement;
    endTime: number;
    startTime: number;
    goalTimeRemaining: number; // For recurring sessions
    private isUpdatingDaily: boolean = false;
    private suppressCategoryChange: boolean = false;

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
            cls: 'study-flow-daily-stats study-flow-daily-box'
        });
        this.dailyTimeDisplay = dailyStatsContainer.createEl('div', {
            cls: 'study-flow-daily-time',
            text: 'Today’s study time: Loading...'
        });

        // Initial update and regular updates
        await this.updateDailyTime();
        // Keep minute-level background refresh as fallback; real-time sync is driven by throttledGoalUpdate
        this.registerInterval(
            window.setInterval(async () => await this.updateDailyTime(), 60000)
        );

        // Timer Display
        this.timerDisplay = container.createEl('div', { cls: 'timer-display' });
        this.endTimeDisplay = container.createEl('div', { cls: 'end-time-display' });
        this.updateTimerDisplay();

        // Stopwatch Toggle
        const stopwatchDiv = container.createEl('div', { cls: 'stopwatch-section' });
        let toggleText = 'Switch to stopwatch';
        
        if (this.isStopwatch) {
            toggleText = this.plugin.settings.useCompactDesign ? 
                'Switch to Rec. Sess.' : 'Switch to Recurring Sessions';
        } else if (this.isRecurringSession) {
            toggleText = 'Switch to pomodoro';
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
        this.newSessionButton = controls.createEl('button', {
            text: this.plugin.settings.useCompactDesign ? 'New' : 'New Session',
            cls: 'control-button new-session-button'
        });
        this.newSessionButton.onclick = async () => {
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
        this.endButton = controls.createEl('button', {
            text: 'End',
            cls: 'control-button end-button'
        });
        this.endButton.onclick = () => this.plugin.endCurrentSession();

        // If tracking without explicit sessions, simplify UI: only Pause/Start, no New/End
        if (this.plugin.settings.trackWithoutSession) {
            this.newSessionButton.toggleAttribute('disabled', true);
            this.newSessionButton.style.display = 'none';
            this.endButton.toggleAttribute('disabled', true);
            this.endButton.style.display = 'none';
        }

        // Category Selection
        const categoryDiv = container.createEl('div', { cls: 'category-section' });
        categoryDiv.createEl('label', { text: 'Category: ' });
        this.categorySelect = categoryDiv.createEl('select');
        this.categorySelect.onchange = () => {
            if (this.suppressCategoryChange) return;
            // Only change category through session service when explicitly requested
            this.changeCategory(this.categorySelect.value);
        };
        this.updateCategorySelect();

        // Difficulty Slider
        if (this.plugin.settings.showDifficulty) {
            this.difficultySectionEl = container.createEl('div', { cls: 'difficulty-section' });
            this.difficultySectionEl.createEl('label', { text: 'Difficulty: ' });
            this.difficultySlider = this.difficultySectionEl.createEl('input', {
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
        this.notesSectionEl = container.createEl('div', { cls: 'notes-section' });
        this.notesSectionEl.createEl('label', { text: 'Session notes:' });
        this.notesArea = this.notesSectionEl.createEl('textarea', {
            cls: 'notes-area',
            attr: { rows: '4', placeholder: 'Enter session notes here...' }
        });
        // Autosave notes changes to persistent snapshot (debounced)
        this.notesArea.addEventListener('input', () => {
            if (this.plugin.currentSession) {
                this.plugin.currentSession.notes = this.notesArea.value || '';
                this.plugin.scheduleAutosaveLiveSnapshot();
            }
        });

        // Add Reflection Note Button
        const reflectionDiv = container.createEl('div', { cls: 'reflection-section' });
        const reflectionButton = reflectionDiv.createEl('button', {
            text: 'Add reflection',
            cls: 'reflection-button'
        });
        reflectionButton.onclick = () => this.addReflection();
        reflectionDiv.addEventListener('change', () => this.plugin.scheduleAutosaveLiveSnapshot());

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
        this.distractionInput.addEventListener('change', () => this.plugin.scheduleAutosaveLiveSnapshot());

        // Simplify UI in continuous mode if enabled
        if (this.plugin.settings.trackWithoutSession && this.plugin.settings.simplifyContinuousUI) {
            if (this.difficultySectionEl) this.difficultySectionEl.style.display = 'none';
            if (this.notesSectionEl) this.notesSectionEl.style.display = 'none';
        }
        
        distractionButton.onclick = () => this.reportDistraction();

    }

    async updateDailyTime(): Promise<void> {
        if (this.isUpdatingDaily) return;
        this.isUpdatingDaily = true;
        const today = this.plugin.getDateString(new Date());
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
            } else if (this.plugin.sessionsData.liveSession && !this.plugin.sessionsData.liveSession.isBreak && this.plugin.sessionsData.liveSession.date === today) {
                const ls: any = this.plugin.sessionsData.liveSession;
                const sec = typeof ls.durationSec === 'number' ? ls.durationSec : (ls.duration || 0) * 60;
                totalMinutes += Math.floor(sec / 60);
            }

            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            
            // Only empty and recreate elements if they don't exist yet
            if (!this.dailyTimeDisplay.querySelector('.daily-time-total-btn')) {
                this.dailyTimeDisplay.empty();
                const btn = this.dailyTimeDisplay.createEl('button', {
                    text: `Today’s study time: ${hours}h ${minutes}m`,
                    cls: 'daily-time-total-btn'
                });
                btn.onclick = () => { const modal = new LiveAnalyticsModal(this.app, this.plugin); modal.open(); };
                
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
                const totalTimeEl = this.dailyTimeDisplay.querySelector('.daily-time-total-btn');
                if (totalTimeEl) {
                    (totalTimeEl as HTMLButtonElement).textContent = `Today’s study time: ${hours}h ${minutes}m`;
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
                
                // Loop through all categories with goals (live remaining seconds)
                const entries = Object.entries(this.plugin.settings.recurringSessionGoals);
                for (const [category, goal] of entries) {
                    if (!goal.timeGoal) continue; // Skip if no goal set

                    const remainingSec = await this.computeRemainingGoalSeconds(category);
                    const remainingHours = Math.floor(remainingSec / 3600);
                    const remainingMinutes = Math.floor((remainingSec % 3600) / 60);

                    const row = goalsContainer.createEl('div', { cls: 'goal-row' });
                    row.createEl('span', { text: category, cls: 'goal-category' });

                    if (goal.period === 'daily') {
                        row.createEl('span', {
                            text: `${remainingHours}h ${remainingMinutes}m left (daily)`,
                            cls: remainingSec <= 0 ? 'goal-complete' : 'goal-remaining'
                        });
                        if (remainingSec <= 0) row.createEl('span', { text: '✓ Goal reached', cls: 'goal-complete-badge' });
                    } else if (goal.period === 'weekly') {
                        if (this.plugin.settings.prorateWeeklyGoals && daysRemaining > 0) {
                            const dailyTargetSec = Math.floor(remainingSec / daysRemaining);
                            const dHours = Math.floor(dailyTargetSec / 3600);
                            const dMinutes = Math.floor((dailyTargetSec % 3600) / 60);
                            row.createEl('span', {
                                text: `${dHours}h ${dMinutes}m/day (weekly)`,
                                cls: remainingSec <= 0 ? 'goal-complete' : 'goal-remaining'
                            });
                        } else {
                            row.createEl('span', {
                                text: `${remainingHours}h ${remainingMinutes}m left (weekly)`,
                                cls: remainingSec <= 0 ? 'goal-complete' : 'goal-remaining'
                            });
                        }
                        if (remainingSec <= 0) row.createEl('span', { text: '✓ Goal reached', cls: 'goal-complete-badge' });
                    }
                }
            }
        } catch (error) {
            console.error('Error calculating total study time:', error);
            this.dailyTimeDisplay.setText('Today’s study time: Error');
        }
        finally {
            this.isUpdatingDaily = false;
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
                    
                    // Füge die Dauer hinzu (Sekundenpräzision → Stunden)
                    const sec = typeof (session as any).durationSec === 'number' ? (session as any).durationSec : (session.duration || 0) * 60;
                    categoryTimes[session.category] += sec / 3600;
                }
            });
            
            // Füge die Zeit der aktuellen Sitzung hinzu, wenn es keine Break ist (Sekundengenau)
            if (this.plugin.currentSession && !this.plugin.currentSession.isBreak) {
                const category = this.plugin.currentSession.category;
                const sec = this.plugin.currentSession.getDurationSec();
                if (!categoryTimes[category]) categoryTimes[category] = 0;
                categoryTimes[category] += sec / 3600;
            } else if (this.plugin.sessionsData.liveSession && !this.plugin.sessionsData.liveSession.isBreak && this.plugin.sessionsData.liveSession.date === date) {
                const s: any = this.plugin.sessionsData.liveSession;
                const category = s.category;
                const sec = typeof s.durationSec === 'number' ? s.durationSec : (s.duration || 0) * 60;
                if (!categoryTimes[category]) categoryTimes[category] = 0;
                categoryTimes[category] += sec / 3600;
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
        const prev = this.categorySelect?.value;
        this.suppressCategoryChange = true;
        this.categorySelect.empty();
        this.plugin.settings.categories.forEach(cat => {
            if (!this.isBreak || cat === '~Break~') {
                const option = this.categorySelect.createEl('option', { text: cat, value: cat });
                if (cat === '~Break~') option.disabled = !this.isBreak;
            }
        });
        if (prev && this.categorySelect.querySelector(`option[value="${prev}"]`)) {
            this.categorySelect.value = prev;
        } else if (this.categorySelect.options.length>0) {
            // Keep current session category if exists
            const cur = this.plugin.currentSession?.category;
            if (cur && this.categorySelect.querySelector(`option[value="${cur}"]`)) {
                this.categorySelect.value = cur;
            }
        }
        this.suppressCategoryChange = false;
    }

    toggleStopwatchMode(): void {
        this.toggleTimerMode();
    }

    updateTimerDisplay(): void {
        if (this.isStopwatch) {
            const svc = this.plugin.timerService;
            const totalSeconds = Math.floor((svc ? svc.getState().elapsedMs : this.stopwatchElapsed) / 1000);
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
                const svc = this.plugin.timerService;
                const totalSeconds = Math.floor(svc ? svc.getState().goalRemainingSec : this.goalTimeRemaining);
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
                    // Stable end time: round up to the next minute to avoid flicker
                    const minutesUp = Math.ceil(totalSeconds / 60);
                    const endTime = new Date(Date.now() + minutesUp * 60000);
                    const endTimeStr = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    endDisplay += ` - Ends at ${endTimeStr}`;
                }
                
                this.endTimeDisplay.textContent = endDisplay;
            } else {
                this.timerDisplay.textContent = "00:00";
                this.endTimeDisplay.textContent = "No goal set";
            }
        } else {
            // Pomodoro: derive from timerService if present
            const svc = this.plugin.timerService;
            const remaining = svc ? svc.getState().remainingSec : this.timeLeft;
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            this.timerDisplay.textContent = display;

            if (this.isRunning) {
                // Stable end time: round up to next minute from remaining seconds
                const minutesUp = Math.ceil(remaining / 60);
                const endTime = new Date(Date.now() + minutesUp * 60000);
                const endTimeStr = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                this.endTimeDisplay.textContent = `Ends at ${endTimeStr}`;
            } else {
                this.endTimeDisplay.textContent = '';
            }
        }

        if (this.plugin) {
            this.plugin.updateStatusBar(this.timerDisplay.textContent);
        }
        // Keep category goals panel in near real-time sync
        this.throttledGoalUpdate();
    }

    throttledGoalUpdate(): void {
        const now = Date.now();
        if (now - this.lastGoalsUpdateTs >= 1000) {
            this.lastGoalsUpdateTs = now;
            // Fire and forget; updateDailyTime is async
            this.updateDailyTime();
        }
    }

    // Compute remaining goal seconds for a category (daily/weekly) considering past sessions and the current one
    async computeRemainingGoalSeconds(category: string): Promise<number> {
        const goal = this.plugin.settings.recurringSessionGoals[category];
        if (!goal || !goal.timeGoal) return 0;

        const goalSeconds = Math.floor(goal.timeGoal * 3600);
        let spentSeconds = 0;

        if (goal.period === 'daily') {
            const today = this.plugin.getDateString(new Date());
            this.plugin.sessionsData.sessions.forEach(s => {
                if (!s.isBreak && s.date === today && s.category === category) {
                    const sec = typeof (s as any).durationSec === 'number' ? (s as any).durationSec : (s.duration || 0) * 60;
                    spentSeconds += sec;
                }
            });
            if (this.plugin.currentSession && !this.plugin.currentSession.isBreak && this.plugin.currentSession.category === category) {
                spentSeconds += this.plugin.currentSession.getDurationSec();
            } else if (this.plugin.sessionsData.liveSession && !this.plugin.sessionsData.liveSession.isBreak && this.plugin.sessionsData.liveSession.category === category && this.plugin.sessionsData.liveSession.date === today) {
                const ls: any = this.plugin.sessionsData.liveSession;
                const sec = typeof ls.durationSec === 'number' ? ls.durationSec : (ls.duration || 0) * 60;
                spentSeconds += sec;
            }
        } else if (goal.period === 'weekly') {
            // Compute spent time for the current week based on configured weekly start day
            const weekDates = this.plugin.getWeekDates(new Date());
            const inWeek = (ds: string) => weekDates.includes(ds);
            this.plugin.sessionsData.sessions.forEach(s => {
                if (!s.isBreak && s.category === category && inWeek(s.date)) {
                    const sec = typeof (s as any).durationSec === 'number' ? (s as any).durationSec : (s.duration || 0) * 60;
                    spentSeconds += sec;
                }
            });
            // Add live/current if they fall in this week
            if (this.plugin.currentSession && !this.plugin.currentSession.isBreak && this.plugin.currentSession.category === category) {
                const curDate = this.plugin.getDateString(this.plugin.currentSession.startTime);
                if (inWeek(curDate)) spentSeconds += this.plugin.currentSession.getDurationSec();
            } else if (this.plugin.sessionsData.liveSession && !this.plugin.sessionsData.liveSession.isBreak && this.plugin.sessionsData.liveSession.category === category) {
                const ls: any = this.plugin.sessionsData.liveSession;
                if (inWeek(ls.date)) {
                    const sec = typeof ls.durationSec === 'number' ? ls.durationSec : (ls.duration || 0) * 60;
                    spentSeconds += sec;
                }
            }
        }

        return Math.max(0, goalSeconds - spentSeconds);
    }

    // Recompute and sync recurring goal countdown for current category
    async refreshRecurringGoalCountdown(): Promise<void> {
        if (!this.isRecurringSession) return;
        const category = this.categorySelect?.value;
        if (!category) return;
        const remaining = await this.computeRemainingGoalSeconds(category);
        this.goalTimeRemaining = remaining;
        const svc = this.plugin.timerService;
        if (svc) {
            svc.setMode('recurring');
            svc.setRecurringGoalSeconds(remaining);
        }
        this.updateTimerDisplay();
    }

    resetSession(): void {
        if (this.isStopwatch) {
            this.stopwatchElapsed = 0;
        } else if (this.isRecurringSession) {
            const category = this.categorySelect?.value;
            if (category && this.plugin.settings.recurringSessionGoals[category]) {
                // Compute remaining time dynamically
                this.computeRemainingGoalSeconds(category).then(sec => {
                    this.goalTimeRemaining = sec;
                    const svc = this.plugin.timerService;
                    if (svc) { svc.setMode('recurring'); svc.setRecurringGoalSeconds(sec); }
                    this.updateTimerDisplay();
                });
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

        if (this.interval) { clearInterval(this.interval); this.interval = null; }
        const svc = this.plugin.timerService;
        if (svc) {
            let mode: TimerMode = 'pomodoro';
            if (this.isStopwatch) mode = 'stopwatch';
            else if (this.isRecurringSession) mode = 'recurring';
            svc.setMode(mode);
            if (mode === 'pomodoro') svc.setPomodoroSeconds(this.timeLeft);
            if (mode === 'recurring') svc.setRecurringGoalSeconds(this.goalTimeRemaining);
            svc.reset();
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
        if (!this.plugin.sessionService) return;
        this.plugin.sessionService.changeCategory(this as any, newCategory);
    }

    startTimer(): void {
        if (!this.plugin.currentSession) {
            const category = this.categorySelect.value;
            this.plugin.startNewSession(category);
        }

        if (this.plugin.currentSession) {
            this.plugin.currentSession.resume();
        }

        // Configure timer service based on mode
        const svc = this.plugin.timerService;
        if (svc) {
            let mode: TimerMode = 'pomodoro';
            if (this.isStopwatch) mode = 'stopwatch';
            else if (this.isRecurringSession) mode = 'recurring';
            svc.setMode(mode);
            if (mode === 'pomodoro') {
                svc.setPomodoroSeconds(this.timeLeft);
            } else if (mode === 'recurring') {
                // ensure countdown starts from actual remaining time
                // compute synchronously if already computed, else set what we have
                svc.setRecurringGoalSeconds(this.goalTimeRemaining);
            }
            svc.start();
        }

        this.isRunning = true;
        this.startButton.textContent = 'Pause';

        // No local intervals: TimerService drives timing; UI updates via callbacks and the existing minute update.
    }

    breakTimer(): void {
        this.isRunning = false;
        this.startButton.textContent = 'Start';

        if (this.plugin.currentSession) {
            this.plugin.currentSession.break();
        }

        if (this.interval) { window.clearInterval(this.interval); this.interval = null; }

        const svc = this.plugin.timerService;
        if (svc) svc.pause();

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
                    // configure timer service for break interval
                    const svc = this.plugin.timerService;
                    if (svc) {
                        svc.setMode('pomodoro');
                        svc.setPomodoroSeconds(this.timeLeft);
                    }
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
                const svc = this.plugin.timerService;
                if (svc) {
                    svc.setMode('pomodoro');
                    svc.setPomodoroSeconds(this.timeLeft);
                }
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
        modal.titleEl.setText('Add reflection');

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
                
                // Beim Wechsel in den Recurring-Sessions-Modus: verbleibende Zielzeit ermitteln
                if (this.plugin.settings.recurringSessionGoals[currentCategory]) {
                    this.computeRemainingGoalSeconds(currentCategory).then(sec => {
                        this.goalTimeRemaining = sec;
                        const svc = this.plugin.timerService;
                        if (svc) { svc.setMode('recurring'); svc.setRecurringGoalSeconds(sec); }
                        this.updateTimerDisplay();
                        this.updateDailyTime();
                    });
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
        
        // Sync timer service to new mode
        const svc = this.plugin.timerService;
        if (svc) {
            let mode: TimerMode = 'pomodoro';
            if (this.isStopwatch) mode = 'stopwatch';
            else if (this.isRecurringSession) mode = 'recurring';
            svc.setMode(mode);
            if (mode === 'pomodoro') svc.setPomodoroSeconds(this.timeLeft);
            if (mode === 'recurring') svc.setRecurringGoalSeconds(this.goalTimeRemaining);
        }

        this.resetSession();
        this.updateCategorySelect();
        
        // Restore the previously selected category
        if (this.categorySelect.querySelector(`option[value="${currentCategory}"]`)) {
            this.categorySelect.value = currentCategory;
            if (this.isRecurringSession) {
                // If in recurring sessions mode, update goal display and sync timer
                this.refreshRecurringGoalCountdown();
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

        // Time Zone
        new Setting(containerEl).setName('Time Zone').setHeading();
        new Setting(containerEl)
          .setName('Mode')
          .setDesc('Use system, UTC, or a fixed UTC offset for date calculations')
          .addDropdown(d => d
            .addOption('system', 'System default')
            .addOption('utc', 'UTC')
            .addOption('fixed', 'Fixed offset')
            .setValue(this.plugin.settings.timeZoneMode || 'system')
            .onChange(async (v) => { this.plugin.settings.timeZoneMode = v as any; await this.plugin.saveSettings(); }));
        new Setting(containerEl)
          .setName('Fixed offset (e.g., +02:00 or -0530)')
          .setDesc('Only applies when mode is Fixed offset')
          .addText(t => t
            .setPlaceholder('+02:00')
            .setValue(this.formatOffset(this.plugin.settings.timeZoneOffsetMinutes || 0))
            .onChange(async (value) => {
              const mins = this.parseOffsetToMinutes(value);
              if (mins !== null) {
                this.plugin.settings.timeZoneOffsetMinutes = mins;
                await this.plugin.saveSettings();
              }
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

        // Live Analytics
        new Setting(containerEl).setName('Live Analytics').setHeading();
        new Setting(containerEl)
            .setName('Chart categories (max 2)')
            .setDesc('Comma-separated category names to display in the live analytics bar chart')
            .addText(t => t
                .setPlaceholder('e.g., Study, Work')
                .setValue((this.plugin.settings.liveAnalyticsCategories || []).join(', '))
                .onChange(async (value) => {
                    const parts = value.split(',').map(s => s.trim()).filter(Boolean);
                    this.plugin.settings.liveAnalyticsCategories = parts.slice(0, 2);
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName('Include tags in live analytics')
            .setDesc('Show tracked tag breakdown when enabled and tags are configured')
            .addToggle(t => t
                .setValue(this.plugin.settings.liveAnalyticsIncludeTags || false)
                .onChange(async (v) => { this.plugin.settings.liveAnalyticsIncludeTags = v; await this.plugin.saveSettings(); }));

        // Restore on startup (prompt)
        new Setting(containerEl)
            .setName('Offer restore on startup')
            .setDesc('If a previous session was not ended, offer to restore it on startup')
            .addToggle(t => t
                .setValue(this.plugin.settings.promptRestoreOnAbruptExit || false)
                .onChange(async (v) => {
                    this.plugin.settings.promptRestoreOnAbruptExit = v;
                    await this.plugin.saveSettings();
                }));

        // Intervals
        new Setting(containerEl).setName('Intervals').setHeading();
        new Setting(containerEl)
            .setName('Autosave interval (sec)')
            .setDesc('How often to persist a live snapshot of the running session')
            .addText(t => t
                .setValue(String(this.plugin.settings.autosaveIntervalSec || 10))
                .onChange(async (v) => { const n = parseInt(v)||10; this.plugin.settings.autosaveIntervalSec = n; await this.plugin.saveSettings(); }));
        new Setting(containerEl)
            .setName('JSON poll interval (sec)')
            .setDesc('How often to check the sessions JSON file for changes')
            .addText(t => t
                .setValue(String(this.plugin.settings.jsonPollIntervalSec || 10))
                .onChange(async (v) => { const n = parseInt(v)||10; this.plugin.settings.jsonPollIntervalSec = n; await this.plugin.saveSettings(); }));
        new Setting(containerEl)
            .setName('Live analytics refresh (sec)')
            .setDesc('How often the live analytics modal refreshes')
            .addText(t => t
                .setValue(String(this.plugin.settings.liveAnalyticsRefreshSec || 1))
                .onChange(async (v) => { const n = Math.max(1, parseInt(v)||1); this.plugin.settings.liveAnalyticsRefreshSec = n; await this.plugin.saveSettings(); }));

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

            if (category !== '~Break~') {
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
            .setName('Notes folder')
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

        new Setting(containerEl).setName('UI').setHeading();

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

        new Setting(containerEl).setName('Tracking').setHeading();

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
                
        new Setting(containerEl).setName('Analytics').setHeading();

        new Setting(containerEl)
            .setName('Track tagged notes')
            .setDesc('Track notes with specific tags in summaries')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.trackTaggedNotes)
                .onChange(async (value) => {
                    this.plugin.settings.trackTaggedNotes = value;
                    await this.plugin.saveSettings();
                }));

        if (this.plugin.settings.trackTaggedNotes) {
            new Setting(containerEl)
                .setName('Include tag breakdown in daily summary')
                .setDesc('Adds created/modified note lists per tracked tag to daily summaries')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.showTagStatsInDaily || false)
                    .onChange(async (value) => {
                        this.plugin.settings.showTagStatsInDaily = value;
                        await this.plugin.saveSettings();
                    }));
        }

        new Setting(containerEl).setName('Automation').setHeading();

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
            .setName('Track without sessions (continuous)')
            .setDesc('Tracks continuously while Obsidian is open (caps at 23:59). Hides New/End; Start acts as Pause/Resume.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.trackWithoutSession)
                .onChange(async (value) => {
                    this.plugin.settings.trackWithoutSession = value;
                    await this.plugin.saveSettings();
                    new Notice('Tracking mode updated');
                }));

        new Setting(containerEl)
            .setName('Simplify UI in continuous mode')
            .setDesc('Hide difficulty and notes sections while continuous tracking is enabled')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.simplifyContinuousUI || false)
                .onChange(async (value) => {
                    this.plugin.settings.simplifyContinuousUI = value;
                    await this.plugin.saveSettings();
                    const view = this.plugin.getStudyFlowView();
                    if (view && this.plugin.settings.trackWithoutSession) {
                        if (view.difficultySectionEl) view.difficultySectionEl.style.display = value ? 'none' : '';
                        if (view.notesSectionEl) view.notesSectionEl.style.display = value ? 'none' : '';
                    }
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
            new Setting(containerEl).setName('Folder–category mappings').setHeading();
            
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
                .setName('Add folder–category mapping')
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
        new Setting(containerEl).setName('Tags to track').setHeading();
        
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
                            view.stopwatchToggle.textContent = 'Switch to stopwatch';
                            view.resetSession();
                        }
                    }
                    
                    // Refresh the settings panel to show/hide recurring goals settings
                    this.display();
                }));

        // Only show recurring goal settings if enabled
        if (this.plugin.settings.enableRecurringSessions) {
            new Setting(containerEl)
            .setName('Prorate weekly goals')
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

            new Setting(containerEl).setName('Recurring goals').setHeading();
            
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

    private parseOffsetToMinutes(val: string): number | null {
        const s = val.trim();
        if (!s) return 0;
        const m = s.match(/^([+-]?)(\d{1,2})(?::?(\d{2}))?$/);
        if (!m) return null;
        const sign = m[1] === '-' ? -1 : 1;
        const hh = parseInt(m[2],10);
        const mm = m[3] ? parseInt(m[3],10) : 0;
        if (hh>14 || mm>59) return null;
        return sign * (hh*60 + mm);
    }
    private formatOffset(mins: number): string {
        const sign = mins<0 ? '-' : '+';
        const m = Math.abs(mins);
        const hh = Math.floor(m/60).toString().padStart(2,'0');
        const mm = (m%60).toString().padStart(2,'0');
        return `${sign}${hh}:${mm}`;
    }
}

export default class StudyAnalyticsPlugin extends Plugin {
    settings: StudyAnalyticsSettings;
    currentSession: StudySession | null = null;
    statusBarItem: HTMLElement;
    sessionsData: SessionsData = { sessions: [], lastUpdated: new Date().toISOString() };
    sessionsFilePath: string = '';
    timerService: TimerService | null = null;
    trackingService: TrackingService | null = null;
    schedulerService: SchedulerService | null = null;
    analyticsService: AnalyticsService | null = null;
    summaryService: SummaryService | null = null;
    sessionService: SessionService | null = null;
    tagIndexService: TagIndexService | null = null;
    private liveAutosaveTimer: number | null = null;
    private sessionsPollIntervalId: number | null = null;
    debugEnabled: boolean = false;
    private lastDebugTick: number = 0;

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

        // Initialize services
        this.timerService = new TimerService({
            pomodoroSec: this.settings.pomodoroTime * 60,
            shortBreakSec: this.settings.shortBreakTime * 60,
            longBreakSec: this.settings.longBreakTime * 60,
            longBreakInterval: this.settings.longBreakInterval,
        }, 'pomodoro', {
            onTick: () => {
                const view = this.getStudyFlowView();
                view?.updateTimerDisplay();
                // Also keep the goals panel in sync while ticking
                view?.throttledGoalUpdate();
                // Optional debug tick (throttled)
                if (this.debugEnabled) {
                    const now = Date.now();
                    if (now - this.lastDebugTick > 1000) {
                        this.lastDebugTick = now;
                        try {
                            const st = this.timerService!.getState();
                            console.debug('[SA] tick', { mode: st.mode, remainingSec: st.remainingSec, goalRemainingSec: st.goalRemainingSec, elapsedMs: st.elapsedMs, isRunning: st.isRunning });
                        } catch {}
                    }
                }
            },
            onComplete: () => {
                const view = this.getStudyFlowView();
                if (view) view.completeTimer();
            }
        });

        this.trackingService = new TrackingService(this);
        this.schedulerService = new SchedulerService(this);
        this.analyticsService = new AnalyticsService(this);
        this.summaryService = new SummaryService(this);
        this.sessionService = new SessionService(this);
        this.tagIndexService = new TagIndexService(this);

        // Register view
        this.registerView(
            VIEW_TYPE_STUDY_FLOW,
            (leaf) => new StudyFlowView(leaf, this)
        );
        
        // Automatically open the sidebar on startup
        this.app.workspace.onLayoutReady(async () => {
            this.activateView();
            this.checkWeeklySummary();
            // Avoid auto-tracking session if a snapshot exists; let resume handle it
            if (!this.sessionsData.liveSession) {
                this.startAutoTracking();
            }
            // Optional: offer restore if an unfinished snapshot exists
            if (this.settings.promptRestoreOnAbruptExit && this.sessionsData.liveSession && !this.currentSession) {
                const modal = new LiveSessionResumeModal(this.app, this);
                modal.open();
            }
            // Ensure daily time and goals reflect loaded sessions immediately
            const view = this.getStudyFlowView();
            if (view) {
                view.updateDailyTime();
                view.refreshRecurringGoalCountdown().catch(()=>{});
            }
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

        // Register tracking events via service
        this.trackingService.register();
        // Register tag index caching
        await this.tagIndexService.register();

        // Kick off frequent live autosave to persist running session state
        this.registerInterval(
            window.setInterval(() => this.autosaveLiveSessionSnapshot().catch(() => {}), (this.settings.autosaveIntervalSec||10)*1000)
        );

        // Periodically poll sessions data file for external updates
        this.registerInterval(
            window.setInterval(() => this.pollSessionsDataFromDisk().catch(() => {}), (this.settings.jsonPollIntervalSec||10)*1000)
        );

        // Initialize debug flag (env or file)
        await this.updateDebugEnabled();

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
            callback: () => this.createDailySummaryUsingServices()
        });

        this.addCommand({
            id: 'create-weekly-summary',
            name: 'Create weekly study summary',
            callback: () => this.createWeeklySummaryUsingServices()
        });

        // Command to toggle timer state
        this.addCommand({
            id: 'toggle-timer',
            name: 'Toggle timer (start/pause)',
            callback: () => {
                const view = this.getStudyFlowView();
                if (view) {
                    view.toggleTimer();
                }
            }
        });
        
        // Register scheduler
        this.schedulerService.register();
        
        // Start auto tracking if enabled or continuous mode is enabled
        if (this.settings.autoTrackSessionOnStartup || this.settings.trackWithoutSession) {
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
        const view = this.getStudyFlowView();
        if (view) {
            // Keep UI and timers in sync with changed settings
            view.updateCategorySelect();
            view.updateTimerDisplay();
            view.updateDailyTime();
            await view.refreshRecurringGoalCountdown();
        }
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

            // Clear any live snapshot now that the session is finalized
            if (this.sessionsData.liveSession) {
                delete this.sessionsData.liveSession;
                await this.saveSessionsData();
            }

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
            
            // Normalize date using plugin time-zone settings
            try { sessionData.date = this.getDateString(new Date(sessionData.startTime)); } catch {}

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

    // Periodically persist the current session state (notes, duration, etc.) to avoid data loss
    async autosaveLiveSessionSnapshot(): Promise<void> {
        try {
            // If no session running, clear existing live snapshot if present
            if (!this.currentSession) {
                if (this.sessionsData.liveSession) {
                    delete this.sessionsData.liveSession;
                    this.sessionsData.lastUpdated = new Date().toISOString();
                    await this.saveSessionsData();
                }
                return;
            }

            // Pull the latest notes/difficulty from the view if available
            const view = this.getStudyFlowView();
            if (view) {
                this.currentSession.notes = view.notesArea.value || '';
                if (this.settings.showDifficulty && view.difficultySlider) {
                    const val = parseInt(view.difficultySlider.value);
                    if (!Number.isNaN(val)) this.currentSession.difficulty = val;
                }
            }

            // Create a snapshot of the running session without finalizing it
            const snapshot: SessionData = {
                category: this.currentSession.category,
                startTime: this.currentSession.startTime,
                duration: this.currentSession.getDuration(),
                durationSec: this.currentSession.getDurationSec(),
                pomodoros: this.currentSession.pomodorosCompleted,
                difficulty: this.currentSession.difficulty,
                notes: this.currentSession.notes,
                distractions: this.currentSession.distractions,
                lineNotes: this.currentSession.lineNotes,
                modifiedFiles: Array.from(this.currentSession.modifiedFiles),
                openedFiles: Array.from(this.currentSession.openedFiles),
                createdFiles: Array.from(this.currentSession.createdFiles),
                completedTasks: this.currentSession.completedTasks,
                reflections: this.currentSession.reflections,
                date: this.getDateString(this.currentSession.startTime),
                completed: false,
                isBreak: this.currentSession.isBreak,
                breakDuration: Math.round(this.currentSession.totalBreakDuration / 60000),
                wordCount: this.currentSession.wordCount,
                createdLinks: Array.from(this.currentSession.createdLinks),
                id: this.currentSession.id,
            };

            this.sessionsData.liveSession = snapshot;
            this.sessionsData.lastUpdated = new Date().toISOString();
            await this.saveSessionsData();
        } catch (e) {
            console.error('Autosave live session failed', e);
        }
    }

    // Debounced autosave trigger (e.g., from notes input)
    scheduleAutosaveLiveSnapshot(delayMs = 1500) {
        if (this.liveAutosaveTimer) window.clearTimeout(this.liveAutosaveTimer);
        this.liveAutosaveTimer = window.setTimeout(() => {
            this.autosaveLiveSessionSnapshot();
        }, delayMs);
    }

    async createDailySummary(date?: string) {
        // New service-based implementation
        return await this.createDailySummaryUsingServices(date);
        // Legacy code below is kept for now but never executed
        // It will be removed after full migration is validated
        const summaryDate = date || this.getDateString(new Date());
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

            // Determine created/modified notes (markdown files only)
            const createdNotesList = Array.from(createdFiles).filter(f => f.endsWith('.md'));
            const modifiedNotesList = Array.from(modifiedFiles).filter(f => f.endsWith('.md'));

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
            summaryContent += `Created notes:: ${createdNotesList.length}\n`;
            summaryContent += `Modified notes:: ${modifiedNotesList.length}\n\n`;

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

            // Created Notes Overview (Markdown only)
            if (createdNotesList.length > 0) {
                summaryContent += `## 📔 Created Notes\n`;
                createdNotesList.forEach(file => {
                    summaryContent += `- [[${file}|${file.split('/').pop()}]]\n`;
                });
                summaryContent += '\n';
            }
            
            // Modified Notes Overview (Markdown only)
            if (modifiedNotesList.length > 0) {
                summaryContent += `## ✏️ Modified Notes\n`;
                modifiedNotesList.forEach(file => {
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

            // Tracked tags breakdown (optional)
            if (this.settings.trackTaggedNotes && (this.settings.showTagStatsInDaily || false) && this.settings.tagsToTrack && this.settings.tagsToTrack.length > 0) {
                const createdByTag: Record<string, string[]> = {};
                const modifiedByTag: Record<string, string[]> = {};
                this.settings.tagsToTrack.forEach(tag => { createdByTag[tag] = []; modifiedByTag[tag] = []; });

                const appendByTags = (files: string[], target: Record<string, string[]>) => {
                    for (const file of files) {
                        const tfile = this.app.vault.getAbstractFileByPath(file);
                        if (tfile instanceof TFile) {
                            const cache = this.app.metadataCache.getFileCache(tfile as TFile);
                            if (cache && cache.tags) {
                                const fileTags = cache.tags.map(t => t.tag);
                                for (const tag of this.settings.tagsToTrack) {
                                    if (fileTags.includes(tag)) {
                                        target[tag].push(file);
                                    }
                                }
                            }
                        }
                    }
                };

                appendByTags(createdNotesList, createdByTag);
                appendByTags(modifiedNotesList, modifiedByTag);

                summaryContent += `## 🏷️ Tracked Tags (Daily)\n`;
                for (const tag of this.settings.tagsToTrack) {
                    const created = createdByTag[tag] || [];
                    const modified = modifiedByTag[tag] || [];
                    summaryContent += `### ${tag} — Created: ${created.length}, Modified: ${modified.length}\n`;
                    if (created.length > 0) {
                        summaryContent += `- Created:\n`;
                        created.forEach(f => summaryContent += `  - [[${f}|${f.split('/').pop()}]]\n`);
                    }
                    if (modified.length > 0) {
                        summaryContent += `- Modified:\n`;
                        modified.forEach(f => summaryContent += `  - [[${f}|${f.split('/').pop()}]]\n`);
                    }
                    if (created.length === 0 && modified.length === 0) {
                        summaryContent += `- No notes with this tag changed today\n`;
                    }
                    summaryContent += `\n`;
                }
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
        // New service-based implementation
        return await this.createWeeklySummaryUsingServices();
        // Legacy code below is kept for now but never executed
        // It will be removed after full migration is validated
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
                weekDates.push(this.getDateString(currentDate));
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
                                    const cache = this.app.metadataCache.getFileCache(tfile as TFile);
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
            const mondayStr = this.getDateString(monday);
            const sundayStr = this.getDateString(sunday);
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
    
    // Time zone helpers
    getDateString(d: Date): string {
        const mode = this.settings.timeZoneMode || 'system';
        if (mode === 'system') {
            const y = d.getFullYear();
            const m = (d.getMonth()+1).toString().padStart(2,'0');
            const day = d.getDate().toString().padStart(2,'0');
            return `${y}-${m}-${day}`;
        } else if (mode === 'utc') {
            return d.toISOString().slice(0,10);
        } else {
            const off = this.settings.timeZoneOffsetMinutes || 0; // minutes from UTC
            const shifted = new Date(d.getTime() + off*60000);
            return shifted.toISOString().slice(0,10);
        }
    }
    getDayOfWeek(d: Date): number {
        const mode = this.settings.timeZoneMode || 'system';
        if (mode === 'system') return d.getDay();
        if (mode === 'utc') return d.getUTCDay();
        const off = this.settings.timeZoneOffsetMinutes || 0;
        const shifted = new Date(d.getTime() + off*60000);
        return shifted.getUTCDay();
    }
    getWeekDates(baseDate?: Date): string[] {
        const d = baseDate ? new Date(baseDate) : new Date();
        const startDow = this.settings.weeklySummaryDay ?? 0;
        const curDow = this.getDayOfWeek(d);
        const diff = (curDow - startDow + 7) % 7;
        const start = new Date(d);
        start.setDate(d.getDate() - diff);
        start.setHours(0,0,0,0);
        const out: string[] = [];
        for (let i=0;i<7;i++) {
            const nd = new Date(start);
            nd.setDate(start.getDate()+i);
            out.push(this.getDateString(nd));
        }
        return out;
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
        if (!this.currentSession && (this.settings.autoTrackSessionOnStartup || this.settings.trackWithoutSession)) {
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
            const todayStr = this.getDateString(now);
            
            if (lastWeeklySummaryDate !== todayStr) {
                // Create the weekly summary
                await this.createWeeklySummaryUsingServices();
                
                // Update the last summary date
                this.settings.lastWeeklySummary = todayStr;
                await this.saveSettings();
            }
        }
    }

    async onunload() {
        // Ensure any running session is saved on unload
        if (this.currentSession) {
            try {
                const view = this.getStudyFlowView();
                if (view) {
                    this.currentSession.notes = view.notesArea.value;
                    if (this.settings.showDifficulty) {
                        this.currentSession.difficulty = parseInt(view.difficultySlider.value);
                    }
                }
                const data = this.currentSession.end();
                await this.saveSessionToFile(data);
                this.currentSession = null;
            } catch (e) {
                console.error('Error saving session on unload', e);
            }
        }

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
                    // Normalize date to plugin date string (handles UTC/system/fixed)
                    try { (session as any).date = this.getDateString(new Date(session.startTime)); } catch {}
                    // ensure durationSec exists for precision
                    if (typeof (session as any).durationSec !== 'number') {
                        (session as any).durationSec = (session.duration || 0) * 60;
                    }
                    
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
                // Revive liveSession dates if present
                if (this.sessionsData.liveSession) {
                    const s = this.sessionsData.liveSession as any;
                    s.startTime = new Date(s.startTime);
                    try { s.date = this.getDateString(new Date(s.startTime)); } catch {}
                    if (typeof s.durationSec !== 'number') s.durationSec = (s.duration || 0) * 60;
                    if (Array.isArray(s.distractions)) s.distractions.forEach((d: any) => d.time = new Date(d.time));
                    if (Array.isArray(s.lineNotes)) s.lineNotes.forEach((n: any) => n.time = new Date(n.time));
                    if (Array.isArray(s.reflections)) s.reflections.forEach((r: any) => r.time = new Date(r.time));
                    if (Array.isArray(s.completedTasks)) s.completedTasks.forEach((t: any) => t.time = new Date(t.time));
                }
            }
        } catch (error) {
            console.error("Error loading sessions data:", error);
            new Notice("Error loading sessions data");
            // Initialize with empty data if there was an error
            this.sessionsData = { sessions: [], lastUpdated: new Date().toISOString() };
        }
    }

    // Poll the sessions JSON on disk and update in-memory + UI if it changed elsewhere
    private async pollSessionsDataFromDisk(): Promise<void> {
        try {
            if (!(await this.app.vault.adapter.exists(this.sessionsFilePath))) return;
            const raw = await this.app.vault.adapter.read(this.sessionsFilePath);
            const incoming = JSON.parse(raw) as SessionsData;
            if (!incoming || !incoming.lastUpdated) return;
            if (incoming.lastUpdated === this.sessionsData.lastUpdated) return;
            // Prepare and adopt new data (reuse conversion logic)
            const prevLive = this.sessionsData.liveSession;
            this.sessionsData = incoming;
            // revive types similar to loadSessionsData
            this.sessionsData.sessions.forEach((s: any) => {
                s.startTime = new Date(s.startTime);
                try { s.date = this.getDateString(new Date(s.startTime)); } catch {}
                if (typeof s.durationSec !== 'number') s.durationSec = (s.duration || 0) * 60;
                if (Array.isArray(s.distractions)) s.distractions.forEach((d: any) => d.time = new Date(d.time));
                if (Array.isArray(s.lineNotes)) s.lineNotes.forEach((n: any) => n.time = new Date(n.time));
                if (Array.isArray(s.reflections)) s.reflections.forEach((r: any) => r.time = new Date(r.time));
                if (Array.isArray(s.completedTasks)) s.completedTasks.forEach((t: any) => t.time = new Date(t.time));
            });
            if (this.sessionsData.liveSession) {
                const ls: any = this.sessionsData.liveSession;
                ls.startTime = new Date(ls.startTime);
                try { ls.date = this.getDateString(new Date(ls.startTime)); } catch {}
                if (typeof ls.durationSec !== 'number') ls.durationSec = (ls.duration || 0) * 60;
                if (Array.isArray(ls.distractions)) ls.distractions.forEach((d: any) => d.time = new Date(d.time));
                if (Array.isArray(ls.lineNotes)) ls.lineNotes.forEach((n: any) => n.time = new Date(n.time));
                if (Array.isArray(ls.reflections)) ls.reflections.forEach((r: any) => r.time = new Date(r.time));
                if (Array.isArray(ls.completedTasks)) ls.completedTasks.forEach((t: any) => t.time = new Date(t.time));
            }
            if (this.debugEnabled) console.debug('[SA] sessions reloaded from disk', { lastUpdated: this.sessionsData.lastUpdated, count: this.sessionsData.sessions.length });
            // Update current view (goals/timers) based on fresh data
            const view = this.getStudyFlowView();
            if (view) {
                await view.updateDailyTime();
                await view.refreshRecurringGoalCountdown();
                view.updateTimerDisplay();
            }
            // Also update debug flag from file (allows CLI toggle by touching a file)
            await this.updateDebugEnabled();
        } catch (e) {
            console.warn('pollSessionsDataFromDisk failed', e);
        }
    }

    // Update debugEnabled from environment or a special file in notesFolder
    private async updateDebugEnabled() {
        try {
            // Env variable preferred
            const envFlag = (typeof process !== 'undefined' && (process as any)?.env) ? (((process as any).env.STUDY_ANALYTICS_DEBUG === '1') || ((process as any).env.OBSIDIAN_STUDY_ANALYTICS_DEBUG === '1')) : false;
            let fileFlag = false;
            try {
                const flagPath = `${this.settings.notesFolder}/.study-analytics-debug`;
                fileFlag = await this.app.vault.adapter.exists(flagPath);
            } catch {}
            const newVal = !!(envFlag || fileFlag);
            if (newVal !== this.debugEnabled) {
                this.debugEnabled = newVal;
                console.info('[SA] Debug mode', newVal ? 'ENABLED' : 'DISABLED');
            }
        } catch {}
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

    // New service-based daily summary
    async createDailySummaryUsingServices(date?: string) {
        const summaryDate = date || this.getDateString(new Date());
        const summaryFileName = `${summaryDate}_daily_summary.md`;
        const summaryFilePath = `${this.settings.notesFolder}/${summaryFileName}`;
        try {
            const daily = this.analyticsService.computeDaily(summaryDate);
            if (daily.noData) {
                new Notice(`No study sessions found for ${summaryDate}`);
                return null;
            }
            const content = this.summaryService.renderDaily(daily);
            if (!(await this.app.vault.adapter.exists(this.settings.notesFolder))) {
                await this.app.vault.createFolder(this.settings.notesFolder);
            }
            await this.app.vault.adapter.write(summaryFilePath, content);
            new Notice(`Daily summary for ${summaryDate} created`);
            return {
                studySessions: daily.studySessions,
                breakSessions: daily.breakSessions,
                totalStudyTime: daily.totalStudyTime,
                totalBreakTime: daily.totalBreakTime,
                totalPomodoros: daily.totalPomodoros,
                totalDistractions: daily.totalDistractions,
                totalTasks: daily.totalTasks,
                totalWordCount: daily.totalWordCount,
                avgDifficulty: daily.avgDifficulty,
                modifiedFiles: Array.from(daily.modifiedFiles),
                openedFiles: Array.from(daily.openedFiles),
                createdFiles: Array.from(daily.createdFiles),
                createdLinks: Array.from(daily.createdLinks),
                createdNotes: daily.createdNotes,
                modifiedNotes: daily.modifiedNotes,
            };
        } catch (error) {
            console.error('Error creating daily summary:', error);
            new Notice('Error creating daily summary');
            return null;
        }
    }

    // New service-based weekly summary
    async createWeeklySummaryUsingServices() {
        try {
            const now = new Date();
            // derive week start using settings
            const weekDates = this.getWeekDates(now);
            const startStr = weekDates[0];
            const monday = new Date(startStr + 'T00:00:00Z');
            const weekly = this.analyticsService.computeWeekly(monday);
            const content = this.summaryService.renderWeekly(weekly);
            const weeklyFileName = `${weekly.rangeStart}_weekly_summary.md`;
            const weeklyFilePath = `${this.settings.notesFolder}/${weeklyFileName}`;
            if (!(await this.app.vault.adapter.exists(this.settings.notesFolder))) {
                await this.app.vault.createFolder(this.settings.notesFolder);
            }
            await this.app.vault.adapter.write(weeklyFilePath, content);
            new Notice('Weekly summary created successfully!');
        } catch (error) {
            console.error('Error creating weekly summary:', error);
            new Notice('Error creating weekly summary');
        }
    }
}

class LiveAnalyticsModal extends Modal {
    plugin: StudyAnalyticsPlugin;
    intervalId: number | null = null;
    period: 'day' | 'week' | 'month' = 'day';
    anchorDate: string = '';
    contentRoot!: HTMLElement;
    chartRoot!: HTMLElement;
    statsRoot!: HTMLElement;
    detailsRoot!: HTMLElement;
    periodCatRoot!: HTMLElement;
    selectedDate: string | null = null;

    constructor(app: App, plugin: StudyAnalyticsPlugin) {
        super(app);
        this.plugin = plugin;
        this.anchorDate = this.plugin.getDateString(new Date());
    }

    onOpen() {
        this.titleEl.setText('Live Analytics');
        const { contentEl } = this;
        contentEl.empty();

        // Controls
        const controls = contentEl.createEl('div', { cls: 'live-analytics-controls' });
        const periodSelect = controls.createEl('select');
        ;(['day','week','month'] as const).forEach(p => {
            const opt = periodSelect.createEl('option', { text: p.toUpperCase(), value: p });
            if (p === this.period) opt.selected = true;
        });
        periodSelect.onchange = () => {
            this.period = periodSelect.value as any;
            this.render();
        };
        const dateInput = controls.createEl('input', { type: 'date', value: this.anchorDate });
        dateInput.onchange = () => { this.anchorDate = dateInput.value || this.anchorDate; this.render(); };
        const hint = controls.createEl('div', { text: 'Select period and date. Updates in real time.', cls: 'live-analytics-hint' });
        const exportBtn = controls.createEl('button', { text: 'Export CSV', cls: 'live-export-button' });
        exportBtn.onclick = () => { this.exportCsv().catch(e=>console.error(e)); };

        this.statsRoot = contentEl.createEl('div', { cls: 'live-analytics-stats' });
        this.chartRoot = contentEl.createEl('div', { cls: 'live-analytics-chart' });
        this.periodCatRoot = contentEl.createEl('div', { cls: 'live-analytics-catdist' });
        this.detailsRoot = contentEl.createEl('div', { cls: 'live-analytics-details' });

        this.render();
        const hz = Math.max(1, this.plugin.settings.liveAnalyticsRefreshSec || 1);
        this.intervalId = window.setInterval(() => this.render(), hz * 1000);
    }

    onClose() {
        if (this.intervalId) { window.clearInterval(this.intervalId); this.intervalId = null; }
    }

    private getDatesForPeriod(): string[] {
        // Build dates using plugin helpers (time-zone aware)
        if (!this.anchorDate) this.anchorDate = this.plugin.getDateString(new Date());
        if (this.period === 'day') return [this.anchorDate];

        // Local noon anchor to avoid DST/offset issues
        const [ay, am, ad] = this.anchorDate.split('-').map(n=>parseInt(n,10));
        const anchorLocal = new Date(ay, (am||1)-1, ad||1, 12, 0, 0, 0);

        if (this.period === 'week') {
            return this.plugin.getWeekDates(anchorLocal);
        }
        // month (generate dates from first to first of next month)
        const first = new Date(anchorLocal.getFullYear(), anchorLocal.getMonth(), 1, 12, 0, 0, 0);
        const nextMonth = new Date(anchorLocal.getFullYear(), anchorLocal.getMonth()+1, 1, 12, 0, 0, 0);
        const out: string[] = [];
        for (let cur = new Date(first); cur < nextMonth; cur = new Date(cur.getTime()+86400000)) {
            out.push(this.plugin.getDateString(cur));
        }
        return out;
    }

    private augmentDaily(d: any, date: string) {
        // Add live snapshot/current session to daily if applicable
        const today = this.plugin.getDateString(new Date());
        const live = this.plugin.sessionsData.liveSession as any;
        // If the selected day matches live snapshot and there is no current session with same date
        if (live && live.date === date) {
            const sec = typeof live.durationSec === 'number' ? live.durationSec : (live.duration || 0) * 60;
            d.totalStudyTime += Math.floor(sec/60);
            d.totalWordCount += live.wordCount || 0;
            d.totalDistractions += (live.distractions?.length || 0);
            d.totalTasks += (live.completedTasks?.length || 0);
        }
        if (this.plugin.currentSession && !this.plugin.currentSession.isBreak && date === today) {
            d.totalStudyTime += this.plugin.currentSession.getDuration();
            d.totalWordCount += this.plugin.currentSession.wordCount || 0;
            d.totalDistractions += this.plugin.currentSession.distractions.length;
            d.totalTasks += this.plugin.currentSession.completedTasks.length;
        }
    }

    private render() {
        const dates = this.getDatesForPeriod();
        if (!this.selectedDate || !dates.includes(this.selectedDate)) {
            this.selectedDate = dates.includes(this.anchorDate) ? this.anchorDate : dates[dates.length-1];
        }
        // Aggregate
        let study=0, brk=0, pom=0, dis=0, tasks=0, words=0, created=0, modified=0;
        const perDayCategory: Record<string, Record<string, number>> = {}; // date -> cat -> minutes
        const cats = (this.plugin.settings.liveAnalyticsCategories || []).slice(0,2);
        dates.forEach(date => {
            const daily = this.plugin.analyticsService!.computeDaily(date);
            this.augmentDaily(daily, date);
            study += daily.totalStudyTime;
            brk += daily.totalBreakTime;
            pom += daily.totalPomodoros;
            dis += daily.totalDistractions;
            tasks += daily.totalTasks;
            words += daily.totalWordCount;
            created += daily.createdNotes.length;
            modified += daily.modifiedNotes.length;
            // per category (selected ones)
            const perCat: Record<string, number> = {};
            cats.forEach(c => perCat[c] = 0);
            // from sessions
            this.plugin.sessionsData.sessions.forEach(s => {
                if (!s.isBreak && s.date === date && cats.includes(s.category)) {
                    perCat[s.category] += s.duration;
                }
            });
            // live/current
            const live = this.plugin.sessionsData.liveSession as any;
            if (live && live.date === date && cats.includes(live.category) && !this.plugin.currentSession) {
                perCat[live.category] += Math.floor(((typeof live.durationSec === 'number' ? live.durationSec : (live.duration||0)*60))/60);
            }
            if (this.plugin.currentSession && !this.plugin.currentSession.isBreak) {
                const curDate = this.plugin.getDateString(this.plugin.currentSession.startTime);
                if (curDate === date && cats.includes(this.plugin.currentSession.category)) {
                    perCat[this.plugin.currentSession.category] += this.plugin.currentSession.getDuration();
                }
            }
            perDayCategory[date] = perCat;
        });

        // Render stats
        const sH = Math.floor(study/60), sM = study%60;
        const bH = Math.floor(brk/60), bM = brk%60;
        const tH = Math.floor((study+brk)/60), tM = (study+brk)%60;
        this.statsRoot.empty();
        this.statsRoot.createEl('div', { text: `Study: ${sH}h ${sM}m • Break: ${bH}h ${bM}m • Total: ${tH}h ${tM}m` });
        this.statsRoot.createEl('div', { text: `Pomodoros: ${pom} • Distractions: ${dis} • Tasks: ${tasks} • Words: ${words}` });
        this.statsRoot.createEl('div', { text: `Created notes: ${created} • Modified notes: ${modified}` });

        // Optional tags breakdown across the selected period
        if (this.plugin.settings.liveAnalyticsIncludeTags && this.plugin.settings.trackTaggedNotes && (this.plugin.settings.tagsToTrack||[]).length) {
            const idx = this.plugin.tagIndexService;
            const tagCounts: Record<string, {created:number, modified:number}> = {};
            this.plugin.settings.tagsToTrack.forEach(t=> tagCounts[t] = {created:0, modified:0});
            dates.forEach(date => {
                const daily = this.plugin.analyticsService!.computeDaily(date);
                const createdMd = daily.createdNotes;
                const modifiedMd = daily.modifiedNotes;
                createdMd.forEach(f => {
                    for (const tag of this.plugin.settings.tagsToTrack) {
                        const set = idx?.getFilesForTag(tag);
                        if (set && set.has(f)) tagCounts[tag].created++;
                    }
                });
                modifiedMd.forEach(f => {
                    for (const tag of this.plugin.settings.tagsToTrack) {
                        const set = idx?.getFilesForTag(tag);
                        if (set && set.has(f)) tagCounts[tag].modified++;
                    }
                });
            });
            const wrap = this.statsRoot.createEl('div', { cls: 'tag-breakdown' });
            wrap.createEl('div', { text: 'Tracked tags (period):' });
            const ul = wrap.createEl('ul');
            for (const tag of this.plugin.settings.tagsToTrack) {
                const c = tagCounts[tag] || {created:0, modified:0};
                ul.createEl('li', { text: `${tag}: Created ${c.created} • Modified ${c.modified}` });
            }
        }

        // Render simple bar chart for up to two categories across dates
        this.chartRoot.empty();
        if (cats.length === 0) {
            this.chartRoot.createEl('div', { text: 'Configure up to 2 categories in settings to see the chart.' });
        } else {
            const maxVal = Math.max(1, ...dates.map(d=>Math.max(...cats.map(c=> perDayCategory[d][c] || 0))));
            const chart = this.chartRoot.createEl('div', { cls: 'live-chart-grid' });
            // Header row
            const head = chart.createEl('div', { cls: 'live-chart-row live-chart-head' });
            head.createEl('div', { cls: 'live-chart-cell', text: 'Date' });
            cats.forEach(c => head.createEl('div', { cls: 'live-chart-cell', text: c }));

            dates.forEach(d => {
                const row = chart.createEl('div', { cls: 'live-chart-row' });
                const label = row.createEl('div', { cls: 'live-chart-cell live-chart-label', text: d });
                if (this.selectedDate === d) label.addClass('is-selected');
                label.onclick = () => { this.selectedDate = d; this.render(); };
                cats.forEach((c, idx) => {
                    const v = perDayCategory[d][c] || 0; // minutes
                    const barCell = row.createEl('div', { cls: 'live-chart-cell' });
                    const bar = barCell.createEl('div', { cls: `live-bar cat-${idx}` });
                    const pct = Math.round((v / maxVal) * 100);
                    bar.setAttr('style', `width:${pct}%;`);
                    bar.setText(`${v}m`);
                });
            });
        }

        // Period category distribution (top categories by minutes)
        this.periodCatRoot.empty();
        const catTotals: Record<string, number> = {};
        dates.forEach(date => {
            this.plugin.sessionsData.sessions.forEach(s => {
                if (!s.isBreak && s.date === date) {
                    catTotals[s.category] = (catTotals[s.category] || 0) + s.duration;
                }
            });
            const live = this.plugin.sessionsData.liveSession as any;
            if (live && live.date === date && !this.plugin.currentSession) {
                catTotals[live.category] = (catTotals[live.category] || 0) + Math.floor(((typeof live.durationSec==='number'? live.durationSec : (live.duration||0)*60))/60);
            }
            if (this.plugin.currentSession && !this.plugin.currentSession.isBreak) {
                const cs = this.plugin.currentSession;
                const curDate = this.plugin.getDateString(cs.startTime);
                if (curDate === date) catTotals[cs.category] = (catTotals[cs.category] || 0) + cs.getDuration();
            }
        });
        const catEntries = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,8);
        if (catEntries.length) {
            const wrap = this.periodCatRoot.createEl('div', { cls: 'catdist-wrap' });
            wrap.createEl('div', { text: 'Category distribution (minutes)', cls: 'catdist-title' });
            const max = Math.max(1, ...catEntries.map(e=>e[1]));
            catEntries.forEach(([cat,val]) => {
                const row = wrap.createEl('div', { cls: 'catdist-row' });
                row.createEl('div', { cls: 'catdist-label', text: cat });
                const bar = row.createEl('div', { cls: 'catdist-bar' });
                const pct = Math.round((val/max)*100);
                bar.setAttr('style', `width:${pct}%`);
                bar.setText(`${val}m`);
            });
        }

        // Minimal inline styles to make chart & details readable
        const styleId = 'live-analytics-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
            .live-analytics-controls{display:flex;gap:8px;align-items:center;margin-bottom:8px}
            .live-analytics-stats{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
            .live-chart-grid{display:flex;flex-direction:column;gap:6px}
            .live-chart-row{display:grid;grid-template-columns: 140px 1fr 1fr;gap:8px;align-items:center}
            .live-chart-cell{position:relative;height:22px}
            .live-chart-label{font-weight:600;cursor:pointer}
            .live-chart-label.is-selected{color: var(--interactive-accent)}
            .live-bar{height:100%;background: var(--interactive-accent); color: var(--text-on-accent); text-align:right;padding-right:6px; line-height:22px; border-radius:4px}
            .live-bar.cat-1{background: var(--color-yellow, #f2b01e)}
            .live-analytics-details{margin-top:12px}
            .details-title{font-weight:700;margin:6px 0}
            .session-list{display:flex;flex-direction:column;gap:4px}
            .session-item{border:1px solid var(--background-modifier-border);border-radius:6px;padding:6px}
            .session-header{display:flex;gap:8px;align-items:center;font-weight:600}
            .catdist-wrap{margin-top:10px}
            .catdist-title{font-weight:700;margin-bottom:6px}
            .catdist-row{display:flex;align-items:center;gap:8px;margin:2px 0}
            .catdist-label{width:140px}
            .catdist-bar{height:18px;background: var(--interactive-accent); color: var(--text-on-accent); text-align:right;padding-right:6px; line-height:18px; border-radius:4px}
            .clickable{cursor:pointer; text-decoration: underline}
            `;
            document.head.appendChild(style);
        }
        this.renderDetailsForDate(this.selectedDate!);
    }

    private async exportCsv() {
        try {
            const dates = this.getDatesForPeriod();
            const cats = (this.plugin.settings.liveAnalyticsCategories || []).slice(0,2);
            const rows: string[] = [];
            const header = ['date','study_minutes','break_minutes','total_minutes','pomodoros','words','created_notes','modified_notes', ...cats.map(c=>`cat_${c}_minutes`)];
            rows.push(header.join(','));
            for (const date of dates) {
                const daily = this.plugin.analyticsService!.computeDaily(date);
                this.augmentDaily(daily, date);
                const perCat: Record<string, number> = {}; cats.forEach(c=>perCat[c]=0);
                this.plugin.sessionsData.sessions.forEach(s => { if (!s.isBreak && s.date===date && cats.includes(s.category)) perCat[s.category]+=s.duration; });
                const live = this.plugin.sessionsData.liveSession as any;
                if (live && live.date===date && cats.includes(live.category) && !this.plugin.currentSession) perCat[live.category]+= Math.floor(((typeof live.durationSec==='number'? live.durationSec : (live.duration||0)*60))/60);
                if (this.plugin.currentSession && !this.plugin.currentSession.isBreak && this.plugin.getDateString(this.plugin.currentSession.startTime)===date && cats.includes(this.plugin.currentSession.category)) perCat[this.plugin.currentSession.category]+= this.plugin.currentSession.getDuration();
                const total = daily.totalStudyTime + daily.totalBreakTime;
                const row = [date, String(daily.totalStudyTime), String(daily.totalBreakTime), String(total), String(daily.totalPomodoros), String(daily.totalWordCount), String(daily.createdNotes.length), String(daily.modifiedNotes.length), ...cats.map(c=> String(perCat[c]||0))];
                rows.push(row.join(','));
            }
            const csv = rows.join('\n');
            const pathSafeDate = this.anchorDate;
            const file = `${this.plugin.settings.notesFolder}/live_analytics_${this.period}_${pathSafeDate}.csv`;
            if (!(await this.plugin.app.vault.adapter.exists(this.plugin.settings.notesFolder))) await this.plugin.app.vault.createFolder(this.plugin.settings.notesFolder);
            await this.plugin.app.vault.adapter.write(file, csv);
            new Notice(`Exported CSV to ${file}`);
        } catch (e) {
            console.error('Export CSV failed', e);
            new Notice('Export CSV failed');
        }
    }

    private renderDetailsForDate(date: string) {
        this.detailsRoot.empty();
        this.detailsRoot.createEl('div', { cls: 'details-title', text: `Details for ${date}` });
        const list = this.detailsRoot.createEl('div', { cls: 'session-list' });
        const sessions = this.plugin.sessionsData.sessions.filter(s=> s.date === date);
        const transient: any[] = [];
        if (this.plugin.currentSession && !this.plugin.currentSession.isBreak && this.plugin.getDateString(this.plugin.currentSession.startTime)===date) {
            const cs = this.plugin.currentSession;
            transient.push({
                category: cs.category,
                startTime: cs.startTime,
                duration: cs.getDuration(),
                pomodoros: cs.pomodorosCompleted,
                difficulty: cs.difficulty,
                notes: cs.notes,
                distractions: cs.distractions,
                modifiedFiles: Array.from(cs.modifiedFiles),
                createdFiles: Array.from(cs.createdFiles),
                completedTasks: cs.completedTasks,
                wordCount: cs.wordCount,
                createdLinks: Array.from(cs.createdLinks),
                isLive: true,
            });
        } else if (this.plugin.sessionsData.liveSession && !this.plugin.currentSession && this.plugin.sessionsData.liveSession.date === date) {
            const ls: any = this.plugin.sessionsData.liveSession;
            transient.push({
                category: ls.category,
                startTime: new Date(ls.startTime),
                duration: Math.floor((typeof ls.durationSec==='number'? ls.durationSec : (ls.duration||0)*60)/60),
                pomodoros: ls.pomodoros || 0,
                difficulty: ls.difficulty || 1,
                notes: ls.notes || '',
                distractions: ls.distractions || [],
                modifiedFiles: ls.modifiedFiles || [],
                createdFiles: ls.createdFiles || [],
                completedTasks: ls.completedTasks || [],
                wordCount: ls.wordCount || 0,
                createdLinks: ls.createdLinks || [],
                isLive: true,
            });
        }
        const all: any[] = sessions.concat(transient);
        if (all.length === 0) {
            list.createEl('div', { text: 'No sessions.' });
            return;
        }
        const fileCounts = new Map<string, number>();
        all.forEach(s => (s.modifiedFiles||[]).forEach((f:string)=> fileCounts.set(f, (fileCounts.get(f)||0)+1)));
        const topFiles = Array.from(fileCounts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0]);
        if (topFiles.length) {
            this.detailsRoot.createEl('div', { text: 'Top modified files:' });
            const ul = this.detailsRoot.createEl('ul');
            topFiles.forEach(f => {
                const name = f.endsWith('.md') ? (f.split('/').pop() || f) : f;
                const li = ul.createEl('li');
                const a = li.createEl('a', { text: name, cls: 'clickable' });
                a.onclick = () => {
                    const tf = this.plugin.app.vault.getAbstractFileByPath(f);
                    if (tf) (this.plugin.app as any).workspace.openLinkText(f, '', true);
                };
            });
        }
        all.sort((a,b)=> (new Date(a.startTime).getTime()) - (new Date(b.startTime).getTime()));
        all.forEach(s => {
            const item = list.createEl('div', { cls: 'session-item' });
            const header = item.createEl('div', { cls: 'session-header' });
            header.createEl('span', { text: s.category });
            header.createEl('span', { text: new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
            header.createEl('span', { text: `${Math.floor(s.duration/60)}h ${s.duration%60}m` });
            if (s.isLive) header.createEl('span', { text: 'LIVE', cls: 'mod-warning' });
            const body = item.createEl('div');
            const line1 = body.createEl('div');
            line1.createEl('span', { text: `Pomodoros: ${s.pomodoros || 0} • Difficulty: ${s.difficulty || 1}/5 • Words: ${s.wordCount || 0}` });
            const line2 = body.createEl('div');
            const createdList = (s.createdFiles||[]).filter((f:string)=>f.endsWith('.md'));
            const modifiedList = (s.modifiedFiles||[]).filter((f:string)=>f.endsWith('.md'));
            const links = (s.createdLinks||[]).length;
            line2.createEl('span', { text: `Created notes: ${createdList.length} • Modified notes: ${modifiedList.length} • Links: ${links}` });
            const quick = body.createEl('div');
            if (modifiedList.length) {
                quick.createEl('span', { text: 'Open modified: ' });
                modifiedList.slice(0,3).forEach((f:string, i:number) => {
                    const a = quick.createEl('a', { text: (f.split('/').pop()||f), cls: 'clickable' });
                    a.onclick = () => { const tf = this.plugin.app.vault.getAbstractFileByPath(f); if (tf) (this.plugin.app as any).workspace.openLinkText(f, '', true); };
                    if (i<Math.min(2, modifiedList.length-1)) quick.createEl('span', { text: ' • '});
                });
            }
            if (createdList.length) {
                quick.createEl('span', { text: '  ' });
                quick.createEl('span', { text: 'Open created: ' });
                createdList.slice(0,3).forEach((f:string, i:number) => {
                    const a = quick.createEl('a', { text: (f.split('/').pop()||f), cls: 'clickable' });
                    a.onclick = () => { const tf = this.plugin.app.vault.getAbstractFileByPath(f); if (tf) (this.plugin.app as any).workspace.openLinkText(f, '', true); };
                    if (i<Math.min(2, createdList.length-1)) quick.createEl('span', { text: ' • '});
                });
            }
            const line3 = body.createEl('div');
            line3.createEl('span', { text: `Distractions: ${(s.distractions||[]).length} • Tasks: ${(s.completedTasks||[]).length}` });
        });
        // Export day details
        const btns = this.detailsRoot.createEl('div', { cls: 'details-actions' });
        const exportCsvBtn = btns.createEl('button', { text: 'Export Day CSV' });
        exportCsvBtn.onclick = () => this.exportDayCsv(date);
        const exportJsonBtn = btns.createEl('button', { text: 'Export Day JSON' });
        exportJsonBtn.onclick = () => this.exportDayJson(date);
    }

    private async exportDayCsv(date: string) {
        try {
            const sessions = this.plugin.sessionsData.sessions.filter(s=>s.date===date);
            const rows = [['category','start_time','duration_min','pomodoros','difficulty','words','distractions','tasks','created_notes','modified_notes']];
            const toRow = (s:any) => [s.category, new Date(s.startTime).toISOString(), String(s.duration), String(s.pomodoros||0), String(s.difficulty||1), String(s.wordCount||0), String((s.distractions||[]).length), String((s.completedTasks||[]).length), String((s.createdFiles||[]).filter((f:string)=>f.endsWith('.md')).length), String((s.modifiedFiles||[]).filter((f:string)=>f.endsWith('.md')).length)];
            sessions.forEach(s=> rows.push(toRow(s)));
            const live = this.plugin.sessionsData.liveSession as any;
            if (live && live.date===date && !this.plugin.currentSession) {
                rows.push([live.category, new Date(live.startTime).toISOString(), String(Math.floor((typeof live.durationSec==='number'? live.durationSec:(live.duration||0)*60)/60)), String(live.pomodoros||0), String(live.difficulty||1), String(live.wordCount||0), String((live.distractions||[]).length), String((live.completedTasks||[]).length), String((live.createdFiles||[]).filter((f:string)=>f.endsWith('.md')).length), String((live.modifiedFiles||[]).filter((f:string)=>f.endsWith('.md')).length)]);
            }
            const csv = rows.map(r=>r.join(',')).join('\n');
            const file = `${this.plugin.settings.notesFolder}/day_${date}_details.csv`;
            if (!(await this.plugin.app.vault.adapter.exists(this.plugin.settings.notesFolder))) await this.plugin.app.vault.createFolder(this.plugin.settings.notesFolder);
            await this.plugin.app.vault.adapter.write(file, csv);
            new Notice(`Exported ${file}`);
        } catch (e) { console.error(e); new Notice('Export day CSV failed'); }
    }
    private async exportDayJson(date: string) {
        try {
            const data:any = { date, sessions: this.plugin.sessionsData.sessions.filter(s=>s.date===date) };
            const live = this.plugin.sessionsData.liveSession as any;
            if (live && live.date===date && !this.plugin.currentSession) data.liveSession = live;
            const file = `${this.plugin.settings.notesFolder}/day_${date}_details.json`;
            if (!(await this.plugin.app.vault.adapter.exists(this.plugin.settings.notesFolder))) await this.plugin.app.vault.createFolder(this.plugin.settings.notesFolder);
            await this.plugin.app.vault.adapter.write(file, JSON.stringify(data, null, 2));
            new Notice(`Exported ${file}`);
        } catch (e) { console.error(e); new Notice('Export day JSON failed'); }
    }
}

class LiveSessionResumeModal extends Modal {
    plugin: StudyAnalyticsPlugin;
    autoStart: boolean = false;
    constructor(app: App, plugin: StudyAnalyticsPlugin) {
        super(app);
        this.plugin = plugin;
    }
    onOpen() {
        const { contentEl } = this;
        this.titleEl.setText('Resume previous session?');
        const live = this.plugin.sessionsData.liveSession as any;
        if (!live) { this.close(); return; }
        const cat = live.category;
        const mins = Math.floor(((typeof live.durationSec==='number'? live.durationSec : (live.duration||0)*60))/60);
        contentEl.createEl('p', { text: `A previous session was found: ${cat} • ~${mins} minutes.` });
        const checkboxDiv = contentEl.createEl('div');
        const cb = checkboxDiv.createEl('input', { type: 'checkbox' });
        checkboxDiv.createEl('label', { text: 'Start timer immediately after resuming' });
        cb.onchange = () => { this.autoStart = cb.checked; };
        const btns = contentEl.createEl('div', { cls: 'modal-button-container' });
        const resumeBtn = btns.createEl('button', { text: 'Resume', cls: 'mod-cta' });
        const laterBtn = btns.createEl('button', { text: 'Not now' });
        resumeBtn.onclick = async () => {
            await this.resumeFromSnapshot(this.autoStart);
            this.close();
        };
        laterBtn.onclick = () => this.close();
    }
    async resumeFromSnapshot(startTimer: boolean) {
        const live = this.plugin.sessionsData.liveSession as any;
        if (!live) return;
        const view = this.plugin.getStudyFlowView();
        // Create new session with same category
        this.plugin.startNewSession(live.category || 'Study');
        const s = this.plugin.currentSession!;
        // Reconstruct duration by setting startTime accordingly (no ongoing break)
        const now = Date.now();
        const sec = typeof live.durationSec==='number' ? live.durationSec : (live.duration||0)*60;
        s.startTime = new Date(now - sec*1000);
        s.totalBreakDuration = (live.breakDuration ? live.breakDuration*60000 : 0);
        s.pomodorosCompleted = live.pomodoros || 0;
        s.difficulty = live.difficulty || 1;
        s.notes = live.notes || '';
        s.isBreak = false;
        // Restore sets
        (live.modifiedFiles||[]).forEach((f:string)=> s.modifiedFiles.add(f));
        (live.openedFiles||[]).forEach((f:string)=> s.openedFiles.add(f));
        (live.createdFiles||[]).forEach((f:string)=> s.createdFiles.add(f));
        (live.createdLinks||[]).forEach((f:string)=> s.createdLinks.add(f));
        s.completedTasks = live.completedTasks || [];
        s.distractions = live.distractions || [];
        s.lineNotes = live.lineNotes || [];
        s.reflections = live.reflections || [];
        // Update UI
        if (view) {
            view.updateCategorySelect();
            view.categorySelect.value = s.category;
            view.notesArea.value = s.notes;
            if (view.difficultySlider && this.plugin.settings.showDifficulty) {
                view.difficultySlider.value = String(s.difficulty);
            }
            // Re-sync recurring countdown if in that mode
            await view.refreshRecurringGoalCountdown();
            view.updateTimerDisplay();
            await view.updateDailyTime();
            if (startTimer) {
                view.startTimer();
            }
        }
        // Remove snapshot
        delete this.plugin.sessionsData.liveSession;
        this.plugin.sessionsData.lastUpdated = new Date().toISOString();
        await this.plugin.saveSessionsData();
        new Notice('Session resumed from snapshot');
    }
}
