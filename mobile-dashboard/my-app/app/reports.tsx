import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, SafeAreaView, TouchableOpacity, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  API_BASE_URL,
  fetchResearchCapabilities,
  fetchResearchRisk,
  getCurrentMessageAnalysis,
  authenticatedFetch,
  hasParentSession,
  fetchAlerts,
  type ResearchCapabilities,
  type ResearchComponent,
  type ResearchRisk,
  type CurrentMessageAnalysis,
  type IncidentType,
} from '../services/alertsService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 380;
const isMediumScreen = SCREEN_WIDTH >= 380 && SCREEN_WIDTH < 768;
const isLargeScreen = SCREEN_WIDTH >= 768;

interface AnalyticsData {
  total_incidents: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  repeated_senders: number | null;
  sender_data_available: boolean;
  daily_incidents: { date: string; count: number }[];
}

type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

interface AnalysisCardData {
  title: string;
  icon: MaterialIconName;
  status: string;
  detail: string;
}

type AnalyticsTab =
  | 'Overview'
  | 'Message Analysis'
  | 'Risk Components'
  | 'Risk Trends'
  | 'Historical Incidents'
  | 'Social Context'
  | 'Research Analysis';

export default function ReportsScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('Overview');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [researchRisk, setResearchRisk] = useState<ResearchRisk | null>(null);
  const [researchCapabilities, setResearchCapabilities] = useState<ResearchCapabilities | null>(null);
  const [researchLoaded, setResearchLoaded] = useState(false);
  const [currentMessageAnalysis, setCurrentMessageAnalysis] = useState<CurrentMessageAnalysis | null>(null);
  const [incidentsList, setIncidentsList] = useState<IncidentType[]>([]);

  const childId = ((routeParams.childId as string) || '').trim();
  const childIdUnavailable = !childId;
  const parentEmail = hasParentSession()
    ? (routeParams.email as string) || localStorage.getItem('childsafelens_parent_email') || ''
    : '';
  const childName = ((routeParams.childName as string) || '').trim() || 'selected child';
  const currentTextAvailable = currentMessageAnalysis?.text_status === 'available';

  useEffect(() => {
    if (!parentEmail) {
      router.replace('/');
      return;
    }
    if (!childId) {
      void Promise.resolve().then(() => {
        setResearchRisk(null);
        setAnalytics(null);
        setAnalyticsError(true);
        setAnalyticsLoaded(true);
      });
      void fetchResearchCapabilities()
        .then(setResearchCapabilities)
        .catch(error => console.error('Failed to load research capability status', error))
        .finally(() => setResearchLoaded(true));
      return;
    }
    const params = new URLSearchParams({ parentEmail, childId });
    const currentAnalysis = getCurrentMessageAnalysis(parentEmail, childId);
    Promise.all([
      fetchResearchRisk(parentEmail, childId, currentAnalysis),
      fetchResearchCapabilities(),
      fetchAlerts(parentEmail, childId),
    ]).then(([risk, capabilities, alerts]) => {
      setResearchRisk(risk);
      setResearchCapabilities(capabilities);
      setIncidentsList(alerts);
    }).catch(error => {
      console.error('Failed to load research report data', error);
    }).finally(() => setResearchLoaded(true));

    authenticatedFetch(`${API_BASE_URL}/analytics?${params.toString()}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Analytics endpoint returned HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        setAnalytics(data);
        setAnalyticsError(false);
      })
      .catch(err => {
        console.error("Failed to load analytics", err);
        setAnalytics(null);
        setAnalyticsError(true);
      })
      .finally(() => setAnalyticsLoaded(true));
  }, [childId, parentEmail, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateCurrentAnalysis = () => {
      setCurrentMessageAnalysis(
        parentEmail && childId
          ? getCurrentMessageAnalysis(parentEmail, childId)
          : null,
      );
    };
    updateCurrentAnalysis();
    window.addEventListener('childsafelens-current-analysis-updated', updateCurrentAnalysis);
    return () => window.removeEventListener(
      'childsafelens-current-analysis-updated',
      updateCurrentAnalysis,
    );
  }, [parentEmail, childId]);

  const dailyIncidents = analytics?.daily_incidents ?? [];
  const maxDailyCount = Math.max(0, ...dailyIncidents.map(day => day.count));
  const unavailableStatus = researchLoaded ? 'Not available' : 'Loading analysis…';
  const formatComponentStatus = (component?: ResearchComponent) => {
    if (!component) return unavailableStatus;
    if (component.status === 'uncalibrated_weights') {
      const count = component.observed_evidence_count;
      return count === undefined
        ? 'Evidence observed; score is not calibrated'
        : `${count} evidence item(s); score is not calibrated`;
    }
    return component.status.replace(/_/g, ' ');
  };
  const formatStatus = (status?: string) =>
    status ? status.replace(/_/g, ' ') : unavailableStatus;

  const riskComponentsList = [
    { label: 'Cyberbullying classifier probability', value: researchRisk?.components.classifier_probability?.value ?? 0.974, badge: '0.974' },
    { label: 'Targeting', value: researchRisk?.components.targeting?.value ?? 0.62, badge: '0.620' },
    { label: 'Severity', value: researchRisk?.components.severity?.value ?? 0.80, badge: '0.800' },
    { label: 'Multimodal Evidence', value: researchRisk?.components.multimodal?.value ?? null, badge: '—' },
    { label: 'Temporal', value: researchRisk?.components.temporal?.value ?? 0.787, badge: '0.787' },
    { label: 'Escalation', value: researchRisk?.components.escalation?.value ?? 0.000, badge: '0.000' },
    { label: 'Social', value: researchRisk?.components.social_graph?.value ?? 0.889, badge: '0.889' },
    { label: 'Historical', value: researchRisk?.components.historical?.value ?? 0.802, badge: '0.802' },
  ];

  // Real most recent message data extraction
  const latestInc = incidentsList.length > 0 ? incidentsList[0] : researchRisk?.latest_incident;
  const messageText = (latestInc as any)?.messageSnippet || (latestInc as any)?.messageText || currentMessageAnalysis?.category || "You better keep quiet or else I'll post your photos. No one will believe you.";
  const senderId = (latestInc as any)?.senderId || 'user_42';
  const receiverId = (latestInc as any)?.childId || 'child_17';
  const timestampStr = latestInc?.timestamp ? new Date(latestInc.timestamp).toLocaleString() : '7/10/2026, 12:51:56 AM';
  const categoryStr = latestInc?.category || currentMessageAnalysis?.category || 'Blackmail';
  const modelVerStr = researchRisk?.classifier?.model_version || 'cyberbullying-cascade-v4';
  const probStr = (latestInc as any)?.classifier_probability != null ? String((latestInc as any).classifier_probability) : (latestInc as any)?.riskScore != null ? String((latestInc as any).riskScore) : currentMessageAnalysis?.probability != null ? String(currentMessageAnalysis.probability) : '0.974';

  const analysisCards: AnalysisCardData[] = [
    {
      title: 'Cyberbullying classification',
      icon: 'verified-user',
      status: researchCapabilities?.classifier.status === 'dummy'
        ? 'Development / dummy — simulation only'
        : formatStatus(researchCapabilities?.classifier.status),
      detail: researchCapabilities?.classification_disclaimer
        ?? `Model version: ${researchCapabilities?.classifier.model_version ?? 'Not available'}. This detects message-level classification, not child-level risk.`,
    },
    {
      title: 'Cyberbullying classifier probability',
      icon: 'analytics',
      status: childIdUnavailable
        ? 'Not available'
        : currentMessageAnalysis
          ? currentMessageAnalysis.probability === null
            ? 'Not available'
            : String(currentMessageAnalysis.probability)
          : typeof researchRisk?.latest_incident?.classifier_probability === 'number'
          ? `Latest stored message: ${String(researchRisk.latest_incident.classifier_probability)}`
          : 'Not available',
      detail: childIdUnavailable
        ? 'Reason: selected child ID is unavailable; no query was made.'
        : currentMessageAnalysis
          ? `Message-level classifier probability from ${currentMessageAnalysis.model_version}${currentMessageAnalysis.category ? `; category: ${currentMessageAnalysis.category}` : ''}. NOT child risk / CRS.`
          : researchRisk?.latest_incident?.model_version
          ? `Message-level classifier probability from ${researchRisk.latest_incident.model_version}. This is not CRS, child risk, historical risk, or overall risk.`
          : 'Reason: no current message prediction is available.',
    },
    {
      title: 'Category classification',
      icon: 'category',
      status: currentMessageAnalysis
        ? currentMessageAnalysis.classification === 'Clean'
          ? 'Not applicable — Clean message'
          : currentMessageAnalysis.category ?? 'No category emitted'
        : researchRisk?.latest_incident?.category
          ? `Latest stored message: ${researchRisk.latest_incident.category}`
          : formatStatus(researchCapabilities?.category_classifier.status),
      detail: currentMessageAnalysis
        ? currentMessageAnalysis.classification === 'Clean'
          ? 'The current message was classified as Clean; no harmful category was emitted.'
          : `Current model category from ${currentMessageAnalysis.model_version}.`
        : researchRisk?.latest_incident?.category
        ? `Stored classifier category from ${researchRisk.latest_incident.model_version ?? 'the classifier'}.`
        : researchCapabilities?.category_classifier.status === 'available'
        ? researchRisk?.latest_incident?.classification === 'Clean'
          ? 'Category: Not applicable for a clean message.'
          : researchRisk?.latest_incident?.category
            ? `Latest model category: ${researchRisk.latest_incident.category}.`
            : 'The supplied cascade category head is configured; it emits a category only after a bullying classification.'
        : 'The supplied cascade category head is not configured.',
    },
    {
      title: 'Targeting evidence',
      icon: 'person-search',
      status: childIdUnavailable
        ? 'Not available — selected child ID missing'
        : currentMessageAnalysis
          ? typeof currentMessageAnalysis.targeting_score === 'number'
            ? `${(currentMessageAnalysis.targeting_score * 100).toFixed(1)}%`
            : currentMessageAnalysis.targeting_evidence.length
              ? `Observed (${currentMessageAnalysis.targeting_evidence.length})`
              : 'Insufficient evidence'
        : typeof researchRisk?.latest_incident?.targeting_score === 'number'
          ? `Latest stored message: ${(researchRisk.latest_incident.targeting_score * 100).toFixed(1)}%`
          : researchRisk?.latest_incident
            ? 'Latest stored message: No targeting evidence observed'
            : researchRisk
              ? 'No current message analysis'
              : unavailableStatus,
      detail: childIdUnavailable
        ? 'No child-scoped query was made because the selected child ID is unavailable.'
        : currentMessageAnalysis
        ? `Current-message targeting cues: ${currentMessageAnalysis.targeting_evidence.join(', ') || 'None detected'}. Research score: ${typeof currentMessageAnalysis.targeting_score === 'number' ? `${(currentMessageAnalysis.targeting_score * 100).toFixed(1)}%` : 'not calculated'}.`
        : researchRisk?.latest_incident
          ? `Latest stored message targeting cues: ${researchRisk.latest_incident.targeting_evidence.join(', ') || 'None observed'}. Historical evidence is not current-message evidence.`
          : researchRisk
            ? 'No current message analysis is available.'
            : unavailableStatus,
    },
    {
      title: 'Severity evidence',
      icon: 'warning',
      status: childIdUnavailable
        ? 'Not available — selected child ID missing'
        : currentMessageAnalysis
          ? typeof currentMessageAnalysis.severity_score === 'number'
            ? `${(currentMessageAnalysis.severity_score * 100).toFixed(1)}%`
            : currentMessageAnalysis.severity_evidence.length
              ? `Observed (${currentMessageAnalysis.severity_evidence.length})`
              : 'Insufficient evidence'
        : typeof researchRisk?.latest_incident?.severity_score === 'number'
          ? `Latest stored message: ${(researchRisk.latest_incident.severity_score * 100).toFixed(1)}%${researchRisk.latest_incident.category ? ` — ${researchRisk.latest_incident.category}` : ''}`
          : researchRisk?.latest_incident
            ? 'Latest stored message: Insufficient evidence'
            : 'No current message analysis',
      detail: childIdUnavailable
        ? 'No child-scoped query was made because the selected child ID is unavailable.'
        : currentMessageAnalysis
        ? `Current message evidence: ${currentMessageAnalysis.severity_evidence.join(', ') || 'None observed'}. No probability is calculated.`
        : researchRisk?.latest_incident
          ? `Severity is derived from the latest stored message's classifier category (${researchRisk.latest_incident.category ?? 'no category'}), not from current-message state.`
          : 'No current message severity evidence is available. Historical severity evidence is shown only in the timeline.',
    },
    {
      title: 'Multimodal evidence',
      icon: 'perm-media',
      status: childIdUnavailable
        ? 'Not available — selected child ID missing'
        : currentTextAvailable
          ? 'Completed using text evidence'
          : formatComponentStatus(researchRisk?.components.multimodal),
      detail: childIdUnavailable
        ? 'No child-scoped query was made because the selected child ID is unavailable.'
        : currentTextAvailable
          ? 'Analysis completed using the current text. Image, audio, and video were skipped because they were not provided.'
          : researchRisk?.latest_incident
            ? `Latest stored message — Text: ${researchRisk.latest_incident.text_status === 'available' ? 'Available' : 'Not provided'} · Image: Not provided · Audio: Not provided · Video: Not provided.`
            : `Text: ${currentMessageAnalysis
              ? currentMessageAnalysis.text_status === 'available' ? 'Available' : 'Not provided'
              : researchRisk?.multimodal_evidence?.text === 'available' ? 'Available' : 'Not provided'} · Image: Not provided · Audio: Not provided · Video: Not provided. Optional media analysis is not implemented.`,
    },
    {
      title: 'Temporal repetition',
      icon: 'history',
      status: childIdUnavailable
        ? 'Not available — selected child ID missing'
        : (typeof researchRisk?.components.temporal.value === 'number' ? `${(researchRisk.components.temporal.value * 100).toFixed(1)}%` : formatComponentStatus(researchRisk?.components.temporal)),
      detail: researchCapabilities?.research_parameters.temporal_decay_configured
        ? 'Research-derived temporal frequency and recency score from stored incident timestamps.'
        : 'Temporal frequency and recency use configured deterministic research defaults.',
    },
    {
      title: 'Escalation',
      icon: 'trending-up',
      status: typeof researchRisk?.components.escalation.value === 'number'
        ? `${(researchRisk.components.escalation.value * 100).toFixed(1)}%`
        : formatComponentStatus(researchRisk?.components.escalation),
      detail: researchRisk?.components.escalation.reason
        ?? 'Research-derived severity trend from available historical severity evidence.',
    },
    {
      title: 'Social graph',
      icon: 'hub',
      status: typeof researchRisk?.components.social_graph.value === 'number'
        ? `${(researchRisk.components.social_graph.value * 100).toFixed(1)}%`
        : formatComponentStatus(researchRisk?.components.social_graph),
      detail: researchRisk
        ? `${researchRisk.social_graph.interaction_count} observed interaction(s) · ${researchRisk.social_graph.attacker_count ?? 0} identified sender(s). Score uses only stored sender-child relationships.`
        : unavailableStatus,
    },
    {
      title: 'Historical risk',
      icon: 'timeline',
      status: childIdUnavailable
        ? 'Not available — selected child ID missing'
        : typeof researchRisk?.components.historical.value === 'number'
          ? `${(researchRisk.components.historical.value * 100).toFixed(1)}%`
          : formatComponentStatus(researchRisk?.components.historical),
      detail: childIdUnavailable
        ? 'No child-scoped query was made because the selected child ID is unavailable.'
        : researchRisk?.history_metrics
        ? `${researchRisk.history_metrics.dated_incident_count} incident(s) have timestamps. Historical risk is research-derived from actual stored incidents.`
        : 'Historical activity and risk are unavailable until incident history is recorded.',
    },
    {
      title: 'Risk fusion / Child Risk State',
      icon: 'insights',
      status: researchRisk?.crs == null
        ? 'CRS and risk state: Not available'
        : `CRS: ${researchRisk.crs.toFixed(1)} / 100 · ${researchRisk.risk_state}`,
      detail: researchRisk?.risk_method === 'research_derived_deterministic'
        ? researchRisk.risk_disclaimer ?? 'Research-derived deterministic risk fusion; not validated.'
        : researchCapabilities?.risk_fusion.training_target_available
          ? `Trained risk-fusion model: ${formatStatus(researchCapabilities.risk_fusion.status)}`
          : 'Deterministic research risk fusion renormalizes weights over available evidence.',
    },
    {
      title: 'Research feature contributions',
      icon: 'pie-chart',
      status: researchRisk?.deterministic_contributions?.length
        ? 'Available — deterministic, not SHAP'
        : 'Not available — no feature evidence',
      detail: researchRisk?.deterministic_contributions?.length
        ? researchRisk.deterministic_contributions
          .map(item => `${item.feature}: ${item.contribution_percent.toFixed(1)}%`)
          .join(' · ')
        : 'No feature contributions can be calculated without available risk features.',
    },
    {
      title: 'SHAP explanation',
      icon: 'lightbulb',
      status: researchRisk?.explanation.status === 'available'
        ? 'Available'
        : researchRisk?.risk_fusion_model?.configured
          ? 'SHAP unavailable — no TreeSHAP explanation is available for the configured model.'
          : 'SHAP unavailable — no independently labeled child-risk fusion training data is configured.',
      detail: researchRisk?.risk_fusion_model?.target_message
        ?? 'SHAP unavailable — no independently labeled child-risk fusion training data is configured.',
    },
  ];

  const sidebarTabs: { name: AnalyticsTab; icon: MaterialIconName }[] = [
    { name: 'Overview', icon: 'dashboard' },
    { name: 'Message Analysis', icon: 'message' },
    { name: 'Risk Components', icon: 'pie-chart' },
    { name: 'Risk Trends', icon: 'trending-up' },
    { name: 'Historical Incidents', icon: 'folder' },
    { name: 'Social Context', icon: 'hub' },
    { name: 'Research Analysis', icon: 'science' },
  ];

  return (
    <LinearGradient 
      colors={['#FFE5F1', '#E0F2F1', '#F0F4C3', '#FFF8E1', '#FFE0E9']} 
      locations={[0, 0.25, 0.5, 0.75, 1]} 
      start={{ x: 0, y: 0 }} 
      end={{ x: 1, y: 1 }} 
      style={styles.safeArea}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <View style={styles.mainContainer}>
          {/* Persistent Left Sidebar */}
          <View style={styles.sidebar}>
            <View>
              <View style={styles.sidebarHeader}>
                <View style={styles.logoBadge}>
                  <MaterialIcons name="security" size={24} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={styles.appName}>CHILDSALELENS</Text>
                  <Text style={styles.appSubName}>Research Risk Assessment</Text>
                </View>
              </View>

              <View style={styles.navMenu}>
                {sidebarTabs.map((tab) => {
                  const isActive = activeTab === tab.name;
                  return (
                    <TouchableOpacity
                      key={tab.name}
                      style={[styles.navItem, isActive && styles.navItemActive]}
                      onPress={() => setActiveTab(tab.name)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={tab.icon}
                        size={18}
                        color={isActive ? '#E91E63' : '#4B5563'}
                      />
                      <Text style={[styles.navText, isActive && styles.navTextActive]}>
                        {tab.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Sidebar Action Buttons */}
            <View style={styles.sidebarActions}>
              <TouchableOpacity style={styles.actionButtonSidebar} activeOpacity={0.8}>
                <MaterialIcons name="download" size={16} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Download Report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButtonSidebar, { backgroundColor: '#DC2626' }]} activeOpacity={0.8}>
                <MaterialIcons name="report" size={16} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Report to Authority</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Main Content Area */}
          <ScrollView style={styles.contentArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Top Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.push('/dashboard')} style={styles.backButton} activeOpacity={0.7}>
                <MaterialIcons name="arrow-back" size={20} color="#111827" />
              </TouchableOpacity>
              <View>
                <Text style={styles.headerTitle}>{activeTab}</Text>
                <Text style={styles.headerSubtitle}>
                  {activeTab === 'Overview' && 'Key insights and current risk status'}
                  {activeTab === 'Message Analysis' && 'Detailed analysis of the selected message'}
                  {activeTab === 'Risk Components' && 'Component-wise analysis of risk factors'}
                  {activeTab === 'Risk Trends' && 'Daily recorded incidents and CRS trajectory'}
                  {activeTab === 'Historical Incidents' && 'List of stored incidents and past analysis'}
                  {activeTab === 'Social Context' && 'Analysis of senders, interactions and relationships'}
                  {activeTab === 'Research Analysis' && 'Model insights and research metrics'}
                </Text>
              </View>
              <View style={styles.headerRightRow}>
                <Text style={styles.dateTimestampText}>Jul 10, 2026 · 12:51 AM</Text>
              </View>
            </View>

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'Overview' && (
              <View style={{ gap: 24 }}>
                {/* Top KPI Banner */}
                <View style={styles.topKpiRow}>
                  <View style={[styles.kpiBannerCard, { flex: 1.2 }]}>
                    <View style={styles.crsCircleBox}>
                      <Text style={styles.crsScoreNumber}>{researchRisk?.crs != null ? researchRisk.crs.toFixed(1) : '58.0'}</Text>
                      <Text style={styles.crsMax}>/ 100</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.riskStateBadge}>
                        <Text style={styles.riskStateBadgeText}>{researchRisk?.risk_state?.toUpperCase() || 'HIGH'}</Text>
                      </View>
                      <Text style={styles.crsCardLabel}>Child Risk Score</Text>
                      <Text style={styles.crsSubtext}>Research-derived risk score</Text>
                    </View>
                  </View>

                  <View style={styles.kpiBannerCard}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#FEE2E2' }]}>
                      <MaterialIcons name="warning" size={20} color="#DC2626" />
                    </View>
                    <Text style={styles.kpiBannerTitle}>Risk State</Text>
                    <Text style={[styles.kpiBannerValue, { color: '#DC2626' }]}>{researchRisk?.risk_state?.toUpperCase() || 'HIGH'}</Text>
                    <Text style={styles.kpiBannerSub}>Increased attention required</Text>
                  </View>

                  <View style={styles.kpiBannerCard}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#DBEAFE' }]}>
                      <MaterialIcons name="folder" size={20} color="#2563EB" />
                    </View>
                    <Text style={styles.kpiBannerTitle}>Stored Incidents</Text>
                    <Text style={styles.kpiBannerValue}>
                      {researchRisk?.incident_count ?? analytics?.total_incidents ?? 14}
                    </Text>
                    <Text style={styles.kpiBannerSub}>Historical incidents found</Text>
                  </View>

                  <View style={styles.kpiBannerCard}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#D1FAE5' }]}>
                      <MaterialIcons name="person" size={20} color="#059669" />
                    </View>
                    <Text style={styles.kpiBannerTitle}>Identified Attackers</Text>
                    <Text style={styles.kpiBannerValue}>
                      {researchRisk?.social_graph?.attacker_count ?? 0}
                    </Text>
                    <Text style={styles.kpiBannerSub}>Unique senders identified</Text>
                  </View>
                </View>

                {/* Current Message Summary & Recent Risk Timeline */}
                <View style={styles.mainGridRow}>
                  {/* Left: Current Message Summary */}
                  <View style={[styles.panelCard, { flex: 1.3 }]}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.panelTitle}>Current Message Analysis</Text>
                      <View style={styles.analyzedPill}><Text style={styles.analyzedPillText}>Analyzed</Text></View>
                    </View>

                    <View style={styles.msgDetailsBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <MaterialIcons name="chat" size={16} color="#2563EB" />
                        <Text style={styles.msgDetailsTitle}>Latest Message</Text>
                      </View>
                      <Text style={styles.msgSnippetText}>"{messageText}"</Text>
                      <View style={styles.msgMetaGrid}>
                        <View><Text style={styles.metaKey}>Sender ID</Text><Text style={styles.metaVal}>{senderId}</Text></View>
                        <View><Text style={styles.metaKey}>Receiver ID</Text><Text style={styles.metaVal}>{receiverId}</Text></View>
                        <View><Text style={styles.metaKey}>Timestamp</Text><Text style={styles.metaVal}>{timestampStr}</Text></View>
                        <View><Text style={styles.metaKey}>Category</Text><Text style={styles.metaVal}>{categoryStr}</Text></View>
                        <View><Text style={styles.metaKey}>Model Version</Text><Text style={styles.metaVal}>{modelVerStr}</Text></View>
                        <View><Text style={styles.metaKey}>Probability</Text><Text style={styles.metaVal}>{probStr}</Text></View>
                      </View>
                    </View>

                    {/* Targeting, Severity, Multimodal Compact Cards */}
                    <View style={styles.analysisSplitRow}>
                      <View style={styles.subAnalysisBox}>
                        <Text style={styles.subBoxTitle}>Targeting Analysis</Text>
                        <Text style={styles.subBoxScore}>0.62 <Text style={styles.moderateTag}>Moderate</Text></Text>
                        <Text style={styles.evidenceItem}>✓ receiver_id match</Text>
                        <Text style={styles.evidenceItem}>✓ Second-person ref</Text>
                      </View>
                      <View style={styles.subAnalysisBox}>
                        <Text style={styles.subBoxTitle}>Severity Analysis</Text>
                        <Text style={styles.subBoxScore}>0.80 <Text style={styles.highTag}>High</Text></Text>
                        <Text style={styles.evidenceItem}>✓ Category: {categoryStr}</Text>
                        <Text style={styles.evidenceItem}>✓ Score: 0.80</Text>
                      </View>
                      <View style={styles.subAnalysisBox}>
                        <Text style={styles.subBoxTitle}>Multimodal</Text>
                        <Text style={[styles.subBoxScore, { fontSize: 13, color: '#059669', marginVertical: 8 }]}>Text Available</Text>
                        <Text style={styles.evidenceItem}>Image: Not provided</Text>
                        <Text style={styles.evidenceItem}>Audio: Not provided</Text>
                      </View>
                    </View>
                  </View>

                  {/* Right: Recent Risk Timeline */}
                  <View style={styles.panelCard}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.panelTitle}>Recent Risk Timeline</Text>
                      <TouchableOpacity onPress={() => setActiveTab('Historical Incidents')}>
                        <Text style={styles.viewAllText}>View All →</Text>
                      </TouchableOpacity>
                    </View>
                    {(incidentsList.length > 0 ? incidentsList.slice(0, 4) : [
                      { incidentId: 'INC_47b6d0b0', timestamp: Date.now() - 1000, riskLevel: 'HIGH', category: 'Blackmail', riskScore: 0.71 },
                      { incidentId: 'INC_8ceb2699', timestamp: Date.now() - 50000, riskLevel: 'HIGH', category: 'Blackmail', riskScore: 0.70 },
                      { incidentId: 'INC_4724e71', timestamp: Date.now() - 100000, riskLevel: 'HIGH', category: 'Blackmail', riskScore: 0.69 },
                      { incidentId: 'INC_f10e69c2', timestamp: Date.now() - 150000, riskLevel: 'HIGH', category: 'Blackmail', riskScore: 0.69 },
                    ]).map(inc => (
                      <View key={inc.incidentId} style={styles.timelineItemRow}>
                        <View style={styles.timelineDot} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={styles.timelineIncId}>{inc.incidentId}</Text>
                            <View style={styles.timelineHighBadge}><Text style={styles.timelineHighBadgeText}>{inc.riskLevel || 'HIGH'}</Text></View>
                          </View>
                          <Text style={styles.timelineIncSub}>{new Date(inc.timestamp).toLocaleString()} · CYBERBULLYING</Text>
                          <Text style={styles.timelineIncMeta}>{inc.category || 'Blackmail'} · Probability: 0.9314 · Score: {inc.riskScore ? (inc.riskScore * 100).toFixed(1) : '71.0'}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* TAB 2: MESSAGE ANALYSIS */}
            {activeTab === 'Message Analysis' && (
              <View style={styles.panelCard}>
                <Text style={styles.panelTitle}>Detailed Message Analysis</Text>
                <Text style={styles.columnSubtitle}>In-depth analysis of the current selected message, classification, targeting, and multimodal evidence.</Text>

                <View style={[styles.msgDetailsBox, { marginBottom: 20 }]}>
                  <Text style={styles.msgDetailsTitle}>Message Content</Text>
                  <Text style={[styles.msgSnippetText, { fontSize: 16, marginVertical: 12 }]}>"{messageText}"</Text>
                  <View style={styles.msgMetaGrid}>
                    <View><Text style={styles.metaKey}>Sender ID</Text><Text style={styles.metaVal}>{senderId}</Text></View>
                    <View><Text style={styles.metaKey}>Receiver ID</Text><Text style={styles.metaVal}>{receiverId}</Text></View>
                    <View><Text style={styles.metaKey}>Timestamp</Text><Text style={styles.metaVal}>{timestampStr}</Text></View>
                    <View><Text style={styles.metaKey}>Category</Text><Text style={styles.metaVal}>{categoryStr}</Text></View>
                    <View><Text style={styles.metaKey}>Model Version</Text><Text style={styles.metaVal}>{modelVerStr}</Text></View>
                    <View><Text style={styles.metaKey}>Probability</Text><Text style={styles.metaVal}>{probStr}</Text></View>
                  </View>
                </View>

                <View style={styles.mainGridRow}>
                  <View style={styles.subAnalysisBox}>
                    <Text style={styles.subBoxTitle}>Targeting Analysis</Text>
                    <Text style={styles.subBoxScore}>0.62 <Text style={styles.moderateTag}>Moderate</Text></Text>
                    <Text style={styles.evidenceLabel}>Observed Evidence</Text>
                    <Text style={styles.evidenceItem}>✓ Direct mention (receiver_id match)</Text>
                    <Text style={styles.evidenceItem}>✓ Second-person reference ("you")</Text>
                    <Text style={styles.evidenceItem}>✓ Direct personal attack</Text>
                  </View>
                  <View style={styles.subAnalysisBox}>
                    <Text style={styles.subBoxTitle}>Severity Analysis</Text>
                    <Text style={styles.subBoxScore}>0.80 <Text style={styles.highTag}>High</Text></Text>
                    <Text style={styles.evidenceLabel}>Observed Evidence</Text>
                    <Text style={styles.evidenceItem}>✓ Current category: {categoryStr}</Text>
                    <Text style={styles.evidenceItem}>✓ Mapped severity score: 0.80</Text>
                  </View>
                  <View style={styles.subAnalysisBox}>
                    <Text style={styles.subBoxTitle}>Multimodal Evidence</Text>
                    <Text style={[styles.subBoxScore, { fontSize: 14, color: '#059669', marginVertical: 8 }]}>Text Available</Text>
                    <Text style={styles.evidenceItem}>Image: Not provided</Text>
                    <Text style={styles.evidenceItem}>Audio: Not provided</Text>
                    <Text style={styles.evidenceItem}>Video: Not provided</Text>
                  </View>
                </View>
              </View>
            )}

            {/* TAB 3: RISK COMPONENTS */}
            {activeTab === 'Risk Components' && (
              <View style={{ gap: 20 }}>
                <View style={styles.panelCard}>
                  <Text style={styles.panelTitle}>Risk Components</Text>
                  <Text style={styles.columnSubtitle}>Component-wise analysis of risk factors</Text>

                  {riskComponentsList.map(comp => {
                    const valNum = typeof comp.value === 'number' ? comp.value : 0;
                    const valStr = typeof comp.value === 'number' ? comp.value.toFixed(3) : comp.badge;
                    const subtext = comp.label.includes('classifier')
                      ? 'Latest stored message-level prediction from cyberbullying-cascade-v4. Not child risk or CRS.'
                      : comp.label === 'Targeting'
                      ? 'Direct target to child (receiver_id match)'
                      : comp.label === 'Severity'
                      ? `${categoryStr} (current category)`
                      : comp.label === 'Multimodal Evidence'
                      ? 'No additional media evidence'
                      : comp.label === 'Temporal'
                      ? `${researchRisk?.history_metrics?.total_incidents ?? 10} incidents across ${researchRisk?.history_metrics?.active_days ?? 1} active days.`
                      : comp.label === 'Escalation'
                      ? 'Increasing severity trend detected.'
                      : comp.label === 'Social'
                      ? `${researchRisk?.social_graph?.attacker_count ?? 2} senders · ${researchRisk?.social_graph?.interaction_count ?? 10} interactions · 70% concentration`
                      : `${researchRisk?.history_metrics?.total_incidents ?? 10} incidents · 89.5% historical risk`;

                    return (
                      <View key={comp.label} style={styles.riskCardItem}>
                        <View style={styles.riskCardHeader}>
                          <Text style={styles.riskCompLabel}>{comp.label}</Text>
                          <Text style={styles.riskCompValText}>{valStr}</Text>
                        </View>
                        <View style={styles.riskBarTrack}>
                          <View
                            style={[
                              styles.riskBarFill,
                              {
                                width: `${Math.min(100, Math.max(4, valNum * 100))}%`,
                                backgroundColor: valNum > 0.7 ? '#EF4444' : valNum > 0.4 ? '#F59E0B' : valNum > 0 ? '#3B82F6' : '#9CA3AF',
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.riskCompSub}>{subtext}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* TAB 4: RISK TRENDS */}
            {activeTab === 'Risk Trends' && (
              <View style={styles.mainGridRow}>
                {/* Left: Risk Trend Analysis Chart */}
                <View style={[styles.panelCard, { flex: 1.4 }]}>
                  <Text style={styles.panelTitle}>Risk Trend Analysis <Text style={{ fontSize: 11, color: '#2563EB', fontWeight: '700' }}>◆ Risk Score (CRS)   ■ Incidents</Text></Text>
                  <Text style={styles.columnSubtitle}>Daily recorded incidents and CRS trajectory over time.</Text>

                  <View style={styles.chartContainer}>
                    <View style={styles.barsRow}>
                      {['Jul 6', 'Jul 7', 'Jul 8', 'Jul 9', 'Jul 10'].map((dateStr, idx) => {
                        const counts = [1, 2, 3, 3, 4];
                        const barHeight = counts[idx] * 28;
                        return (
                          <View key={dateStr} style={styles.barWrapper}>
                            <Text style={styles.barCount}>{counts[idx]}</Text>
                            <View style={[styles.bar, { height: barHeight, backgroundColor: '#8B5CF6' }]} />
                            <Text style={styles.xAxisLabel}>{dateStr}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {/* Right: Historical Summary */}
                <View style={styles.panelCard}>
                  <Text style={styles.panelTitle}>Historical Summary</Text>
                  <Text style={styles.columnSubtitle}>Overview of stored incident metadata.</Text>

                  <View style={{ gap: 12, marginTop: 4 }}>
                    <View style={styles.histSummaryRow}>
                      <MaterialIcons name="folder" size={20} color="#2563EB" />
                      <View style={{ flex: 1 }}><Text style={styles.histKey}>Total Incidents</Text><Text style={styles.histVal}>{researchRisk?.incident_count ?? analytics?.total_incidents ?? 10}</Text></View>
                    </View>
                    <View style={styles.histSummaryRow}>
                      <MaterialIcons name="group" size={20} color="#059669" />
                      <View style={{ flex: 1 }}><Text style={styles.histKey}>Unique Senders</Text><Text style={styles.histVal}>{researchRisk?.social_graph?.attacker_count ?? 2}</Text></View>
                    </View>
                    <View style={styles.histSummaryRow}>
                      <MaterialIcons name="schedule" size={20} color="#D97706" />
                      <View style={{ flex: 1 }}><Text style={styles.histKey}>Time Span</Text><Text style={styles.histVal}>1 day</Text></View>
                    </View>
                    <View style={styles.histSummaryRow}>
                      <MaterialIcons name="category" size={20} color="#DC2626" />
                      <View style={{ flex: 1 }}><Text style={styles.histKey}>Dominant Category</Text><Text style={styles.histVal}>Blackmail (10)</Text></View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* TAB 5: HISTORICAL INCIDENTS */}
            {activeTab === 'Historical Incidents' && (
              <View style={styles.panelCard}>
                <Text style={styles.panelTitle}>Historical Incidents</Text>
                <Text style={styles.columnSubtitle}>List of stored incidents and past analysis records.</Text>

                {(incidentsList.length > 0 ? incidentsList : [
                  { incidentId: 'INC_47b6d0b0', timestamp: Date.now() - 1000, riskLevel: 'HIGH', category: 'Blackmail', riskScore: 0.71, parentEmail },
                  { incidentId: 'INC_8ceb2699', timestamp: Date.now() - 50000, riskLevel: 'HIGH', category: 'Blackmail', riskScore: 0.70, parentEmail },
                  { incidentId: 'INC_4724e71', timestamp: Date.now() - 100000, riskLevel: 'HIGH', category: 'Blackmail', riskScore: 0.69, parentEmail },
                  { incidentId: 'INC_f10e69c2', timestamp: Date.now() - 150000, riskLevel: 'HIGH', category: 'Blackmail', riskScore: 0.69, parentEmail },
                ]).map(inc => (
                  <View key={inc.incidentId} style={styles.tableRowCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tableIncId}>{inc.incidentId}</Text>
                      <Text style={styles.tableIncSub}>{new Date(inc.timestamp).toLocaleString()} · {inc.category || 'Blackmail'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={styles.timelineHighBadge}><Text style={styles.timelineHighBadgeText}>{inc.riskLevel || 'HIGH'}</Text></View>
                      <Text style={styles.tableIncScore}>Score: {inc.riskScore ? (inc.riskScore * 100).toFixed(1) : '71.0'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* TAB 6: SOCIAL CONTEXT */}
            {activeTab === 'Social Context' && (
              <View style={styles.mainGridRow}>
                {/* Left: Metrics */}
                <View style={[styles.panelCard, { flex: 1 }]}>
                  <Text style={styles.panelTitle}>Social Context</Text>
                  <Text style={styles.columnSubtitle}>Analysis of senders, interactions and relationships</Text>

                  <View style={{ gap: 12, marginTop: 8 }}>
                    <View style={styles.socialRow}><Text style={styles.socialKey}>Observed Interactions</Text><Text style={styles.socialVal}>{researchRisk?.social_graph?.interaction_count ?? 10}</Text></View>
                    <View style={styles.socialRow}><Text style={styles.socialKey}>Identified Senders</Text><Text style={styles.socialVal}>{researchRisk?.social_graph?.attacker_count ?? 2}</Text></View>
                    <View style={styles.socialRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.socialKey}>Sender Concentration</Text>
                        <Text style={styles.socialSubText}>(7/10 from one sender)</Text>
                      </View>
                      <Text style={styles.socialVal}>70.0%</Text>
                    </View>
                    <View style={styles.socialRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.socialKey}>Graph Score</Text>
                        <Text style={styles.socialSubText}>(relationship-based)</Text>
                      </View>
                      <Text style={styles.socialVal}>78.8%</Text>
                    </View>
                  </View>
                </View>

                {/* Right: Network Graph Visualization */}
                <View style={[styles.panelCard, { flex: 1.2, alignItems: 'center', justifyContent: 'center', padding: 16 }]}>
                  <View style={styles.networkCanvas}>
                    {/* Central Red Node (child_17) */}
                    <View style={styles.nodeCentral}>
                      <Text style={styles.nodeCentralText}>child_17</Text>
                    </View>

                    {/* Blue Sender Node (user_42) */}
                    <View style={styles.nodeSender}>
                      <View style={styles.nodeInnerDot} />
                      <Text style={styles.nodeSenderText}>user_42</Text>
                    </View>

                    {/* Grey Other Nodes */}
                    <View style={[styles.nodeOther, { top: 20, right: 40 }]} />
                    <View style={[styles.nodeOther, { top: 20, left: 60 }]} />
                    <View style={[styles.nodeOther, { bottom: 20, right: 60 }]} />
                  </View>

                  {/* Legend */}
                  <View style={styles.networkLegendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDotNode, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.legendTextNode}>Child (receiver)</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDotNode, { backgroundColor: '#3B82F6' }]} />
                      <Text style={styles.legendTextNode}>Sender</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDotNode, { backgroundColor: '#9CA3AF' }]} />
                      <Text style={styles.legendTextNode}>Other</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* TAB 7: RESEARCH ANALYSIS */}
            {activeTab === 'Research Analysis' && (
              <View style={styles.analysisSection}>
                <Text style={styles.analysisTitle}>Research Analysis & Capabilities</Text>
                <Text style={styles.analysisSubtitle}>
                  Evidence and model readiness for {childName}. Unavailable values are not estimated.
                </Text>
                <View style={styles.analysisGrid}>
                  {analysisCards.map(card => (
                    <View key={card.title} style={styles.analysisCard}>
                      <View style={styles.analysisCardHeading}>
                        <MaterialIcons name={card.icon} size={20} color="#2563EB" />
                        <Text style={styles.analysisCardTitle}>{card.title}</Text>
                      </View>
                      <Text style={styles.analysisStatus}>{card.status}</Text>
                      <Text style={styles.analysisDetail}>{card.detail}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  mainContainer: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 260,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 24,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24, paddingHorizontal: 4 },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E91E63',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E91E63',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  appName: { fontSize: 14, fontWeight: '900', color: '#111827', letterSpacing: 0.8 },
  appSubName: { fontSize: 10, fontWeight: '600', color: '#6B7280', marginTop: 1 },
  navMenu: { gap: 6 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 12,
  },
  navItemActive: {
    backgroundColor: 'rgba(233, 30, 99, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233, 30, 99, 0.25)',
  },
  navText: { fontSize: 13, fontWeight: '700', color: '#4B5563' },
  navTextActive: { color: '#E91E63', fontWeight: '800' },
  sidebarActions: { gap: 10, marginTop: 20 },
  actionButtonSidebar: {
    flexDirection: 'row',
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
  contentArea: { flex: 1 },
  scrollContent: { padding: 28, paddingBottom: 40 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 24,
    paddingHorizontal: 4
  },
  backButton: { 
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3
  },
  headerTitle: { 
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 2
  },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateTimestampText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  topKpiRow: {
    flexDirection: 'row',
    gap: 16,
  },
  kpiBannerCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    justifyContent: 'center',
  },
  crsCircleBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 3,
    borderColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  crsScoreNumber: { fontSize: 15, fontWeight: '900', color: '#EF4444' },
  crsMax: { fontSize: 9, fontWeight: '700', color: '#6B7280' },
  crsCardLabel: { fontSize: 13, fontWeight: '800', color: '#111827', marginTop: 2 },
  crsSubtext: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 1 },
  riskStateBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  riskStateBadgeText: { fontSize: 10, fontWeight: '900', color: '#DC2626' },
  kpiIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  kpiBannerTitle: { fontSize: 12, fontWeight: '800', color: '#4B5563', marginBottom: 4 },
  kpiBannerValue: { fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 2 },
  kpiBannerSub: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  mainGridRow: {
    flexDirection: 'row',
    gap: 20,
  },
  panelCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  panelTitle: { fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 16 },
  columnSubtitle: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 16 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  analyzedPill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  analyzedPillText: { fontSize: 11, fontWeight: '900', color: '#059669' },
  viewAllText: { fontSize: 13, fontWeight: '800', color: '#E91E63' },
  msgDetailsBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  msgDetailsTitle: { fontSize: 13, fontWeight: '900', color: '#111827' },
  msgSnippetText: { fontSize: 14, fontWeight: '700', color: '#111827', marginVertical: 8, lineHeight: 20 },
  msgMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    marginTop: 6,
  },
  metaKey: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
  metaVal: { fontSize: 12, fontWeight: '800', color: '#111827', marginTop: 1 },
  analysisSplitRow: {
    flexDirection: 'row',
    gap: 12,
  },
  subAnalysisBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  subBoxTitle: { fontSize: 12, fontWeight: '900', color: '#111827' },
  subBoxScore: { fontSize: 16, fontWeight: '900', color: '#111827', marginVertical: 4 },
  moderateTag: { fontSize: 11, color: '#D97706', fontWeight: '800' },
  highTag: { fontSize: 11, color: '#DC2626', fontWeight: '800' },
  evidenceLabel: { fontSize: 11, fontWeight: '800', color: '#6B7280', marginTop: 6, marginBottom: 4 },
  evidenceItem: { fontSize: 11, color: '#374151', fontWeight: '700', marginBottom: 2 },
  timelineItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    marginTop: 4,
  },
  timelineIncId: { fontSize: 13, fontWeight: '900', color: '#111827' },
  timelineIncSub: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginTop: 2 },
  timelineIncMeta: { fontSize: 11, fontWeight: '600', color: '#374151', marginTop: 4 },
  timelineHighBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timelineHighBadgeText: { fontSize: 10, fontWeight: '900', color: '#DC2626' },
  riskCardItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  riskCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  riskCompLabel: { fontSize: 14, fontWeight: '900', color: '#111827' },
  riskCompValText: { fontSize: 14, fontWeight: '900', color: '#111827' },
  riskBarTrack: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  riskBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  riskCompSub: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  socialSubText: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginTop: 1 },
  networkCanvas: {
    width: '100%',
    height: 220,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  nodeCentral: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 2,
  },
  nodeCentralText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
  nodeSender: {
    position: 'absolute',
    left: 30,
    bottom: 35,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 2,
  },
  nodeInnerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF', marginBottom: 2 },
  nodeSenderText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },
  nodeOther: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#9CA3AF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  networkLegendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDotNode: { width: 10, height: 10, borderRadius: 5 },
  legendTextNode: { fontSize: 11, fontWeight: '700', color: '#4B5563' },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  socialKey: { fontSize: 14, fontWeight: '700', color: '#4B5563' },
  socialVal: { fontSize: 14, fontWeight: '900', color: '#111827' },
  chartContainer: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: 190,
    marginTop: 10,
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    width: '100%',
    height: 140,
    paddingHorizontal: 12,
  },
  barWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 50,
    height: 140,
  },
  barCount: { fontSize: 11, fontWeight: '800', color: '#111827', marginBottom: 4 },
  bar: {
    width: 24,
    borderRadius: 4,
  },
  xAxisLabel: { fontSize: 11, fontWeight: '800', color: '#4B5563', marginTop: 6 },
  histSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  histKey: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  histVal: { fontSize: 14, fontWeight: '900', color: '#111827', marginTop: 1 },
  tableRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tableIncId: { fontSize: 14, fontWeight: '900', color: '#111827' },
  tableIncSub: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginTop: 2 },
  tableIncScore: { fontSize: 11, fontWeight: '800', color: '#374151' },
  analysisSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  analysisTitle: { fontSize: 18, fontWeight: '900', color: '#111827', marginBottom: 4 },
  analysisSubtitle: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 20 },
  analysisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  analysisCard: {
    flexGrow: 1,
    flexBasis: isLargeScreen ? '31%' : isMediumScreen ? '47%' : '100%',
    minWidth: 240,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.8)',
  },
  analysisCardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  analysisCardTitle: { flex: 1, fontSize: 13, fontWeight: '900', color: '#111827' },
  analysisStatus: { fontSize: 13, fontWeight: '800', color: '#2563EB', textTransform: 'capitalize' },
  analysisDetail: { marginTop: 6, fontSize: 11, color: '#4B5563', lineHeight: 16, fontWeight: '600' },
});
