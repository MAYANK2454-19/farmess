import Link from "next/link";
import { Icon } from "@/components/icons";

export default function MyProducePage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Farmer workspace</p>
          <h1>My Produce</h1>
          <p className="page-subtitle">
            Manage your produce lots, availability dates and selling urgency.
          </p>
        </div>
        <Link href="/farmer/produce/new" className="button button-primary">
          <Icon name="plus" size={16} /> Add produce lot
        </Link>
      </div>

      <div className="preview-banner" role="status">
        <span className="banner-dot" />
        <span>
          <strong>Build preview.</strong> Saved lots will appear here after
          authentication and database persistence are connected.
        </span>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Your produce lots</h2>
            <p className="panel-caption">
              Crop, variety, grade, quantity, sell-by date and current status
            </p>
          </div>
        </div>
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="leaf" size={23} />
          </span>
          <h3 className="empty-title">No produce lots have been added</h3>
          <p className="empty-copy">
            Add a lot to record what is available, where it can be collected,
            and how soon it needs to be sold. You can review the details before
            anything is submitted or shared.
          </p>
          <Link
            href="/farmer/produce/new"
            className="button button-primary"
            style={{ marginTop: 16 }}
          >
            Add your first produce lot <Icon name="chevron" size={15} />
          </Link>
        </div>
      </section>
    </main>
  );
}
