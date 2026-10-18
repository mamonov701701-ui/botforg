import { useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  style?: CSSProperties;
};

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  minLength,
  disabled,
  style,
}: Props) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    const input = inputRef.current;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;
    const direction = input?.selectionDirection;
    setVisible(previous => !previous);
    window.requestAnimationFrame(() => {
      if (!input?.isConnected) return;
      input.focus();
      if (start !== null && start !== undefined && end !== null && end !== undefined) {
        input.setSelectionRange(start, end, direction ?? undefined);
      }
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        id={id}
        aria-label={label}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        disabled={disabled}
        style={{
          ...style,
          width: '100%',
          minHeight: 44,
          boxSizing: 'border-box',
          paddingRight: 52,
        }}
      />
      <button
        type="button"
        onClick={toggle}
        onMouseDown={event => event.preventDefault()}
        aria-label={`${visible ? 'Скрыть' : 'Показать'} ${label.toLowerCase()}`}
        aria-pressed={visible}
        disabled={disabled}
        style={{
          position: 'absolute',
          right: 2,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 44,
          height: 44,
          display: 'grid',
          placeItems: 'center',
          border: 0,
          background: 'transparent',
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
