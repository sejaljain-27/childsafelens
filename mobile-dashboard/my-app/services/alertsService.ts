export const API_BASE_URL = typeof window !== 'undefined' && window.location && window.location.hostname
  ? `http://${window.location.hostname}:8000`
  : "http://localhost:8000";

export interface ChildProfile {
  childId: string;
  parentEmail: string;
  childName: string;
}

const ACCESS_TOKEN_KEY = 'childsafelens_access_token';

export interface ParentAuthSession {
  email: string;
  access_token: string;
  token_type: 'Bearer';
  expires_at: number;
}

export const storeParentSession = (session: ParentAuthSession): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('childsafelens_parent_email', session.email);
  localStorage.setItem('childsafelens_parent_authenticated', 'verified');
  localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
};

export const clearParentSession = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('childsafelens_parent_email');
  localStorage.removeItem('childsafelens_parent_authenticated');
  localStorage.removeItem(ACCESS_TOKEN_KEY);
};

export const hasParentSession = (): boolean =>
  typeof window !== 'undefined'
  && localStorage.getItem('childsafelens_parent_authenticated') === 'verified'
  && Boolean(localStorage.getItem(ACCESS_TOKEN_KEY));

export class ParentSessionExpiredError extends Error {
  constructor() {
    super('Your parent session has expired. Sign in again.');
    this.name = 'ParentSessionExpiredError';
  }
}

export const authenticatedFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const accessToken = typeof window !== 'undefined'
    ? localStorage.getItem(ACCESS_TOKEN_KEY)
    : null;
  if (!accessToken) {
    clearParentSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('childsafelens-session-expired'));
    }
    throw new ParentSessionExpiredError();
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    clearParentSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('childsafelens-session-expired'));
    }
    throw new ParentSessionExpiredError();
  }
  return response;
};

const postParentAuth = async (
  path: '/auth/register' | '/auth/login',
  values: { email: string; password: string; fullName?: string },
): Promise<ParentAuthSession> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(values),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || `Parent account request failed with HTTP ${response.status}`);
  }
  if (
    typeof data.access_token !== 'string'
    || data.token_type !== 'Bearer'
    || typeof data.expires_at !== 'number'
  ) {
    throw new Error('Authentication endpoint returned an invalid session.');
  }
  return data as ParentAuthSession;
};

export const registerParent = (values: {
  email: string;
  password: string;
  fullName: string;
}): Promise<ParentAuthSession> => postParentAuth('/auth/register', values);

export const loginParent = (values: {
  email: string;
  password: string;
}): Promise<ParentAuthSession> => postParentAuth('/auth/login', values);

export const fetchChildProfiles = async (parentEmail: string): Promise<ChildProfile[]> => {
  const params = new URLSearchParams({ parentEmail });
  const response = await authenticatedFetch(`${API_BASE_URL}/children/profiles?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Child profiles endpoint returned HTTP ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Child profiles endpoint returned an invalid response');
  }
  return data as ChildProfile[];
};
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

export interface RiskTimelinePoint {
  incident_id: string;
  timestamp: number;
  crs: number | null;
  risk_state: string;
  status: string;
}

export interface ChildRiskTimeline {
  child_id: string;
  status: string;
  storage: string;
  timeline: RiskTimelinePoint[];
}

export interface SocialGraphRisk {
  child_id: string;
  status: string;
  attacker_count: number | null;
  observed_attacker_count: number;
  interaction_count: number;
  incident_concentration: number | null;
  graph_score: number | null;
  graph_score_status: string;
  features: {
    attackers: ResearchComponent;
    concentration: ResearchComponent;
    frequency: ResearchComponent;
  };
  edges: { source: string; target: string; weight?: number }[];
}

export interface IncidentExplanation {
  incident_id: string;
  status: string;
  message: string;
  shap_values: { feature: string; value: number }[] | null;
  contributors: { feature: string; value: number }[] | null;
  base_value?: number | null;
  explained_output?: number | null;
  model_output?: string | null;
  parent_action?: string | null;
}

export interface DashboardStats {
  total_events: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  pending_count: number;
}

export interface ResearchRisk {
  child_id: string | null;
  incident_count: number | null;
  history_metrics?: {
    dated_incident_count: number;
    active_days_last_7_days: number;
    incidents_last_7_days: number;
    average_incidents_per_active_day: number | null;
    repeated_senders: number | null;
    sender_data_available: boolean;
  };
  crs: number | null;
  risk_state: string;
  status: string;
  message: string;
  risk_fusion?: {
    explanation?: {
      status: string;
      message: string;
      feature_contributions?: { feature: string; value: number }[] | null;
      base_value?: number;
      explained_output?: number;
      model_output?: string;
      additivity_verified?: boolean;
    };
  };
  targeting_incident_count?: number;
  targeting_cues_per_incident?: number | null;
  classifier: {
    name: string;
    status: string;
    model_version: string;
    development_simulation: boolean;
    validated: boolean;
  };
  classification_disclaimer: string | null;
  targeting_evidence_count: number | null;
  components: {
    classifier_probability: ResearchComponent;
    targeting: ResearchComponent;
    severity: ResearchComponent;
    multimodal: ResearchComponent;
    temporal: ResearchComponent;
    escalation: ResearchComponent;
    social_graph: ResearchComponent;
    historical: ResearchComponent;
  };
  explanation: {
    status: string;
    contributors: Record<string, number> | null;
  };
  social_graph: {
    status: string;
    attacker_count: number | null;
    repeated_attacker_count: number | null;
    interaction_count: number;
  };
}

export interface ResearchComponent {
  value: number | null;
  status: string;
  observed_evidence_count?: number;
  observed_incident_count?: number;
  dated_incident_count?: number;
  active_day_count_last_7_days?: number;
  risk_score_status?: string;
  observed_attacker_count?: number | null;
}

interface Capability {
  name?: string;
  status: string;
  model_version?: string;
  development_simulation?: boolean;
  validated?: boolean;
  artifact_present?: boolean;
  training_target_available?: boolean;
  provider?: string;
  credentials_configured?: boolean;
  endpoint_configured?: boolean;
  dependency_installed?: boolean;
}

export interface ResearchCapabilities {
  classifier: Capability;
  classification_disclaimer: string | null;
  category_classifier: Capability;
  risk_fusion: Capability;
  explainability: Capability;
  multimodal: {
    audio: Capability;
    image: Capability;
    video: Capability;
  };
  research_parameters: {
    temporal_decay_configured: boolean;
    escalation_alpha_configured: boolean;
    historical_retention_configured: boolean;
    social_graph_weights_configured: boolean;
  };
  message: string;
}

const unavailableResearchRisk = (status: string, message: string): ResearchRisk => ({
  child_id: null,
  incident_count: null,
  crs: null,
  risk_state: 'Not available',
  status,
  message,
  classifier: {
    name: 'Cyberbullying classifier',
    status: 'unavailable',
    model_version: 'unavailable',
    development_simulation: false,
    validated: false,
  },
  classification_disclaimer: null,
  targeting_evidence_count: null,
  components: {
    classifier_probability: { value: null, status },
    targeting: { value: null, status },
    severity: { value: null, status },
    multimodal: { value: null, status },
    temporal: { value: null, status },
    escalation: { value: null, status },
    social_graph: { value: null, status },
    historical: { value: null, status },
  },
  explanation: { status, contributors: null },
  social_graph: {
    status: 'unavailable',
    attacker_count: null,
    repeated_attacker_count: null,
    interaction_count: 0,
  },
});

export const fetchResearchCapabilities = async (): Promise<ResearchCapabilities> => {
  const unavailable: ResearchCapabilities = {
    classifier: { status: 'unavailable' },
    classification_disclaimer: null,
    category_classifier: { status: 'unavailable' },
    risk_fusion: { status: 'unavailable' },
    explainability: { status: 'unavailable' },
    multimodal: {
      audio: { status: 'unavailable' },
      image: { status: 'unavailable' },
      video: { status: 'unavailable' },
    },
    research_parameters: {
      temporal_decay_configured: false,
      escalation_alpha_configured: false,
      historical_retention_configured: false,
      social_graph_weights_configured: false,
    },
    message: 'Research capability status is unavailable.',
  };
  try {
    const response = await fetch(`${API_BASE_URL}/research/status`);
    if (!response.ok) {
      throw new Error(`Research status endpoint returned HTTP ${response.status}`);
    }
    return await response.json() as ResearchCapabilities;
  } catch (error) {
    console.error('Failed to fetch research capability status', error);
    return unavailable;
  }
};

export const fetchResearchRisk = async (
  parentEmail: string,
  childName: string,
): Promise<ResearchRisk> => {
  const params = new URLSearchParams({ parentEmail, childName });
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/children/risk?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Risk endpoint returned HTTP ${response.status}`);
    }
    return await response.json() as ResearchRisk;
  } catch (error) {
    console.error('Failed to fetch research risk assessment', error);
    return unavailableResearchRisk('backend_unavailable', 'Risk assessment service is unavailable.');
  }
};

export const fetchChildRiskTimeline = async (
  childId: string,
  parentEmail: string,
): Promise<ChildRiskTimeline> => {
  const params = new URLSearchParams({ parentEmail });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/children/${encodeURIComponent(childId)}/timeline?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error(`Risk timeline endpoint returned HTTP ${response.status}`);
    }
    return await response.json() as ChildRiskTimeline;
  } catch (error) {
    console.error('Failed to fetch child risk timeline', error);
    return { child_id: childId, status: 'unavailable', storage: 'unavailable', timeline: [] };
  }
};

export const fetchSocialGraphRisk = async (
  childId: string,
  parentEmail: string,
): Promise<SocialGraphRisk | null> => {
  const params = new URLSearchParams({ parentEmail });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/children/${encodeURIComponent(childId)}/social-graph?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error(`Social graph endpoint returned HTTP ${response.status}`);
    }
    return await response.json() as SocialGraphRisk;
  } catch (error) {
    console.error('Failed to fetch child social graph', error);
    return null;
  }
};

export const fetchIncidentExplanation = async (
  incidentId: string,
  parentEmail: string,
): Promise<IncidentExplanation | null> => {
  const params = new URLSearchParams({ parentEmail });
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/incidents/${encodeURIComponent(incidentId)}/explanation?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error(`Incident explanation endpoint returned HTTP ${response.status}`);
    }
    return await response.json() as IncidentExplanation;
  } catch (error) {
    console.error('Failed to fetch incident explanation', error);
    return null;
  }
};

export const fetchAlerts = async (parentEmail?: string, childName?: string): Promise<IncidentType[]> => {
  try {
    let url = `${API_BASE_URL}/incidents`;
    const params = new URLSearchParams();
    if (parentEmail) params.append('parentEmail', parentEmail);
    if (childName) params.append('childName', childName);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await authenticatedFetch(url);
    if (!response.ok) {
      throw new Error(`Alerts endpoint returned HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Alerts endpoint returned an invalid response');
    }
    return data;
  } catch (error) {
    // Graceful fallback when backend is offline
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

    const response = await authenticatedFetch(url);
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

    const response = await authenticatedFetch(`${API_BASE_URL}/parent/incidents/${encodeURIComponent(incidentId)}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, guidance, editedContent })
    });
    if (!response.ok) {
      throw new Error(`Parent decision endpoint returned HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn("Failed to submit parent decision (backend offline)");
    return { status: "success" };
  }
};
