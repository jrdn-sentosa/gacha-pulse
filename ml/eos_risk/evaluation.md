# EoS-Risk Pipeline Evaluation (Retrospective Validation)

The deployed EoS-risk pipeline (`ml/eos_risk/models/pipeline.joblib`, the "v2"
base-rate-prior x sentiment/volume approach from `results.md`) has exactly 5 known EoS
events to validate against. **That is far too few for a classification metric like
AUC, precision, or recall to mean anything** -- this document deliberately does not
report one. What follows are three qualitative/illustrative checks, computed by
`ml/eos_risk/evaluate_pipeline.py`, read as case studies rather than statistics. No
pipeline changes were made as a result of this exercise; nothing here revealed a bug,
only real, worth-documenting limitations of a 5-example validation set.

All three checks load the **already-fitted, currently-deployed** pipeline bundle (Check
2 additionally fits fresh, temporary transformer instances for its leave-one-out
comparison, but never touches or overwrites the deployed bundle).

## Check 1: Retrospective trajectory

For each EoS game, features at 24/12/4 weeks before its real announcement were pulled
from the same aligned weekly feature table used to build the pipeline (`weeks_offset`
-24/-12/-4 relative to the announcement date). These are genuinely "as of that week"
values -- the rolling slope/volatility features are trailing windows by construction, so
no data from after each point leaks into its own score.

| Game | 24wk before | 12wk before | 4wk before | Note |
| --- | --- | --- | --- | --- |
| FINAL FANTASY VII EVER CRISIS | 0.269 (moderate) | 0.613 (elevated) | 0.670 (elevated) | Strong, monotonic rise; score_sv itself flips from -0.306 to +0.445 -- genuine behavioral deterioration detected well before announcement. |
| Atelier Resleriana | 0.065 (low) | 0.129 (low) | 0.120 (low) | Rises then slightly dips; stays "low" throughout. Weak/mixed signal. |
| Battle Star | 0.548 (elevated) | 0.568 (elevated) | 0.582 (elevated) | Monotonic rise, but `score_sv` is flat at -0.03 the whole time -- the rise is entirely `base_rate_risk` (age) increasing week over week, not a detected behavioral change. Only 1 of 3 sentiment/volume features had enough review volume to compute most weeks. |
| Gran Saga | no data (too young at -24wk) | 0.015 (low) | 0.039 (low) | Slight rise, but only 2 of 3 checkpoints exist (launched too recently for a -24wk point) and stays "low" up to its own shutdown announcement. |
| TRIBE NINE | no data | 0.000 (low) | 0.022 (low) | Essentially no signal. At -12wk, all 3 sentiment/volume features were unavailable (0/3) -- pure age prior, itself ~0 since the game was very young. Still "low" 4 weeks before announcement. |

**Honest read: only 1 of 5 (FINAL FANTASY VII EVER CRISIS) shows a decisive, behaviorally
-driven upward trend.** Battle Star's rise is a pure aging artifact, not detected
decline. Gran Saga and TRIBE NINE show negligible signal and would have been missed by
this model right up to their own announcement weeks -- both are low-review-volume,
short-lived titles, and their pre-announcement decline (if any) either wasn't visible in
sentiment/volume at all, or wasn't visible in the limited data available.

## Check 2: Leave-one-out refit

For each EoS game, the transformer's pooled sentiment/volume mean/std were refit
excluding every one of that game's own weekly rows, then that game was scored (at its
announcement week, `weeks_offset=0`) against those refit stats -- checking whether its
flagged status depends on its own data propping up the pool it's compared against.

| Game | Deployed (pooled on all 10 games) | Leave-one-out refit | Category flip? |
| --- | --- | --- | --- |
| FINAL FANTASY VII EVER CRISIS | 0.783 (elevated) | 0.815 (elevated) | No |
| Battle Star | 0.588 (elevated) | 0.587 (elevated) | No |
| Atelier Resleriana | 0.240 (moderate) | 0.241 (moderate) | No |
| TRIBE NINE | 0.059 (low) | 0.059 (low) | No |
| Gran Saga | 0.051 (low) | 0.051 (low) | No |

**No game's interpretation band changes between the deployed and leave-one-out score.**
This is a real, if narrow, positive result: the pooled normalization isn't
self-contaminated -- a game isn't only flagged because its own extreme values dragged
the mean/std in its favor. But this check demonstrates *stability*, not *sensitivity*:
it confirms the "low" calls for Gran Saga and TRIBE NINE are consistent, not that they're
correct. Two of five known EoS games are, and remain, scored "low" by this model at the
moment they announced shutdown.

## Check 3: Matched-age rank comparison

For each of the 5 live games, the single EoS pre-announcement snapshot (across all 5 EoS
trajectories, any point at or before their real announcement) with the closest
`game_age_weeks` was found, and its risk_score compared to the live game's current score.

| Live game | Live age (wk) | Live score | Closest EoS match | EoS age (wk) | Age gap (wk) | EoS score | EoS scored higher? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Zenless Zone Zero | 12.0 | 0.030 | Gran Saga (5wk pre-announcement) | 12.0 | 0 | 0.036 | **Yes** |
| Wuthering Waves | 71.0 | 0.188 | FINAL FANTASY VII EVER CRISIS (52wk pre) | 83.0 | 12 | 0.279 | **Yes** |
| Reverse: 1999 | 100.0 | 0.271 | FINAL FANTASY VII EVER CRISIS (35wk pre) | 100.0 | 0 | 0.224 | No (close: 0.224 vs 0.271) |
| Tower of Fantasy | 203.0 | 1.050 | Battle Star (0wk pre, i.e. its announcement week) | 183.0 | 20 | 0.588 | No |
| Honkai Impact 3rd | 255.0 | 1.991 | Battle Star (0wk pre) | 183.0 | 72 | 0.588 | No |

**2 of 5 pairs score the EoS game higher -- but match quality matters a lot here.** The
three youngest live games (Zenless, Wuthering Waves, Reverse: 1999) matched an EoS
trajectory point within 0-12 weeks of age -- a fair comparison -- and split 2 "EoS
higher" to 1 close near-tie. The two oldest live games (Tower of Fantasy, Honkai Impact
3rd) matched Battle Star at a 20- and 72-week age gap respectively, because **no EoS
game in this 5-example set lived long enough to match their true age** -- none of the 5
reached 183 weeks pre-announcement with usable data beyond that point. Reading those two
rows as "the live game is safe because it outscored its EoS match" would overstate the
comparison: it's an extrapolation past the reference set's age range, not a like-for-like
match. For Honkai Impact 3rd specifically (the model's #1 riskiest live game from
`results.md`), this check is inconclusive rather than reassuring or damning.

## Overall assessment

No AUC/precision/recall is reported, by design -- n=5 cannot support one. Taken
together as case studies:

- **Supportive**: FINAL FANTASY VII EVER CRISIS shows a clean, behaviorally-grounded
  retrospective trajectory, and no game's leave-one-out score flips category, so the
  pooled normalization isn't an artifact of self-inclusion.
- **Real limitations, not bugs**: two of five known EoS games (Gran Saga, TRIBE NINE)
  show negligible risk-score elevation even in their final pre-announcement weeks --
  both are sparse-review, short-lived titles where the sentiment/volume signal was
  largely unavailable or simply absent, and the model would likely have missed these
  events had it been running live. Battle Star's apparent trajectory is driven almost
  entirely by the age-based prior, not detected behavioral change, because too few of
  its weeks had enough reviews to compute a sentiment slope/volatility. The matched-age
  comparison is only reliably informative for younger/mid-life games; the reference set
  doesn't cover the age range of the two oldest live games, so no claim should be drawn
  about Honkai Impact 3rd or Tower of Fantasy from Check 3 alone.
- **No pipeline changes were made.** This was a validation exercise against an
  unavoidably tiny ground-truth set, not a re-tuning pass. The honest conclusion is that
  the pipeline is plausible and partially corroborated, not proven -- and with n=5, it
  likely never can be much more than that without more EoS events to learn from.
