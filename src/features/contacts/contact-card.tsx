export type CounterpartyContact = {
  name: string | null;
  organisation: string | null;
  phone: string | null;
  email: string | null;
  /** "accepted" | "consent" | null (not shared yet). */
  sharedBecause: string | null;
};

/**
 * Counterparty contact block. Phone and email appear only when the person has
 * opted in or the offer / request has been accepted (enforced in the database).
 */
export function ContactCard({
  title = "Contact",
  contact,
  hiddenHint,
}: {
  title?: string;
  contact: CounterpartyContact | null | undefined;
  hiddenHint: string;
}) {
  if (!contact) return null;
  const who = [contact.name, contact.organisation].filter(Boolean).join(" · ") || "Farmess user";
  const shared = Boolean(contact.phone || contact.email);

  return (
    <div className="contact-card">
      <strong>{title}</strong>
      <span>{who}</span>
      {shared ? (
        <span className="contact-card-lines">
          {contact.phone ? (
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>📞 {contact.phone}</a>
          ) : null}
          {contact.email ? <a href={`mailto:${contact.email}`}>✉️ {contact.email}</a> : null}
        </span>
      ) : (
        <span className="form-help">{hiddenHint}</span>
      )}
      {shared && contact.sharedBecause === "consent" ? (
        <span className="form-help">Shared because they chose to share their contact.</span>
      ) : null}
    </div>
  );
}
