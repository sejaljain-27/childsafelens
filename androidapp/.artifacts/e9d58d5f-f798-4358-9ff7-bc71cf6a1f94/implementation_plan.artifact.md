# Implementation Plan: Message-Level SHAP Dashboard UI Integration

## Goal
Add Message-Level SHAP visualization components to the React Native parent dashboard (`mobile-dashboard/my-app`) to enable parents to inspect word-level attributions and contributions for flagged incidents.

## User Review Required

> [!IMPORTANT]
> **Dashboard UI Requirements:**
> - Add `MessageExplanation` types and `getMessageExplanation(incidentId)` to `services/alertsService.ts`.
> - Create `components/MessageExplanationView.tsx` rendering token chips (ordered by index, coloured by sign of gate contribution towards vs away from bullying, intensity by magnitude), "other words" bar from `omitted_contribution`, category contributions when present, model explanation disclaimer, and graceful handling of non-`computed` statuses.
> - Integrate `MessageExplanationView` into `components/AlertCard.tsx` (or incident detail view).
> - Do **not** modify `app/reports.tsx`'s risk-fusion SHAP card.
> - Run `npx tsc --noEmit` and eslint without errors.

## Proposed Changes

### [Mobile Dashboard]

#### [MODIFY] [alertsService.ts](file:///C:/Users/Sejal Jain/Downloads/childsafe8/childsafelens/mobile-dashboard/my-app/services/alertsService.ts)
- Add TypeScript interfaces for `MessageExplanation`, `TokenContribution`, `ExplanationOutput`.
- Add `getMessageExplanation(incidentId, parentEmail)` API fetcher helper.

#### [NEW] [MessageExplanationView.tsx](file:///C:/Users/Sejal Jain/Downloads/childsafe8/childsafelens/mobile-dashboard/my-app/components/MessageExplanationView.tsx)
- React Native component rendering word attribution chips, omitted contributions, category scores, and fallback states.

#### [MODIFY] [AlertCard.tsx](file:///C:/Users/Sejal Jain/Downloads/childsafe8/childsafelens/mobile-dashboard/my-app/components/AlertCard.tsx)
- Fetch and display `MessageExplanationView` when viewing alert details.

## Verification Plan

### Automated Tests
- Run `npx tsc --noEmit` in `mobile-dashboard/my-app` to ensure zero TypeScript compilation errors.
