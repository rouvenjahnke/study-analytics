import type StudyAnalyticsPlugin from '../../../main';
import { DailyAnalytics, WeeklyAnalytics } from '../analytics/AnalyticsTypes';

export class SummaryService {
  private plugin: StudyAnalyticsPlugin;
  constructor(plugin: StudyAnalyticsPlugin) { this.plugin = plugin; }

  renderDaily(d: DailyAnalytics): string {
    const studyHours = Math.floor(d.totalStudyTime/60); const studyMinutes = d.totalStudyTime%60;
    const breakHours = Math.floor(d.totalBreakTime/60); const breakMinutes = d.totalBreakTime%60;
    const total = d.totalStudyTime + d.totalBreakTime;
    const totalHours = Math.floor(total/60); const totalMinutes = total%60;

    let out = `# Daily Study Summary - ${d.date}\n\n`;
    out += `Study time:: ${studyHours}h ${studyMinutes}m\n`;
    out += `Break time:: ${breakHours}h ${breakMinutes}m\n`;
    out += `Total time:: ${totalHours}h ${totalMinutes}m\n`;
    out += `Pomodoros:: ${d.totalPomodoros}\n`;
    out += `Modified files:: ${d.modifiedFiles.size}\n`;
    out += `Created files:: ${d.createdFiles.size}\n`;
    out += `Created links:: ${d.createdLinks.size}\n`;
    out += `Words written:: ${d.totalWordCount}\n\n`;
    out += `Created notes:: ${d.createdNotes.length}\n`;
    out += `Modified notes:: ${d.modifiedNotes.length}\n\n`;

    out += `## 📊 Daily statistics\n`;
    out += `- ⏱️ Study Time: ${studyHours}h ${studyMinutes}m\n`;
    out += `- ⏸️ Break Time: ${breakHours}h ${breakMinutes}m\n`;
    out += `- 🕙 Total Time: ${totalHours}h ${totalMinutes}m\n`;
    out += `- 🍅 Total Pomodoros: ${d.totalPomodoros}\n`;
    out += `- ⚠️ Total Distractions: ${d.totalDistractions}\n`;
    out += `- 📝 Modified Files: ${d.modifiedFiles.size}\n`;
    out += `- 📖 Opened Files: ${d.openedFiles.size}\n`;
    out += `- 📄 Created Files: ${d.createdFiles.size}\n`;
    out += `- 🔗 Created Links: ${d.createdLinks.size}\n`;
    out += `- ✅ Completed tasks: ${d.totalTasks}\n`;
    out += `- 📏 Words Written: ${d.totalWordCount}\n`;
    out += `- 📈 Average Difficulty: ${d.avgDifficulty}/5\n\n`;

    if (d.modifiedFiles.size>0) {
      out += `## 📝 Modified Files Overview\n`;
      d.modifiedFiles.forEach(file => { out += `- [[${file}|${file.split('/').pop()}]]\n`; });
      out += `\n`;
    }

    if (d.createdNotes.length>0) {
      out += `## 📔 Created Notes\n`;
      d.createdNotes.forEach(file => { out += `- [[${file}|${file.split('/').pop()}]]\n`; });
      out += `\n`;
    }
    if (d.modifiedNotes.length>0) {
      out += `## ✏️ Modified Notes\n`;
      d.modifiedNotes.forEach(file => { out += `- [[${file}|${file.split('/').pop()}]]\n`; });
      out += `\n`;
    }

    // Optional tracked tags daily breakdown
    if (this.plugin.settings.trackTaggedNotes && (this.plugin.settings.showTagStatsInDaily || false) && this.plugin.settings.tagsToTrack?.length) {
      const createdByTag: Record<string, string[]> = {}; const modifiedByTag: Record<string, string[]> = {};
      this.plugin.settings.tagsToTrack.forEach(tag => { createdByTag[tag]=[]; modifiedByTag[tag]=[]; });
      const idx = this.plugin.tagIndexService;
      const append = (files: string[], target: Record<string,string[]>) => {
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          for (const tag of this.plugin.settings.tagsToTrack) {
            const set = idx?.getFilesForTag(tag);
            if (set && set.has(file)) target[tag].push(file);
          }
        }
      };
      append(d.createdNotes, createdByTag);
      append(d.modifiedNotes, modifiedByTag);
      out += `## 🏷️ Tracked Tags (Daily)\n`;
      for (const tag of this.plugin.settings.tagsToTrack) {
        const c = createdByTag[tag]||[]; const m = modifiedByTag[tag]||[];
        out += `### ${tag} — Created: ${c.length}, Modified: ${m.length}\n`;
        if (c.length) { out += `- Created:\n`; c.forEach(f=> out += `  - [[${f}|${f.split('/').pop()}]]\n`); }
        if (m.length) { out += `- Modified:\n`; m.forEach(f=> out += `  - [[${f}|${f.split('/').pop()}]]\n`); }
        if (!c.length && !m.length) out += `- No notes with this tag changed today\n`;
        out += `\n`;
      }
    }

    // Individual sessions
    d.studySessions.forEach((s: any, idx: number) => {
      out += `## Study Session ${idx+1}: ${s.category}\n`;
      out += `- Start Time: ${new Date(s.startTime).toLocaleTimeString()}\n`;
      out += `- Duration: ${Math.floor(s.duration/60)}h ${s.duration%60}m\n`;
      out += `- Pomodoros: ${s.pomodoros}\n`;
      out += `- ${s.wordCount ? `**Words Written: ${s.wordCount}**` : 'Words Written: 0'}\n`;
      const modifiedNotes = (s.modifiedFiles||[]).filter((f:string)=>f.endsWith('.md')).length;
      const createdNotes = (s.createdFiles||[]).filter((f:string)=>f.endsWith('.md')).length;
      if (createdNotes>0) out += `- **Created Notes: ${createdNotes}**\n`;
      if (modifiedNotes>0) out += `- Modified Notes: ${modifiedNotes}\n`;
      if (s.createdLinks?.length>0) out += `- Created Links: ${s.createdLinks.length}\n`;
      out += `- Difficulty: ${s.difficulty}/5\n\n`;
      if (s.notes) out += `### Notes\n${s.notes}\n\n`;
      if (s.reflections?.length>0) s.reflections.forEach((r:any)=>{ out+=`##### Reflection - ${new Date(r.time).toLocaleTimeString()}\n${r.text}\n\n`; });
      if (s.distractions?.length>0) {
        out += `### Distractions\n`; s.distractions.forEach((dr:any)=>{ out+=`- ${new Date(dr.time).toLocaleTimeString()}: ${dr.note}\n`; }); out += `\n`;
      }
      if (s.lineNotes?.length>0) {
        out += `### Line Notes\n`;
        s.lineNotes.forEach((n:any)=>{
          out += `#### [[${n.file}#${n.lineNumber}|${n.file.split('/').pop()}:${n.lineNumber}]]\n`;
          out += `${n.tag}\n`;
          out += '```\n' + (n.line ?? '') + '\n```\n' + (n.note ?? '') + '\n\n';
        });
      }
      if (s.createdFiles?.length>0) {
        out += `### Created Files\n`; s.createdFiles.forEach((f:string)=>{ out+=`- [[${f}|${f.split('/').pop()}]]\n`; }); out+=`\n`;
      }
    });

    return out;
  }

  renderWeekly(w: WeeklyAnalytics): string {
    const studyHours = Math.floor(w.weeklyStudyTime/60); const studyMinutes = w.weeklyStudyTime%60;
    const breakHours = Math.floor(w.weeklyBreakTime/60); const breakMinutes = w.weeklyBreakTime%60;
    const total = w.weeklyStudyTime + w.weeklyBreakTime;
    const totalHours = Math.floor(total/60); const totalMinutes = total%60;

    let out = `# Weekly Study Summary - ${w.rangeStart} to ${w.rangeEnd}\n\n`;
    out += `Study time:: ${studyHours}h ${studyMinutes}m\n`;
    out += `Break time:: ${breakHours}h ${breakMinutes}m\n`;
    out += `Total time:: ${totalHours}h ${totalMinutes}m\n`;
    out += `Pomodoros:: ${w.weeklyPomodoros}\n`;
    out += `Modified files:: ${w.modifiedFiles.size}\n`;
    out += `Words written:: ${w.weeklyWordCount}\n\n`;

    out += `## 📊 Weekly statistics\n`;
    out += `- ⏱️ Study Time: ${studyHours}h ${studyMinutes}m\n`;
    out += `- ⏸️ Break Time: ${breakHours}h ${breakMinutes}m\n`;
    out += `- 🕙 Total Time: ${totalHours}h ${totalMinutes}m\n`;
    out += `- 🍅 Total Pomodoros: ${w.weeklyPomodoros}\n`;
    out += `- ⚠️ Total Distractions: ${w.weeklyDistractions}\n`;
    out += `- 📝 Modified Files: ${w.modifiedFiles.size}\n`;
    out += `- 📖 Opened Files: ${w.openedFiles.size}\n`;
    out += `- 📄 Created Files: ${w.createdFiles.size}\n`;
    out += `- 📔 Created Notes: ${w.totalCreatedNotes}\n`;
    out += `- 📝 Modified Notes: ${w.totalModifiedNotes}\n`;
    out += `- 🔗 Created Links: ${w.createdLinks.size}\n`;
    out += `- ✅ Completed tasks: ${w.weeklyTasks}\n`;
    out += `- 📏 Words Written: ${w.weeklyWordCount}\n`;
    out += `- 📈 Average Difficulty: ${w.avgDifficulty}/5\n\n`;

    out += `weekly_study_time:: ${studyHours}h ${studyMinutes}m\n`;
    out += `weekly_break_time:: ${breakHours}h ${breakMinutes}m\n`;
    out += `weekly_total_time:: ${totalHours}h ${totalMinutes}m\n`;
    out += `weekly_pomodoros:: ${w.weeklyPomodoros}\n`;
    out += `weekly_words_written:: ${w.weeklyWordCount}\n`;
    out += `weekly_modified_files:: ${w.modifiedFiles.size}\n`;
    out += `weekly_created_files:: ${w.createdFiles.size}\n`;
    out += `weekly_created_notes:: ${w.totalCreatedNotes}\n`;
    out += `weekly_modified_notes:: ${w.totalModifiedNotes}\n`;
    out += `weekly_created_links:: ${w.createdLinks.size}\n`;
    out += `weekly_tasks_completed:: ${w.weeklyTasks}\n`;
    out += `weekly_distractions:: ${w.weeklyDistractions}\n\n`;

    out += `## 📆 Daily Breakdown\n`;
    out += `| Date | Study Time | Break Time | Pomodoros | Words Written | Created Notes | Modified Notes |\n`;
    out += `| ---- | ---------- | ---------- | --------- | ------------- | ------------ | -------------- |\n`;
    w.dayReports.forEach(day => {
      const sH = Math.floor(day.studyTime/60), sM = day.studyTime%60;
      const bH = Math.floor(day.breakTime/60), bM = day.breakTime%60;
      out += `| ${day.date} | ${sH}h ${sM}m | ${bH}h ${bM}m | ${day.pomodoros} | ${day.wordCount} | ${day.createdNotes} | ${day.modifiedNotes} |\n`;
    });
    out += `\n`;

    if (w.dayReports.length>0) {
      const labels = 'labels: [' + w.dayReports.map(d=>`"${d.date}"`).join(', ') + ']';
      out += '## 📊 Word Count Chart\n\n';
      out += '```chart\n'; out += 'type: bar\n'; out += labels + '\n';
      out += 'series:\n  - title: Words Written\n    data: [' + w.dayReports.map(d=>d.wordCount).join(', ') + ']\n';
      out += 'width: 100%\nlabelColors: true\n'; out += '```\n\n';

      out += '## ⏱️ Study Time Chart\n\n';
      out += '```chart\n'; out += 'type: bar\n'; out += labels + '\n';
      out += 'series:\n  - title: Study Minutes\n    data: [' + w.dayReports.map(d=>d.studyTime).join(', ') + ']\n';
      out += 'width: 100%\nlabelColors: true\n'; out += '```\n\n';

      out += '## 📝 Notes Created & Modified Chart\n\n';
      out += '```chart\n'; out += 'type: bar\n'; out += labels + '\n';
      out += 'series:\n  - title: Notes Created\n    data: [' + w.dayReports.map(d=>d.createdNotes).join(', ') + ']\n';
      out += '  - title: Notes Modified\n    data: [' + w.dayReports.map(d=>d.modifiedNotes).join(', ') + ']\n';
      out += 'width: 100%\nlabelColors: true\nstacked: true\n'; out += '```\n\n';
    }

    if (w.modifiedFiles.size>0) {
      out += `## 📝 Most Modified Files\n`;
      const arr = Array.from(w.modifiedFiles).slice(0,10);
      arr.forEach(f=> out += `- [[${f}|${f.split('/').pop()}]]\n`);
      if (w.modifiedFiles.size>10) out += `- ... and ${w.modifiedFiles.size-10} more files\n`;
      out += `\n`;
    }
    if (w.createdFiles.size>0) {
      out += `## 📄 Created Files\n`;
      const arr = Array.from(w.createdFiles).slice(0,10);
      arr.forEach(f=> out += `- [[${f}|${f.split('/').pop()}]]\n`);
      if (w.createdFiles.size>10) out += `- ... and ${w.createdFiles.size-10} more files\n`;
      out += `\n`;
    }

    return out;
  }
}
