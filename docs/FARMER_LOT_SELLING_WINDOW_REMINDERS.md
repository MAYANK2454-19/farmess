# Farmer lot selling-window reminders

The farmer inventory page classifies each lot using the calendar dates the farmer entered:

- **Past sell-by:** the entered sell-by date is before today's India-local calendar date.
- **Sell-by approaching:** the sell-by date is today or within the next three calendar days, and the lot is already available.
- **Upcoming:** the availability date is still in the future.
- **Within selling window:** the lot is available and its sell-by date is more than three days away.

Lots are sorted by urgency, then nearest sell-by date. Invalid dates and reversed date windows are omitted rather than guessed. Each lot links to its private quality record, and the panel links to reported market prices.

These are calendar reminders, not estimates of shelf life or produce freshness. Farmess does not infer spoilage, food safety, or a guaranteed sale from entered dates. Reminders are private to the owning farmer and require no new database table or external service.
