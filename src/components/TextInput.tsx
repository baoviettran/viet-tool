import { useTranslation } from '../i18n/useTranslation';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function TextInput({ value, onChange }: TextInputProps) {
  const { t } = useTranslation();
  return (
    <textarea
      className="text-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('inputPlaceholder')}
      rows={8}
    />
  );
}
