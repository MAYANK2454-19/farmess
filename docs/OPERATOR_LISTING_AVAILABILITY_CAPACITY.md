# Provider listing availability and capacity updates

Operators can update the capacity and availability window of their own transport or storage listings without publishing a duplicate listing.

## Editable fields

- Capacity quantity and unit are updated together. Both can be cleared when the provider no longer has a reliable capacity figure.
- Availability start and end are optional calendar dates. Either can be cleared independently.
- An end date cannot precede a start date.
- The API accepts only the listing ID and these four fields. Verification state, operator identity, price, service coordinates and listing status are not editable through this action.

## Access and truthfulness

The route requires a same-origin request and an authenticated operator session. The database update is scoped to both the listing ID and the current operator ID. A successful response is returned only when the owned listing was updated.

Availability and capacity are provider-entered statements, not a confirmed booking or live inventory guarantee. Farmers must still submit a service request and wait for the provider's response. Updating these fields does not change the administrative verification state.

## Verification

Focused tests cover valid updates, clearing optional fields, paired capacity values, supported units, positive quantities, strict calendar dates, reversed date windows, unknown fields and malformed IDs.
