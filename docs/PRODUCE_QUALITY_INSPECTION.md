# Produce quality inspection

The quality-inspection helper provides a consistent checklist summary for a produce lot.

## Checklist

- Appearance
- Physical damage
- Pest or contamination observations
- Moisture condition
- Packaging condition
- Temperature handling

Each check is marked `acceptable`, `issue_found` or `not_assessed`.

## Outcomes

- `incomplete`: one or more checks are missing or not assessed.
- `needs_attention`: every check has a result and at least one issue was recorded.
- `checks_complete`: every check was marked acceptable.

The result includes the exact issue and unassessed check keys so the operator can follow up.

## Important limits

This is a checklist summary, not a food-safety certification, laboratory result, automated grade, or legal quality certificate. It does not change lot grade, publish/unpublish a lot, or persist records. A qualified human assessor must interpret observations and apply the project's approved grading policy. An authenticated server endpoint must verify assessor permissions and lot access before storing an inspection.
