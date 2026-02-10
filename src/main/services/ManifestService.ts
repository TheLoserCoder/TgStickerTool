import * as fs from 'fs';
import * as path from 'path';

export interface FragmentEntry {
  fileName: string;
  status: 'pending' | 'uploaded';
  emoji?: string;
  fileId?: string;
}

export interface Manifest {
  fragments: FragmentEntry[];
  order: string[];
  packName?: string;
  lastUpdated: string;
  pendingReorder?: boolean;
}

export class ManifestService {
  private manifestPath: string;

  constructor(packDir: string) {
    this.manifestPath = path.join(packDir, 'manifest.json');
  }

  load(): Manifest {
    if (!fs.existsSync(this.manifestPath)) {
      return { fragments: [], order: [], lastUpdated: new Date().toISOString() };
    }
    return JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
  }

  save(manifest: Manifest): void {
    manifest.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  initFragments(fileNames: string[], emoji: string, packName?: string): Manifest {
    const manifest = this.load();
    const existing = new Set(manifest.fragments.map(f => f.fileName));
    
    if (packName) {
      manifest.packName = packName;
    }
    
    fileNames.forEach(fileName => {
      if (!existing.has(fileName)) {
        manifest.fragments.push({ fileName, status: 'pending', emoji });
        manifest.order.push(fileName);
      }
    });
    
    this.save(manifest);
    return manifest;
  }

  markUploaded(fileName: string, fileId: string, emoji: string): void {
    const manifest = this.load();
    const frag = manifest.fragments.find(f => f.fileName === fileName);
    if (frag) {
      frag.status = 'uploaded';
      frag.fileId = fileId;
      frag.emoji = emoji;
      this.save(manifest);
    }
  }

  syncWithTelegram(fileNames: string[], telegramStickers: Array<{ file_id: string }>, emoji: string): void {
    const manifest = this.load();
    
    // Сопоставляем по порядку файлов
    fileNames.forEach((fileName, idx) => {
      if (idx < telegramStickers.length) {
        const frag = manifest.fragments.find(f => f.fileName === fileName);
        if (frag) {
          frag.status = 'uploaded';
          frag.fileId = telegramStickers[idx].file_id;
          frag.emoji = emoji;
        }
      }
    });
    
    this.save(manifest);
  }

  removeFragment(fileName: string): void {
    const manifest = this.load();
    manifest.fragments = manifest.fragments.filter(f => f.fileName !== fileName);
    manifest.order = manifest.order.filter(f => f !== fileName);
    this.save(manifest);
  }

  updateOrder(order: string[]): void {
    const manifest = this.load();
    manifest.order = order;
    manifest.pendingReorder = true;
    this.save(manifest);
  }

  getOrderedFragments(): FragmentEntry[] {
    const manifest = this.load();
    const fragmentMap = new Map(manifest.fragments.map(f => [f.fileName, f]));
    return manifest.order
      .map(fileName => fragmentMap.get(fileName))
      .filter((f): f is FragmentEntry => f !== undefined);
  }

  getFileIdByName(fileName: string): string | null {
    const manifest = this.load();
    const frag = manifest.fragments.find(f => f.fileName === fileName);
    return frag?.fileId || null;
  }

  getUploadedCount(): number {
    return this.load().fragments.filter(f => f.status === 'uploaded').length;
  }

  canDelete(): boolean {
    return this.getUploadedCount() > 1;
  }
}
