# HEARTBEAT

When running a production task:
- Emit stage log every poll interval.
- Keep stage state aligned with pipeline UI.
- Stop only on completed export or hard failure.
