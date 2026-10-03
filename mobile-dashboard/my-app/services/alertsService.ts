const API_BASE_URL = "http://10.46.19.193:8001";

export interface IncidentType {
  incidentId: string;
  parentEmail: string;
  childId: string;
  childName: string;
  type: string;
  messageSnippet: string;
  riskScore: number;
  riskLevel: string;
  category: string;
  packageName: string;
  timestamp: number;
  status: string;
  parentDecision?: string;
  guidance?: string;
  editedContent?: string;
}

export interface DashboardStats {
  total_events: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  pending_count: number;
}

export const fetchAlerts = async (parentEmail?: string, childName?: string): Promise<IncidentType[]> => {
  try {
    let url = `${API_BASE_URL}/incidents`;
    const params = new URLSearchParams();
    if (parentEmail) params.append('parentEmail', parentEmail);
    if (childName) params.append('childName', childName);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch alerts from backend", error);
    return [];
  }
};

export const fetchDashboardStats = async (parentEmail?: string, childName?: string): Promise<DashboardStats> => {
  try {
    let url = `${API_BASE_URL}/events`;
    const params = new URLSearchParams();
    if (parentEmail) params.append('parentEmail', parentEmail);
    if (childName) params.append('childName', childName);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url);
    const data = await response.json();
    const incidents = await fetchAlerts(parentEmail, childName);
    const pendingCount = incidents.filter(i => i.status === 'PENDING' || i.status === 'PENDING_PARENT_REVIEW' || i.status === 'EDIT_REQUIRED').length;
    return {
      total_events: data.total_events || incidents.length,
      high_risk_count: data.high_risk_count || incidents.filter(i => i.riskLevel === 'HIGH' || i.riskLevel === 'CRITICAL' || i.riskLevel === 'high_risk').length,
      medium_risk_count: data.medium_risk_count || incidents.filter(i => i.riskLevel === 'MEDIUM' || i.riskLevel === 'medium_risk').length,
      low_risk_count: data.low_risk_count || incidents.filter(i => i.riskLevel === 'LOW' || i.riskLevel === 'low_risk').length,
      pending_count: pendingCount
    };
  } catch (error) {
    console.error("Failed to fetch dashboard stats", error);
    return { total_events: 0, high_risk_count: 0, medium_risk_count: 0, low_risk_count: 0, pending_count: 0 };
  }
};

export const submitDecision = async (incidentId: string, decision: "ALLOW" | "BLOCK" | "EDIT", guidance?: string, editedContent?: string) => {
  return submitParentDecision(incidentId, decision, guidance, editedContent);
};

export const submitParentDecision = async (incidentId: string, decision: "ALLOW" | "BLOCK" | "EDIT", guidance?: string, editedContent?: string) => {
  try {
    let endpoint = "allow";
    if (decision === "BLOCK") endpoint = "block";
    if (decision === "EDIT") endpoint = "edit";

    const response = await fetch(`${API_BASE_URL}/parent/incidents/${incidentId}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, guidance, editedContent })
    });
    return await response.json();
  } catch (error) {
    console.error("Failed to submit parent decision", error);
  }
};
