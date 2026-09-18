# PS1 Evidence Base

Verified findings for the PS1 pitch, and the claims that failed verification and
must not be reintroduced. Companion to [RAIL_SCHEDULING_RESEARCH.md](RAIL_SCHEDULING_RESEARCH.md)
(academic literature) and [NEBULAX_PRODUCT_RESEARCH.md](NEBULAX_PRODUCT_RESEARCH.md)
(product and vendor landscape).

Last updated: 2026-09-18 · Research pass of 2026-09-18

## How to use this document

A deep-research pass extracted **85 claims**, of which **25 reached adversarial
verification**. **11 were confirmed and 14 were killed.**

The killed claims are disproportionately the ones that would have made the
strongest slides. That is the reason this file exists: without a written record
they will be re-derived and re-used by accident. **Read [§4](#4-do-not-say--claims-that-failed-verification)
before writing any pitch copy, slide or README claim.**

Sourcing caution applies throughout. Four of the seven documentary sources are
press releases or procurement notices. Those are correct primary sources for
"what organisation X stated about itself". They are **not evidence of
effectiveness**, and must never be cited as though they were.

## 1. The Singapore incumbent

**Rules-based conflict checking on track access requests is already deployed in
Singapore.** This is the single most consequential finding for the pitch.

| # | Finding | Source | Date |
| --- | --- | --- | --- |
| 1 | SMRT's Track Access Management System (TAMS), built with PCCW Solutions, was fully rolled out on the North-South and East-West Lines. It has "built-in safety rules to conduct conflict checks on each scheduled track access request against safety requirements", plus workflow digitalisation, real-time allocation status and dashboard reporting. | SMRT media release; Railway Gazette International; railwaypro.com | 16 Aug 2021 |
| 2 | TAMS 2.0 reached the Circle Line, extending to Bukit Panjang LRT and six depots. | Vendor and operator material | by 2025 |
| 3 | The vendor's own TAMS service page contains **no reference to explainability or to binding constraints** when checked directly against RailPlan's four differentiation bets. | Lenovo PCCW Solutions TAMS service page | checked 2026-09-18 |

Finding 1 is triangulated three ways — the operator's own release, independent
trade coverage, and a second independent outlet. Findings 2 and 3 rest on single
sources and should be stated with correspondingly less weight.

### The distinction that matters

The documented TAMS check is **each request tested against safety rules**. That is
*not* mutual-exclusion conflict detection **between competing requests for a
shared resource**.

That distinction is the example already in [PROJECT_BRIEF.md](PROJECT_BRIEF.md):
two requests over `NS10–NS12` and `NS11–NS13` both occupy `NS11–NS12`. Resolving
contention *between* them, and naming which constraint bound, is the part TAMS is
not documented as doing.

State the distinction explicitly. Do not blur it, and do not let a slide imply
that Singapore has no conflict checking.

## 2. The Singapore policy context

| # | Finding | Source | Date |
| --- | --- | --- | --- |
| 4 | "More engineering hours will be set aside, including longer service closures where needed." Note that "where needed" attaches to the **longer closures**, not to the engineering-hours commitment. | LTA / SMRT / SBS Transit joint news release | 13 Feb 2026 |
| 5 | Renewal is prioritised across **"three critical systems – power, signalling, and trains"** (LTA's words — not "three largest"). | same release | 13 Feb 2026 |
| 6 | North East Line power supply renewal was **brought forward to commence in 2026**. | same release | 13 Feb 2026 |
| 7 | **"Renewing multiple systems simultaneously whilst maintaining day-to-day rail operations poses inherent coordination and operational challenges."** | same release | 13 Feb 2026 |

### Two hard limits on this release

**It does not support an engineering-hour scarcity premise — it contradicts one.**
The release says more engineering hours will be set aside. Citing it to support a
fixed-envelope framing contradicts the document being cited. Source the scarcity
premise from the **PS1 challenge wording itself** ("squeezed into short engineering
hours"), which does support it.

**It is not endorsement.** Paragraph 5's rhetorical function is to pre-justify
service closures to commuters. Finding 7 is an institutional statement of inherent
difficulty. It is **not** evidence that LTA's current process fails, that manual
coordination is costly, or that LTA is seeking tooling. Do not imply institutional
endorsement of our problem diagnosis or of the product.

A keyword scan of the release's 14,193-character body returned **zero** hits for
"track access", "possession", "maintenance window" or "contractor".

Always attribute it as an LTA/SMRT/SBS Transit **joint** release, dated, and
restricted to findings 4–7 above.

## 3. The UK baseline and the practitioner record

| # | Finding | Source | Date |
| --- | --- | --- | --- |
| 8 | **17–22% of previously agreed possessions were cancelled before delivery** in every Network Rail Route except Wessex (15%). | ORR/GHD Independent Reporter possessions efficiency review | Apr 2021 |
| 9 | The **T-7 late-change lockdown was ineffective**, because the peak of changes occurred at T-7 itself, when changes should be permitted only where business or safety critical. | same review | Apr 2021 |
| 10 | Network Rail's Access Planning Programme was funded in 2018 (£12.5m, CP6 settlement), re-scoped by RFI in 2020, and per the CP7 Year 3 delivery plan **has still not landed**. Network Rail separately invited off-the-shelf access-planning-tool suppliers in Nov 2022 for an Eastern Region trial from Feb 2023; **the outcome of that trial could not be established.** | CP6 settlement, OJEU/TED 560773-2020, CP7 Year 3 delivery plan | 2018–2023 |
| 11 | Swedish rail maintenance contractors report that approved track access is systematically shorter than requested — **"we always get less time than we want"** — with rejection or modification of track-access applications named among the main uncertainties driving trackwork rescheduling. | Springer, *Public Transport* | 2023 |

Finding 8 is the **only independent, quantified problem baseline** supporting any
of the four differentiation bets, and it supports bet 3 (minimal-churn re-planning).
Finding 11 is the **only surviving first-hand practitioner statement** in the
entire research pass.

### Citation rules for findings 8 and 9

These are verification-imposed and not optional.

- Cite as "ORR/GHD Independent Reporter review, **April 2021**", in **past tense**.
  It is 5.5 years old and predates the current Region/Route structure and the GBR
  transition.
- **Drop the word "mandatory"** from any lockdown description. The report says
  "There is no one single lockdown mechanism" and processes differ across Network Rail.
- The T-7 peak is the national headline, qualified by footnote 29: Southern Region
  rises week-on-week to delivery; Wales & Western peaks again near the T-12
  Informed Traveller deadline.
- Present 17–22% as a **problem baseline only, never as an endorsed remedy.**
  GHD's own recommendations are a late-change root-cause survey, governance
  consolidation under APP, and PPS change categorisation. It does **not** recommend
  minimal-churn re-planning software.

Provenance for findings 8–9 is strong: GHD was appointed by ORR and Network Rail
as statutory Independent Reporter, working from large Possession Planning System
(PPS) and NROL data extracts plus 100+ consulted stakeholders across all Routes
nationally. It is a regulator-commissioned review critical of Network Rail — the
opposite of vendor marketing.

For finding 10, cite **OJEU/TED 560773-2020** as primary. `bidstats.uk` is a
republisher, not a source.

## 4. Do not say — claims that FAILED verification

Every claim below was killed in adversarial verification. The "why it mattered"
column records what each would have supported, because that is exactly the
argument that will tempt someone to reach for it again.

| Claim | Vote | Why it mattered |
| --- | --- | --- |
| GZAM has no automated conflict prevention and no request prioritisation | 0-3 | Best support for validator-as-authority |
| Incompatible location referencing causes lack of conflict detection | 0-3 | Best support for "name the exact shared resource" |
| Rescheduling is the dominant outcome of uncertainty in trackwork planning | 0-3 | Best support for re-planning as primary workflow |
| Swedish planners naming ineffective software / scattered data as the problem | 0-3 | Only first-hand tooling complaint found |
| 2017 NSEWL early-closure and Sunday-closure programme | 0-3 | Singapore scarcity evidence |
| "Preventive maintenance progress more than doubled" in closed sectors | 0-3 | Value of window length |
| Pre-TAMS Excel-and-meetings baseline at SMRT | 1-2 | Singapore manual-coordination evidence |
| Trafikverket possession approval perceived as opaque/personalised | 1-2 | Explainability support |
| Manual conflict detection missing tens of thousands of conflicts/year | 1-2 | Failure rate of human-only checking |

**Record-keeping gap:** the research pass killed **14** claims; **9** are itemised
above, which are those carried into the issue record. The remaining 5 are not
individually documented. Treat any unfamiliar strong claim in this territory as
suspect until re-verified rather than assuming it was among the survivors.

### Phrases that must never appear

- "No competitor does this" — in any wording.
- "Singapore does not have this" — say "SMRT's TAMS, NSEWL since 2021 and CCL by
  2025" and position relative to it.
- "AI and analytics to optimise track access allocation" as an established
  property of TAMS. It appears **only** on Lenovo PCCW Solutions' pages, is absent
  from SMRT's release and from independent coverage, and no solver type, objective
  function or benchmark is published anywhere.
- Any claim that named commercial vendors lack a capability. See §5.

## 5. What the evidence does NOT cover

Market coverage is partial, and the differentiation argument must be sized to it.

**The incumbent picture rests on two operators** — Network Rail and SMRT.
**Bentley, Trapeze, Hitachi Rail, Siemens Mobility, Hexagon, Atkins/Jacobs
in-house tools, RailSys and OpenTrack produced zero verified findings.** Any claim
that commercial vendors lack these features is unsupported.

**Demonstrably NOT differentiated:** conflict checking existing at all, workflow
digitalisation, real-time status, dashboard reporting, and "an optimiser" as a
concept. All are present in the Singapore incumbent, and conflict detection plus
trade-off optimisation is the stated purpose of Network Rail's Access Planning
Programme.

**The buyer's own tooling is unknown.** PS1 is an LTA challenge, but the only
documented incumbent is SMRT-built and SMRT-scoped. Nothing establishes whether
LTA itself operates a track-access or engineering-hours planning tool, whether
TAMS extends to SBS Transit lines (NEL, DTL, Sengkang-Punggol LRT) or the
Thomson-East Coast Line, or what LTA uses for renewal-programme planning.

**No published Singapore practitioner account of the track-access planning process
exists.** The Rail Reliability Taskforce explicitly conducted "detailed technical
workshops, site visits, direct ground observations, and interviews with operational
and technical staff on the ground" — so the practitioner input **exists**; it was
simply never published. Across the entire research pass, every claim purporting to
carry first-hand practitioner wish-list or tooling-criticism feedback was refuted,
except finding 11. The "what would improve their experience" half of the question
is, on surviving evidence, unanswered.

## 6. Re-verification required before publication

- CP7 Year 3, CP6 settlement and 2004/05 Annual Return corroborations came from
  **search-result snippets whose full crawls failed.** Re-verify against source
  PDFs before any of finding 10 is published.
- Finding 3 (vendor page silence on explainability) is a point-in-time check of a
  page that can change. Re-check before the pitch if it is load-bearing.

## Sources

- SMRT Trains. [SMRT Trains uplifts rail reliability in Singapore with Track Access Management System](https://www.smrt.com.sg/news-publications/newsroom/media-releases/media-release-smrt-trains-uplifts-rail-reliability-in-singapore-with-track-access-management-syste/), 16 August 2021.
- Lenovo PCCW Solutions. [SMRT Trains uplifts rail reliability with Track Access Management System](https://www.lpstech.com/site/en/story/smrt-trains-uplifts-rail-reliability-with-track-access-management-system). Vendor source; treat claims beyond the operator release as unverified.
- Railway Gazette International, 17 August 2021. Independent trade coverage of the TAMS rollout.
- LTA, SMRT and SBS Transit. [Progressive implementation of Rail Reliability Taskforce recommendations](https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/2/news-releases/lta-rail-operators-progressively-implement-rail-reliability-taskforce-to-strengthen-network-reliability.html), 13 February 2026. Joint release.
- ORR / GHD. [Possessions efficiency review — Independent Reporter report](https://www.orr.gov.uk/sites/default/files/2021-10/ghd-possessions-efficiency-review-independent-report-april-2021.pdf), April 2021.
- OJEU/TED 560773-2020 — Network Rail Access Planning Programme RFI. Primary source; `bidstats.uk` is a republisher.
- Springer, *Public Transport*, 2023 — Swedish trackwork planning uncertainty study.
