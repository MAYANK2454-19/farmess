# FARMESS — Master Figma, Prototype, Workflows & Product Documentation Brief

**Purpose:** Give this file to a teammate and ask their GPT to execute the complete Farmess design and documentation work in one connected Figma file.  
**Project:** Farmess  
**Competition / context:** Sangam × ANANTA 2026  
**Team:** Team 13 — CodeFarm  
**Product owner / team lead:** Mayank  
**Document status:** Consolidated execution specification based on the team's agreed product and UX decisions.  
**Existing Figma file:** [Farmess — existing Figma file](https://www.figma.com/design/S0JzUA0lpaApwy8ifPeCZn?node-id=6-3)  
**Figma file key:** `S0JzUA0lpaApwy8ifPeCZn`

---

# 1. Instructions to the GPT receiving this file

You are the product designer, UX architect, systems analyst, and Figma execution agent for **Farmess**. Treat this brief as the source of truth. Your job is to turn it into a complete, editable, coherent product blueprint in **one Figma file**, not to merely describe what should be built.

## 1.1 Required final outcome

Update the existing Farmess Figma file linked above. Keep all deliverables in that file and return **one shareable Figma file link** that opens the complete work. The one file must contain:

1. Product overview and agreed scope.
2. Complete system architecture.
3. DFD Level 0 and DFD Level 1.
4. Farmer, buyer, and logistics-provider workflows.
5. Notification event flow, notification UI, data model, and permission rules.
6. Data model / entity relationships and role-based access rules.
7. A realistic, clickable, responsive website prototype representing the actual website the team intends to build.
8. Desktop and mobile screen designs for the primary journeys.
9. Screen states, edge cases, empty/loading/error/success/pending states.
10. Testing plan, acceptance criteria, and implementation handoff notes.

The Figma file must work as a single source of truth for product understanding, design review, judging/presentation, and implementation by the student team.

## 1.2 Execute, do not only explain

- Inspect the existing Figma file before changing it.
- Reuse and improve existing screens where useful. Do not discard good existing work without reason.
- Create all missing pages, frames, diagrams, documentation and prototype interactions in the same file.
- Use editable Figma layers and native shapes/text/components. Do not use a flattened screenshot as a substitute for a screen, workflow, architecture, or diagram.
- Add meaningful prototype connections so the primary journeys can actually be clicked through.
- Verify the resulting pages and interactions in Figma before declaring the work complete.
- Return the final Figma file link and a concise completion report listing pages added/updated and anything genuinely blocked.

## 1.3 Honesty and access requirements

This task requires a working Figma integration with permission to edit the existing file and enough available tool calls. If Figma access, permissions, or a tool-call quota prevents edits:

- Do not claim that anything has been updated.
- Do not invent screenshots, page names, node IDs, or a new link.
- Do not create an unrelated substitute and present it as the requested Figma file.
- Explain the exact blocker and identify the work that remains.
- You may prepare content in the chat as a fallback, but that does not count as a completed Figma update.

Do not silently switch to a new Figma file. If the existing file cannot be accessed, report that first. Create a new file only if the user explicitly authorises that change.

## 1.4 Design and product fidelity

The prototype is the **blueprint for the real Farmess website**. It must show the screens, terminology, information, navigation, forms, actions, role differences, and responsive behaviour that the team actually intends to implement. It must not be a generic dashboard concept that merely looks polished.

Every visible control must have a clear purpose. Every primary button must lead to the next meaningful screen or state. If an action is outside the MVP, label it as unavailable or planned; do not pretend it works. A clickable Figma prototype is a design simulation, not a working backend.

---

# 2. Product definition

## 2.1 What Farmess is

Farmess is a farmer-centred produce-market decision-support and marketplace coordination platform. It helps a farmer record a produce lot, compare relevant market options, understand the estimated net amount they may realise after relevant costs, review buyer interest/offers, and coordinate transport or storage requests.

The product should help a farmer make a better-informed decision than looking at a headline market price alone. It should make assumptions, information sources, dates, units, and uncertainty visible.

## 2.2 Core user problem

A farmer may see a high quoted market price but may not know whether that option is actually better after transport, handling, packaging, market charges, storage, and expected quality loss. Buyer discovery and transport/storage coordination may also require separate calls and manual coordination.

Farmess brings the relevant information and workflow into one understandable place. It should not promise a guaranteed sale, guaranteed profit, or a guaranteed buyer.

## 2.3 Core product promise

**Help farmers compare realistic sale options for a specific produce lot, using transparent prices, costs, and assumptions, and then coordinate the next step.**

## 2.4 Product principles

1. **Farmer-first:** plain language, readable values, clear next actions, low cognitive load.
2. **Transparent calculations:** show the formula, unit, assumptions, cost components, source, and observation date.
3. **No fabricated live information:** never invent market prices, buyer offers, transport capacity, storage availability, or provider responses.
4. **Reported versus estimated:** distinguish reported market prices, buyer offers, estimated costs, historical observations, and calculated net return.
5. **No guaranteed outcomes:** show estimates and uncertainty rather than guaranteed profit or sale claims.
6. **Privacy by default:** private contact details and precise location are not public by default.
7. **MVP realism:** prioritise a small set of implementable features. Do not invent AI features, payments, tracking, or integrations that the team has not agreed or verified.
8. **Consistent responsive product:** mobile is not a separate toy mockup. It must represent the same product and complete key user journeys.

## 2.5 Explicit non-goals unless the team separately approves them

Do not imply that Farmess already provides:

- Guaranteed selling prices, profit, buyer demand, or sale completion.
- Real-time GPS vehicle tracking or guaranteed transport capacity.
- Instant logistics booking without provider confirmation.
- Integrated payments, escrow, loans, insurance, or credit scoring.
- Automated quality grading using computer vision.
- AI predictions or recommendations without validated data and a documented method.
- Direct government-system integration unless access, API availability, permissions, and data fields have been checked.
- Live inventory or buyer data when only demonstration data is available.

Any future feature may be placed in a clearly labelled **Future / not in MVP** section, but it must not appear as a currently working feature in the main prototype.

---

# 3. User roles and permissions

Create role-specific navigation and screens. Do not show every role the same generic dashboard.

## 3.1 Farmer

A farmer can:

- Create, view, update, and manage their own produce lots.
- Enter commodity, quantity, unit, quality/grade if known, harvest/ready date, and pickup area at an appropriate level of precision.
- Review the entered lot before submitting it.
- View available market observations and compare sale options.
- See the net-return estimate and each included cost component.
- View buyer offers attached to their own lot.
- Respond to offers where the agreed rules permit it.
- Request transport or storage and view provider responses.
- Track sale/request activity related to their own records.
- Receive and manage notifications addressed to them.
- Manage their profile and privacy preferences.

A farmer must not see another farmer's private contact information, exact location, private lot details, or offer history unless the product explicitly authorises that disclosure for a transaction.

## 3.2 Buyer

A buyer can:

- Set up a buyer profile and business/contact details with appropriate privacy controls.
- Create or manage produce requirements (commodity, quantity, quality/grade, location or service area, and date window where supported).
- View lots that are eligible to be shown to them.
- Open a lot detail page with only the information that the farmer has permitted to be shared.
- Submit an offer with amount, unit/basis, quantity, validity/expiry if supported, and optional note.
- View and manage their own submitted offers and their statuses.
- Receive notifications about relevant matching lots and offer status changes.

A buyer must not see private farmer contact details or exact pickup location before the applicable consent/transaction stage.

## 3.3 Logistics / storage provider

A service provider can:

- Create and manage transport and/or storage service listings.
- State service type, service area, capacity, price basis, availability window, and relevant constraints.
- View requests that are routed to them.
- Respond to a request with acceptance, rejection, or a clarification/quote where supported.
- View their own request and service activity.
- Receive notifications about requests and changes relevant to their services.

A service request is **not a confirmed booking** until the provider has explicitly accepted and any required details are confirmed. Do not label a request as booked simply because a farmer submitted it.

## 3.4 Admin / platform operator

For the product documentation, specify an admin/support role that can manage platform-level records and resolve reports where required. Keep this role out of the public prototype unless an admin interface is actually in the agreed MVP. Do not make admin able to view every private field by default without documenting the operational reason and access controls.

## 3.5 Permissions matrix

Include a clear permissions table in Figma. At minimum document these rules:

| Resource / action | Farmer | Buyer | Provider | Admin |
|---|---|---|---|---|
| Own profile | Read/update own | Read/update own | Read/update own | Limited support access with reason |
| Own produce lots | Full access | Only shared/eligible lot fields | Only request-relevant fields | Moderation/support as authorised |
| Other farmers' private data | No | No | No | Restricted, audited access only |
| Market observations | Read | Read where relevant | Read where relevant | Manage source/import health if authorised |
| Own buyer requirements | No | Full access to own | No | Support access where justified |
| Offers | Own received offers | Own submitted offers | No | Dispute/support access where justified |
| Logistics listings | Read relevant listings | Read only if relevant | Manage own listings | Moderation as authorised |
| Service requests | Own requests | No unless relevant to agreed flow | Requests routed to provider | Support access where justified |
| Notifications | Own recipient notifications | Own recipient notifications | Own recipient notifications | No general access to all private notifications |

Use least privilege, server-side authorisation, and database-level row access policies where the chosen backend supports them. UI hiding is not an access-control mechanism.

---

# 4. Information architecture

The website should have one coherent product structure and role-appropriate navigation.

## 4.1 Farmer navigation

- Overview
- My Produce
- Market Prices
- Compare Markets
- Buyer Offers
- Transport & Storage
- Sale Activity
- Notifications (bell/notification centre)
- Profile & Settings

## 4.2 Buyer navigation

- Buyer Dashboard
- Requirements
- Matching Lots
- Lot Details
- Make an Offer
- Offer Management
- Notifications
- Profile & Settings

## 4.3 Logistics-provider navigation

- Service Dashboard
- Transport Listings
- Storage Listings
- Service Details
- Requests
- Activity
- Notifications
- Profile & Settings

The navigation can be adapted for a narrow mobile screen, but the same destinations and permissions must remain available.

---

# 5. Figma file organisation — all work in one file

Use the existing Figma file. Create or rename pages to the following order. Keep pages focused and clearly named. All diagrams and documentation must be in this same file, not in separate files.

| Page | Page name | Required contents |
|---|---|---|
| 00 | `00 — Product Overview` | Product purpose, problem, users, MVP scope, non-goals, key principles, feature map, glossary |
| 01 | `01 — System Architecture` | Context diagram, application architecture, services, data stores, external data sources, trust boundaries, implementation notes |
| 02 | `02 — Data Flow Diagrams` | DFD Level 0 and DFD Level 1 with numbered processes, data stores, external entities, labelled flows and legend |
| 03 | `03 — Product Workflows` | Farmer journey, buyer journey, logistics-provider journey, exception paths and handoffs |
| 04 | `04 — Notifications` | Notification centre desktop/mobile, event catalogue, recipient rules, event/data flow, read/unread states, notification data structure |
| 05 | `05 — Data & Permissions` | ER/data model, field definitions, state/status definitions, permission matrix, privacy and security rules |
| 06 | `06 — Website Prototype` | Complete desktop website prototype for the agreed farmer, buyer, and provider journeys; interactive links and screen states |
| 07 | `07 — Responsive Design` | Mobile equivalents for primary journeys, responsive navigation and key state behaviour |
| 08 | `08 — Testing & Acceptance` | Test scenarios, acceptance criteria, edge cases, usability checks, implementation checklist and known limitations |
| 09 | `09 — Components & Design System` | Colours, typography, spacing, buttons, inputs, tables, status treatments, navigation, cards, notification components |

If these pages already exist under slightly different names, update them rather than creating duplicate page sets. Put documentation in structured frames with headings and readable typography. Use consistent frame naming.

---

# 6. Visual and content design direction

## 6.1 Overall direction

Create a restrained, professional, trustworthy agricultural product interface. Use a forest-green primary accent with warm neutral surfaces and high-contrast readable text. Keep it modern but practical, calm, and usable for people who may not be highly comfortable with complex software.

Use consistent typography (Inter or a similarly legible sans serif), a clear type scale, simple spacing rules, clear form labels, and a small number of reusable components.

## 6.2 Avoid these design mistakes

- No generic AI-dashboard look.
- No unnecessary 3D illustrations or gimmicky hero objects.
- No fake AI assistant, AI score, prediction, or insight card.
- No vague promotional copy such as “Your journey starts here”, “Unlock the future”, or “Market intelligence” unless there is a clearly defined product function behind it.
- No breadcrumb-like/folder-path labels used as decorative page headings, such as `01 / OVERVIEW / FARMER WORKSPACE`.
- No excessive icons, decorative badges, status pills, gradients, shadows, or over-rounded cards.
- No fake live indicators, fake provider availability, fabricated ratings, invented buyer names, or made-up market prices.
- No unexplained abbreviations or technical jargon in farmer-facing UI.
- No meaningless buttons that do nothing or jump to unrelated screens.

## 6.3 Preferred page titles and labels

Use direct names such as:

- Overview
- My Produce
- Add Produce Lot
- Review Lot
- Market Prices
- Compare Markets
- Net-return Breakdown
- Buyer Offers
- Offer Details
- Transport & Storage
- Request Service
- Sale Activity
- Notifications
- Requirements
- Matching Lots
- Service Requests

Keep language consistent across desktop, mobile, diagrams, and documentation.

## 6.4 Data visualisation and tables

Market and offer information should be understandable as a table or a simple comparison layout. Show relevant fields such as market/location, commodity, price, unit, observation date, source, and freshness. Keep the unit consistent when comparing values. Do not compare unlike quantities without conversion and a visible explanation.

For each market option, distinguish:

- Reported market price.
- Buyer offer (if any).
- Estimated transport/handling/storage/market costs.
- Estimated quality or spoilage loss (only where a defensible method exists).
- Estimated net return.

A calculated value must show its unit and the assumptions used. Unknown costs must be displayed as **Not available** or **Not included**, not silently treated as zero.

---

# 7. Screen inventory and required content

Build the following as real, editable website screens. Desktop primary frame target: approximately 1360 × 900. Mobile primary frame target: approximately 390 × 844. Use consistent breakpoints and responsive behaviour rather than simply shrinking the desktop frame.

Existing prototype content may be reused, but add missing screens and repair any incorrect links. The following are minimum requirements, not a reason to stop if a necessary supporting state is missing.

## 7.1 Farmer desktop screens

### F-D01 — Overview

- Welcome heading and a short, useful explanation of the farmer's workspace.
- Summary of the farmer's own active produce lots, pending offers, and open service requests. Use clearly labelled demo values if real data is unavailable.
- Primary action: `Add produce lot`.
- Useful recent activity, not fabricated “live insights”.
- Clear access to Market Prices, Compare Markets, Buyer Offers, Transport & Storage, and Sale Activity.
- Header notification bell with unread count when unread notifications exist.

### F-D02 — My Produce

- List/table of the farmer's own lots.
- Columns or fields: lot/commodity, quantity and unit, created/harvest date, status, latest activity, action.
- Search/filter only if the prototype demonstrates a real, implementable behaviour.
- Empty state with `Add produce lot` action.
- Loading, error, and no-results states documented.

### F-D03 — Add Produce Lot

Use a simple form with clear labels and units. Include, at minimum:

- Commodity / produce.
- Quantity.
- Unit (for example, quintal or kg; make units explicit and consistent).
- Quality/grade, only if known/available.
- Harvest date or ready-to-sell date.
- Pickup area/location at the precision required for matching; do not expose exact private address publicly.
- Optional notes where relevant.
- Field validation and helper text.
- Save draft / continue action only if the underlying product scope includes draft persistence; otherwise do not imply persistence.

### F-D04 — Review Lot

- Read-only summary of all entered fields before submission.
- Edit action to return to the form.
- Clear note about which fields will be shared and with whom.
- Submit lot action.
- Submission success state with next steps.
- Error state if submission fails.

### F-D05 — Market Prices

- Market observations for the selected commodity and relevant region.
- Price, unit, market, observation date, source, and freshness.
- Filters only where the team can implement them.
- Clear data-source attribution and no claim of real-time freshness unless confirmed.
- Empty/unavailable state when there is no valid observation.

### F-D06 — Compare Markets

- Compare options for the farmer's selected lot.
- Use the same quantity/unit basis for every option.
- Show reported price separately from estimated costs and estimated net return.
- Make the assumptions visible and link to a detailed breakdown.
- Action to view relevant buyer offers where available.
- Action to explore transport/storage where appropriate.
- No unsupported “best market” claim. Explain whether comparison is based on price only or net estimate.

### F-D07 — Net-return Breakdown

Show the calculation explicitly:

`Expected Sale Value − Transport − Handling/Packaging − Market Charges − Storage − Expected Spoilage/Quality Loss = Estimated Net Return`

- Show each amount, unit, source or assumption, and whether reported or estimated.
- Show the basis (for example, per quintal and total lot).
- Show missing cost inputs as not available/not included.
- Avoid double-counting spoilage/quality loss.
- Show a clear note that the result is an estimate and not a guaranteed sale amount or profit.

### F-D08 — Buyer Offers

- Offers associated with the farmer's own lot(s).
- Buyer/organisation label only to the extent allowed by privacy and product rules.
- Offered quantity, amount, unit, date, expiry/validity if used, and status.
- Clear actions: review offer, accept, reject, or request clarification only if those actions are in the approved business flow.
- Offer status definitions must be documented.

### F-D09 — Offer Details

- Full permitted offer details.
- Related lot summary.
- Price and unit, quantity, delivery/pickup terms if captured, validity, buyer note, and current status.
- Explicit decision actions and confirmation state.
- Do not expose private information beyond the applicable stage.

### F-D10 — Transport & Storage

- Separate transport and storage options or clearly distinguish service type.
- Service area, capacity, price basis, availability window, constraints, and provider details subject to privacy policy.
- Indicate the data's source and whether it is demo data.
- Action to request a service.
- Do not present a request as a booking.

### F-D11 — Service Request / Logistics Details

- Selected service and farmer's lot summary.
- Requested date/window, quantity, pickup/drop area at appropriate precision, and relevant instructions.
- Submission confirmation with status `Request sent` or equivalent.
- Provider response states: pending, accepted/quoted, rejected, or clarification needed.
- Confirmed state only after explicit provider confirmation and any necessary details.

### F-D12 — Sale Activity

- Chronological records of lot, offer, service-request, and sale-status events relevant to the farmer.
- Clear timestamps and statuses.
- Empty state for a new user.
- Do not imply that a sale completed unless the underlying event confirms it.

### F-D13 — Notifications Centre

A functional design for an in-app notification centre:

- Notification list grouped by date or recency.
- Unread versus read styling.
- Timestamp.
- Short meaningful title and explanatory body.
- Category/context where useful, without decorative badge overload.
- Mark one notification read.
- Mark all as read.
- Selecting a notification navigates to its related lot, offer, service request, sale activity, or account page.
- Empty state.
- Loading and error states.
- Unread counter in the global header.

### F-D14 — Profile & Settings

- Basic account and role details.
- Contact/privacy preferences.
- Notification preferences if included in MVP.
- Sign-out action.
- No unnecessary collection of sensitive personal information.

## 7.2 Buyer desktop screens

### B-D01 — Buyer Dashboard

- Summary of active requirements and offer activity.
- Links to Requirements, Matching Lots, Offer Management, and Notifications.
- No fabricated match counts or live demand claims.

### B-D02 — Requirements

- Create/edit a produce requirement: commodity, quantity, unit, quality/grade if applicable, service area/location, and date window if supported.
- Validation and submitted/saved states.

### B-D03 — Matching Lots

- Lots that satisfy the visible requirement criteria.
- Only farmer-approved fields.
- Show commodity, quantity, grade/quality if known, broad location, ready date, and permitted details.
- Empty/no-match state.
- Clearly label demonstration data when used.

### B-D04 — Lot Details (Buyer view)

- Permitted produce-lot details.
- Clear indication of information that will be shared after the applicable action/consent.
- Action to make an offer.

### B-D05 — Make an Offer

- Offered quantity and unit.
- Offer price and unit/basis.
- Valid-until date/time if part of MVP.
- Optional message/terms.
- Review and submit step or explicit confirmation.
- Validation, success, and error states.

### B-D06 — Offer Management

- Buyer's own offers and statuses.
- Offer detail view.
- Withdraw/edit only where rules and timing permit; state those rules.
- Notification links to the relevant offer.

## 7.3 Logistics-provider desktop screens

### L-D01 — Service Dashboard

- Summary of provider's own active listings and incoming requests.
- Clear separation of transport and storage services.

### L-D02 — Transport Listings

- Provider's own transport listing records.
- Service area, vehicle/capacity details only to the extent needed, price basis, availability window, and status.

### L-D03 — Storage Listings

- Provider's own storage listing records.
- Storage type, available capacity, service area, pricing basis, availability, and constraints.

### L-D04 — Request Details

- Request information received by the provider.
- Farmer/lot information limited to what is needed and authorised.
- Actions: accept, reject, or request clarification/quote where supported.
- Confirmation step before changing status.

### L-D05 — Provider Activity

- Incoming and past requests, responses, and status history.
- Empty and error states.

## 7.4 Mobile screens

Create mobile equivalents for the primary farmer, buyer, and provider journeys. At minimum include:

- Farmer Overview.
- My Produce list.
- Add Produce Lot and Review Lot.
- Market Prices and Compare Markets.
- Net-return Breakdown.
- Buyer Offers and Offer Details.
- Transport & Storage and Service Request/Details.
- Sale Activity.
- Notifications Centre.
- Buyer Requirements, Matching Lots, Lot Details, Make an Offer, Offer Management.
- Provider Dashboard, Requests, Request Details, and Activity.

Mobile requirements:

- Use a compact navigation pattern (for example bottom navigation plus a clearly accessible More/menu area) that retains access to all destinations.
- Keep notification access available and the unread count legible.
- Use stacked data rows or horizontally scrollable tables only where necessary; do not make essential values inaccessible.
- Forms must be comfortable to use on a narrow screen, with clear labels and touch targets.
- Do not link from a mobile screen to a desktop frame. Mobile prototype actions must stay within the mobile journey.
- Show what happens when content is long, a form has validation errors, a notification opens a record, or a list is empty.

---

# 8. Prototype interaction requirements

The Figma prototype must be a coherent demonstration, not just a collection of static screens. Connect the primary flows and make every visible primary action meaningful.

## 8.1 Farmer flow

`Overview → My Produce / Add Produce Lot → Review Lot → Submission Success → Market Prices → Compare Markets → Net-return Breakdown → Buyer Offers / Transport & Storage → Offer or Service Details → Sale Activity`

Suggested primary links:

- Overview `Add produce lot` → Add Produce Lot.
- Add Produce Lot `Review lot` → Review Lot (not directly to Market Comparison).
- Review Lot `Edit` → Add Produce Lot.
- Review Lot `Submit lot` → Submission Success or the next appropriate state.
- Submission Success `Compare markets` → Market Prices/Compare Markets.
- Compare Markets `Open breakdown` → Net-return Breakdown (not back to Compare Markets).
- Compare Markets `Find buyer offers` → Buyer Offers.
- Buyer Offers `Review offer` → Offer Details (not the same list screen).
- Compare Markets / Transport & Storage `Explore logistics` → relevant logistics screen.
- Transport & Storage `View details` → Logistics Details / Service Request (not Sale Activity).
- Logistics response → Request Status / Sale Activity.
- Sale Activity `Back to overview` → Overview.

## 8.2 Buyer flow

`Buyer Dashboard → Requirements → Matching Lots → Lot Details → Make an Offer → Offer Submitted → Offer Management → Offer Status`

- A matching lot card opens the corresponding Lot Details.
- `Make an offer` opens the offer form for that lot.
- `Review offer` opens an explicit confirmation state.
- `Submit offer` opens Offer Submitted.
- `View offers` opens Offer Management.
- Notification about an offer status opens the correct offer detail.

## 8.3 Logistics-provider flow

`Service Dashboard → Listings / Incoming Requests → Request Details → Accept / Reject / Clarify → Response Confirmation → Activity`

- Provider opens a request assigned/routed to them.
- Provider response changes the displayed status in the prototype's linked state.
- Farmer-facing flow must distinguish a pending request from a provider-confirmed booking.

## 8.4 Notification flow

`Notification Bell → Notifications Centre → Select Notification → Related Record`

- Unread notification is visually distinct.
- Mark read updates it to read in the prototype state.
- Mark all read updates the visible list state.
- Opening a notification takes the user to its correct related record.
- Use separate relevant notifications for farmer, buyer, and provider roles.

## 8.5 Repair known existing prototype defects

Inspect the current prototype and correct these known problems if they still exist:

- Create Lot `Review lot` currently routes directly to Market Comparison; add and connect a Review Lot screen.
- Market Comparison `Open breakdown` currently routes to itself; connect it to Net-return Breakdown.
- Buyer Offers `Review offer` currently routes to itself; connect it to Offer Details.
- Transport `View details` currently routes to Sale Activity; connect it to Logistics/Service Details.
- Mobile Create Lot `Review lot` currently jumps to a desktop frame; keep it in the mobile flow.
- Mobile Buyer Offer `Review offer` currently jumps to a desktop frame; keep it in the mobile flow.

Known current prototype frame IDs from prior work (verify before use; IDs can change):

- `6:3` Desktop · Overview
- `6:4` Desktop · Create a produce lot
- `6:5` Desktop · Market comparison
- `6:6` Desktop · Buyer offers
- `6:7` Desktop · Transport & storage
- `6:8` Desktop · Sale activity
- `6:337` Mobile · Overview
- `6:338` Mobile · Create lot
- `6:339` Mobile · Compare options
- `6:340` Mobile · Buyer offers

Do not assume these IDs are still valid. Read the current file metadata and locate the actual frames by name/content first.

---

# 9. End-to-end workflows

Put these flows on Page 03 as clear, readable diagrams. Use swimlanes or role columns where helpful. Include both the happy path and important exception branches.

## 9.1 Farmer workflow

1. Farmer signs in or creates an account.
2. Farmer opens Overview.
3. Farmer creates a produce lot.
4. System validates required fields and shows a review screen.
5. Farmer reviews the lot and sharing/privacy notice.
6. Farmer submits the lot.
7. System stores the lot and confirms submission.
8. Farmer views available market observations for the commodity/region.
9. System compares eligible options on a common quantity/unit basis.
10. System displays reported price separately from estimated costs and net return.
11. Farmer reviews buyer offers, where available.
12. Farmer may request transport or storage.
13. Provider receives a service request and responds.
14. Farmer sees pending/accepted/rejected/clarification status.
15. Sale or activity records update only when a real confirming event occurs.
16. Relevant parties receive notifications.

Exception branches to show:

- Invalid/missing lot details.
- No market data available.
- Stale or incomplete price observations.
- One or more cost inputs unavailable.
- No buyer offers.
- Offer expires, is rejected, is withdrawn, or is accepted.
- Provider unavailable or request rejected.
- Network/server submission failure.
- User cancels or edits before final submission.

## 9.2 Buyer workflow

1. Buyer signs in.
2. Buyer creates or updates a requirement.
3. System stores the requirement.
4. System identifies eligible lots based on documented match criteria.
5. Buyer opens a matching lot.
6. Buyer sees only permitted fields.
7. Buyer prepares an offer with quantity, unit, price basis, and validity if supported.
8. Buyer reviews and submits the offer.
9. System stores the offer and notifies the relevant farmer.
10. Buyer tracks offer status.
11. Farmer decision/status change is recorded.
12. Buyer receives a status notification.

Exception branches:

- No matching lots.
- Lot no longer available.
- Invalid offer amount/quantity/unit.
- Offer expires or buyer withdraws it if withdrawal is allowed.
- Farmer rejects or accepts.
- Duplicate or repeated offer submission.

## 9.3 Logistics-provider workflow

1. Provider signs in.
2. Provider creates or updates a transport/storage listing.
3. System stores the listing with service area, capacity, price basis, and availability fields.
4. Farmer submits a service request for a lot.
5. System routes the request to the relevant provider(s) based on documented criteria.
6. Provider receives a notification.
7. Provider reviews the request and accepts, rejects, or asks for clarification/quotes.
8. System records provider response and notifies the farmer.
9. Request moves to a confirmed state only after explicit acceptance and required details are confirmed.
10. Both sides can view the relevant status/activity history.

Exception branches:

- Provider has no capacity/availability.
- Request is outside service area.
- Provider rejects or does not respond.
- Farmer changes/cancels a pending request if permitted.
- Service details need clarification.

---

# 10. Notification system — required product feature

Notifications must be treated as a real product feature, not a decorative bell icon. The first release should prioritise **in-app notifications**. Email/push delivery may be documented as future work, not represented as implemented unless it is actually in scope and built.

## 10.1 Core notification behaviour

- A bell or accessible notification entry appears in the desktop header and mobile navigation/header.
- An unread counter appears when unread notifications exist.
- Notifications are persisted server-side in the database; do not describe client-only state as persistence.
- A user sees only notifications addressed to that user.
- Unread and read states are clear.
- A user can mark one notification as read.
- A user can mark all their notifications as read.
- Selecting a notification opens the related page/record, where applicable.
- A notification should not expose private fields in its title/body that the recipient is not allowed to see.
- Notification delivery must be generated from actual server-side events in the implemented product, not from arbitrary page rendering.
- Prototype sample notifications must be visibly identified as sample/demo data in documentation, not passed off as real events.

## 10.2 Event catalogue and recipients

| Event | Recipient(s) | Notification meaning / destination |
|---|---|---|
| Produce lot submitted | Farmer who submitted it | Submission confirmation → lot details |
| Produce lot updated | Relevant farmer; buyer only if a shared/eligible lot change affects them | Lot updated → lot details |
| New buyer offer submitted | Farmer who owns the relevant lot | New offer → offer details |
| Offer accepted | Buyer and farmer | Offer accepted → offer details/activity |
| Offer rejected | Buyer; farmer's own activity as needed | Offer declined → offer details/activity |
| Offer withdrawn/expired | Relevant buyer and farmer | Offer status changed → offer details |
| New matching lot | Buyer with an eligible matching requirement | Matching lot available → lot details, subject to privacy |
| Transport/storage request received | Provider(s) to whom request is routed | New request → request details |
| Provider accepts/rejects/clarifies | Farmer who submitted request | Provider response → request details |
| Service request status changed | Relevant farmer/provider | Request updated → request activity |
| Sale status confirmed/changed | Relevant farmer and buyer/participants as permitted | Sale activity updated → sale record/activity |
| Important account/security event | Account holder | Account/security page or help route |

Do not send notifications to every user. Derive recipients from authenticated ownership, role, subscriptions/requirements, and the actual related transaction. Avoid exposing a farmer's exact location/contact details to an unrelated buyer or provider.

## 10.3 Notification data structure

Document an implementation-ready entity with fields equivalent to:

- `id`
- `recipient_user_id`
- `event_type`
- `title`
- `body`
- `related_entity_type`
- `related_entity_id`
- `read_at` (null means unread)
- `created_at`
- optional `delivery_channel` / `delivery_status` only if channel delivery is implemented

Recommended logical table name: `notifications`.

Required rules:

- Index by `recipient_user_id` and `created_at` for efficient recipient-specific listing.
- Index unread lookup as appropriate for the selected database.
- Users may read/update the read state of their own notifications only.
- Users must not create notifications for other users from the client.
- Event creation and recipient assignment should happen in trusted server-side logic.
- Validate that `related_entity_id` is accessible to the recipient before navigating or displaying related content.
- Avoid storing sensitive information unnecessarily in notification text.

## 10.4 Notification event flow diagram

Show this as a dedicated flow:

`Business event → Server-side validation → Recipient resolution → Permission/privacy check → Notification record created → Recipient unread count/list updates → User opens notification → Access check on linked record → Related screen opens → read_at is updated`

Include failure/retry considerations for notification creation. Notification creation failure must not silently reverse a successfully completed primary transaction unless the product has deliberately designed transactional outbox behaviour; document the chosen approach.

## 10.5 Notification states

Design and document:

- Unread notification.
- Read notification.
- Notification without a related record.
- Empty notification centre.
- Loading notification list.
- Failed-to-load state with retry.
- Related record deleted or no longer accessible.
- Unread counter at zero and with unread count.

---

# 11. Data flow diagrams and system architecture

Use standard, consistent diagram conventions. Every process, data store, external entity, and data flow should be labelled. Include a legend. Keep line crossings to a minimum and make the diagrams readable when zoomed to presentation size.

## 11.1 System context / architecture

Show these logical layers:

1. **Clients:** farmer web/mobile browser, buyer web/mobile browser, provider web/mobile browser, admin/support interface (only if in scope).
2. **Frontend application:** role-aware routes, forms, validation, comparison views, dashboards, notification UI.
3. **Backend/API layer:** authentication/session validation, role/permission checks, business logic, lot/offer/request services, market-data access, net-return calculation, notification event handling.
4. **Database:** users/profiles, roles, lots, requirements, offers, service listings, service requests, market observations, calculation inputs/results where appropriate, notifications, activity/audit records.
5. **Storage:** only for files/documents if the product actually needs them; specify allowed file types and access rules if used.
6. **Background/scheduled processing:** market-data refresh/import, validation, matching, and notification generation where implemented.
7. **External data sources:** government/market information sources such as OGD India / AGMARKNET / e-NAM, subject to actual access and validation.
8. **External participants:** buyers and logistics/storage providers who use the platform.

Clearly mark the trust boundary between browser/client and server. Sensitive writes, calculation inputs, recipient resolution, role checks, and notification generation must not rely solely on client-side code.

## 11.2 DFD Level 0

Create a single high-level process named **Farmess Platform** with these external entities:

- Farmer.
- Buyer.
- Transport/Storage Provider.
- Market Data Source(s).
- Admin/Platform Operator (only as an operational entity if relevant).

Show labelled inbound/outbound flows such as:

- Registration/profile and role details.
- Produce-lot details.
- Market observations and source metadata.
- Buyer requirements and offers.
- Service listings and service requests/responses.
- Comparison inputs and estimated net-return output.
- Notification events and recipient notifications.
- Status/activity information.

The DFD Level 0 should not be overloaded with internal tables or low-level implementation details.

## 11.3 DFD Level 1

Decompose Farmess into numbered processes, for example:

- **1.0 Account & Role Management** — registration, sign-in, profile, role and session validation.
- **2.0 Produce Lot Management** — create, validate, update, share, and retrieve farmer-owned lots.
- **3.0 Market Data Management** — import/retrieve observations, record source/date/unit, validate freshness and quality.
- **4.0 Market Comparison & Net-return Calculation** — normalise compatible units, apply known cost inputs, calculate estimates, expose assumptions.
- **5.0 Buyer Requirements & Matching** — manage requirements, identify eligible lots, enforce privacy rules.
- **6.0 Offer Management** — create, validate, update status, and retrieve buyer offers.
- **7.0 Logistics & Storage Coordination** — manage service listings, submit requests, route requests, record provider responses.
- **8.0 Notification Management** — resolve recipients, create records, read/unread state, deep-link permission check.
- **9.0 Activity & Sale Status Management** — record relevant status changes and display role-specific history.

Show logical data stores, for example:

- D1 Users / Profiles / Roles.
- D2 Produce Lots.
- D3 Market Observations / Source Metadata.
- D4 Requirements / Matching Criteria.
- D5 Offers.
- D6 Service Listings / Requests.
- D7 Notifications.
- D8 Activity / Sale Status History.
- D9 Calculation Inputs / Results (only if persisted; otherwise identify as derived values).

Make the DFD internally balanced: all external data flows at Level 0 must be explainable by Level 1 processes. Do not show a process reading data it has no logical permission to access.

---

# 12. Data model and business rules

Create a clean ER diagram or logical data model on Page 05. Show primary keys, foreign keys, cardinality, and the role/ownership relationship. Field names below are logical recommendations; adapt to the team's chosen backend while preserving meaning.

## 12.1 Core entities

### users / profiles

- `id` (auth/user primary key)
- `display_name`
- `role` (farmer, buyer, provider, admin/support as approved)
- `phone` / contact information where required, private by default
- `created_at`, `updated_at`
- role-specific profile data should be separated or clearly modelled

### produce_lots

- `id`
- `farmer_user_id`
- `commodity_id` or commodity name/reference
- `quantity`
- `unit`
- `quality_grade` (nullable if unknown)
- `harvest_date` / `ready_date`
- `pickup_area` or location reference with privacy-aware precision
- `notes` (optional)
- `status` (draft, submitted, active/shared, unavailable, sold, cancelled or another explicitly defined set)
- `created_at`, `updated_at`

### market_observations

- `id`
- `commodity_id` / commodity label
- `market_id` / market label
- `price`
- `unit`
- `price_type` where relevant (minimum/modal/maximum or source-specific type)
- `observed_at`
- `source_name`
- `source_reference` / import batch where available
- `freshness_status` or derived freshness metadata
- `created_at`

Do not mix incompatible price types or units. Preserve the source's meaning.

### buyer_requirements

- `id`
- `buyer_user_id`
- `commodity_id`
- `quantity`
- `unit`
- `quality_grade` (nullable)
- `service_area`
- `date_window` (if used)
- `status`
- timestamps

### offers

- `id`
- `lot_id`
- `buyer_user_id`
- `quantity`
- `unit`
- `offered_price`
- `price_unit_or_basis`
- `valid_until` (nullable if not used)
- `message` (optional)
- `status` (submitted, accepted, rejected, withdrawn, expired, or another defined lifecycle)
- timestamps

### service_listings

- `id`
- `provider_user_id`
- `service_type` (transport or storage)
- `service_area`
- `capacity` and `capacity_unit`
- `price` and `price_basis`
- `availability_window` / availability metadata
- `constraints`
- `status`
- timestamps

### service_requests

- `id`
- `farmer_user_id`
- `lot_id`
- `service_listing_id` or provider reference
- `service_type`
- `requested_quantity` and unit
- `requested_window`
- pickup/drop/service-area details with privacy controls
- `status` (submitted/pending, clarification, accepted/confirmed, rejected, cancelled, completed as defined)
- provider response / quote fields if required
- timestamps

### notifications

Use the schema in Section 10.3.

### activity_events / sale_status_history

- `id`
- `actor_user_id` where appropriate
- `entity_type`
- `entity_id`
- `event_type`
- safe summary/metadata
- `created_at`

Use a structured event history rather than trusting free-text UI labels as the record of truth.

## 12.2 Relationships

At minimum illustrate:

- One farmer has many produce lots.
- One buyer has many requirements.
- One produce lot can receive many offers.
- One buyer can create many offers.
- One provider has many service listings.
- One produce lot can have relevant service requests.
- One service listing/provider can receive many service requests.
- One user receives many notifications.
- Activity records refer to the relevant user and/or business entity.
- Market observations are sourced by a specific source and relate to a commodity/market/time.

## 12.3 Status definitions

Add a glossary for all statuses. Do not use the same status word for different lifecycle meanings without explanation.

Examples to define:

- Produce lot: draft, submitted, active/shared, unavailable, sold, cancelled.
- Offer: submitted, accepted, rejected, withdrawn, expired.
- Service request: pending, clarification requested, accepted/confirmed, rejected, cancelled, completed.
- Notification: unread/read.

Do not mark a produce lot as sold solely because an offer was accepted. Offer acceptance and confirmed sale are distinct events unless the actual business rules explicitly combine them.

---

# 13. Market data, source integrity, and net-return calculation

## 13.1 Candidate reference sources

The following are candidate references for market/agricultural information. They are not proof that an API is integrated or that data access is currently available. The team must validate access, terms, data fields, update frequency, units, reliability, and permission before claiming integration.

- Open Government Data India — current daily price information: https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi
- AGMARKNET: https://agmarknet.gov.in/
- e-NAM: https://www.enam.gov.in/
- National Horticulture Board: https://www.nhb.gov.in/csrIndex.aspx
- IMD Agromet / agro advisories: https://webgis.imd.gov.in/agro/
- SFAC FPO information: https://www.sfacindia.com/FPOS.aspx

Use only those sources that are relevant and actually validated for the intended feature. Cite/source-label information in the UI where appropriate.

## 13.2 Data integrity rules

- Always record source name and observation date/time where available.
- Display unit and price type exactly enough to avoid misleading comparisons.
- Distinguish stale, missing, incomplete, and current observations.
- Do not label data “live” or “real-time” unless update frequency and retrieval method justify that claim.
- If using manual/demo data in the prototype, add a visible `Sample data` or `Demo data` label.
- Do not invent buyer offers, market records, logistics providers, capacities, or prices to make the design look populated.
- If example values are required for a clickable presentation, identify them in the prototype as illustrative sample values and do not use them as evidence.

## 13.3 Net-return formula

Use the following transparent calculation:

`Estimated Net Return = Expected Sale Value − Transport − Handling/Packaging − Market Charges − Storage − Expected Spoilage/Quality Loss`

For each calculation:

1. Convert values to a common basis only where a valid conversion is known.
2. Keep the basis visible (for example, per quintal and total quantity).
3. Distinguish reported amounts from estimates.
4. Show each cost's source or assumption.
5. If a cost is unknown, show **Not available / Not included** and explain that the estimate is incomplete. Never silently assume zero.
6. Avoid double-counting quality loss/spoilage in both expected sale value and a separate deduction.
7. Do not show a forecast unless there is sufficient validated historical data and an agreed method.
8. Do not label net return as guaranteed profit or a guaranteed amount the farmer will receive.

A comparison should make clear whether it is a complete estimate or only a partial estimate because some cost components are missing.

---

# 14. Privacy, security, and responsible handling

Document these rules in Page 05 and reflect them in UI copy and flows:

- Collect only the personal information needed for the feature.
- Keep phone numbers, exact addresses, and precise pickup coordinates private by default.
- Show a broad service area or approximate location when that is sufficient for initial matching.
- Reveal additional contact/location details only at an appropriate, documented transaction stage and with a valid product reason/consent.
- Enforce role and record ownership on the server/database, not only in the UI.
- A user can read/update only their own notification read state.
- Notification deep links must re-check authorisation before showing the related record.
- Protect file uploads, if used, with file-type/size validation and owner/role checks.
- Record important status changes and security-relevant events where appropriate.
- Avoid placing personal/sensitive details in notification previews.
- Explain what information is shared when a lot is submitted or an offer/service request is made.

Do not add real personal data from the team or farmers into the prototype. Use neutral sample labels, clearly marked as demo content.

---

# 15. States and edge cases to design

For the key forms, tables, comparisons, offers, requests, and notifications, include the relevant states below. Not every screen needs every state, but the design documentation must say which states apply.

## 15.1 Shared states

- Initial/empty state.
- Loading state.
- Successful save/submission state.
- Validation error state.
- Server/network error state with retry where useful.
- No search results / no matching records.
- Data stale or unavailable.
- Access denied / record no longer available.
- Pending action / waiting for another party.

## 15.2 Specific states

- Produce lot: draft, field validation, ready for review, submitted, update failed, no longer editable where applicable.
- Market comparison: complete estimate, partial estimate, no market data, stale market data, incompatible units.
- Offer: submitted, accepted, rejected, withdrawn, expired, invalid, duplicate submission.
- Service request: submitted/pending, clarification needed, accepted/confirmed, rejected, cancelled, completed.
- Notifications: unread, read, empty, failed to load, related record inaccessible.

Show state changes in the prototype only where the next state is understandable and the user can navigate back to the main journey.

---

# 16. Testing and acceptance criteria

Page 08 must include a practical test matrix. These tests should be phrased so a student team can implement and verify them.

## 16.1 Farmer tests

- Farmer can create a valid produce lot and review it before submission.
- Required-field validation prevents incomplete submission.
- Farmer can view only their own private lot details.
- Market observation shows source, date, unit, and price type.
- Comparison uses a common unit basis or clearly flags incompatible records.
- Net-return breakdown shows each known input and identifies unknown inputs.
- Missing costs are not silently treated as zero.
- Farmer can view an offer attached to their lot and see its current status.
- Farmer can submit a transport/storage request and see it marked pending until provider response.
- Farmer can distinguish provider acceptance from final booking/confirmation where additional details are required.

## 16.2 Buyer tests

- Buyer can create/update a requirement.
- Matching logic only displays lots that satisfy defined criteria.
- Buyer sees only permitted lot details.
- Buyer can create and submit an offer with valid quantity, unit, and price basis.
- Duplicate/invalid offer submission is handled.
- Buyer can see the correct offer status and related notification.

## 16.3 Provider tests

- Provider can create/update their own listings.
- Provider sees only requests routed to them.
- Provider can accept/reject/request clarification according to the flow.
- Farmer receives the correct response status.
- Request is not presented as confirmed before provider acceptance and required details are complete.

## 16.4 Notification tests

- Relevant business event creates a notification for the correct recipient(s).
- Unrelated users cannot see another user's notifications.
- Unread count equals the user's unread notifications.
- Mark-one-read updates only the selected notification.
- Mark-all-read updates only the signed-in user's notifications.
- Selecting a notification opens the correct accessible record.
- If the record is inaccessible or deleted, the app handles it safely.
- Notification body does not leak private fields.

## 16.5 Responsive and usability tests

- Primary actions are visible and usable at mobile width.
- No mobile prototype link jumps to a desktop screen.
- Long names, quantities, and prices do not overlap or become unreadable.
- Forms remain usable with validation messages.
- Tables/comparison content remain understandable on narrow screens.
- Navigation and notifications remain accessible on mobile.
- Colour contrast and text sizes are readable.

## 16.6 Figma prototype completion criteria

- All pages in Section 5 exist in one file.
- Required diagrams are editable and labelled.
- All primary screens in Section 7 are present or explicitly noted as intentionally deferred with a reason.
- Desktop and mobile core journeys are connected.
- No primary CTA leads to the same screen accidentally or to an unrelated screen.
- No mobile flow jumps into a desktop frame.
- Notification centre, read/unread, mark-one-read, mark-all-read, and notification deep-link behaviour are represented.
- Sample/demo values are labelled.
- No fabricated live data, false integrations, or fake AI features are presented as real.
- Pages are organised and readable at normal presentation zoom.
- File is verified and the returned link opens the same updated file.

---

# 17. Component and design-system requirements

Create reusable components on Page 09 and use them throughout the prototype:

- Desktop primary navigation/sidebar and top bar.
- Mobile navigation pattern.
- Page title and page action area.
- Primary, secondary, and destructive buttons.
- Text input, number input, select, date input, textarea, checkbox where needed.
- Form field with label, helper text, required indicator, and error state.
- Data table / responsive row.
- Produce-lot summary.
- Market observation row.
- Market comparison option.
- Cost breakdown row.
- Offer summary and offer status treatment.
- Service listing and service request summary.
- Activity timeline item.
- Notification item (unread/read).
- Empty, loading, and error state patterns.
- Confirmation dialog where an irreversible/important action needs confirmation.

Keep styles restrained and consistent. Use status text plus a secondary visual treatment; do not rely on colour alone. Make components editable and use auto layout/constraints so the screens can be adjusted.

---

# 18. Suggested technical architecture and implementation boundaries

The architecture drawing should be technology-neutral unless the team has already chosen and verified a stack. Represent responsibilities clearly rather than inventing services or integrations.

A practical first-release logical architecture:

- Responsive web client for farmer, buyer, provider.
- Authentication and session management.
- Role-aware backend/API.
- Relational database for users, roles, lots, requirements, offers, services, requests, observations, notifications, and activity.
- Server-side business logic for validation, comparison, matching, status transitions, and notification creation.
- Controlled data-import process for market observations if a source is actually available.
- Scheduled refresh/import only where the source and access method permit it.
- Object storage only if a real document/image upload feature is approved.

Do not over-engineer the first release. Do not draw microservices, message brokers, AI inference, payment services, or tracking systems unless the team has a real need, implementation plan, and capability for them. If a server-side notification event queue/outbox is shown as a future reliability improvement, label it as such.

---

# 19. Team implementation ownership (planning guide)

Use this section as an ownership guide; it is not a claim that any work has already been completed.

| Team member | Suggested responsibility |
|---|---|
| Mayank — Team Lead / Product Owner | Product scope, final UX decisions, integration, review, presentation narrative |
| Prince Kumar — Backend & Platform | Role/permission model, API/backend structure, DFDs, database and access-control implementation |
| Bhavishya Jain — UI/UX & Frontend | Design system, responsive screens, components, frontend implementation and Figma prototype quality |
| Yash — Backend & Data | Market-source validation, data mapping, units, freshness, ingestion/validation |
| Atharv Singh — Marketplace & QA | Buyer workflow, logistics workflow, edge cases, test cases and acceptance checks |
| Rajan Kumar — Data & Recommendation | Net-return calculation, comparison assumptions, cost breakdown and history/comparison rules |

The team is beginner-heavy. Keep the first release understandable and implementable. Prefer fewer complete, reliable workflows over many incomplete advanced features.

---

# 20. How to execute the Figma work efficiently

Follow this order so the file remains consistent:

1. **Inspect existing file:** read page list, frames, components, styles, and prototype links. Identify which existing screens already meet this specification.
2. **Create/organise pages:** establish the page order in Section 5. Avoid duplicate page sets.
3. **Define shared styles/components:** establish typography, colours, spacing, buttons, forms, tables, status elements, and navigation first.
4. **Build architecture and data documentation:** use the same terms/entity names as the prototype and workflows.
5. **Build workflows and DFDs:** check that every role/action and data flow maps to the product definition.
6. **Complete desktop screens:** begin with farmer's primary path, then buyer and provider paths, then supporting states.
7. **Complete mobile screens:** preserve the same actions and terminology; keep links within the mobile prototype.
8. **Build notification feature:** centre, unread/read states, mark actions, event catalogue, data/permission rules, and deep links.
9. **Wire prototype:** connect all primary CTAs and notification routes. Check every destination manually.
10. **Add test/acceptance page:** verify the screens and interactions against Section 16.
11. **Quality review:** inspect at presentation zoom; remove generic copy, decorative labels, fake data claims, broken links, overlapping content, and inconsistent terminology.
12. **Return one link:** provide the final link to the existing Figma file, not separate links to individual pages or external documents.

Use native editable Figma elements. Use auto layout, components, and constraints intelligently. Use consistent naming. Avoid one enormous unstructured canvas: make each page's content easy to find and present.

---

# 21. Final instruction to the GPT — execute this now

**Start the work now. Do not ask the user to repeat the product requirements in this file.**

1. Open the existing Farmess Figma file: https://www.figma.com/design/S0JzUA0lpaApwy8ifPeCZn?node-id=6-3
2. Inspect the current state and preserve useful existing work.
3. Create/update every page and deliverable defined above in that same file.
4. Build the website prototype as an implementation-faithful, responsive product blueprint with complete primary farmer, buyer, and provider journeys.
5. Add system architecture, DFD Level 0, DFD Level 1, role workflows, notification flow, data model, permission/privacy rules, and testing documentation.
6. Make all diagrams, screens, and documentation editable in Figma.
7. Connect and verify the primary desktop and mobile prototype interactions.
8. Do not invent actual data integrations, live prices, offers, providers, bookings, AI, or payment features.
9. When finished, return **one link to the complete updated Figma file** and a short report of what was completed and any genuine limitations.

If Figma editing is blocked by plan limits, access permissions, or unavailable tools, stop and report that exact blocker. Never present this specification, a static export, or an unedited file as though the Figma file itself has been updated.

---

# 22. Quick handoff message for the teammate

Give your GPT this file and send the following instruction:

> Read the entire `FARMESS_Master_Figma_Execution_Brief.md` and execute Section 21. Use the existing Farmess Figma file specified in the document. All prototype screens, responsive layouts, workflows, DFDs, architecture, notification system, data model, permissions, and testing documentation must be in that one Figma file. Preserve useful existing work, complete the missing work, verify the prototype, and return one updated Figma file link. Do not claim completion if Figma editing is blocked.
