import { useState, useEffect } from "react";
import { WADS_OPTIMUM_16 } from "../constants";

interface ColorPaletteProps {
  selectedColor: string;
  onChange: (color: string) => void;
  onBlur?: () => void;
}

/**
 * Wad's Optimum 16 — компактная палитра из 16 цветов.
 * Отображается по умолчанию в свойствах объекта.
 */
export default function ColorPalette({ selectedColor, onChange, onBlur }: ColorPaletteProps) {
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);

  // Восстановление выбранного цвета при смене палитры
  useEffect(() => {
    setHoveredColor(null);
  }, []);

  return (
    <div className="color-palette" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {WADS_OPTIMUM_16.map((color) => (
        <button
          key={color.hex}
          className="color-palette-swatch"
          style={{
            background: color.hex,
            border: color.hex.toLowerCase() === '#191919' ? '2px solid #555' : '2px solid transparent',
            boxShadow: hoveredColor === color.hex
              ? '0 0 0 2px #fff, 0 0 0 4px #0075DC'
              : selectedColor === color.hex
                ? '0 0 0 2px #fff, 0 0 0 4px #0075DC'
                : '0 1px 2px rgba(0,0,0,0.3)',
            transform: hoveredColor === color.hex ? 'scale(1.15)' : 'scale(1)',
            cursor: 'pointer',
            borderRadius: '4px',
            width: '28px',
            height: '28px',
            padding: 0,
            transition: 'all 0.15s ease',
          }}
          onClick={() => onChange(color.hex)}
          onMouseEnter={() => setHoveredColor(color.hex)}
          onMouseLeave={() => setHoveredColor(null)}
          onBlur={onBlur}
          title={`${color.nameRu} (${color.name}) — ${color.hex}`}
          aria-label={`${color.nameRu} — ${color.hex}`}
        />
      ))}
    </div>
  );
}
