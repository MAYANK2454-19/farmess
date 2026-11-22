import { LotForm } from "@/features/lots/lot-form";

export default function CreateProduceLotPage() {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">My Produce</p>
          <h1>Add a produce lot</h1>
          <p className="page-subtitle">
            Tell us what you have available and when it needs to be sold.
          </p>
        </div>
      </div>
      <div className="preview-banner" role="status">
        <span className="banner-dot" />
        <span>
          <strong>Prototype form.</strong> Review works locally; account sign-in, server validation
          and saving are next integration steps.
        </span>
      </div>
      <LotForm />
    </main>
  );
}
