import Link from "next/link";
import { Icon } from "@/components/icons";

export default function MyProducePage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your inventory</p>
          <h1>My produce</h1>
          <p className="page-subtitle">
            Keep track of the crop, quantity, quality and collection details for each lot.
          </p>
        </div>
        <Link href="/farmer/produce/new" className="button button-primary">
          <Icon name="plus" size={16} /> Add a produce lot
        </Link>
      </div>

      <section className="panel" aria-labelledby="lots-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="lots-heading">Your produce lots</h2>
            <p className="panel-caption">
              Crop, variety, grade, quantity, collection area and sell-by date
            </p>
          </div>
        </div>
        <div className="empty-state">
          <h3 className="empty-title">No produce lots to show</h3>
          <p className="empty-copy">
            Your inventory will appear here after you add a lot. Each record should describe
            produce that is actually available, with a clear quantity and collection area.
          </p>
          <Link href="/farmer/produce/new" className="button button-primary" style={{ marginTop: 16 }}>
            Add your first lot <Icon name="chevron" size={15} />
          </Link>
        </div>
      </section>

      <p className="preview-footnote">
        Saved lot records are not connected to your account in this preview. Do not enter sensitive
        personal details in the collection-area field.
      </p>
    </main>
  );
}
