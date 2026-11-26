import type { CounterpartyContact } from "@/features/contacts/contact-card";

type ContactRow = {
  counterparty_name: string | null;
  organisation_name: string | null;
  phone: string | null;
  email: string | null;
  shared_because: string | null;
};

/** Index counterparty contact rows (from offer_contacts / service_request_contacts) by id. */
export function contactsById<T extends ContactRow>(
  rows: readonly T[] | null | undefined,
  idOf: (row: T) => string,
): Map<string, CounterpartyContact> {
  return new Map(
    (rows ?? []).map((row) => [
      idOf(row),
      {
        name: row.counterparty_name,
        organisation: row.organisation_name,
        phone: row.phone,
        email: row.email,
        sharedBecause: row.shared_because,
      },
    ]),
  );
}
