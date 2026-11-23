import { LotForm } from "@/features/lots/lot-form";

export default function CreateProduceLotPage() {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">My produce</p>
          <h1>Add a produce lot</h1>
          <p className="page-subtitle">
            Record what is available, where it can be collected and when it needs to be sold.
          </p>
        </div>
      </div>
      <LotForm />
      <p className="preview-footnote">
        This preview checks the details in your browser only. It does not save or publish a lot.
      </p>
    </main>
  );
}
