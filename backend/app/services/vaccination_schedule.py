"""India's Universal Immunization Programme (UIP) schedule, plus a
representative well-baby checkup schedule, used to generate due-date
reminders for a baby profile.

IMPORTANT — compiled from general public knowledge of the UIP schedule,
not fetched live from an official source (this sandbox has no internet
access to mohfw.gov.in). Immunization schedules are revised periodically
— new vaccines get added, timing gets adjusted. Before relying on this
for anything beyond a demo, cross-check against the current official
schedule at https://main.mohfw.gov.in or with a pediatrician.

Ages are converted to an approximate day-offset from date of birth
(week=7 days, month≈30.44 days, year≈365.25 days) purely to compute a
due date on a calendar — clinical practice always allows a reasonable
window around these, not an exact day.
"""

# Each vaccine dose in UIP is one schedule item. Combination vaccines
# (e.g. Pentavalent = DTP+HepB+Hib) are listed as a single item with
# their combined name, matching how they're actually given as one shot.
VACCINE_SCHEDULE = [
    {"key": "bcg",            "name": "BCG",                          "age_label": "At birth",     "age_days": 0},
    {"key": "opv_0",          "name": "OPV – birth dose",              "age_label": "At birth",     "age_days": 0},
    {"key": "hepb_birth",     "name": "Hepatitis B – birth dose",      "age_label": "At birth",     "age_days": 0},
    {"key": "penta_1",        "name": "Pentavalent 1 (DTP+HepB+Hib)",  "age_label": "6 weeks",      "age_days": 42},
    {"key": "opv_1",          "name": "OPV 1",                         "age_label": "6 weeks",      "age_days": 42},
    {"key": "rota_1",         "name": "Rotavirus 1",                   "age_label": "6 weeks",      "age_days": 42},
    {"key": "pcv_1",          "name": "PCV 1",                         "age_label": "6 weeks",      "age_days": 42},
    {"key": "penta_2",        "name": "Pentavalent 2",                 "age_label": "10 weeks",     "age_days": 70},
    {"key": "opv_2",          "name": "OPV 2",                         "age_label": "10 weeks",     "age_days": 70},
    {"key": "rota_2",         "name": "Rotavirus 2",                   "age_label": "10 weeks",     "age_days": 70},
    {"key": "pcv_2",          "name": "PCV 2",                         "age_label": "10 weeks",     "age_days": 70},
    {"key": "penta_3",        "name": "Pentavalent 3",                 "age_label": "14 weeks",     "age_days": 98},
    {"key": "opv_3",          "name": "OPV 3",                         "age_label": "14 weeks",     "age_days": 98},
    {"key": "rota_3",         "name": "Rotavirus 3",                   "age_label": "14 weeks",     "age_days": 98},
    {"key": "pcv_3",          "name": "PCV 3",                         "age_label": "14 weeks",     "age_days": 98},
    {"key": "ipv_1",          "name": "IPV (fractional) 1",            "age_label": "14 weeks",     "age_days": 98},
    {"key": "mr_1",           "name": "Measles-Rubella 1",             "age_label": "9 months",     "age_days": 274},
    {"key": "vit_a_1",        "name": "Vitamin A – 1st dose",          "age_label": "9 months",     "age_days": 274},
    {"key": "dpt_booster_1",  "name": "DPT Booster 1",                 "age_label": "16–24 months", "age_days": 487},
    {"key": "opv_booster",    "name": "OPV Booster",                   "age_label": "16–24 months", "age_days": 487},
    {"key": "mr_2",           "name": "Measles-Rubella 2",             "age_label": "16–24 months", "age_days": 487},
    {"key": "dpt_booster_2",  "name": "DPT Booster 2",                 "age_label": "5–6 years",    "age_days": 1826},
]

# Representative well-baby checkup visits — in practice these often
# coincide with vaccination visits, listed separately here since a
# checkup is a distinct reminder even for a fully-vaccinated baby.
CHECKUP_SCHEDULE = [
    {"key": "checkup_1m",  "name": "1-month checkup",  "age_label": "1 month",   "age_days": 30},
    {"key": "checkup_2m",  "name": "2-month checkup",  "age_label": "2 months",  "age_days": 61},
    {"key": "checkup_4m",  "name": "4-month checkup",  "age_label": "4 months",  "age_days": 122},
    {"key": "checkup_6m",  "name": "6-month checkup",  "age_label": "6 months",  "age_days": 183},
    {"key": "checkup_9m",  "name": "9-month checkup",  "age_label": "9 months",  "age_days": 274},
    {"key": "checkup_12m", "name": "12-month checkup", "age_label": "12 months", "age_days": 365},
    {"key": "checkup_18m", "name": "18-month checkup", "age_label": "18 months", "age_days": 548},
    {"key": "checkup_24m", "name": "24-month checkup", "age_label": "24 months", "age_days": 730},
]


def get_schedule() -> list[dict]:
    """Combined, chronologically-sorted schedule of vaccines and
    checkups, each tagged with a 'kind' so the frontend can style/group
    them differently.
    """
    items = (
        [{**v, "kind": "vaccine"} for v in VACCINE_SCHEDULE]
        + [{**c, "kind": "checkup"} for c in CHECKUP_SCHEDULE]
    )
    return sorted(items, key=lambda x: x["age_days"])