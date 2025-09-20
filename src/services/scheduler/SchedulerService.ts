import type StudyAnalyticsPlugin from '../../../main';

export class SchedulerService {
  private plugin: StudyAnalyticsPlugin;

  constructor(plugin: StudyAnalyticsPlugin) { this.plugin = plugin; }

  register() {
    // Minute tick for daily/weekly resets and continuous-mode midnight rollover
    this.plugin.registerInterval(
      window.setInterval(async () => {
        const now = new Date();

        // Daily midnight tasks
        if (now.getHours() === 0 && now.getMinutes() < 1) {
          await this.plugin.resetRecurringGoals('daily');
          if (this.plugin.settings.autoDailySummary) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const d = yesterday.toISOString().split('T')[0];
            await this.plugin.createDailySummaryUsingServices(d);
          }
        }

        // Weekly summary/reset
        if (this.plugin.settings.enableWeeklySummary &&
            this.plugin.settings.autoWeeklySummary &&
            now.getDay() === this.plugin.settings.weeklySummaryDay &&
            now.getHours() === 0 && now.getMinutes() < 1) {
          await this.plugin.resetRecurringGoals('weekly');
          await this.plugin.checkWeeklySummary();
        }

        // Continuous tracking cap at midnight
        if (this.plugin.settings.trackWithoutSession && now.getHours() === 0 && now.getMinutes() < 1) {
          if (this.plugin.currentSession) {
            const cat = this.plugin.currentSession.category;
            await this.plugin.endCurrentSession();
            this.plugin.startNewSession(cat);
            const view = this.plugin.getStudyFlowView();
            if (view) {
              view.categorySelect.value = cat;
              if (!view.isRunning) view.startTimer();
            }
          }
        }
      }, 60000)
    );
  }
}
