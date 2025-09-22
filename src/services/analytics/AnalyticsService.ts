import type StudyAnalyticsPlugin from '../../../main';
import { DailyAnalytics, WeeklyAnalytics } from './AnalyticsTypes';

export class AnalyticsService {
  private plugin: StudyAnalyticsPlugin;
  constructor(plugin: StudyAnalyticsPlugin) { this.plugin = plugin; }

  computeDaily(date: string): DailyAnalytics {
    const studySessions: any[] = [];
    const breakSessions: any[] = [];
    this.plugin.sessionsData.sessions.forEach(s => {
      if (s.date === date) {
        if (s.isBreak) breakSessions.push(s); else studySessions.push(s);
      }
    });

    if (studySessions.length === 0) {
      return {
        date,
        studySessions, breakSessions,
        totalStudyTime: 0,
        totalBreakTime: breakSessions.reduce((a,b)=>a+b.duration,0),
        totalPomodoros: 0,
        totalDistractions: 0,
        totalTasks: 0,
        totalWordCount: 0,
        modifiedFiles: new Set<string>(),
        openedFiles: new Set<string>(),
        createdFiles: new Set<string>(),
        createdLinks: new Set<string>(),
        avgDifficulty: '0',
        createdNotes: [],
        modifiedNotes: [],
        noData: true,
      };
    }

    let totalStudyTime = 0, totalPomodoros = 0, totalDistractions = 0, totalTasks = 0, totalWordCount = 0;
    const modifiedFiles = new Set<string>();
    const openedFiles = new Set<string>();
    const createdFiles = new Set<string>();
    const createdLinks = new Set<string>();
    const difficulties: number[] = [];

    studySessions.forEach(s => {
      totalStudyTime += s.duration;
      totalPomodoros += s.pomodoros;
      totalDistractions += s.distractions.length;
      s.modifiedFiles.forEach((f: string)=>modifiedFiles.add(f));
      s.openedFiles?.forEach((f: string)=>openedFiles.add(f));
      s.createdFiles?.forEach((f: string)=>createdFiles.add(f));
      s.createdLinks?.forEach((l: string)=>createdLinks.add(l));
      totalTasks += s.completedTasks.length;
      difficulties.push(s.difficulty);
      totalWordCount += s.wordCount || 0;
    });

    const totalBreakTime = breakSessions.reduce((a,b)=>a+b.duration,0);
    const avgDifficulty = difficulties.length>0 ? (difficulties.reduce((a,b)=>a+b)/difficulties.length).toFixed(1) : '0';
    const createdNotes = Array.from(createdFiles).filter(f=>f.endsWith('.md'));
    const modifiedNotes = Array.from(modifiedFiles).filter(f=>f.endsWith('.md'));

    return {
      date,
      studySessions, breakSessions,
      totalStudyTime, totalBreakTime,
      totalPomodoros, totalDistractions, totalTasks, totalWordCount,
      modifiedFiles, openedFiles, createdFiles, createdLinks,
      avgDifficulty,
      createdNotes, modifiedNotes,
      noData: false,
    };
  }

  computeWeekly(monday: Date): WeeklyAnalytics {
    const start = new Date(monday); start.setHours(0,0,0,0);
    const sunday = new Date(start); sunday.setDate(sunday.getDate()+6);
    const dayReports = [] as {date:string,studyTime:number,breakTime:number,pomodoros:number,wordCount:number,createdNotes:number,modifiedNotes:number}[];

    let weeklyStudyTime=0, weeklyBreakTime=0, weeklyPomodoros=0, weeklyDistractions=0, weeklyTasks=0, weeklyWordCount=0;
    const modifiedFiles = new Set<string>();
    const openedFiles = new Set<string>();
    const createdFiles = new Set<string>();
    const createdLinks = new Set<string>();
    const allDifficulties: number[] = [];
    let totalCreatedNotes = 0, totalModifiedNotes = 0;

    const cur = new Date(start);
    while (cur <= sunday) {
      const d = this.plugin.getDateString(cur);
      const daily = this.computeDaily(d);
      weeklyStudyTime += daily.totalStudyTime;
      weeklyBreakTime += daily.totalBreakTime;
      weeklyPomodoros += daily.totalPomodoros;
      weeklyDistractions += daily.totalDistractions;
      weeklyTasks += daily.totalTasks;
      weeklyWordCount += daily.totalWordCount;
      daily.modifiedFiles.forEach(f=>modifiedFiles.add(f));
      daily.openedFiles.forEach(f=>openedFiles.add(f));
      daily.createdFiles.forEach(f=>createdFiles.add(f));
      daily.createdLinks.forEach(l=>createdLinks.add(l));
      totalCreatedNotes += daily.createdNotes.length;
      totalModifiedNotes += daily.modifiedNotes.length;
      if (daily.avgDifficulty && parseFloat(daily.avgDifficulty)>0) allDifficulties.push(parseFloat(daily.avgDifficulty));
      dayReports.push({
        date: d,
        studyTime: daily.totalStudyTime,
        breakTime: daily.totalBreakTime,
        pomodoros: daily.totalPomodoros,
        wordCount: daily.totalWordCount,
        createdNotes: daily.createdNotes.length,
        modifiedNotes: daily.modifiedNotes.length,
      });
      cur.setDate(cur.getDate()+1);
    }

    const avgDifficulty = allDifficulties.length>0 ? (allDifficulties.reduce((a,b)=>a+b)/allDifficulties.length).toFixed(1) : '0';
    return {
      rangeStart: this.plugin.getDateString(start),
      rangeEnd: this.plugin.getDateString(sunday),
      dayReports,
      weeklyStudyTime, weeklyBreakTime, weeklyPomodoros, weeklyDistractions, weeklyTasks, weeklyWordCount,
      avgDifficulty,
      modifiedFiles, openedFiles, createdFiles, createdLinks,
      totalCreatedNotes, totalModifiedNotes,
    };
  }
}
