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
          <p className="eyebrow">Farmer workspace</p>
          <h1>{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      <section className="module-unavailable" aria-labelledby="module-unavailable-title">
        <p className="module-status">Not connected yet</p>
        <h2 id="module-unavailable-title">{title} is being built.</h2>
        <p>{scope}</p>
        <p>
          This section will show information from your account once sign-in and the saved-record
          workflow are connected. It does not currently create or display real requests, offers or
          activity.
        </p>
        <div className="topbar-right" style={{ justifyContent: "flex-start", marginTop: 18 }}>
          <Link href="/farmer" className="button button-secondary">
            Back to overview
          </Link>
          <Link href="/farmer/markets" className="button button-primary">
            Check market prices
          </Link>
        </div>
      </section>
    </main>
  );
}
