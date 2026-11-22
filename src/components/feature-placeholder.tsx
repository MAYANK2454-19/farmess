import Link from "next/link";

type Props = { title: string; subtitle: string; owner: string; scope: string };

export function FeaturePlaceholder({ title, subtitle, owner, scope }: Props) {
  return (
    <main className="content module-page">
      <div className="page-heading"><div><p className="eyebrow">Farmess workspace</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div></div>
      <div className="preview-banner" role="status"><span className="banner-dot" /><span><strong>Team module in progress.</strong> This route is reserved for the assigned feature lane.</span></div>
      <section className="panel module-card">
        <div className="module-status">Implementation not connected</div>
        <h2>This section is being built collaboratively</h2>
        <p>{scope}</p>
        <div className="module-owner">Initial owner: {owner} · This placeholder will be replaced by the feature PR.</div>
        <div style={{ marginTop: 19 }}><Link href="/farmer" className="button button-secondary">Back to overview</Link></div>
      </section>
    </main>
  );
}
