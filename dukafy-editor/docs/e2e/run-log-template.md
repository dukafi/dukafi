# E2E Run Log Template

Copy this structure into `docs/e2e/runs/YYYY-MM-DD-<scope>.md` for each run.

```md
# E2E Run: <Scope>

## Metadata

- Date:
- Agent:
- Scope:
- Branch:
- HEAD:
- Worktree state:
- App URL:
- Public URL:
- Database:
- Uploads dir:
- Browser:
- Viewports:

## Screenshot Trail

| Moment | Screenshot | Notes |
|---|---|---|
| Start state |  |  |
| Post-setup/login |  |  |
| Editor baseline |  |  |
| Main edit result |  |  |
| Reload/persistence |  |  |
| Publish feedback |  |  |
| Public page |  |  |

## Summary

- Scenarios run:
- Pass:
- Pass with friction:
- Fail:
- Blocked:
- Product questions:

## Scenario Results

| ID | Result | Notes | Issues |
|---|---|---|---|
| SETUP-001 |  |  |  |

## Issues

### E2E-YYYYMMDD-01: <Short Title>

- Severity:
- Category:
- Feature:
- Status: Open
- Scenario:
- Environment:
- Evidence:

Steps:
1.
2.

Expected:

Actual:

Notes:

## Product Questions

1.

## Retest Notes

-

## Follow-Up Recommendations

1.
```
