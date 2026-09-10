"""Approximate WHO-style growth reference curves for infant weight and
length, used to estimate a percentile for a given measurement.

IMPORTANT — read before treating any percentile from this module as
clinically precise:

This does NOT use the official WHO Child Growth Standards LMS (Lambda-
Mu-Sigma) tables. Those are published at who.int as downloadable CSVs,
and pulling them required live internet access this codebase's AI
assistant didn't have while building this. Instead, this module uses:

  - median weight/length at a sparse set of ages (monthly 0-12mo, then
    every 3 months to 24mo), linearly interpolated between points
  - an assumed flat coefficient of variation (13% for weight, 4% for
    length) to estimate spread, rather than WHO's actual per-age,
    skew-adjusted (Box-Cox) spread

The result is a reasonable *approximate* percentile for demo purposes —
good enough to show "this measurement looks roughly typical" or "this
looks like an outlier worth mentioning to a pediatrician" — but it is
not the exact WHO percentile a real growth chart would show. Swapping
in the official LMS CSVs (from who.int/tools/child-growth-standards)
is a matter of replacing WEIGHT_REFERENCE/LENGTH_REFERENCE below with
proper (L, M, S) triples and using the LMS z-score formula instead of
the flat-CV approximation in _percentile_from_median_sd.
"""
import math
from bisect import bisect_left

# Ages in months. Values are approximate medians compiled from widely
# published pediatric growth norms, not the official WHO LMS tables.
AGES_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 21, 24]

WEIGHT_KG_MEDIAN = {
    "male":   [3.3, 4.5, 5.6, 6.4, 7.0, 7.5, 7.9, 8.3, 8.6, 8.9, 9.2, 9.4, 9.6, 10.3, 10.9, 11.5, 12.2],
    "female": [3.2, 4.2, 5.1, 5.8, 6.4, 6.9, 7.3, 7.6, 7.9, 8.2, 8.5, 8.7, 8.9, 9.6, 10.2, 10.9, 11.5],
}
LENGTH_CM_MEDIAN = {
    "male":   [49.9, 54.7, 58.4, 61.4, 63.9, 65.9, 67.6, 69.2, 70.6, 72.0, 73.3, 74.5, 75.7, 79.1, 82.3, 85.1, 87.8],
    "female": [49.1, 53.7, 57.1, 59.8, 62.1, 64.0, 65.7, 67.3, 68.7, 70.1, 71.5, 72.8, 74.0, 77.5, 80.7, 83.7, 86.4],
}

WEIGHT_CV = 0.13   # assumed flat coefficient of variation
LENGTH_CV = 0.04


def _interpolate(age_months: float, table: list[float]) -> float | None:
    if age_months < AGES_MONTHS[0] or age_months > AGES_MONTHS[-1]:
        return None  # outside 0-24mo range this module covers

    i = bisect_left(AGES_MONTHS, age_months)
    if i == 0:
        return table[0]
    if AGES_MONTHS[i] == age_months:
        return table[i]

    x0, x1 = AGES_MONTHS[i - 1], AGES_MONTHS[i]
    y0, y1 = table[i - 1], table[i]
    fraction = (age_months - x0) / (x1 - x0)
    return y0 + fraction * (y1 - y0)


def _normal_cdf(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def _percentile_from_median_sd(value: float, median: float, cv: float) -> float:
    sd = median * cv
    z = (value - median) / sd
    return round(_normal_cdf(z) * 100, 1)


def estimate_percentile(
    metric: str,  # "weight" or "length"
    value: float,
    age_months: float,
    sex: str,  # "male" or "female"
) -> float | None:
    """Returns an approximate percentile (0-100), or None if age is
    outside the 0-24 month range this module covers or sex is unknown.
    """
    if sex not in ("male", "female"):
        return None

    if metric == "weight":
        median = _interpolate(age_months, WEIGHT_KG_MEDIAN[sex])
        cv = WEIGHT_CV
    elif metric == "length":
        median = _interpolate(age_months, LENGTH_CM_MEDIAN[sex])
        cv = LENGTH_CV
    else:
        raise ValueError(f"Unknown metric: {metric}")

    if median is None:
        return None
    return _percentile_from_median_sd(value, median, cv)


def percentile_band_label(percentile: float) -> str:
    """Plain-language band, not a raw number a worried parent has to
    interpret themselves. Thresholds (3rd/97th) mirror the standard
    convention pediatric growth charts use to flag outliers worth a
    closer look — not a diagnosis, just where to pay more attention.
    """
    if percentile < 3:
        return "low for their age — worth mentioning at the next checkup"
    if percentile > 97:
        return "high for their age — worth mentioning at the next checkup"
    if percentile < 15 or percentile > 85:
        return "on the edge of the typical range"
    return "in the typical range"