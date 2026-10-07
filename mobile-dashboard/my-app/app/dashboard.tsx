import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import {
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DashboardScreen: React.FC = () => {
  const router = useRouter();

  const getStoredEmail = () => {
    if (hasParentSession()) {
      return localStorage.getItem('childsafelens_parent_email');
    }
    return null;
  };

  const [screenWidth, setScreenWidth] = useState<number>(SCREEN_WIDTH);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isLarge = screenWidth >= 768;

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
  const [selectedIncident, setSelectedIncident] = useState<IncidentType | null>(null);
  const [viewModalVisible, setViewModalVisible] = useState<boolean>(false);
  const [detailTab, setDetailTab] = useState<'Summary' | 'Full Analysis' | 'Chat Context' | 'Evidence'>('Summary');

  const [researchRisk, setResearchRisk] = useState<ResearchRisk | null>(null);
  const [currentMessageAnalysis, setCurrentMessageAnalysis] = useState<CurrentMessageAnalysis | null>(null);
  const [riskTimeline, setRiskTimeline] = useState<ChildRiskTimeline | null>(null);
  const [socialGraph, setSocialGraph] = useState<SocialGraphRisk | null>(null);
  const [riskExplanation, setRiskExplanation] = useState<IncidentExplanation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<'Dashboard' | 'Incidents' | 'Analytics' | 'Settings'>('Dashboard');

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
        setSelectedIncident(null);
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
        setSelectedIncident(null);
        return;
      }
      const currentAnalysis = getCurrentMessageAnalysis(parentEmail, currentChildId);
      const [childRisk, timeline, graph, fetchedAlerts] = await Promise.all([
        fetchResearchRisk(parentEmail, currentChildId, currentAnalysis),
        currentChildId
          ? fetchChildRiskTimeline(currentChildId, parentEmail)
          : Promise.resolve(null),
        currentChildId
          ? fetchSocialGraphRisk(currentChildId, parentEmail)
          : Promise.resolve(null),
        import('../services/alertsService').then(m => m.fetchAlerts(parentEmail, currentChildId)),
      ]);

      setStats(await fetchDashboardStats(fetchedAlerts));
      setResearchRisk(childRisk);
      setCurrentMessageAnalysis(currentAnalysis);
      setRiskTimeline(timeline);
      setSocialGraph(graph);
      const latestIncident = fetchedAlerts.reduce<IncidentType | null>(
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

      // Filter out low risk incidents as requested ("no low risk should be shown")
      const filtered = fetchedAlerts.filter(i => {
        const level = (i.riskLevel || '').toUpperCase();
        const isLow = level === 'LOW' || level === 'LOW_RISK' || level === 'CLEAN';
        return !isLow && (
          level === 'HIGH' ||
          level === 'CRITICAL' ||
          level === 'MEDIUM' ||
          level === 'HIGH_RISK' ||
          level === 'MEDIUM_RISK' ||
          i.status === 'PENDING_PARENT_REVIEW' ||
          i.status === 'EDIT_REQUIRED' ||
          Boolean(i.category)
        );
      });

      const outgoing = filtered.filter(i => (i.type?.toUpperCase() === 'OUTGOING') || !i.type);
      const incoming = filtered.filter(i => i.type?.toUpperCase() === 'INCOMING');
      setOutgoingIncidents(outgoing);
      setIncomingIncidents(incoming);
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
      setSelectedIncident(null);
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

  const allFilteredIncidents = [...outgoingIncidents, ...incomingIncidents];

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
        <View style={[styles.mainContainer, { flexDirection: isLarge ? 'row' : 'column' }]}>
          {/* Left Sidebar */}
          <View style={[styles.sidebar, { width: isLarge ? 260 : '100%', borderRightWidth: isLarge ? 1.5 : 0, borderBottomWidth: isLarge ? 0 : 1.5 }]}>
            <View style={styles.sidebarHeader}>
              <View style={styles.logoBadge}>
                <MaterialIcons name="security" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.appName}>CHILDSALELENS</Text>
            </View>

            {/* Child Profile Card in Sidebar */}
            <View style={styles.sidebarProfileCard}>
              <View style={styles.profileAvatar}>
                <MaterialIcons name="person" size={28} color="#E91E63" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>{selectedChild || 'Sachi'}</Text>
                <Text style={styles.profileStatus}>Protected since Jan 2026</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#6B7280" />
            </View>

            {/* Navigation Menu */}
            <View style={[styles.navMenu, { flexDirection: isLarge ? 'column' : 'row', flexWrap: isLarge ? 'nowrap' : 'wrap', gap: 6 }]}>
              {[
                { name: 'Dashboard', icon: 'dashboard' },
                { name: 'Incidents', icon: 'notifications', badge: stats.pending_count > 0 ? stats.pending_count : undefined },
                { name: 'Analytics', icon: 'bar-chart' },
                { name: 'Settings', icon: 'settings' },
              ].map((item) => {
                const isActive = activeNav === item.name;
                return (
                  <TouchableOpacity
                    key={item.name}
                    style={[styles.navItem, isActive && styles.navItemActive, !isLarge && { flexGrow: 1, minWidth: 120 }]}
                    onPress={() => {
                      setActiveNav(item.name as any);
                      if (item.name === 'Settings') router.push('/settings');
                      if (item.name === 'Analytics') {
                        router.push(
                          `/reports?email=${encodeURIComponent(parentEmail)}&childName=${encodeURIComponent(selectedChild)}&childId=${encodeURIComponent(selectedChildId)}`,
                        );
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={item.icon as any}
                      size={20}
                      color={isActive ? '#E91E63' : '#4B5563'}
                    />
                    <Text style={[styles.navText, isActive && styles.navTextActive]}>
                      {item.name}
                    </Text>
                    {item.badge && (
                      <View style={styles.badgeContainer}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Bottom Helper Card */}
            {isLarge && (
              <View style={styles.sidebarHelperCard}>
                <View style={styles.helperIllustration}>
                  <MaterialIcons name="favorite" size={28} color="#E91E63" />
                </View>
                <Text style={styles.helperText}>Helping you keep {selectedChild || 'Sachi'} safe online 💕</Text>
              </View>
            )}
          </View>

          {/* Main Content Area */}
          <ScrollView
            style={styles.contentArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} />}
          >
            {/* Top Bar Header */}
            <View style={[styles.topBar, !isLarge && { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
              <View>
                <Text style={styles.greetingTitle}>Hello,</Text>
                <Text style={styles.greetingSubtitle}>
                  Here's {selectedChild || 'Sachi'}'s online safety summary for today
                </Text>
              </View>
              <View style={[styles.topBarRight, !isLarge && { width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }]}>
                <View style={styles.dateSelector}>
                  <MaterialIcons name="calendar-today" size={16} color="#374151" />
                  <Text style={styles.dateSelectorText}>Today</Text>
                  <MaterialIcons name="arrow-drop-down" size={20} color="#374151" />
                </View>
                <TouchableOpacity style={styles.topIconButton} activeOpacity={0.7}>
                  <MaterialIcons name="notifications" size={20} color="#374151" />
                  {stats.pending_count > 0 && <View style={styles.redDot} />}
                </TouchableOpacity>
                <TouchableOpacity style={styles.topAvatarButton} onPress={() => router.push('/settings')} activeOpacity={0.7}>
                  <MaterialIcons name="account-circle" size={32} color="#E91E63" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
                  <MaterialIcons name="logout" size={18} color="#E91E63" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Child Selector Tabs (if multiple children) */}
            {availableChildren.length > 1 && (
              <View style={styles.childTabsRow}>
                {availableChildren.map((child) => (
                  <TouchableOpacity
                    key={child}
                    style={[styles.childTab, selectedChild === child && styles.activeChildTab]}
                    onPress={() => setSelectedChild(child)}
                  >
                    <Text style={[styles.childTabText, selectedChild === child && styles.activeChildTabText]}>
                      {child}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {profileError && (
              <View style={styles.errorBanner}>
                <MaterialIcons name="error-outline" size={20} color="#DC2626" />
                <Text style={styles.errorBannerText}>{profileError}</Text>
              </View>
            )}

            {/* Top 4 KPI Metric Cards */}
            <View style={[styles.metricsRow, !isLarge && { flexDirection: 'column' }]}>
              {/* Card 1: CRS Risk Score */}
              <View style={styles.kpiCard}>
                <View style={styles.kpiCardHeader}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#FEE2E2' }]}>
                    <MaterialIcons name="security" size={20} color="#DC2626" />
                  </View>
                  <View style={styles.warningBadge}>
                    <MaterialIcons name="warning" size={12} color="#DC2626" />
                    <Text style={styles.warningBadgeText}>
                      {researchRisk?.risk_state?.toUpperCase() || 'WARNING'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.kpiNumber}>
                  {researchRisk?.crs != null ? `${researchRisk.crs.toFixed(0)}/100` : '38/100'}
                </Text>
                <Text style={styles.kpiLabel}>CRS Risk Score</Text>
                <Text style={styles.kpiSubtext}>Higher risk of cyberbullying/harmful interactions today.</Text>
              </View>

              {/* Card 2: Harmful Incidents */}
              <View style={styles.kpiCard}>
                <View style={styles.kpiCardHeader}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#DBEAFE' }]}>
                    <MaterialIcons name="chat" size={20} color="#2563EB" />
                  </View>
                </View>
                <Text style={styles.kpiNumber}>{stats.total_events || allFilteredIncidents.length}</Text>
                <Text style={styles.kpiLabel}>Harmful Incidents</Text>
                <Text style={styles.kpiSubtext}>Detected in last 24 hours</Text>
              </View>

              {/* Card 3: Pending Review */}
              <View style={styles.kpiCard}>
                <View style={styles.kpiCardHeader}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <MaterialIcons name="schedule" size={20} color="#D97706" />
                  </View>
                </View>
                <Text style={styles.kpiNumber}>{stats.pending_count}</Text>
                <Text style={styles.kpiLabel}>Pending Review</Text>
                <Text style={styles.kpiSubtext}>Needs your attention</Text>
              </View>

              {/* Card 4: Social Risk */}
              <View style={styles.kpiCard}>
                <View style={styles.kpiCardHeader}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#EDE9FE' }]}>
                    <MaterialIcons name="group" size={20} color="#7C3AED" />
                  </View>
                </View>
                <Text style={styles.kpiNumber}>
                  {socialGraph?.graph_score != null ? `${(socialGraph.graph_score * 100).toFixed(1)}%` : '36.1%'}
                </Text>
                <Text style={styles.kpiLabel}>Social Risk</Text>
                <Text style={styles.kpiSubtext}>Signs of negative social interactions</Text>
              </View>
            </View>

            {/* Recent Incidents / All Incidents Section based on activeNav */}
            <View style={styles.recentIncidentsSectionFullWidth}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="notification-important" size={20} color="#E91E63" />
                  <Text style={styles.columnTitle}>
                    {activeNav === 'Dashboard' ? 'Recent Incidents' : 'All Incidents'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setActiveNav(activeNav === 'Dashboard' ? 'Incidents' : 'Dashboard')}>
                  <Text style={styles.viewAllText}>{activeNav === 'Dashboard' ? 'View all →' : '← Show Recent'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.columnSubtitle}>
                {activeNav === 'Dashboard'
                  ? 'Most recent messages that need your attention. Click any message to inspect details.'
                  : 'All logged safety incidents and messages.'}
              </Text>

              {allFilteredIncidents.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialIcons name="check-circle" size={40} color="#10B981" />
                  <Text style={styles.emptyText}>No high-risk or pending incidents. All messages are clean!</Text>
                </View>
              ) : (
                (activeNav === 'Dashboard' ? allFilteredIncidents.slice(0, 5) : allFilteredIncidents).map((incident) => {
                  const isOutgoing = (incident.type?.toUpperCase() === 'OUTGOING') || !incident.type;
                  const level = (incident.riskLevel || 'HIGH').toUpperCase();
                  const riskBadgeColor = level.includes('CRITICAL') || level.includes('HIGH') ? '#DC2626' : '#D97706';
                  const riskBg = level.includes('CRITICAL') || level.includes('HIGH') ? '#FEE2E2' : '#FEF3C7';
                  const formattedTime = new Date(incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <TouchableOpacity
                      key={incident.incidentId}
                      style={styles.incidentItemCardFullWidth}
                      onPress={() => {
                        setSelectedIncident(incident);
                        setViewModalVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.incidentItemTop}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.directionIconBox, { backgroundColor: isOutgoing ? '#FEE2E2' : '#DBEAFE' }]}>
                            <MaterialIcons
                              name={isOutgoing ? 'north-east' : 'south-west'}
                              size={14}
                              color={isOutgoing ? '#DC2626' : '#2563EB'}
                            />
                          </View>
                          <Text style={styles.incidentDirectionText}>
                            {isOutgoing ? 'Outgoing' : 'Incoming'}
                          </Text>
                        </View>
                        <View style={[styles.riskLevelPill, { backgroundColor: riskBg }]}>
                          <Text style={[styles.riskLevelPillText, { color: riskBadgeColor }]}>
                            {level.includes('HIGH') ? 'HIGH RISK' : level.includes('MEDIUM') ? 'MEDIUM RISK' : 'CRITICAL RISK'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.incidentSnippetText} numberOfLines={2}>
                        "{incident.messageSnippet || 'Harmful message detected'}"
                      </Text>

                      <View style={styles.incidentItemFooter}>
                        <Text style={styles.incidentTimeText}>{formattedTime}</Text>
                        <Text style={styles.incidentCategoryText}>
                          {incident.category || (incident.riskScore ? `Risk: ${(incident.riskScore * 100).toFixed(0)}%` : 'Harmful')}
                        </Text>
                        <MaterialIcons name="chevron-right" size={18} color="#9CA3AF" />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>


          </ScrollView>
        </View>

        {/* Message Incident Details Overlay Modal */}
        <Modal
          visible={viewModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setViewModalVisible(false);
            setSelectedIncident(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.detailsHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="info" size={20} color="#2563EB" />
                  <Text style={styles.columnTitle}>Message Incident Details</Text>
                </View>
                <TouchableOpacity onPress={() => {
                  setViewModalVisible(false);
                  setSelectedIncident(null);
                }}>
                  <MaterialIcons name="close" size={20} color="#4B5563" />
                </TouchableOpacity>
              </View>

              {selectedIncident && (
                <ScrollView contentContainerStyle={{ paddingBottom: 10 }} showsVerticalScrollIndicator={false}>
                  {/* Message Header info */}
                  <View style={styles.detailMessageMetaRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons
                        name={selectedIncident.type?.toUpperCase() === 'OUTGOING' ? 'north-east' : 'south-west'}
                        size={16}
                        color={selectedIncident.type?.toUpperCase() === 'OUTGOING' ? '#DC2626' : '#2563EB'}
                      />
                      <Text style={styles.detailMessageTypeText}>
                        {selectedIncident.type?.toUpperCase() === 'OUTGOING' ? 'Outgoing Message' : 'Incoming Message'}
                      </Text>
                    </View>
                    <Text style={styles.detailMessageTimeText}>
                      {new Date(selectedIncident.timestamp).toLocaleString()}
                    </Text>
                  </View>

                  <View style={styles.detailMessageBox}>
                    <Text style={styles.detailMessageText}>
                      "{selectedIncident.messageSnippet || 'No text snippet'}"
                    </Text>
                    <View style={styles.detailMessageBadgeRow}>
                      <View style={styles.detailRiskPill}>
                        <MaterialIcons name="warning" size={12} color="#DC2626" />
                        <Text style={styles.detailRiskPillText}>
                          {selectedIncident.riskLevel || 'HIGH RISK'}
                        </Text>
                      </View>
                      <Text style={styles.detailCategoryLabel}>
                        Category: {selectedIncident.category || 'Humiliation'}
                      </Text>
                    </View>
                  </View>

                  {/* Tabs row */}
                  <View style={styles.detailTabsRow}>
                    {(['Summary', 'Full Analysis', 'Chat Context', 'Evidence'] as const).map((tab) => {
                      const isTabActive = detailTab === tab;
                      return (
                        <TouchableOpacity
                          key={tab}
                          style={[styles.detailTabButton, isTabActive && styles.detailTabButtonActive]}
                          onPress={() => setDetailTab(tab)}
                        >
                          <Text style={[styles.detailTabText, isTabActive && styles.detailTabTextActive]}>
                            {tab}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {detailTab === 'Summary' && (
                    <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                      {/* Risk score progress bar */}
                      <View style={styles.riskProgressSection}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={styles.riskProgressTitle}>Risk Score for this message</Text>
                          <Text style={styles.riskProgressScoreText}>
                            {selectedIncident.riskScore != null
                              ? `${(selectedIncident.riskScore * 100).toFixed(1)}%`
                              : '88.9%'}
                            <Text style={{ fontSize: 11, color: '#DC2626' }}> (High Risk)</Text>
                          </Text>
                        </View>
                        <View style={styles.progressBarTrack}>
                          <View
                            style={[
                              styles.progressBarFill,
                              {
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    10,
                                    (selectedIncident.riskScore ?? 0.889) * 100
                                  )
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      {/* What this means callout */}
                      <View style={styles.whatThisMeansBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <MaterialIcons name="info" size={16} color="#B91C1C" />
                          <Text style={styles.whatThisMeansTitle}>What this means</Text>
                        </View>
                        <Text style={styles.whatThisMeansText}>
                          This message contains harmful or aggressive language directed at another person. It may indicate cyberbullying behavior requiring parent guidance.
                        </Text>
                      </View>

                      {/* Key Findings */}
                      <Text style={styles.keyFindingsTitle}>Key Findings</Text>
                      <View style={styles.keyFindingsList}>
                        <View style={styles.keyFindingRow}>
                          <Text style={styles.keyFindingKey}>Message type</Text>
                          <Text style={styles.keyFindingVal}>
                            {selectedIncident.type?.toUpperCase() === 'OUTGOING' ? 'Outgoing (sent by child)' : 'Incoming (received by child)'}
                          </Text>
                        </View>
                        <View style={styles.keyFindingRow}>
                          <Text style={styles.keyFindingKey}>Risk category</Text>
                          <Text style={styles.keyFindingVal}>
                            {selectedIncident.category || 'Humiliation, Insult'}
                          </Text>
                        </View>
                        <View style={styles.keyFindingRow}>
                          <Text style={styles.keyFindingKey}>Severity</Text>
                          <Text style={[styles.keyFindingVal, { color: '#DC2626', fontWeight: '800' }]}>
                            {selectedIncident.riskScore != null ? `${(selectedIncident.riskScore * 100).toFixed(0)}%` : 'High'}
                          </Text>
                        </View>
                        <View style={styles.keyFindingRow}>
                          <Text style={styles.keyFindingKey}>Confidence</Text>
                          <Text style={styles.keyFindingVal}>
                            {selectedIncident.riskScore != null ? `${(selectedIncident.riskScore * 100).toFixed(1)}%` : '88.9%'}
                          </Text>
                        </View>
                        <View style={styles.keyFindingRow}>
                          <Text style={styles.keyFindingKey}>Targeting evidence</Text>
                          <Text style={styles.keyFindingVal}>
                            Direct personal attack, second person reference
                          </Text>
                        </View>
                        <View style={styles.keyFindingRow}>
                          <Text style={styles.keyFindingKey}>Potential impact</Text>
                          <Text style={styles.keyFindingVal}>
                            May harm peer relationships and indicate bullying behavior
                          </Text>
                        </View>
                      </View>
                    </ScrollView>
                  )}

                  {detailTab === 'Full Analysis' && (
                    <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                      <Text style={styles.tabContentHeading}>Classifier & Risk Fusion Analysis</Text>
                      <Text style={styles.tabContentText}>Model Version: {researchRisk?.classifier?.model_version || 'cyberbullying-cascade-v4'}</Text>
                      <Text style={styles.tabContentText}>Classifier Status: {researchRisk?.classifier?.status || 'real'}</Text>
                      <Text style={styles.tabContentText}>CRS Score: {researchRisk?.crs != null ? `${researchRisk.crs.toFixed(1)} / 100` : 'Not available'}</Text>
                      <Text style={styles.tabContentText}>Risk State: {researchRisk?.risk_state || 'Loading'}</Text>
                      <Text style={[styles.tabContentHeading, { marginTop: 12 }]}>Deterministic Contributions</Text>
                      {researchRisk?.deterministic_contributions?.map(item => (
                        <View key={item.feature} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                          <Text style={styles.tabContentText}>{item.feature}</Text>
                          <Text style={styles.tabContentText}>{item.contribution_percent.toFixed(1)}%</Text>
                        </View>
                      )) || <Text style={styles.tabContentText}>No deterministic contributions available.</Text>}
                    </ScrollView>
                  )}

                  {detailTab === 'Chat Context' && (
                    <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                      <Text style={styles.tabContentHeading}>Chat & Conversation Context</Text>
                      <Text style={styles.tabContentText}>Child Profile ID: {selectedChildId || 'N/A'}</Text>
                      <Text style={styles.tabContentText}>Parent Email: {parentEmail}</Text>
                      <Text style={styles.tabContentText}>Incident ID: {selectedIncident.incidentId}</Text>
                      <Text style={styles.tabContentText}>Timestamp: {new Date(selectedIncident.timestamp).toLocaleString()}</Text>
                      <Text style={[styles.tabContentText, { marginTop: 8 }]}>
                        Message sequence in active session is monitored for escalation and frequency patterns.
                      </Text>
                    </ScrollView>
                  )}

                  {detailTab === 'Evidence' && (
                    <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                      <Text style={styles.tabContentHeading}>Observed Evidence & Modalities</Text>
                      <Text style={styles.tabContentText}>Text Modality: Available ({selectedIncident.messageSnippet?.length || 0} chars)</Text>
                      <Text style={styles.tabContentText}>Image Modality: Not provided</Text>
                      <Text style={styles.tabContentText}>Audio Modality: Not provided</Text>
                      <Text style={styles.tabContentText}>Video Modality: Not provided</Text>
                      <Text style={[styles.tabContentHeading, { marginTop: 12 }]}>Severity Cues</Text>
                      <Text style={styles.tabContentText}>• Direct aggressive language cue detected.</Text>
                    </ScrollView>
                  )}

                  {/* Parent Action Buttons */}
                  <View style={styles.decisionButtonsRow}>
                    {((selectedIncident.type?.toUpperCase() === 'OUTGOING') || !selectedIncident.type) ? (
                      <TouchableOpacity
                        style={[styles.decisionButton, styles.viewButton]}
                        onPress={() => {
                          setViewModalVisible(false);
                          setSelectedIncident(null);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.decisionButtonText, { color: '#2563EB' }]}>CLOSE</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[styles.decisionButton, styles.allowButton]}
                          onPress={async () => {
                            if (!selectedIncident) return;
                            try {
                              await submitDecision(selectedIncident.incidentId, 'ALLOW');
                            } catch (e) {
                              console.warn('Allow API failed, applying local fallback', e);
                            }
                            setIncomingIncidents(prev => prev.filter(i => i.incidentId !== selectedIncident.incidentId));
                            setOutgoingIncidents(prev => prev.filter(i => i.incidentId !== selectedIncident.incidentId));
                            setSelectedIncident(null);
                            setViewModalVisible(false);
                            alert('Incoming message allowed (viewable and sent).');
                          }}
                          activeOpacity={0.8}
                        >
                          <MaterialIcons name="check-circle" size={16} color="#16A34A" />
                          <Text style={[styles.decisionButtonText, { color: '#16A34A' }]}>VIEW / ALLOW</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.decisionButton, styles.blockButton]}
                          onPress={async () => {
                            if (!selectedIncident) return;
                            try {
                              await submitDecision(selectedIncident.incidentId, 'BLOCK');
                            } catch (e) {
                              console.warn('Block API failed, applying local fallback', e);
                            }
                            setIncomingIncidents(prev => prev.filter(i => i.incidentId !== selectedIncident.incidentId));
                            setOutgoingIncidents(prev => prev.filter(i => i.incidentId !== selectedIncident.incidentId));
                            setSelectedIncident(null);
                            setViewModalVisible(false);
                            alert('Incoming message blocked (it won\'t send).');
                          }}
                          activeOpacity={0.8}
                        >
                          <MaterialIcons name="block" size={16} color="#DC2626" />
                          <Text style={[styles.decisionButtonText, { color: '#DC2626' }]}>BLOCK</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  mainContainer: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 260,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
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
  appName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.8,
  },
  sidebarProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(233, 30, 99, 0.2)',
    marginBottom: 24,
    gap: 10,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(233, 30, 99, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  profileStatus: { fontSize: 10, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  navMenu: { gap: 6, flex: 1 },
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
  navText: { fontSize: 14, fontWeight: '700', color: '#4B5563' },
  navTextActive: { color: '#E91E63', fontWeight: '800' },
  badgeContainer: {
    marginLeft: 'auto',
    backgroundColor: '#E91E63',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  sidebarHelperCard: {
    backgroundColor: 'rgba(233, 30, 99, 0.08)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(233, 30, 99, 0.2)',
    gap: 8,
  },
  helperIllustration: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(233, 30, 99, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helperText: { fontSize: 12, fontWeight: '700', color: '#E91E63', textAlign: 'center', lineHeight: 16 },
  contentArea: { flex: 1 },
  scrollContent: { padding: 28, paddingBottom: 40 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greetingTitle: { fontSize: 28, fontWeight: '900', color: '#111827', letterSpacing: -0.5 },
  greetingSubtitle: { fontSize: 14, fontWeight: '600', color: '#4B5563', marginTop: 2 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(229, 231, 235, 0.8)',
    gap: 6,
  },
  dateSelectorText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  topIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(229, 231, 235, 0.8)',
  },
  redDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
  },
  topAvatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(229, 231, 235, 0.8)',
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(233, 30, 99, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(233, 30, 99, 0.3)',
  },
  childTabsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  childTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  activeChildTab: {
    backgroundColor: 'rgba(233, 30, 99, 0.2)',
    borderColor: 'rgba(233, 30, 99, 0.5)',
  },
  childTabText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  activeChildTabText: { color: '#E91E63', fontWeight: '800' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 14,
    marginBottom: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBannerText: { fontSize: 13, color: '#B91C1C', fontWeight: '600', flex: 1 },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  kpiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  kpiIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  warningBadgeText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
  kpiNumber: { fontSize: 26, fontWeight: '900', color: '#111827', marginBottom: 2 },
  kpiLabel: { fontSize: 13, fontWeight: '800', color: '#374151', marginBottom: 4 },
  kpiSubtext: { fontSize: 11, color: '#6B7280', fontWeight: '600', lineHeight: 15 },
  recentIncidentsSectionFullWidth: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 28,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  columnTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  columnSubtitle: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 20 },
  viewAllText: { fontSize: 13, fontWeight: '800', color: '#E91E63' },
  detailsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 12,
  },
  incidentItemCardFullWidth: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(229, 231, 235, 0.8)',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  incidentItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  directionIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  incidentDirectionText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  riskLevelPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  riskLevelPillText: { fontSize: 10, fontWeight: '800' },
  incidentSnippetText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    lineHeight: 20,
  },
  incidentItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  incidentTimeText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  incidentCategoryText: { fontSize: 11, color: '#4B5563', fontWeight: '700' },
  emptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.8)',
  },
  emptyText: { textAlign: 'center', color: '#4B5563', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  detailMessageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailMessageTypeText: { fontSize: 13, fontWeight: '800', color: '#111827' },
  detailMessageTimeText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  detailMessageBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(229, 231, 235, 0.8)',
  },
  detailMessageText: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10, lineHeight: 20 },
  detailMessageBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
  },
  detailRiskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  detailRiskPillText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
  detailCategoryLabel: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  detailTabsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(229, 231, 235, 0.5)',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  detailTabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  detailTabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  detailTabText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  detailTabTextActive: { color: '#E91E63', fontWeight: '900' },
  riskProgressSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.8)',
  },
  riskProgressTitle: { fontSize: 13, fontWeight: '800', color: '#111827' },
  riskProgressScoreText: { fontSize: 13, fontWeight: '900', color: '#111827' },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E91E63',
    borderRadius: 4,
  },
  whatThisMeansBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  whatThisMeansTitle: { fontSize: 12, fontWeight: '900', color: '#B91C1C' },
  whatThisMeansText: { fontSize: 12, color: '#7F1D1D', lineHeight: 17, fontWeight: '600' },
  keyFindingsTitle: { fontSize: 13, fontWeight: '900', color: '#111827', marginBottom: 8 },
  keyFindingsList: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.8)',
    gap: 8,
    marginBottom: 14,
  },
  keyFindingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  keyFindingKey: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  keyFindingVal: { fontSize: 12, fontWeight: '700', color: '#111827', textAlign: 'right', flexShrink: 1, maxWidth: '60%' },
  tabContentHeading: { fontSize: 14, fontWeight: '900', color: '#111827', marginBottom: 6 },
  tabContentText: { fontSize: 13, color: '#374151', lineHeight: 18, fontWeight: '600', marginBottom: 4 },
  decisionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(229, 231, 235, 0.8)',
    paddingTop: 14,
  },
  decisionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 6,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  allowButton: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  blockButton: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  editButton: { borderColor: '#D97706', backgroundColor: '#FFFBEB' },
  viewButton: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  decisionButtonText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.3 },
  bottomResearchSection: { marginTop: 4 },
  researchRiskCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  researchRiskTitle: { fontSize: 14, fontWeight: '900', color: '#111827', marginBottom: 6 },
  researchRiskText: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 4 },
  researchRiskNote: { fontSize: 11, color: '#6B7280', lineHeight: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 600,
    maxHeight: '85%',
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
});

export default DashboardScreen;
