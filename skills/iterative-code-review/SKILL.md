---
name: iterative-code-review
description: This skill should be used when the user asks to iteratively review and fix a branch, diff, worktree, module, or codebase until no actionable over-engineering or maintainability findings remain. Trigger for requests such as "review and fix until clean," "run a deep code-quality cleanup," or "triage the findings and repeat the review." Do not use for a one-shot read-only review.
---

# Iterative Code Review

Own the review from initial inspection through a verified clean result. Make fixes in the main thread. Use subagents only for independent, read-only review seats.

## Establish scope

1. Read the repository instructions and the requirements for the work.
2. Fix the comparison point for a change review. For a whole-codebase review, record the included directories and exclusions instead.
3. Divide the scope into logical parts based on modules, domains, call paths, and ownership boundaries. Do not divide it by arbitrary file counts.
4. Create a coverage map that assigns every in-scope file to at least one part and identifies cross-part interfaces.
5. Create a review ledger for accepted fixes, rejected findings and evidence, unresolved findings, verification results, known risks, and changes made in each round.

Keep both records in the task notes unless the user requests repository artifacts. Use these fields:

- Coverage map: part, files or globs, interfaces, assigned seats, and latest result.
- Review ledger: round, finding ID, reviewer, location and evidence, decision and rationale, correction, verification, and status.

## Run a review round

For every logical part, dispatch two independent review seats. Run independent seats in parallel up to the available concurrency limit.

- Assign one seat to load and follow `ponytail-review`. Ask it to find unnecessary code, dependencies, abstractions, flexibility, and duplication.
- Assign one seat to load and follow `thermo-nuclear-code-quality-review`. Ask it to find weak module boundaries, oversized files, scattered conditionals, partial operations, and maintainability problems.
- When the scope has multiple parts, add one seat of each type for cross-part behavior and integration risks.

Give each reviewer:

- the fixed comparison point and assigned scope;
- relevant interfaces, requirements, and repository instructions;
- the coverage map;
- the current review ledger, including changes since the preceding round.

Require reviewers to inspect the current code independently before considering the ledger. Tell them to be adversarial: verify accepted fixes, challenge rejected findings, reopen unsupported rejections, and search for regressions and new findings. Reviewers must not edit files, defer to earlier conclusions, or dispatch more subagents.

Require each reviewer to report only actionable findings with evidence, locations, impact, and a concrete correction. It must also state what it inspected and any coverage limitation.

## Triage and fix

1. Inspect every finding in the main thread.
2. Merge duplicates across parts and resolve conflicting advice.
3. Reject only false positives or changes that add more complexity than they remove. Record the decision and evidence in the ledger.
4. Fix each accepted finding in the smallest coherent change. Preserve input validation, error handling, security controls, accessibility, and data-loss protection.
5. Run the relevant tests, static checks, and formatting checks. Fix regressions before continuing.
6. Update the coverage map and ledger. Repeat the affected part and integration reviews against the updated code.

## Complete the loop

Stop only when:

- every logical part and cross-part interface has a clean result from both review types;
- every accepted finding is fixed;
- every rejected finding has survived adversarial re-review;
- the latest verification passes.

If subagents are unavailable, coverage is incomplete, or a finding requires user authority or an external change, report the exact blocker instead of weakening the completion criteria.

Return a concise summary of accepted fixes, rejected findings, verification results, coverage, and remaining blockers. Do not commit or push unless the user asks.
