import { useState } from 'react';

/** Inline-editable name: click ✎ to edit, Enter/blur saves, Esc cancels. */
export function EditableName({
  value,
  onSave,
  title = 'Rename',
}: {
  value: string;
  onSave: (name: string) => void;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  const commit = () => {
    setEditing(false);
    const t = text.trim();
    if (t && t !== value) onSave(t);
  };

  if (editing) {
    return (
      <input
        className="editable-name-input"
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      className="editable-name"
      title={title}
      onClick={() => {
        setText(value);
        setEditing(true);
      }}
    >
      <span className="editable-name-text">{value}</span>
      <span className="edit-pencil">✎</span>
    </button>
  );
}
