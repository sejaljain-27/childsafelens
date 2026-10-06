import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import AlertCard from '../components/AlertCard';
import {
  fetchAlerts,
  fetchChildProfiles,
  fetchChildRiskTimeline,
  fetchDashboardStats,
  fetchIncidentExplanation,
  fetchResearchRisk,
  getCurrentMessageAnalysis,
  clearParentSession,
  hasParentSession,
  ParentSessionExpiredError,
  fetchSocialGraphRisk,
  submitDecision,
  type ChildRiskTimeline,
  type CurrentMessageAnalysis,
  type IncidentExplanation,
  type IncidentType,
  type DashboardStats,
  type ResearchRisk,
  type SocialGraphRisk,
} from '../services/alertsService';

const riskComponentLabels = [
  ['classifier_probability', 'Cyberbullying classifier probability'],
  ['targeting', 'Targeting'],
  ['severity', 'Severity'],
  ['multimodal', 'Multimodal'],
  ['temporal', 'Temporal'],
  ['escalation', 'Escalation'],
  ['social_graph', 'Social'],
  ['historical', 'Historical'],
] as const;

const displayComponentValue = (
  value: number | null | undefined,
  status?: string,
  evidenceCount?: number,
) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(3);
  }
  if (status === 'observed_uncalibrated' && evidenceCount) {
    return `Observed (${evidenceCount})`;
  }
  if (status === 'observed_descriptive') return 'Descriptive only';
  if (status === 'text_available_optional_media_not_provided') return 'Text available';
  if (status?.includes('insufficient') || status?.includes('uncalibrated')) {
    return 'Insufficient evidence';
  }
  return 'Not available';
};

const displayEvidenceCount = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Not available';

const displayResearchPercent = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : 'Not available';

const DashboardScreen: React.FC = () => {
  const router = useRouter();

  const getStoredEmail = () => {
    if (hasParentSession()) {
      return localStorage.getItem('childsafelens_parent_email');
    }
    return null;
  };

  const [parentEmail] = useState<string>(getStoredEmail() || '');
  const [availableChildren, setAvailableChildren] = useState<string[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [stats, setStats] = useState<DashboardStats>({
    total_events: 0,
    classifier_flagged_count: 0,
    pending_count: 0,
  });
  const [outgoingIncidents, setOutgoingIncidents] = useState<IncidentType[]>([]);
  const [incomingIncidents, setIncomingIncidents] = useState<IncidentType[]>([]);
  const [researchRisk, setResearchRisk] = useState<ResearchRisk | null>(null);
  const [currentMessageAnalysis, setCurrentMessageAnalysis] = useState<CurrentMessageAnalysis | null>(null);
  const [riskTimeline, setRiskTimeline] = useState<ChildRiskTimeline | null>(null);
  const [socialGraph, setSocialGraph] = useState<SocialGraphRisk | null>(null);
  const [riskExplanation, setRiskExplanation] = useState<IncidentExplanation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const currentTextAvailable = currentMessageAnalysis?.text_status === 'available';

  const loadData = useCallback(async () => {
    if (!parentEmail) return;
    try {
      const profiles = await fetchChildProfiles(parentEmail);
      const children = Array.from(new Set(profiles.map(profile => profile.childName.trim()).filter(Boolean)));
      setAvailableChildren(children);
      setProfileError(null);

      const currentChild = children.includes(selectedChild) ? selectedChild : children[0];
      if (!currentChild) {
        setSelectedChild('');
        setSelectedChildId('');
        setStats({
          total_events: 0,
          classifier_flagged_count: 0,
          pending_count: 0,
        });
        setResearchRisk(null);
        setCurrentMessageAnalysis(null);
        setRiskTimeline(null);
        setSocialGraph(null);
        setRiskExplanation(null);
        setOutgoingIncidents([]);
        setIncomingIncidents([]);
        return;
      }

      if (currentChild !== selectedChild) setSelectedChild(currentChild);
      const selectedProfile = profiles.find(
        profile => profile.childName.trim() === currentChild,
      );
      const currentChildId = selectedProfile?.childId ?? '';
      setSelectedChildId(currentChildId);
      if (!currentChildId.trim()) {
        setProfileError('The selected child profile has no ID. Child research data was not queried.');
        setStats({
          total_events: 0,
          classifier_flagged_count: 0,
          pending_count: 0,
        });
        setResearchRisk(null);
        setCurrentMessageAnalysis(null);
        setRiskTimeline(null);
        setSocialGraph(null);
        setRiskExplanation(null);
        setOutgoingIncidents([]);
        setIncomingIncidents([]);
        return;
      }
      const currentAnalysis = getCurrentMessageAnalysis(parentEmail, currentChildId);
      const [allIncidents, childRisk, timeline, graph] = await Promise.all([
        fetchAlerts(parentEmail, currentChildId),
        fetchResearchRisk(parentEmail, currentChildId, currentAnalysis),
        currentChildId
          ? fetchChildRiskTimeline(currentChildId, parentEmail)
          : Promise.resolve(null),
        currentChildId
          ? fetchSocialGraphRisk(currentChildId, parentEmail)
          : Promise.resolve(null),
      ]);
      setStats(await fetchDashboardStats(allIncidents));
      setResearchRisk(childRisk);
      setCurrentMessageAnalysis(currentAnalysis);
      setRiskTimeline(timeline);
      setSocialGraph(graph);
      const latestIncident = allIncidents.reduce<IncidentType | null>(
        (latest, incident) => (
          latest === null || incident.timestamp > latest.timestamp ? incident : latest
        ),
        null,
      );
      setRiskExplanation(
        latestIncident
          ? await fetchIncidentExplanation(latestIncident.incidentId, parentEmail)
          : null,
      );

      const filtered = allIncidents.filter(i =>
        i.riskLevel === 'HIGH' ||
        i.riskLevel === 'CRITICAL' ||
        i.riskLevel === 'high_risk' ||
        i.status === 'PENDING_PARENT_REVIEW' ||
        i.status === 'EDIT_REQUIRED'
      );
      setOutgoingIncidents(filtered.filter(i => (i.type?.toUpperCase() === 'OUTGOING') || !i.type));
      setIncomingIncidents(filtered.filter(i => i.type?.toUpperCase() === 'INCOMING'));
    } catch (error) {
      if (error instanceof ParentSessionExpiredError) return;
      console.error('Failed to load connected child profiles:', error);
      setProfileError(error instanceof Error ? error.message : 'Unable to load child profiles.');
      setAvailableChildren([]);
      setSelectedChild('');
      setSelectedChildId('');
      setStats({
        total_events: 0,
        classifier_flagged_count: 0,
        pending_count: 0,
      });
      setResearchRisk(null);
      setCurrentMessageAnalysis(null);
      setRiskTimeline(null);
      setSocialGraph(null);
      setRiskExplanation(null);
      setOutgoingIncidents([]);
      setIncomingIncidents([]);
    } finally {
      setRefreshing(false);
    }
  }, [parentEmail, selectedChild]);

  const refreshData = async () => {
    setRefreshing(true);
    await loadData();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleExpiredSession = () => router.replace('/');
    window.addEventListener('childsafelens-session-expired', handleExpiredSession);
    return () => {
      window.removeEventListener('childsafelens-session-expired', handleExpiredSession);
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateCurrentAnalysis = () => {
      setCurrentMessageAnalysis(
        parentEmail && selectedChildId
          ? getCurrentMessageAnalysis(parentEmail, selectedChildId)
          : null,
      );
    };
    updateCurrentAnalysis();
    window.addEventListener('childsafelens-current-analysis-updated', updateCurrentAnalysis);
    return () => window.removeEventListener(
      'childsafelens-current-analysis-updated',
      updateCurrentAnalysis,
    );
  }, [parentEmail, selectedChildId]);

  useEffect(() => {
    if (!parentEmail) {
      router.replace('/');
      return;
    }
    const initialLoad = setTimeout(() => void loadData(), 0);
    const interval = setInterval(() => void loadData(), 4000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadData, parentEmail, router]);

  const handleDecision = async (incidentId: string, decision: 'ALLOW' | 'BLOCK' | 'EDIT') => {
    try {
      await submitDecision(incidentId, decision);
      await loadData();
    } catch (error) {
      console.error('Failed to submit parent decision', error);
      setProfileError(error instanceof Error ? error.message : 'Unable to submit parent decision.');
    }
  };

  const handleLogout = () => {
    clearParentSession();
    router.replace('/');
  };

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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={          <RefreshControl refreshing={refreshing} onRefresh={refreshData} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <MaterialIcons name="security" size={26} color="#E91E63" />
              <Text style={styles.appName}>ChildSafeLens</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/settings')} activeOpacity={0.7}>
                <MaterialIcons name="settings" size={22} color="#E91E63" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={handleLogout} activeOpacity={0.7}>
                <MaterialIcons name="logout" size={22} color="#E91E63" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mapped Account Info */}
          <View style={styles.mappedInfoBox}>
            <Text style={styles.mappedText}>Logged in as: <Text style={styles.boldText}>{parentEmail}</Text></Text>
          </View>

          {/* Children Selector & Summary Metrics */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connected Child Profile</Text>
            {availableChildren.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {profileError
                    ? `Could not load connected profiles: ${profileError}`
                    : `No child profile is connected to ${parentEmail} yet. Sign in to the Android app with this same parent email and create a child profile.`}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.childTabsRow}>
                  {availableChildren.map((child) => (
                    <TouchableOpacity
                      key={child}
                      style={[styles.childTab, selectedChild === child && styles.activeChildTab]}
                      onPress={() => setSelectedChild(child)}
                    >
                      <Text style={[styles.childTabText, selectedChild === child && styles.activeChildTabText]}>{child}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {!selectedChildId && profileError && (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>{profileError}</Text>
                  </View>
                )}

                <View style={styles.metricsGrid}>
                  <View style={styles.metricCard}>
                    <Text style={[styles.metricNumber, { color: '#FF9800' }]}>{stats.pending_count}</Text>
                    <Text style={[styles.metricLabel, { color: '#F57C00' }]}>Pending review</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={[styles.metricNumber, { color: '#E91E63' }]}>{stats.classifier_flagged_count}</Text>
                    <Text style={[styles.metricLabel, { color: '#C2185B' }]}>Message-level classifier flags</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={[styles.metricNumber, { color: '#42A5F5' }]}>{stats.total_events}</Text>
                    <Text style={[styles.metricLabel, { color: '#1976D2' }]}>Harmful incidents</Text>
                  </View>
                </View>
                <Text style={styles.researchRiskNote}>
                  Message-level classifier labels are not child risk or CRS.
                </Text>
                <View style={styles.researchRiskCard}>
                  <Text style={styles.researchRiskTitle}>Classification</Text>
                  <Text style={styles.researchRiskText}>
                    {researchRisk?.classifier?.status === 'dummy'
                      ? 'Development/Dummy classifier (simulation only)'
                      : researchRisk?.classifier?.status === 'real'
                        ? 'Supplied PKL classifier connected (classification performance not independently validated)'
                        : 'Classifier status: Not available'}
                  </Text>
                  {researchRisk?.classification_disclaimer && (
                    <Text style={styles.researchRiskNote}>
                      {researchRisk.classification_disclaimer}
                    </Text>
                  )}
                </View>
                <View style={styles.researchRiskCard}>
                  <Text style={styles.researchRiskTitle}>Research Risk Assessment</Text>
                  <Text style={styles.researchRiskValue}>
                    {researchRisk?.crs === null || researchRisk?.crs === undefined
                      ? 'CRS: Not available'
                      : `CRS: ${researchRisk.crs.toFixed(1)} / 100`}
                  </Text>
                  <Text style={styles.researchRiskText}>
                    Risk state: {researchRisk?.risk_state ?? 'Loading'}
                  </Text>
                  <Text style={styles.researchRiskText}>
                    Stored incidents: {researchRisk?.incident_count ?? 'Not available'}
                  </Text>
                  <Text style={styles.researchRiskText}>
                    Identified attackers: {researchRisk?.social_graph.attacker_count ?? 'Not available'}
                  </Text>
                  <Text style={styles.researchRiskNote}>
                    {researchRisk?.message ?? 'Loading risk assessment status.'}
                  </Text>
                  {researchRisk?.risk_disclaimer && (
                    <Text style={styles.researchRiskNote}>{researchRisk.risk_disclaimer}</Text>
                  )}
                  <Text style={styles.researchRiskSubheading}>Risk components</Text>
                  {riskComponentLabels.map(([key, label]) => {
                    const component = researchRisk?.components[key];
                    const currentValue = key === 'targeting'
                      ? currentMessageAnalysis?.targeting_score
                      : key === 'severity'
                        ? currentMessageAnalysis?.severity_score
                        : undefined;
                    return (
                      <View key={key} style={styles.researchRiskRow}>
                        <Text style={styles.researchRiskText}>{label}</Text>
                        <Text style={styles.researchRiskValueSmall}>
                          {key === 'classifier_probability' && currentMessageAnalysis
                              ? currentMessageAnalysis.probability === null
                                ? 'Not available'
                                : String(currentMessageAnalysis.probability)
                            : typeof currentValue === 'number'
                              ? displayResearchPercent(currentValue)
                              : ['targeting', 'severity', 'multimodal', 'temporal', 'escalation', 'social_graph', 'historical'].includes(key)
                                ? displayResearchPercent(component?.value)
                            : displayComponentValue(
                              component?.value,
                              component?.status,
                              component?.observed_evidence_count,
                            )}
                        </Text>
                        {key === 'classifier_probability' && (
                          <Text style={styles.researchRiskNote}>
                            {currentMessageAnalysis?.probability !== null && currentMessageAnalysis
                              ? `${currentMessageAnalysis.classification} message-level prediction from ${currentMessageAnalysis.model_version}. Probability: ${currentMessageAnalysis.probability}. Category: ${currentMessageAnalysis.category ?? (currentMessageAnalysis.classification === 'Clean' ? 'Not applicable — Clean message' : 'No category emitted')}. Not child risk or CRS.`
                              : currentMessageAnalysis
                                ? `Current message prediction from ${currentMessageAnalysis.model_version}; probability is not available. Category: ${currentMessageAnalysis.category ?? (currentMessageAnalysis.classification === 'Clean' ? 'Not applicable — Clean message' : 'No category emitted')}. Not child risk or CRS.`
                              : typeof component?.value === 'number'
                              ? `Latest stored message-level prediction from ${component.model_version ?? researchRisk?.classifier.model_version ?? 'the classifier'}. Not child risk or CRS.`
                              : 'Not available — no current message prediction is available.'}
                          </Text>
                        )}
                        {key === 'targeting' && (currentMessageAnalysis || component?.evidence?.length) ? (
                          <Text style={styles.researchRiskNote}>
                            Evidence: {(currentMessageAnalysis?.targeting_evidence ?? component?.evidence ?? []).join(', ') || 'Insufficient evidence'}
                          </Text>
                        ) : null}
                        {key === 'severity' && (
                          <Text style={styles.researchRiskNote}>
                            {currentMessageAnalysis
                              ? `Current message evidence: ${currentMessageAnalysis.severity_evidence.join(', ') || 'None observed'}`
                              : 'No current message severity evidence is available. Historical severity evidence is shown only in the timeline.'}
                          </Text>
                        )}
                        {key === 'historical' && (
                          <Text style={styles.researchRiskNote}>
                            {`Historical risk score from ${component?.observed_incident_count ?? 0} stored incident(s); research-derived, not validated.`}
                          </Text>
                        )}
                        {key === 'temporal' && researchRisk?.history_metrics && (
                          <Text style={styles.researchRiskNote}>
                            {`${researchRisk.history_metrics.total_incidents ?? 0} observed incidents across ${researchRisk.history_metrics.active_days ?? 0} active days.`}
                          </Text>
                        )}
                        {key === 'multimodal' && (
                          <Text style={styles.researchRiskNote}>
                            {currentTextAvailable
                              ? 'Analysis status: Completed using available text evidence. Image, audio, and video were skipped because they were not provided.'
                              : `Text: ${currentMessageAnalysis
                                ? currentMessageAnalysis.text_status === 'available' ? 'Available' : 'Not provided'
                                : component?.text_status === 'available' ? 'Available' : 'Not provided'} · Image: ${component?.image_status ?? 'Not provided'} · Audio: ${component?.audio_status ?? 'Not provided'} · Video: ${component?.video_status ?? 'Not provided'}`}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                  <Text style={styles.researchRiskSubheading}>
                    Research feature contributions (deterministic; not SHAP)
                  </Text>
                  {researchRisk?.deterministic_contributions?.length ? (
                    researchRisk.deterministic_contributions.map(item => (
                      <View key={item.feature} style={styles.researchRiskRow}>
                        <Text style={styles.researchRiskText}>{item.feature}</Text>
                        <Text style={styles.researchRiskValueSmall}>
                          {`${item.contribution_percent.toFixed(1)}%`}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.researchRiskNote}>
                      No risk feature contributions are available.
                    </Text>
                  )}
                  <Text style={styles.researchRiskSubheading}>Risk timeline</Text>
                  {!riskTimeline || riskTimeline.timeline.length === 0 ? (
                    <Text style={styles.researchRiskNote}>
                      {riskTimeline?.status === 'no_history'
                        ? 'Insufficient evidence: no stored incidents for this child.'
                        : 'Not available'}
                    </Text>
                  ) : (
                    riskTimeline.timeline.slice(-5).reverse().map(point => (
                      <View key={point.incident_id} style={styles.timelineRow}>
                        <Text style={styles.researchRiskText}>
                          Incident ID: {point.incident_id}
                        </Text>
                        <Text style={styles.researchRiskText}>
                          {new Date(point.timestamp).toLocaleString()}
                        </Text>
                        <Text style={styles.researchRiskText}>
                          {point.classification ?? 'Classification not available'}
                          {' · Category: '}
                          {point.classification === 'Clean'
                            ? 'Not applicable'
                            : point.category ?? 'Not available'}
                        </Text>
                        {point.classifier_probability != null && (
                          <Text style={styles.researchRiskText}>
                            Message-level classifier probability: {String(point.classifier_probability)}
                          </Text>
                        )}
                        {(point.targeting_evidence?.length ?? 0) > 0 && (
                          <Text style={styles.researchRiskNote}>
                            Targeting evidence: {point.targeting_evidence?.join(', ')}
                          </Text>
                        )}
                        {(point.severity_evidence?.length ?? 0) > 0 && (
                          <Text style={styles.researchRiskNote}>
                            Severity evidence: {point.severity_evidence?.join(', ')}
                          </Text>
                        )}
                        <Text style={styles.researchRiskValueSmall}>
                          {point.crs === null
                            ? 'Not available'
                            : `${point.crs.toFixed(1)} / 100`}
                          {' · '}
                          {point.risk_state || 'Not available'}
                        </Text>
                      </View>
                    ))
                  )}
                  <Text style={styles.researchRiskSubheading}>Social context</Text>
                  <Text style={styles.researchRiskText}>
                    Observed interactions: {displayEvidenceCount(socialGraph?.interaction_count)}
                    {' · '}Identified senders: {displayEvidenceCount(socialGraph?.attacker_count)}
                  </Text>
                  <Text style={styles.researchRiskText}>
                    Sender concentration: {displayComponentValue(
                      socialGraph?.features.concentration.value,
                      socialGraph?.features.concentration.status,
                    )}
                    {' · '}Graph score: {displayComponentValue(
                      socialGraph?.graph_score,
                      socialGraph?.graph_score_status,
                    )}
                  </Text>
                  <Text style={styles.researchRiskSubheading}>SHAP contributors</Text>
                  {riskExplanation?.status === 'computed' && riskExplanation.contributors?.length ? (
                    riskExplanation.contributors.map(contribution => (
                      <View key={contribution.feature} style={styles.researchRiskRow}>
                        <Text style={styles.researchRiskText}>{contribution.feature}</Text>
                        <Text style={styles.researchRiskValueSmall}>
                          {contribution.value > 0 ? '+' : ''}
                          {contribution.value.toFixed(4)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.researchRiskNote}>
                      Not available — no trained child-risk fusion model is configured.
                    </Text>
                  )}
                  <Text style={styles.researchRiskNote}>
                    Parent action is separate from risk state. Review incidents and choose an available action; HIGH or CRITICAL never automatically means BLOCK.
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* OUTGOING MESSAGES SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📤 Outgoing Messages (High / Critical Risk)</Text>
            {outgoingIncidents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {selectedChild ? `No high-risk outgoing alerts for ${selectedChild}.` : 'No connected child profile is available for this parent account.'}
                </Text>
              </View>
            ) : (
              outgoingIncidents.map((incident) => (
                <AlertCard key={incident.incidentId} alert={incident} onDecision={handleDecision} />
              ))
            )}
          </View>

          {/* INCOMING MESSAGES SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📥 Incoming Messages (High / Critical Risk)</Text>
            {incomingIncidents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {selectedChild ? `No high-risk incoming alerts for ${selectedChild}.` : 'No connected child profile is available for this parent account.'}
                </Text>
              </View>
            ) : (
              incomingIncidents.map((incident) => (
                <AlertCard key={incident.incidentId} alert={incident} onDecision={handleDecision} />
              ))
            )}
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity style={styles.quickActionCard} onPress={() => loadData()} activeOpacity={0.7}>
                <MaterialIcons name="qr-code-scanner" size={48} color="#000000" />
                <Text style={styles.quickActionText}>Scan / Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionCard}
                onPress={() => {
                  router.push(
                    `/reports?email=${encodeURIComponent(parentEmail)}&childName=${encodeURIComponent(selectedChild)}&childId=${encodeURIComponent(selectedChildId)}`,
                  );
                }}
                disabled={!selectedChild}
                activeOpacity={0.7}
              >
                <MaterialIcons name="bar-chart" size={48} color="#000000" />
                <Text style={styles.quickActionText}>Analytics & Insights</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 10 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 20,
    paddingHorizontal: 4
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appName: { 
    fontSize: 22, 
    fontWeight: '800', 
    color: '#000000', 
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerRight: { flexDirection: 'row', gap: 10 },
  iconButton: { 
    width: 42, 
    height: 42, 
    borderRadius: 21, 
    backgroundColor: 'rgba(255, 255, 255, 0.75)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOpacity: 0.08, 
    shadowRadius: 6, 
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)'
  },
  mappedInfoBox: { 
    backgroundColor: 'rgba(255, 255, 255, 0.75)', 
    padding: 14, 
    borderRadius: 18, 
    marginBottom: 20, 
    borderWidth: 1.5, 
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  mappedText: { fontSize: 14, color: '#000000', fontWeight: '600', letterSpacing: 0.2 },
  boldText: { fontWeight: '800', color: '#000000' },
  section: { marginBottom: 28 },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: '#000000', 
    marginBottom: 16,
    paddingHorizontal: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  childTabsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  childTab: { 
    paddingHorizontal: 20, 
    paddingVertical: 10, 
    borderRadius: 25, 
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  activeChildTab: { 
    backgroundColor: 'rgba(233, 30, 99, 0.25)',
    borderColor: 'rgba(233, 30, 99, 0.6)',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4
  },
  childTabText: { fontSize: 14, fontWeight: '700', color: '#000000', letterSpacing: 0.3 },
  activeChildTabText: { color: '#000000', fontWeight: '800' },
  metricsGrid: { flexDirection: 'row', gap: 12 },
  metricCard: { 
    flex: 1, 
    borderRadius: 20, 
    padding: 18, 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    minHeight: 110
  },
  metricNumber: { fontSize: 36, fontWeight: '800', marginBottom: 6, letterSpacing: -0.5 },
  metricLabel: { 
    fontSize: 11, 
    fontWeight: '700', 
    textAlign: 'center',
    letterSpacing: 1,
    color: '#000000',
    textTransform: 'uppercase',
  },
  researchRiskCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  researchRiskTitle: { fontSize: 15, fontWeight: '800', color: '#000000', marginBottom: 8 },
  researchRiskValue: { fontSize: 20, fontWeight: '800', color: '#000000', marginBottom: 4 },
  researchRiskSubheading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginTop: 14,
    marginBottom: 5,
  },
  researchRiskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 3,
  },
  researchRiskValueSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'right',
    flexShrink: 1,
  },
  timelineRow: {
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(107, 114, 128, 0.18)',
  },
  researchRiskText: { fontSize: 13, fontWeight: '600', color: '#000000', marginTop: 3 },
  researchRiskNote: { fontSize: 12, color: '#374151', marginTop: 8, lineHeight: 17 },
  emptyCard: { 
    backgroundColor: 'rgba(255, 255, 255, 0.75)', 
    borderRadius: 20, 
    padding: 20, 
    alignItems: 'center', 
    borderWidth: 1.5, 
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    minHeight: 90
  },
  emptyText: { 
    textAlign: 'center', 
    color: '#000000', 
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  actionGrid: { flexDirection: 'row', gap: 14, marginTop: 8 },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    minHeight: 120,
    gap: 12
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 18
  },
  actionButton: { 
    flex: 1, 
    height: 90, 
    flexDirection: 'column', 
    paddingHorizontal: 0, 
    borderRadius: 20, 
    backgroundColor: 'rgba(255, 255, 255, 0.75)', 
    borderWidth: 1.5, 
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000', 
    shadowOpacity: 0.08, 
    shadowRadius: 10, 
    shadowOffset: { width: 0, height: 4 },
    elevation: 3 
  },
});

export default DashboardScreen;
