# Offer terms validation

Buyer offers should carry explicit quantity, quantity unit, price, price basis and a future validity time.

The pure `validateOfferTerms` helper checks those fields before a server-side transition is attempted. Money is represented as integer paise, and the price basis must match the quantity unit so a caller cannot accidentally compare a per-kg price with a quintal quantity.

This helper does not authorize buyers, farmers or providers, persist offers, or perform state transitions. Server code must still verify identities, lot ownership, offer expiry and authorization before accepting a transition.
