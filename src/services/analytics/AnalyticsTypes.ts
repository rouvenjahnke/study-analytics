export interface DailyAnalytics {
  date: string;
  studySessions: any[];
  breakSessions: any[];
  totalStudyTime: number;
  totalBreakTime: number;
  totalPomodoros: number;
  totalDistractions: number;
  totalTasks: number;
  totalWordCount: number;
  modifiedFiles: Set<string>;
  openedFiles: Set<string>;
  createdFiles: Set<string>;
  createdLinks: Set<string>;
  avgDifficulty: string; // fixed 1 decimal
  createdNotes: string[]; // markdown notes only
  modifiedNotes: string[]; // markdown notes only
  noData: boolean;
}

export interface DayReportRow {
  date: string;
  studyTime: number;
  breakTime: number;
  pomodoros: number;
  wordCount: number;
  createdNotes: number;
  modifiedNotes: number;
}

export interface WeeklyAnalytics {
  rangeStart: string; // Monday
  rangeEnd: string;   // Sunday
  dayReports: DayReportRow[];
  weeklyStudyTime: number;
  weeklyBreakTime: number;
  weeklyPomodoros: number;
  weeklyDistractions: number;
  weeklyTasks: number;
  weeklyWordCount: number;
  avgDifficulty: string; // fixed 1 decimal
  modifiedFiles: Set<string>;
  openedFiles: Set<string>;
  createdFiles: Set<string>;
  createdLinks: Set<string>;
  totalCreatedNotes: number;
  totalModifiedNotes: number;
}

