import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore, currentLanguage, setLanguage, LANGUAGES, type Language } from "../store/settings";
import { LENGTH_UNITS, unitLabelKey, type LengthUnit } from "../store/units";
import { THEMES } from "../themes";

/**
 * APP-SETTINGS: окно «Настройки» (шестерёнка в статус-баре). Меняется сразу (без «Применить»):
 * язык, тема, звуки (вкл. / громкость), единицы длины; «Сбросить» — всё по умолчанию (язык — браузера).
 * Хранятся в localStorage (`store/settings.ts`). Esc / фон / «Закрыть» — закрыть; клавиши не уходят
 * в сочетания App.
 */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const sound = useSettingsStore((s) => s.sound);
  const units = useSettingsStore((s) => s.units);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setSound = useSettingsStore((s) => s.setSound);
  const setUnits = useSettingsStore((s) => s.setUnits);
  const reset = useSettingsStore((s) => s.reset);
  const [lang, setLang] = useState<Language>(currentLanguage());
  useEffect(() => { setLang(currentLanguage()); }, [i18n.language]);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  return (
    <div
      className="text-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="text-modal-box dim-settings-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings-modal"
      >
        <div className="text-modal-title" id="settings-title">{t("settings.title")}</div>

        <label className="dim-settings-field">
          <span className="dim-settings-label">{t("settings.language")}</span>
          <select
            className="props-input dim-settings-select"
            data-testid="settings-language"
            value={lang}
            onChange={(e) => { const l = e.target.value as Language; setLang(l); setLanguage(l); }}
          >
            {LANGUAGES.map((l) => <option key={l} value={l}>{t(`settings.lang.${l}`)}</option>)}
          </select>
        </label>

        <label className="dim-settings-field">
          <span className="dim-settings-label">{t("settings.theme")}</span>
          <select
            className="props-input dim-settings-select"
            data-testid="settings-theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            {THEMES.map((th) => <option key={th.id} value={th.id}>{t(th.labelKey)}</option>)}
          </select>
        </label>

        <label className="dim-settings-field">
          <span className="dim-settings-label">{t("settings.sound")}</span>
          <input
            type="checkbox"
            data-testid="settings-sound"
            checked={sound.enabled}
            onChange={(e) => setSound({ enabled: e.target.checked })}
          />
        </label>

        <label className="dim-settings-field">
          <span className="dim-settings-label">{t("settings.volume")}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            data-testid="settings-volume"
            value={Math.round(sound.volume * 100)}
            disabled={!sound.enabled}
            onChange={(e) => setSound({ volume: Number(e.target.value) / 100 })}
          />
          <span className="dim-list-value">{Math.round(sound.volume * 100)}%</span>
        </label>

        <label className="dim-settings-field">
          <span className="dim-settings-label">{t("settings.units")}</span>
          <select
            className="props-input dim-settings-select"
            data-testid="settings-units"
            value={units}
            onChange={(e) => setUnits(e.target.value as LengthUnit)}
          >
            {LENGTH_UNITS.map((u) => <option key={u} value={u}>{t(`settings.unitName.${u}`)} ({t(unitLabelKey(u))})</option>)}
          </select>
        </label>
        <div className="text-sm text-muted-xs" style={{ marginTop: 6 }}>{t("settings.unitsHint")}</div>

        <div className="text-modal-actions">
          <button className="btn" data-testid="settings-reset" onClick={reset}>{t("settings.reset")}</button>
          <button ref={closeRef} className="btn primary" data-testid="settings-close" onClick={onClose}>{t("settings.close")}</button>
        </div>
      </div>
    </div>
  );
}
