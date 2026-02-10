import { useEffect, useState } from 'react';
import styles from './ImageCanvas.module.scss';

interface ImageCanvasProps {
  imageData: string;
  rows: number;
  columns: number;
  zoom: number;
}

export function ImageCanvas({ imageData, rows, columns, zoom }: ImageCanvasProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const img = new Image();
    img.src = imageData;
    img.onload = () => {
      const workspaceW = window.innerWidth - 300 - 80;
      const workspaceH = window.innerHeight - 80;

      const imgW = img.width;
      const imgH = img.height;

      const sectionW = imgW / columns;
      const sectionH = imgH / rows;
      const sectionSize = Math.max(sectionW, sectionH);

      const canvasW = columns * sectionSize;
      const canvasH = rows * sectionSize;

      const canvasScale = Math.min(workspaceW / canvasW, workspaceH / canvasH, 1) * 0.85;

      const scaledCanvasW = canvasW * canvasScale;
      const scaledCanvasH = canvasH * canvasScale;
      const scaledImgW = imgW * canvasScale;
      const scaledImgH = imgH * canvasScale;

      const offsetX = (scaledCanvasW - scaledImgW) / 2;
      const offsetY = (scaledCanvasH - scaledImgH) / 2;

      setImageSize({ width: scaledImgW, height: scaledImgH });
      setImageOffset({ x: offsetX, y: offsetY });
      setDimensions({ width: scaledCanvasW, height: scaledCanvasH });
    };
  }, [imageData, rows, columns]);

  if (!dimensions.width || !dimensions.height) return null;

  const sectionSize = dimensions.width / columns;

  return (
    <div
      className={styles.canvas}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        transform: `scale(${zoom})`,
        transformOrigin: 'center',
      }}
    >
      <img
        src={imageData}
        alt="Preview"
        className={styles.image}
        style={{
          width: imageSize.width,
          height: imageSize.height,
          left: imageOffset.x,
          top: imageOffset.y,
        }}
      />
      <svg className={styles.grid} width={dimensions.width} height={dimensions.height}>
        {Array.from({ length: columns + 1 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={i * sectionSize}
            y1={0}
            x2={i * sectionSize}
            y2={dimensions.height}
          />
        ))}
        {Array.from({ length: rows + 1 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={i * sectionSize}
            x2={dimensions.width}
            y2={i * sectionSize}
          />
        ))}
      </svg>
    </div>
  );
}
