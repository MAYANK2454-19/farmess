# Farmess logistics-preference ranker

This offline pipeline trains a **candidate ranking model** from explicit farmer feedback about whether a provider recommendation was useful. It is not a service-completion or booking-success model.

## Input

Export `public.logistics_recommendation_feedback` to CSV with the fields used by `train.py`: user_id, service_listing_id, created_at, user_feedback, distance_meters, price_paise, service_radius_km, service_type, rate_basis, provider_verification_state, and the capacity/crop/date/cold-chain/service-radius match fields.

Ratings 1–2 are treated as negative preference labels and 4–5 as positive preference labels. Neutral rating 3 is excluded. User IDs and provider listing IDs are used only for minimum diversity checks and are excluded from model features.

## Run

Use Python 3.12, create a virtual environment, install `requirements.txt`, then run:

    python train.py --input logistics_recommendation_feedback.csv --output-dir ./artifacts

The tool requires at least 300 clear labels, 30 distinct users, 20 distinct listings, at least 200 training examples and 60 future evaluation examples. It uses a chronological 80/20 split, compares against a prior-probability baseline and checks ROC AUC, balanced accuracy and Brier score.

## Controls

- The model predicts explicit recommendation usefulness, not the probability a provider will accept, complete or safely fulfil a request.
- No user or provider ID is a model feature.
- Missing numeric data is imputed from training rows only; unknown categorical values remain an explicit category.
- The model writes a local candidate artifact and manifest only. It is not automatically served or approved.
- Real request outcomes remain in `service_requests` and should be evaluated separately when there are enough accepted, declined and completed outcome records.
- The live feedback table currently has no rows, so there is no trained logistics model yet.
