export function SectionHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.36em] text-primary">{eyebrow}</div>
        ) : null}
        <h1 className="font-display text-4xl font-bold tracking-[-0.08em] text-text md:text-6xl">{title}</h1>
        {description ? <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300/78">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
