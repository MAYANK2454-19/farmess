import Link from "next/link";

type Props = {
  title: string;
  subtitle: string;
  owner: string;
  scope: string;
};

export function FeaturePlaceholder({ title, subtitle }: Props) {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Farmess</p>
          <h1>{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      <section className="module-unavailable" aria-labelledby="module-unavailable-title">
        <h2 id="module-unavailable-title">This part is not ready yet</h2>
        <p>
          This page is part of the Farmess plan, but the account and saved-record workflow has not
          been connected. No offers, requests or activity are being created here in the meantime.
        </p>
        <Link href="/farmer" className="button button-secondary">
          Back to overview
        </Link>
      </section>
    </main>
  );
}
