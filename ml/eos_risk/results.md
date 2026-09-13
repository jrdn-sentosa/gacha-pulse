# EoS-Risk Modeling: Exploration Results

Exploratory comparison of candidate approaches for scoring the 5 live games' end-of-service
risk, run against the same Week -52..+4 aligned sentiment/volume trend data already computed
for the dashboard's "Healthy vs. EoS" tab (`lib/aggregate.ts`). This is not the final pipeline
-- `explore_approaches.py` and `explore_age_factor.py` are throwaway comparison scripts; nothing
here is a deployed model artifact.

Reference set: 5 live games (Wuthering Waves, Zenless Zone Zero, Honkai Impact 3rd, Tower of
Fantasy, Reverse: 1999) and 5 EoS games (TRIBE NINE, FINAL FANTASY VII EVER CRISIS, Gran Saga,
Battle Star, Atelier Resleriana).

## Approach 1: DTW distance to the 5 EoS reference curves -- rejected

Compared each live game's z-normalized, 4-week-smoothed sentiment curve (weeks -52..0) to each
EoS game's curve over the same window, using `dtaidistance`.

| Live game | Closest EoS match | Distance | Full ranking (closest -> farthest) |
| --- | --- | --- | --- |
| Tower of Fantasy | Atelier Resleriana | 3.493 | Atelier 3.49, FF7EC 5.28, Gran Saga 5.76, TRIBE NINE 5.90 |
| Zenless Zone Zero | Gran Saga | 4.413 | Gran Saga 4.41, TRIBE NINE 4.97, Atelier 6.25, FF7EC 7.43 |
| Reverse: 1999 | FINAL FANTASY VII EVER CRISIS | 4.485 | FF7EC 4.49, Atelier 6.37, Gran Saga 7.23, TRIBE NINE 9.16 |
| Honkai Impact 3rd | FINAL FANTASY VII EVER CRISIS | 4.851 | FF7EC 4.85, Atelier 5.21, Gran Saga 5.87, TRIBE NINE 8.29 |
| Wuthering Waves | Gran Saga | 5.918 | Gran Saga 5.92, FF7EC 6.02, Atelier 7.23, TRIBE NINE 8.23 |

**Rejected because the ranking isn't sensible or differentiated.** Reverse: 1999 (90% sentiment,
the healthiest live game by every other measure) and Honkai Impact 3rd (40% sentiment, the
worst) both matched closest to the same EoS curve (FF7EC), at nearly the same distance (4.485 vs
4.851). Z-normalizing before DTW compares *shape only*, discarding absolute sentiment level --
so a healthy game's random week-to-week noise pattern can coincidentally shape-match a dying
game's curve. Match confidence is also weak across the board: best-vs-second-best distance
gaps are often under 10% (e.g. Wuthering Waves: 5.918 vs 6.02), meaning "closest match" is close
to a coin flip among the 5 reference curves. It's a legitimate candidate for a *fitted,
deployable* component -- the 5 reference curves plus normalization stats are exactly the kind of
learned state you'd persist and serve -- but the signal itself isn't trustworthy yet, and with
only 5 reference curves there isn't enough data to fix the level-discarding problem by, say,
learning a better distance metric.

## Approach 2: Weighted rule-based score -- adopted as the base signal

```
score = 0.5 * (-z(sentiment_slope_4w)) + 0.2 * z(sentiment_vol_4w) + 0.3 * (-z(volume_slope_4w))
```

z-scores computed against the pooled distribution of each feature across all 10 games' full
history. No training required.

| Rank | Game | Risk score | Sentiment % | Sentiment slope (4w) | Sentiment volatility (4w) | Volume slope (4w) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (riskiest) | Honkai Impact 3rd | 1.721 | 40.0% | -17.5 | 26.26 | -1.4 |
| 2 | Tower of Fantasy | 0.637 | 54.5% | -5.99 | 17.77 | 2.0 |
| 3 | Zenless Zone Zero | -0.178 | 85.3% | -0.39 | 2.38 | -26.8 |
| 4 | Wuthering Waves | -0.193 | 80.9% | -0.03 | 0.85 | -77.7 |
| 5 (safest) | Reverse: 1999 | -0.214 | 90.3% | 1.05 | 5.50 | -9.1 |

**Adopted as the base signal.** Sensible and well-differentiated: Honkai Impact 3rd (oldest
title in the dataset, ~5 years, by far the worst sentiment and slope) ranks riskiest by a wide
margin, Tower of Fantasy (mid-life, moderate decline) a clear second, and the three
high-momentum titles cluster together as healthy. Transparent and needs no training data, which
matters given only 5 EoS examples is too few to fit anything more complex reliably. As written
it's a stateless formula, but the pooled normalization means/stds are themselves
fittable/persistable parameters, so it's an easy first thing to wrap as a real (lightly-fitted)
deployable component.

## Approach 3: Changepoint detection (`ruptures`, Pelt/rbf) -- rejected

Ran on each game's own full pre-shutdown sentiment history (post-shutdown reviews excluded, same
filter used everywhere else), checking whether the most recent segment represents a break from
the game's own past.

**Validation against the 5 EoS games (does the last detected changepoint land near the real
announcement date?):**

| Game | Changepoints | Weeks between last changepoint and announcement | Level shift |
| --- | --- | --- | --- |
| Atelier Resleriana | 0 | -- | -- |
| Battle Star | 1 | 168 | -13.3 |
| FINAL FANTASY VII EVER CRISIS | 0 | -- | -- |
| Gran Saga | 0 | -- | -- |
| TRIBE NINE | 0 | -- | -- |

At the default penalty, **0 of 5** EoS reference games show a changepoint anywhere near their
real announcement. Battle Star's one detected changepoint is 168 weeks off.

**Penalty-sensitivity sweep** (same series, penalty = 3 / 6 / 10) -- number of detected
breakpoints:

| Game | pen=3 | pen=6 | pen=10 |
| --- | --- | --- | --- |
| Atelier Resleriana | 1 | 0 | 0 |
| Battle Star | 1 | 1 | 1 |
| FINAL FANTASY VII EVER CRISIS | 0 | 0 | 0 |
| Gran Saga | 1 | 0 | 0 |
| TRIBE NINE | 1 | 0 | 0 |
| Honkai Impact 3rd | 2 | 1 | 0 |
| Tower of Fantasy | 2 | 1 | 1 |
| Wuthering Waves | 3 | 1 | 0 |
| Zenless Zone Zero | 0 | 0 | 0 |
| Reverse: 1999 | 0 | 0 | 0 |

**Rejected.** The method fails its own validation test (it doesn't reliably find the real EoS
break in the reference games) and is highly unstable: a 3x change in the penalty swings the
breakpoint count for the *same series* between 0 and 3. With only 5 labeled EoS examples there's
no held-out way to calibrate this hyperparameter, so this isn't a tuning nitpick -- it's a real
limitation given n=5, not just a footnote.

## Age-factor comparison

Question: does folding "game age" (weeks since first review) into the Approach 2 score change
the live-game ranking -- and specifically, does it change Honkai Impact 3rd's #1 (riskiest)
spot, given it's also the oldest and most durable title in the dataset?

Two treatments were tried, both layered on top of the Approach 2 score above (`v0`):

- **v1 -- age as a 4th additive z-scored term:**
  `score = 0.4*(-z_sent_slope) + 0.15*z_sent_vol + 0.25*(-z_vol_slope) + 0.2*z_age`, with age
  z-scored cross-sectionally across all 10 games' age-at-reference (announcement week for EoS
  games, most recently observed week for live games) -- necessarily n=10, since age is
  monotonically increasing within a game and pooling every weekly row as an independent sample
  (as done for slope/volatility) would be pseudoreplication.
- **v2 -- age as a base-rate prior:** the GachaGo! End of Service Tracker checkpoints already
  cited on the dashboard (`components/dashboard/why-eos-section.tsx` -- 84% of tracked games
  still active past year 1, 44% past year 3, 26% past year 5) are piecewise-linearly interpolated
  into `base_rate_risk(age) = 1 - survival_pct_at(age)/100`, then combined *multiplicatively*
  with the age-free v0 score: `combined = base_rate_risk(age) * (1 + score_sv)`, clipped at 0.

### Ranking comparison

| Game | v0 (age-free) | v1 (additive z-score) | v2 (base-rate prior) |
| --- | --- | --- | --- |
| Honkai Impact 3rd | 1 | 1 | 1 |
| Tower of Fantasy | 2 | 2 | 2 |
| Zenless Zone Zero | 3 | 5 | 5 |
| Wuthering Waves | 4 | 4 | 4 |
| Reverse: 1999 | 5 | 3 | 3 |

### v2 detail

| Game | Age (years) | Base-rate risk | Age-free score (v0) | Multiplier (1+v0) | Combined score |
| --- | --- | --- | --- | --- | --- |
| Honkai Impact 3rd | 4.90 | 0.731 | 1.721 | 2.721 | 1.990 |
| Tower of Fantasy | 3.90 | 0.641 | 0.637 | 1.637 | 1.049 |
| Reverse: 1999 | 1.92 | 0.345 | -0.214 | 0.786 | 0.271 |
| Wuthering Waves | 1.37 | 0.233 | -0.193 | 0.807 | 0.188 |
| Zenless Zone Zero | 0.23 | 0.037 | -0.178 | 0.822 | 0.030 |

**Honkai Impact 3rd stays #1 (riskiest) in every version.** Age doesn't dethrone it -- it
reinforces it. At ~4.9 years it sits inside the survival curve's year-3-to-5 segment, giving it a
73% base-rate risk from age alone, on top of already having the worst sentiment slope of the
five. Neither treatment reads its long survival as evidence of resilience; both just push it
further toward the top.

**The one real ranking shift**: Reverse: 1999 and Zenless Zone Zero swap in both age-aware
versions. In the age-free score, Reverse: 1999 ranked *safest* (best sentiment slope and
volatility). But at ~100 weeks old (1.9 years) vs. Zenless's 12 weeks, the industry base rate
alone (~34% of titles that age have already shut down) outweighs its currently-good trend, so it
moves ahead of both Zenless and Wuthering Waves in risk once age enters at all. The shift is
identical under both treatments, which is a good sign it's a real signal and not an artifact of
one formula's arbitrary weight choice.

## Chosen approach: v2 (base-rate prior), and why

**v2 is more defensible than v1** for three reasons:

1. **Sample size.** v1's z-score for age relies on a cross-sectional sample of just 10 games (one
   age observation per game). That mean/std would shift substantially if even one more very old
   or very young game were added to the dataset. v2's age-risk mapping instead comes from an
   external, independently-sourced curve (already cited elsewhere in this codebase), sidestepping
   the small-n instability for the age term specifically.
2. **Shape.** v1 treats age as linear-in-weeks. The real survival curve is not linear -- 84% to
   44% is a 40-point drop over years 1-3, but 44% to 26% is only an 18-point drop over years 3-5
   (deceleration). v2's piecewise interpolation respects that shape instead of forcing a straight
   line through it.
3. **Structure.** `base_rate x (1 + evidence)` is the standard actuarial decomposition (baseline
   hazard x hazard ratio from covariates) -- a cleaner separation between a slow-moving,
   structural/demographic risk factor (age) and fast-moving behavioral evidence (sentiment/volume
   trend), rather than forcing both through the same additive z-score bucket.

This is a relative judgment, not an absolute one: the specific multiplicative form is itself an
arbitrary design choice (an averaged combination, or a different functional form entirely, would
give different numbers), and the underlying GachaGo survival stats are themselves caveated
elsewhere in this codebase as self-compiled rather than institutional data, spanning games of
different regions/genres/eras than this specific 5-game portfolio.

### Caveat: v2 is a cumulative-survival proxy, not a conditional hazard rate

`base_rate_risk(age) = 1 - survival_pct_at(age)/100` answers "what fraction of tracked games this
age have *already* shut down" (unconditional, cumulative population risk) -- it does **not**
answer "given a game has survived to this age, what's its risk of shutting down soon"
(conditional hazard rate), which is the statistically correct quantity for a forward-looking risk
prior. Computing a true hazard rate would require differentiating the survival curve
(`hazard(t) = -S'(t)/S(t)`), which three checkpoints can't support rigorously. For a ranking
heuristic -- which is all this is -- the cumulative proxy is a fine, clearly-labeled stand-in
because it's still monotonically increasing in age and produces a sensible ranking. But it should
not be read as a calibrated probability, and if age becomes a load-bearing input to a real
pipeline (rather than an exploratory check), this should be revisited with an actual hazard-rate
estimate.

## Summary

| Approach | Sensible & differentiated? | Deployable as a fitted component? | Verdict |
| --- | --- | --- | --- |
| DTW distance to EoS curves | No -- level-blind, low match confidence | Yes, in principle (curves + norm stats are learned state) | Rejected for now |
| Weighted rule-based score | Yes | Partially (normalization stats are fittable) | **Adopted** |
| Changepoint detection | No -- fails its own validation, unstable to an uncalibratable hyperparameter | N/A given the above | Rejected |
| + age as base-rate prior (v2) | Yes -- reinforces Honkai's #1 spot, correctly re-ranks Reverse: 1999 | Prior itself is external/fixed; combination weights are fittable | **Adopted on top of the rule-based score** |
