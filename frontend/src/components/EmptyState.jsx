export function EmptyState({ title, description, action }) {
  return (
    <div className="panel rounded-3xl px-6 py-10 text-center">
      <div className="mx-auto max-w-lg">
        <h3 className="font-display text-2xl font-bold tracking-[-0.06em] text-text">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300/74">{description}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
