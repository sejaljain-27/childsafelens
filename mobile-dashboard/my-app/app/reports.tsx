import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, SafeAreaView, TouchableOpacity, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  fetchResearchCapabilities,
  fetchResearchRisk,
  authenticatedFetch,
  hasParentSession,
  type ResearchCapabilities,
  type ResearchComponent,
  type ResearchRisk,
} from '../services/alertsService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 380;
const isMediumScreen = SCREEN_WIDTH >= 380 && SCREEN_WIDTH < 768;
const isLargeScreen = SCREEN_WIDTH >= 768;

const API_BASE_URL = typeof window !== 'undefined' && window.location && window.location.hostname
  ? `http://${window.location.hostname}:8000`
  : "http://localhost:8000";

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

export default function ReportsScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [researchRisk, setResearchRisk] = useState<ResearchRisk | null>(null);
  const [researchCapabilities, setResearchCapabilities] = useState<ResearchCapabilities | null>(null);
  const [researchLoaded, setResearchLoaded] = useState(false);

  useEffect(() => {
    const authenticated = hasParentSession();
    const parentEmail = authenticated
      ? (routeParams.email as string) || localStorage.getItem('childsafelens_parent_email') || ''
      : '';
    if (!parentEmail) {
      router.replace('/');
      return;
    }
    const params = new URLSearchParams({ parentEmail });
    if (routeParams.childName) {
      params.set('childName', routeParams.childName as string);
    }
    const childName = (routeParams.childName as string) || 'Aarav';
    Promise.all([
      fetchResearchRisk(parentEmail, childName),
      fetchResearchCapabilities(),
    ]).then(([risk, capabilities]) => {
      setResearchRisk(risk);
      setResearchCapabilities(capabilities);
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
  }, [routeParams.childName, routeParams.email, router]);

  const dailyIncidents = analytics?.daily_incidents ?? [];
  const maxDailyCount = Math.max(0, ...dailyIncidents.map(day => day.count));
  const childName = (routeParams.childName as string) || 'Aarav';
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
      title: 'Category classification',
      icon: 'category',
      status: formatStatus(researchCapabilities?.category_classifier.status),
      detail: 'Category model artifact is not configured; no category prediction is shown.',
    },
    {
      title: 'Targeting evidence',
      icon: 'person-search',
      status: researchRisk
        ? `${researchRisk.targeting_evidence_count ?? 'Not available'} observed evidence item(s)`
        : unavailableStatus,
      detail: researchRisk
        ? `${researchRisk.targeting_incident_count ?? 0} incident(s) contain observed targeting cues; ${researchRisk.targeting_cues_per_incident?.toFixed(2) ?? 'Not available'} cues per incident. Descriptive only; a calibrated score requires research-defined weights.`
        : unavailableStatus,
    },
    {
      title: 'Multimodal evidence',
      icon: 'perm-media',
      status: formatComponentStatus(researchRisk?.components.multimodal),
      detail: `Audio: ${formatStatus(researchCapabilities?.multimodal.audio.status)} · Image: ${formatStatus(researchCapabilities?.multimodal.image.status)} · Video: ${formatStatus(researchCapabilities?.multimodal.video.status)}`,
    },
    {
      title: 'Temporal repetition',
      icon: 'history',
      status: researchRisk?.history_metrics
        ? `${researchRisk.history_metrics.incidents_last_7_days} incident(s) across ${researchRisk.history_metrics.active_days_last_7_days} active day(s); ${researchRisk.history_metrics.average_incidents_per_active_day?.toFixed(2) ?? 'Not available'} per active day`
        : formatComponentStatus(researchRisk?.components.temporal),
      detail: researchCapabilities?.research_parameters.temporal_decay_configured
        ? 'Observed activity is counted above. A temporal risk score still requires non-simulated incident and targeting scores.'
        : 'Observed activity is counted above; no calibrated decay parameter or valid research-scored history is configured.',
    },
    {
      title: 'Escalation',
      icon: 'trending-up',
      status: formatComponentStatus(researchRisk?.components.escalation),
      detail: 'Escalation needs severity history; Severity analysis is skipped as requested, so no escalation score is calculated.',
    },
    {
      title: 'Social graph',
      icon: 'hub',
      status: formatComponentStatus(researchRisk?.components.social_graph),
      detail: researchRisk
        ? `${researchRisk.social_graph.interaction_count} interaction(s) · ${researchRisk.social_graph.attacker_count ?? 'Not available'} identified sender(s) · graph risk score is not calibrated.`
        : unavailableStatus,
    },
    {
      title: 'Historical risk',
      icon: 'timeline',
      status: researchRisk?.history_metrics
        ? `${researchRisk.incident_count ?? 0} observed incident(s) in history`
        : formatComponentStatus(researchRisk?.components.historical),
      detail: researchRisk?.history_metrics
        ? `${researchRisk.history_metrics.dated_incident_count} incident(s) have timestamps. Historical risk prediction remains unavailable without a trained child-risk model.`
        : 'Historical activity and risk are unavailable until incident history is recorded.',
    },
    {
      title: 'Risk fusion / Child Risk State',
      icon: 'insights',
      status: researchRisk?.crs == null
        ? 'CRS and risk state: Not available'
        : `CRS: ${researchRisk.crs.toFixed(1)} / 100 · ${researchRisk.risk_state}`,
      detail: researchCapabilities?.risk_fusion.training_target_available
        ? `Risk-fusion model: ${formatStatus(researchCapabilities.risk_fusion.status)}`
        : 'Requires a research-defined child-level training target and trained risk-fusion model.',
    },
    {
      title: 'SHAP explanation',
      icon: 'lightbulb',
      status: researchRisk?.explanation.status === 'available'
        ? 'Available'
        : `Not available — ${formatStatus(researchRisk?.explanation.status)}`,
      detail: 'SHAP values are shown only when an actual trained risk-fusion model is available.',
    },
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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.push('/dashboard')} style={styles.backButton} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={22} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>ANALYTICS & INSIGHTS</Text>
            <View style={{ width: 22 }} />
          </View>

          <View style={styles.analysisSection}>
            <Text style={styles.analysisTitle}>Research Analysis</Text>
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
            {researchCapabilities?.classifier.development_simulation && (
              <Text style={styles.analysisDisclaimer}>
                DEVELOPMENT / SIMULATION ONLY — dummy classifier outputs are not research findings.
              </Text>
            )}
            <Text style={styles.analysisNote}>
              {researchCapabilities?.message ?? (researchLoaded
                ? 'Research readiness details are unavailable.'
                : 'Loading research readiness…')}
            </Text>
          </View>

          {/* Chart Area - Visual Bar Chart */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Weekly Activity Overview</Text>
            <Text style={styles.chartSubtitle}>Recorded incidents per day, last seven days</Text>
            {dailyIncidents.length > 0 ? (
              <View style={styles.chartContainer}>
                <View style={styles.barsRow}>
                  {dailyIncidents.map((day, index) => {
                    const height = maxDailyCount === 0 ? 2 : Math.max(2, (day.count / maxDailyCount) * 140);
                    const weekday = new Date(`${day.date}T00:00:00Z`)
                      .toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
                    const colors = ['#3B82F6', '#06B6D4', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B', '#6366F1'];
                    return (
                      <View key={day.date} style={styles.barWrapper}>
                        <Text style={styles.barCount}>{day.count}</Text>
                        <View style={[styles.bar, { height, backgroundColor: colors[index % colors.length] }]} />
                        <Text style={styles.xAxisLabel}>{weekday}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <Text style={styles.chartSubtitle}>
                {analyticsError ? 'Incident history is unavailable.' : analyticsLoaded ? 'No recorded incidents in this period.' : 'Loading incident history…'}
              </Text>
            )}
          </View>

          {/* Statistics Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analyticsLoaded ? analytics?.total_incidents ?? 'Not available' : 'Loading'}</Text>
              <Text style={styles.statLabel}>Total Incidents</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analyticsLoaded ? analytics?.high_risk ?? 'Not available' : 'Loading'}</Text>
              <Text style={styles.statLabel}>High Risk</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analyticsLoaded ? analytics?.medium_risk ?? 'Not available' : 'Loading'}</Text>
              <Text style={styles.statLabel}>Medium Risk</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analyticsLoaded ? analytics?.low_risk ?? 'Not available' : 'Loading'}</Text>
              <Text style={styles.statLabel}>Low Risk</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {!analyticsLoaded ? 'Loading' : analytics?.sender_data_available && analytics.repeated_senders !== null
                  ? analytics.repeated_senders
                  : 'Not available'}
              </Text>
              <Text style={styles.statLabel}>Repeated Senders</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>7d</Text>
              <Text style={styles.statLabel}>Time Period</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Download Report</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: 'rgba(33, 150, 243, 0.9)' }]}>
            <Text style={styles.actionButtonText}>Report to Cybersecurity Authority</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 10 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 24,
    paddingHorizontal: 4
  },
  backButton: { 
    width: 42, 
    height: 42, 
    borderRadius: 21, 
    backgroundColor: 'rgba(255, 255, 255, 0.75)', 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  headerTitle: { 
    fontSize: 16, 
    fontWeight: '800', 
    color: '#000000',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  analysisSection: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  analysisSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#4B5563',
    marginBottom: 14,
  },
  analysisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  analysisCard: {
    flexGrow: 1,
    flexBasis: isLargeScreen ? '31%' : isMediumScreen ? '47%' : '100%',
    minWidth: isSmallScreen ? '100%' : 230,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
  },
  analysisCardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  analysisCardTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#111827',
  },
  analysisStatus: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#1D4ED8',
    textTransform: 'capitalize',
  },
  analysisDetail: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: '#4B5563',
  },
  analysisDisclaimer: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    color: '#9A3412',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
  },
  analysisNote: {
    marginTop: 10,
    color: '#4B5563',
    fontSize: 11,
    lineHeight: 16,
  },
  chartCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 16,
    padding: 14,
    paddingHorizontal: 4,
    marginBottom: 20,
    marginHorizontal: 100,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 3,
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  chartSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000000',
    opacity: 0.7,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.2
  },
  chartWithAxis: {
    flexDirection: 'row',
    marginBottom: 12,
    marginHorizontal: 0
  },
  yAxisLabels: {
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 6,
    paddingTop: 0,
    paddingBottom: 30,
    height: 180
  },
  yAxisLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#000000',
    opacity: 0.7
  },
  chartContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    height: 180,
    gap: 8,
    paddingHorizontal: 4
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6
  },
  barCount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000000'
  },
  bar: {
    width: '100%',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  xAxisLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: 0.3
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.08)'
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5
  },
  legendText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.3
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    minHeight: 110
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 6,
    letterSpacing: -0.5
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  actionButton: {
    flexDirection: 'row',
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  }
});
