export default function SelectCard({
  selected,
  onSelect,
  className = '',
  style = {},
  children,
  ariaLabel
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={className}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        position: 'relative',
        zIndex: 1,
        ...style
      }}
    >
      {children}
    </div>
  );
}
