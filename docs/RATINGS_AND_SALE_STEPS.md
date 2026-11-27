# Sale steps and ratings

## Sale steps

A sale is created when a farmer accepts a buyer's offer. It then moves through three steps, and
each side confirms only its own:

| Step             | Who confirms | Status after                  |
| ---------------- | ------------ | ----------------------------- |
| Produce sent     | Farmer       | `dispatched`                  |
| Produce received | Buyer        | `delivered`                   |
| Payment received | Farmer       | `paid` (the sale is complete) |

A buyer may confirm delivery straight from `agreed` if the farmer forgot to mark the dispatch.
Each step is written to the sale timeline and the other side is notified. The database function
`advance_sale` checks the person, their side of the sale and the current status; the screens are
**Sales** (farmer) and **My Purchases** (buyer), both backed by `GET/PATCH /api/sales`.

Farmess records what each side says happened. It does not move money or verify a payment.

## Ratings

After the work is done, each side can rate the other once, from 1 to 5 stars, with an optional
comment of up to 300 characters:

| What was completed          | Who can rate whom         | When                       |
| --------------------------- | ------------------------- | -------------------------- |
| A sale                      | Farmer ↔ buyer            | Once `delivered` or `paid` |
| A transport/storage request | Farmer ↔ service provider | Once `completed`           |

Rules, enforced by the database function `submit_rating`:

- only someone who took part can rate, and only the other side;
- one rating per person per sale or request; a rating cannot be changed or deleted;
- nobody can rate themselves;
- the ratings table cannot be written to directly, and can be read only by the person who gave
  a rating and the person who received it.

Everyone else sees only an **average and a count**, through functions that return nothing else:
on service listings and nearby-service results (the provider), on marketplace lots (the farmer,
who stays unnamed), on offers and buyer demand (the buyer) and on each sale. A person's own
ratings and comments are on their **Profile**.

## Ratings in recommendations

The nearby transport and storage ranking is now `rules-v3`. A provider's reputation adds or
removes at most **5 points** out of 100 (`src/features/ratings/rating.ts`):

- an average of 3.5 stars is neutral; 5 stars gives +5, 2 stars or fewer gives −5;
- fewer than 3 ratings count only partly (one rating: a third), so a single review cannot swing
  the ranking;
- a provider with no ratings gets 0, so new providers are not held back.

The reason is shown with each result ("Rated 4.6 out of 5 (12 ratings) by farmers this provider
served on Farmess"), and the points appear in the score breakdown.

When a farmer judges a recommendation, the provider's rating average and count at that moment are
stored with the feedback (`provider_rating_average`, `provider_rating_count`). The offline
preference ranker (`ml/logistics_ranker/train.py`, feature schema v3) reads both as optional
inputs. It still needs 300 clear feedback labels from 30 people and 20 listings before it can be
trained, so the live ranking remains the explainable rules above.
