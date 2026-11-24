import Link from "next/link";

type Props = {
  title: string;
  subtitle: string;
  owner: string;
  scope: string;
};

export function FeaturePlaceholder({ title, subtitle, scope }: Props) {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      <section className="module-unavailable" aria-labelledby="module-unavailable-title">
        <h2 id="module-unavailable-title">Not available yet</h2>
        <p>{scope}</p>
        <Link href="/farmer" className="button button-secondary">
          Back to overview
        </Link>
      </section>
    </main>
  );
}
