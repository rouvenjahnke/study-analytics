import type StudyAnalyticsPlugin from '../../../main';
import type { TFile, CachedMetadata } from 'obsidian';

export class TagIndexService {
  private plugin: StudyAnalyticsPlugin;
  private tagToFiles: Map<string, Set<string>> = new Map();
  private fileToTags: Map<string, Set<string>> = new Map();

  constructor(plugin: StudyAnalyticsPlugin) {
    this.plugin = plugin;
  }

  async register() {
    // Build initial index
    await this.buildInitialIndex();
    // Listen to metadata changes
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', (file, _data, cache) => {
        if (file instanceof TFile) this.updateFileTags(file, cache);
      })
    );
    // Listen to file creation/deletion
    this.plugin.registerEvent(
      this.plugin.app.vault.on('create', (f) => {
        if (f instanceof TFile) {
          const cache = this.plugin.app.metadataCache.getFileCache(f);
          this.updateFileTags(f, cache);
        }
      })
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on('delete', (f) => {
        if ((f as any)?.path) this.removeFile((f as any).path);
      })
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on('rename', (f, oldPath) => {
        if (f instanceof TFile) {
          // Remove old path, then add new
          this.removeFile(oldPath);
          const cache = this.plugin.app.metadataCache.getFileCache(f);
          this.updateFileTags(f, cache);
        }
      })
    );
  }

  getFilesForTag(tag: string): ReadonlySet<string> {
    return this.tagToFiles.get(tag) || new Set();
  }

  private async buildInitialIndex() {
    const files = this.plugin.app.vault.getMarkdownFiles();
    for (const f of files) {
      const cache = this.plugin.app.metadataCache.getFileCache(f);
      this.updateFileTags(f, cache);
    }
  }

  private removeFile(path: string) {
    const prevTags = this.fileToTags.get(path);
    if (!prevTags) return;
    for (const tag of prevTags) {
      const set = this.tagToFiles.get(tag);
      if (set) {
        set.delete(path);
        if (set.size === 0) this.tagToFiles.delete(tag);
      }
    }
    this.fileToTags.delete(path);
  }

  private updateFileTags(file: TFile, cache: CachedMetadata | null | undefined) {
    const path = file.path;
    const newTags = new Set<string>();
    if (cache?.tags?.length) {
      for (const t of cache.tags) newTags.add(t.tag);
    }
    // Diff with previous tags
    const prevTags = this.fileToTags.get(path) || new Set<string>();
    // Tags to remove
    for (const tag of prevTags) {
      if (!newTags.has(tag)) {
        const set = this.tagToFiles.get(tag);
        if (set) {
          set.delete(path);
          if (set.size === 0) this.tagToFiles.delete(tag);
        }
      }
    }
    // Tags to add
    for (const tag of newTags) {
      if (!prevTags.has(tag)) {
        if (!this.tagToFiles.has(tag)) this.tagToFiles.set(tag, new Set<string>());
        this.tagToFiles.get(tag)!.add(path);
      }
    }
    // Store new set
    this.fileToTags.set(path, newTags);
  }
}

