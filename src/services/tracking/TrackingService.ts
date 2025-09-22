import type { TFile } from 'obsidian';
import type StudyAnalyticsPlugin from '../../../main';

export class TrackingService {
  private plugin: StudyAnalyticsPlugin;
  private debounced: Map<string, number> = new Map();

  constructor(plugin: StudyAnalyticsPlugin) {
    this.plugin = plugin;
  }

  register() {
    const p = this.plugin;
    if (p.settings.trackModifiedFiles || p.settings.trackCreatedNotes) {
      p.registerEvent(
        p.app.vault.on('modify', (file) => this.onModify(file))
      );
    }
    if (p.settings.trackCreatedNotes) {
      p.registerEvent(
        p.app.vault.on('create', (file) => this.onCreate(file))
      );
    }
    if (p.settings.trackOpenedFiles) {
      p.registerEvent(
        p.app.workspace.on('file-open', (file) => this.onOpen(file))
      );
    }
  }

  private onModify(file: any) {
    const p = this.plugin;
    if (!p.currentSession || p.currentSession.isBreak) return;
    if (p.settings.focusPath && !file.path.startsWith(p.settings.focusPath)) return;
    p.currentSession.trackModifiedFile(file.path);
    if (p.settings.autoSetCategoryByFolder) p.updateCategoryByFolder(file.path);
    if (p.settings.trackWordCount && file instanceof (p.app.vault.constructor as any).TFile && (file as TFile).extension === 'md') {
      this.debounce(file.path, async () => {
        const content = await p.app.vault.read(file as TFile);
        const wordCount = p.countWords(content);
        p.currentSession?.updateWordCount(file.path, wordCount);
        const cache = p.app.metadataCache.getFileCache(file as TFile);
        if (cache && cache.links) p.currentSession?.updateLinkCount(file.path, cache.links.length);
        // Persist live snapshot after significant change
        p.scheduleAutosaveLiveSnapshot();
      });
    }
    // Also schedule a snapshot for non-MD modifies
    if (!(file instanceof (p.app.vault.constructor as any).TFile) || (file as TFile).extension !== 'md') {
      p.scheduleAutosaveLiveSnapshot();
    }
  }

  private onCreate(file: any) {
    const p = this.plugin;
    if (!p.currentSession || p.currentSession.isBreak) return;
    if (file instanceof (p.app.vault.constructor as any).TFile) {
      if ((file as TFile).extension === 'md') {
        p.currentSession.trackCreatedFile(file.path);
        if (p.settings.autoSetCategoryByFolder) p.updateCategoryByFolder(file.path);
        p.scheduleAutosaveLiveSnapshot();
      }
    }
  }

  private onOpen(file: any) {
    const p = this.plugin;
    if (!p.currentSession || p.currentSession.isBreak || !file) return;
    if (p.settings.focusPath && !file.path.startsWith(p.settings.focusPath)) return;
    p.currentSession.trackOpenedFile(file.path);
    if (p.settings.autoSetCategoryByFolder) p.updateCategoryByFolder(file.path);
    p.scheduleAutosaveLiveSnapshot();
  }

  private debounce(key: string, fn: () => void, wait = 800) {
    const old = this.debounced.get(key);
    if (old) window.clearTimeout(old);
    const id = window.setTimeout(fn, wait);
    this.debounced.set(key, id);
  }
}
