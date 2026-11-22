# Buyer requirement validation contract

The marketplace buyer-requirement validator checks and normalizes a draft before it is passed to lot matching.

## Fields

- Crop and pickup area are required and trimmed.
- Variety and grade are optional; blank values become `null`, not guessed values.
- Quantity must be a finite number greater than zero.
- Unit must be `kg`, `quintal` or `tonne`.
- Required date must be a real ISO calendar date or a timezone-qualified ISO timestamp. The normalized value is UTC ISO format.
- Crop, variety, grade and pickup area have bounded lengths to avoid oversized input.

## Usage

```ts
import { validateBuyerRequirement } from "@/features/marketplace/buyer-requirements";

const result = validateBuyerRequirement(formValues);
if (!result.valid) {
  // Render result.errors beside the corresponding fields.
} else {
  // Pass result.value to the matching workflow.
}
```

## Boundaries

This is a pure validation/normalization helper. It does not create or persist a buyer requirement, verify the buyer's identity, authorize access, guarantee a matching lot, or decide whether a date is still operationally available. The API must validate again and enforce authorization on the server. Matching remains explainable and must retain unknown optional attributes as unknown.
