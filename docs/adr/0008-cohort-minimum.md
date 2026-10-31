# ADR-0008: Lecturers see aggregates only, above a minimum cohort of 8

**Status:** Accepted
**Date:** 2026-09-16
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane

_Recorded retroactively on 31 October 2026._

## Context

Lecturers benefit from seeing when their cohort is overloaded, but students must be able to trust that their lecturer can't see their individual hours. In a small group, an average can still reveal one person.

## Decision

- Lecturer functions return only aggregates (average hours per week, student counts), never per-student rows.
- `lecturer_cohort_weeks` returns nothing until at least `LECTURER_MIN_COHORT` (default **8**) distinct students share the course.
- There is no drill-down to individuals anywhere in the lecturer interface.

## Consequences

- Small courses show lecturers nothing. That is deliberate and is explained in the interface.
- The pilot must onboard students densely (a whole class) for lecturers to get value. This shapes the launch plan (roadmap: "density over size").
- The threshold is a simple k-anonymity rule. It doesn't protect against a lecturer comparing two views over time; we accept that at pilot scale.

## Alternatives considered

- **Per-student view with consent:** a much harder privacy conversation, and it changes how students would use Crunch.
- **A lower threshold (for example 5):** more useful in small classes, but easier to re-identify.
