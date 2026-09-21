---
name: feature-flag
description: Use when safely introducing changes by hiding features behind toggles
---

# Feature Flag

## Purpose
Use feature flags (FeatBit) to safely introduce changes in brownfield systems. Hide incomplete or risky features behind flags to enable continuous integration without exposing unfinished work.

## Principles
- Always use a feature flag for brownfield changes.
- Prefer keystone interface pattern when possible (build backend fully, add UI last).
- Feature flags should be temporary — retire them once the feature is stable.
- Minimum toggle points: place flags at entry points only, not throughout code.

## Rules
- **DO**: Wrap new brownfield functionality in a FeatBit feature flag.
- **DO**: Place flag checks at the entry point (controller/route level).
- **DO**: Retire flags once the feature is stable and fully rolled out.
- **DO**: Test both flag-on and flag-off paths.
- **DON'T**: Scatter flag checks throughout the codebase.
- **DON'T**: Leave flags in place permanently (except ops toggles).
- **DON'T**: Use flags as an excuse to skip testing.

## Patterns
### Flag Types
| Type | Purpose | Lifetime | Dynamic? |
|------|---------|----------|----------|
| **Release** | Hide incomplete features | Days to weeks | Yes |
| **Experiment** | A/B testing | Weeks to months | Yes |
| **Ops** | Circuit breakers, kill switches | Permanent | Yes |
| **Permission** | Feature access control | Permanent | Yes |

### Keystone Interface Pattern
1. Build the full backend feature (integrated, tested).
2. Feature is invisible to users — no UI yet.
3. When ready, add the UI as the final "keystone."
4. No long-lived feature branch needed.

### Dark Launching
- Call new backend behavior without exposing UI to users.
- Run old and new code in parallel, compare results.
- Assess load and performance impact before public release.
