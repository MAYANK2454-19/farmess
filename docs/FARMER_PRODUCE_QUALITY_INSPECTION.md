# Farmer produce quality inspection

Farmers can save append-only quality observations against their own produce lots. Each record stores the authenticated farmer as assessor, a server-generated timestamp, six checklist results, optional notes, completion count and observed issues.

The checklist covers appearance/maturity, physical damage, pest or contamination, moisture condition, packaging and temperature handling. Missing or explicitly unassessed items keep the record incomplete; an observed issue is flagged for attention. No numeric grade is calculated and the inspection does not certify food safety, replace an independent assessor, or change lot publication.

The inspection table uses row-level security and a composite lot/owner foreign key. Farmers can read and insert records only for lots they own. Records are append-only through the application API. Apply the migration before deploying this feature; the API returns an error if the table is not yet present.
