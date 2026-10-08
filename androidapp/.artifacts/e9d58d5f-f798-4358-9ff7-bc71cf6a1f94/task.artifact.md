# Tasks - Fix Parent Dashboard Alerts

- `[x]` Update `DashboardViewModel` to observe `IncidentDao` instead of `NudgeEventDao`
- `[x]` Update `DashboardAdapter` to handle `IncidentEntity` objects
- `[x]` Add robust session fallbacks in `IncidentManager`
- `[x]` Relax model trust checks in `BackendClassifierClient` and `BackendPredictionParser` to prevent dropping simulation/development classification responses
- `[x]` Build app and verify successful compilation
