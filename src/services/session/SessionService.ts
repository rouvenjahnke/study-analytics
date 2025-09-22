import type StudyAnalyticsPlugin from '../../../main';

export class SessionService {
  private plugin: StudyAnalyticsPlugin;

  constructor(plugin: StudyAnalyticsPlugin) {
    this.plugin = plugin;
  }

  start(category: string) {
    this.plugin.startNewSession(category);
  }

  async endAndSave() {
    await this.plugin.endCurrentSession();
  }

  async changeCategory(view: any, newCategory: string) {
    // If timer is not running, changing category must NOT create or save sessions.
    // Just update the UI selection (and pending current session, if any) and refresh displays.
    if (!view.isRunning) {
      view.categorySelect.value = newCategory;
      if (this.plugin.currentSession) this.plugin.currentSession.category = newCategory;
      await view.updateDailyTime();
      view.updateTimerDisplay();
      return;
    }
    if (!this.plugin.currentSession || this.plugin.currentSession.category === newCategory) return;
    // Save current session state (only if running)
    if (view.isRunning) {
      this.plugin.currentSession.notes = view.notesArea.value;
      if (this.plugin.settings.showDifficulty) {
        this.plugin.currentSession.difficulty = parseInt(view.difficultySlider.value);
      }
    }

    const wasRunning = view.isRunning;
    const timeLeftBackup = view.timeLeft;
    const stopwatchElapsedBackup = view.stopwatchElapsed;
    const isStopwatchBackup = view.isStopwatch;
    const isRecurringSessionBackup = view.isRecurringSession;

    // Update recurring goal progress if applicable
    if (isRecurringSessionBackup && !this.plugin.currentSession.isBreak) {
      const category = this.plugin.currentSession.category;
      const sessionDurationHours = this.plugin.currentSession.getDuration() / 60; // minutes -> hours
      const goal = this.plugin.settings.recurringSessionGoals[category];
      if (goal) {
        if (!goal.timeSpent) goal.timeSpent = 0;
        goal.timeSpent += sessionDurationHours;
        if (!goal.achieved && goal.timeSpent >= goal.timeGoal) {
          goal.achieved = true;
          new (this.plugin as any).Notice(`Goal for ${category} reached!`);
        }
        await this.plugin.saveSettings();
      }
    }

    if (wasRunning) view.breakTimer();

    // Only end and save if timer was running (i.e., an active session)
    if (wasRunning) {
      const sessionData = this.plugin.currentSession.end();
      await this.plugin.saveSessionToFile(sessionData);
    }

    // Start new session with new category
    if (wasRunning) {
      this.plugin.startNewSession(newCategory);
      view.categorySelect.value = newCategory;
    } else {
      // If not running, just reflect UI change
      view.categorySelect.value = newCategory;
      await view.updateDailyTime();
      view.updateTimerDisplay();
      return;
    }

    if (view.difficultySlider) view.difficultySlider.value = '1';

    // Restore timer state
    if (isStopwatchBackup) {
      view.isStopwatch = true;
      view.isRecurringSession = false;
      view.stopwatchElapsed = stopwatchElapsedBackup;
    } else if (isRecurringSessionBackup) {
      view.isStopwatch = false;
      view.isRecurringSession = true;
      if (this.plugin.settings.recurringSessionGoals[newCategory]) {
        // Compute remaining time for the new category and sync timer service
        const sec = await view.computeRemainingGoalSeconds(newCategory);
        view.goalTimeRemaining = sec;
        const svc = this.plugin.timerService;
        if (svc) { svc.setMode('recurring'); svc.setRecurringGoalSeconds(sec); }
      } else {
        view.goalTimeRemaining = 0;
      }
      await view.updateDailyTime();
      view.updateTimerDisplay();
    } else {
      view.isStopwatch = false;
      view.isRecurringSession = false;
      view.timeLeft = timeLeftBackup;
    }

    if (wasRunning) view.startTimer();
    new (this.plugin as any).Notice(`Category changed to ${newCategory}`);
  }
}
