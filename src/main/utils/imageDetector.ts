import * as fs from 'fs';
import sharp from 'sharp';

export function isAPNG(filePath: string): boolean {
  try {
    const buffer = fs.readFileSync(filePath);
    
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (!buffer.slice(0, 8).equals(pngSignature)) {
      return false;
    }
    
    return buffer.includes(Buffer.from('acTL'));
  } catch (error) {
    console.error('[ImageDetector] Error checking APNG:', error);
    return false;
  }
}

export async function isAnimatedWebP(filePath: string): Promise<boolean> {
  try {
    const buffer = fs.readFileSync(filePath);
    const metadata = await sharp(buffer, { animated: true, pages: -1 }).metadata();
    return metadata.pages !== undefined && metadata.pages > 1;
  } catch (error) {
    console.error('[ImageDetector] Error checking WebP:', error);
    return false;
  }
}

export async function isAnimatedImage(filePath: string): Promise<boolean> {
  const ext = filePath.toLowerCase();
  
  if (ext.endsWith('.gif')) {
    return true;
  }
  
  if (ext.endsWith('.png')) {
    return isAPNG(filePath);
  }
  
  if (ext.endsWith('.webp')) {
    return await isAnimatedWebP(filePath);
  }
  
  return false;
}
