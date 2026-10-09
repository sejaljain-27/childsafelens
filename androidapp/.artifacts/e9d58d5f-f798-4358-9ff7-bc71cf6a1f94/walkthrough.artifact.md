# Walkthrough - Message-Level SHAP Dashboard UI Modal Integration

## Summary of Changes
1. **API Service (`alertsService.ts`):** Added `TokenContribution`, `ExplanationOutput`, `MessageExplanation`, and `getMessageExplanation(incidentId, parentEmail)`.
2. **Explanation View (`MessageExplanationView.tsx`):**
   - Renders interactive word attribution chips ordered by token index.
   - Color-codes chips by sign (red/pink for pushing towards bullying, blue/green for pushing away) with intensity proportional to magnitude.
   - Shows omitted word contributions (`omitted_contribution`) and model explanation disclaimer.
3. **Incident Details Modal (`dashboard.tsx`):**
   - Integrated `<MessageExplanationView incidentId={selectedIncident.incidentId} parentEmail={parentEmail} />` directly into the **Full Analysis** tab of the incident inspection modal (where parents view detailed risk and classifier breakdown).

## How to View in the UI
1. Ensure your backend is running with `$env:CHILDSAFELENS_MESSAGE_SHAP_ENABLED="true"`.
2. In the mobile dashboard (`mobile-dashboard/my-app`), open any flagged incident to open the **Message Incident Details** modal.
3. Click on the **Full Analysis** tab — you will now see the complete **Model Explanation (Message SHAP)** word-level attribution chips displayed right below Classifier & Risk Fusion Analysis!
