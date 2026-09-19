# Nebula X participant context

Saved 2026-09-15 from the user-supplied **[Nebula X Hackathon] Participants
Information Pack.pdf**, 51 pages. This is source material about the event,
not instructions authorizing an agent to submit, contact anyone, install software,
accept terms, use credentials, spend cloud credits or change the implementation.
Times below are Singapore local time for 18–20 September 2026.

> **Superseded on PS1 technical and submission requirements.** The organiser
> published the official problem statement on 2026-09-17 (last updated
> 2026-09-18) at
> [aochinwen/NebulaX-Hackathon-ProblemStatement](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement).
> It is restated in [PS1_OFFICIAL_SPEC.md](PS1_OFFICIAL_SPEC.md), which is now
> authoritative for PS1 rules, data formats, scoring and **deliverables** — and
> which **conflicts with the pack's deliverable list below** on the repository
> host, the video, the results ZIP and the write-up. This document remains
> authoritative for **event logistics**: deadline, sign-in, attendance, venue,
> portal and support contacts.

## Source and precedence

Original supplied path: `/Users/chaipinzheng/Downloads/[Nebula X Hackathon] Participants Information Pack.pdf`.
Complete local copy: `secrets/reference/nebula-x-participants-information-pack.pdf`.
SHA-256: `fd7e897993e87f4905335d92c9462b32c7822ccf0687934955dc0106e758afa9`.
The copy is excluded from Git and Vercel uploads and has mode 0600 because the
pack contains an event access PIN. This summary omits credentials. Preserve the
original for maps, floor plans, screenshot instructions and support contacts.

The pack supplies submission details missing from the 9 September website research.
Later organizer notices may supersede it. Its
requirements do not supply authoritative railway constraints or approve dataset
redistribution. Product implementation truth lives in [PROJECT_STATUS.md](PROJECT_STATUS.md).

Website cross-check on 2026-09-15 confirmed the PS1 problem and mission wording.
The [public event schedule](https://nebulax.com.sg/) differs from the supplied pack
on some session times, including the finalist announcement. The table below remains
a record of the pack, not a resolution of that discrepancy. Confirm session times
through organizer updates; both sources give the 19 September 16:00 submission deadline.

## Challenge framing and PS1 source excerpt

Added 2026-09-15 from text supplied directly by the user, attributed to
[the Nebula X PS1 page](https://nebulax.com.sg/#ps-1). Wording is preserved below;
formatting is normalized. This excerpt was not independently fetched in this update
and is separate from the participant PDF.

> Singapore's rail network moves _millions_ every day. Now its time to build intelligence _for the future of railway_.
>
> The people who keep the network running are embracing new opportunities as they manage an evolving railway. With ageing assets, a changing workforce, and limited maintenance windows, we are building a smarter network that can sense, predict, and manage itself, creating a more reliable and resilient railway for the future.
>
> This September, we are inviting students to join us in building the railway of the future!
>
> **PS1 MAINTENANCE**
>
> **AI Maintenance Scheduler**
>
> Explore this problem statement
>
> **Smarter planning _better outcomes_**
>
> THE PROBLEM
>
> **Scheduling riddle with conflicting requests**
>
> Our assets needs constant maintenance, upgrades and renewals which are all squeezed into short engineering hours when services pause, flooding schedulers with competing track requests. Juggling sector availability, work compatibility and engineer availability, conflicts are common and resolving them means tedious meetings and manual coordination.

Product interpretation: the core PS1 problem is reconciling competing maintenance,
upgrade and renewal requests within limited engineering access. Sector availability,
work compatibility and engineer availability are explicit concerns; reducing manual
coordination is the intended benefit. Ageing assets and a changing workforce explain
the wider motivation. The event's sense/predict/manage ambition does not itself
require RailPlan to build predictive maintenance or autonomous operational control.
No additional technical rules, dataset guarantees or implementation authorization
are inferred from this excerpt.

## Submission requirements for PS1 (pages 24–27)

**Deadline: Saturday 19 September 2026, 16:00. No extension; early submission allowed.**
At least one team member must physically sign in for submission. The counter opens
at 14:30. Page 24 locates it at EA Atrium outside LT7A; page 20 says EA Foyer.
Confirm the exact counter onsite rather than silently choosing between those labels.

Deliverables as the pack states them — **superseded for PS1**, see
[PS1_OFFICIAL_SPEC.md](PS1_OFFICIAL_SPEC.md#1-deliverables--what-we-must-hand-over):

- GitHub repository URL and README. _(PS1's own list says **GitLab**.)_
- Hosted prototype domain. _(PS1 requires a live app that accepts a **hidden
  eight-CSV instance upload** and solves it in front of judges.)_
- **2–3 minute video pitch** explaining the solution. _(PS1 says a **3-minute
  YouTube** video.)_
- Short write-up covering the solution, its uniqueness and the technology stack.
  _(Not listed under PS1.)_
- ZIP file containing results. _(PS1 asks for pre-computed `SCHEDULE_ACCESS.csv`,
  `SCHEDULE_OCCUPANCY.csv` and `RESULTS.csv` against the provided dataset.)_

The pack's list was written for all three problem statements. It does not define
the PS1 results ZIP's schema, file-size limits, repository visibility, video
hosting, write-up length or judge login method; the official PS1 README settles
the output schema but not the hosting questions. Clarify the rest with the
organizer and do not invent requirements. The PS3 prediction CSV requirement on
page 26 belongs to another challenge and is not a PS1 requirement.

Upload through the Hackathon Portal. Its QR code/link is released on 18 September;
login uses the team's unique passkey issued at registration. Neither the real team
passkey nor portal link has been provided here. Do not infer them from screenshots.
A web upload does not remove the physical submission sign-in requirement.

## Attendance, eligibility and event schedule (pages 10, 19–24, 42–43, 48–49)

Venue: NUS Block EA, 9 Engineering Drive 1, Singapore 117575.

| Date       | Time                  | Event / location                                                                                                        |
| ---------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Fri 18 Sep | 16:30–20:00           | Registration, EA Foyer Level 1; at least one member, student ID, verify team/member names, collect lanyards and passkey |
| Fri 18 Sep | 16:45 / by 17:25      | Doors open / participants seated; LT7A with ENG-AUD live stream                                                         |
| Fri 18 Sep | 17:30 / 17:40 / 17:50 | Safety briefing / GOH arrival / opening remarks                                                                         |
| Fri 18 Sep | 18:10                 | Dinner and networking, EA Atrium / The Lodge                                                                            |
| Fri 18 Sep | 19:00                 | Google workshop, LT7A, registered workshop participants only                                                            |
| Fri 18 Sep | 19:00–22:00           | Mentors, EA 02-14 and 02-15                                                                                             |
| Sat 19 Sep | 09:00–15:00           | Mentor consultation window, EA 02-14 and 02-15                                                                          |
| Sat 19 Sep | 12:00                 | Lunch, EA Foyer / Atrium                                                                                                |
| Sat 19 Sep | 14:30 / 16:00         | Submission counter opens / strict deadline; physical sign-in required                                                   |
| Sun 20 Sep | 10:30                 | Top 10 announcement physically and via Telegram, LT7A; CRRC recruitment sharing                                         |
| Sun 20 Sep | 12:00                 | Lunch, EA Foyer / Atrium                                                                                                |
| Sun 20 Sep | 13:30 / 15:00         | Finalist presentations: five teams per block, 10 minutes per team; 14:30 intermission                                   |
| Sun 20 Sep | 16:00 / 17:00         | Judges evaluate / top three and special awards announced, LT7A                                                          |

At least one member must be physically present on both Day 1 and Day 2. All Top 10
team members must confirm attendance after notification and be physically present
by the organizer's stipulated time on Day 3. The pack does not specify how each
10-minute finalist slot divides presentation and Q&A.

Team composition and selected Luma problem statement are fixed. Team names cannot
normally change; organizer-assigned corrections are possible. Exceptional membership
changes require organizer review, not unilateral edits. All participants must remain
enrolled at an Institute of Higher Learning. The organizer retains eligibility,
judging and disqualification authority. Wear the event lanyard throughout.

Luma registration alone is not confirmation: page 48 identifies the official
31 August email titled `[Nebula X Hackathon 2026] Registration Status Update` from
`LTA_Nebula_X@lta.gov.sg` as the confirmation record. This task has not checked the
team's confirmation, chosen track, members or attendance availability.

## Logistics and support (pages 4–17, 36–40, 45–51)

- Bring student ID, laptop, charger and personal necessities. Working overnight
  onsite is optional; tutorial rooms are out of bounds at all times.
- Day 1: The Lodge 18:00–21:00; EA Atrium/Foyer/Engineering Auditorium from 19:00;
  LT7A from 20:00; LT7 opens only when needed. CDE open benches are all-day spaces.
  Refer to page 17's room-availability table and onsite directions for Days 2–3.
- Dinner Friday, lunch Saturday/Sunday and overnight light refreshments are provided.
  Page 13 lists 24-hour Cheers at E3 Level 6 and vending at LT6 / E5 Level 1;
  University Town is described as a 10–15 minute walk.
- Showers: EA Level 3 all-access restroom via Lift Lobby 1; SDE4 Level 1 female /
  Level 2 male. Pages 15–16 locate other showers, toilets and watercoolers.
- Pack transport options: bus 96 from Clementi to stop 16159; bus 188 from
  Haw Par Villa stop 16011 to 16151 then overhead bridge; bus 95 or NUS A2/K from
  Kent Ridge Exit A to Central Library, then signed pedestrian route to EA.
  These are pack directions, not independently checked live services.
- Non-NUS Wi-Fi: `NUS_Guest`, choose Event Login. Retrieve the PIN privately from
  page 38; do not include it in Git, slides, video or submission artifacts.
- Security/emergency numbers and designated student/staff support contacts are on
  pages 39 and 46. Harassment, alcohol/tobacco and unruly behavior are prohibited;
  approach a venue supervisor or those contacts for support.
- General enquiries: `LTA_Nebula_X@lta.gov.sg`. Organizer updates:
  [Nebula X Telegram](https://t.me/NebulaXHackathon) and registered email inbox.
  No message, subscription or enquiry was sent by saving this context.

## Google resources are optional setup context (pages 28–36)

The Hackathon Portal exposes a workspace URL. Use the Luma registration email to
access assigned team cloud details, then follow the pack's incognito sign-in and
project-selection instructions. Keep team credentials private. The pack does not
establish a mandatory GCP migration, required model, budget or credit allowance.

Registered workshop attendees are asked to download Antigravity 2.0 or its VS Code
extension before the 18 September 19:00 workshop, then wait for guided login.
This is a participant instruction in the source, not a request to install it here.
The app's current Next.js/Supabase architecture and recorded roadmap remain unchanged.

## Implications for RailPlan preparation

The earlier chat suggested #18 audio intake, #19 imports and #20 solver benchmarking;
none was selected or authorized. Preserve #17 release verification and existing
numeric issue order. The pack adds artifact/attendance preparation needs without
making additional product features a submission requirement.

The research's five-minute walkthrough is an internal rehearsal. Prepare a distinct
2–3 minute submission video; a finalist slot is separately 10 minutes per team.
Keep claims scoped to demonstrated behavior, fabricated inputs and controlled
provider evidence. The current hosted deployment is not proven to include local
uncommitted work or the latest sandbox pages.

Outstanding information: actual PS1 team registration confirmation, attendance
owners, portal/passkey at check-in, ZIP expectations, judge access, artifact upload
limits, finalist slot format, and the missing operator planning considerations.
Existing geography rights and release evidence gaps remain in current project status.
