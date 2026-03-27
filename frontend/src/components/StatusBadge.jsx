const statusStyles = {
  Active: 'border-success/30 bg-success/10 text-success',
  Monitoring: 'border-warning/30 bg-warning/10 text-warning',
  'Under Review': 'border-primary/20 bg-primary/10 text-primary',
  Indexed: 'border-primary/20 bg-primary/10 text-primary',
  Offline: 'border-danger/30 bg-danger/10 text-danger',
};

export function StatusBadge({ status }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em]',
        statusStyles[status] ?? statusStyles['Under Review'],
      ].join(' ')}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
