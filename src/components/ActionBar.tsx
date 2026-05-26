import { useTranslation } from '../i18n/useTranslation';

interface ActionBarProps {
  disabled: boolean;
  onRemoveAccents: () => void;
  onAddAccents: () => void;
  onExpandAbbreviations: () => void;
}

export function ActionBar({ disabled, onRemoveAccents, onAddAccents, onExpandAbbreviations }: ActionBarProps) {
  const { t } = useTranslation();
  return (
    <div className="action-bar">
      <button className="action-btn" disabled={disabled} onClick={onRemoveAccents}>
        {t('removeAccents')}
      </button>
      <button className="action-btn" disabled={disabled} onClick={onAddAccents}>
        {t('addAccents')}
      </button>
      <button className="action-btn" disabled={disabled} onClick={onExpandAbbreviations}>
        {t('expandAbbreviations')}
      </button>
    </div>
  );
}
