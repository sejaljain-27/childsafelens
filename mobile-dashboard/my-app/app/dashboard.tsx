import React, { useEffect, useState } from 'react';
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
import PrimaryButton from '../components/PrimaryButton';
import { fetchAlerts, fetchDashboardStats, submitDecision, type IncidentType, type DashboardStats } from '../services/alertsService';

const DashboardScreen: React.FC = () => {
  const router = useRouter();
  const [parentEmail, setParentEmail] = useState<string>('parent@test.com');
  const [selectedChild, setSelectedChild] = useState<'Aarav' | 'Kiara'>('Aarav');
  const [stats, setStats] = useState<DashboardStats>({
    total_events: 0,
    high_risk_count: 0,
    medium_risk_count: 0,
    low_risk_count: 0,
    pending_count: 0,
  });
  const [outgoingIncidents, setOutgoingIncidents] = useState<IncidentType[]>([]);
  const [incomingIncidents, setIncomingIncidents] = useState<IncidentType[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setRefreshing(true);
    const [dashboardStats, allIncidents] = await Promise.all([
      fetchDashboardStats(parentEmail, selectedChild),
      fetchAlerts(parentEmail, selectedChild)
    ]);
    setStats(dashboardStats);

    // Filter for High and Critical risk only
    const highCritical = allIncidents.filter(i => i.riskLevel === 'HIGH' || i.riskLevel === 'CRITICAL');

    setOutgoingIncidents(highCritical.filter(i => i.type === 'OUTGOING'));
    setIncomingIncidents(highCritical.filter(i => i.type === 'INCOMING'));
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, [parentEmail, selectedChild]);

  const handleDecision = async (incidentId: string, decision: 'ALLOW' | 'BLOCK' | 'EDIT') => {
    await submitDecision(incidentId, decision);
    loadData();
  };

  const handleLogout = () => {
    router.replace('/');
  };

  return (
    <LinearGradient colors={['#F5F7FA', '#E2E8F0']} style={styles.safeArea}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <MaterialIcons name="security" size={28} color="#2F80ED" />
              <Text style={styles.appName}>ChildSafeLens</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/settings')} activeOpacity={0.7}>
                <MaterialIcons name="settings" size={24} color="#475569" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={handleLogout} activeOpacity={0.7}>
                <MaterialIcons name="logout" size={24} color="#EF4444" />
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
            <View style={styles.childTabsRow}>
              <TouchableOpacity
                style={[styles.childTab, selectedChild === 'Aarav' && styles.activeChildTab]}
                onPress={() => setSelectedChild('Aarav')}
              >
                <Text style={[styles.childTabText, selectedChild === 'Aarav' && styles.activeChildTabText]}>Aarav (12 yrs)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.childTab, selectedChild === 'Kiara' && styles.activeChildTab]}
                onPress={() => setSelectedChild('Kiara')}
              >
                <Text style={[styles.childTabText, selectedChild === 'Kiara' && styles.activeChildTabText]}>Kiara (10 yrs)</Text>
              </TouchableOpacity>
            </View>

            {/* Metric Cards (High & Critical Risk focus) */}
            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.metricNumber, { color: '#D97706' }]}>{stats.pending_count}</Text>
                <Text style={styles.metricLabel}>Pending</Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: '#FFE4E6' }]}>
                <Text style={[styles.metricNumber, { color: '#F43F5E' }]}>{stats.high_risk_count}</Text>
                <Text style={styles.metricLabel}>High / Critical</Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: '#E0F2FE' }]}>
                <Text style={[styles.metricNumber, { color: '#0284C7' }]}>{stats.total_events}</Text>
                <Text style={styles.metricLabel}>Total Incidents</Text>
              </View>
            </View>
          </View>

          {/* OUTGOING MESSAGES SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📤 Outgoing Messages (High / Critical Risk)</Text>
            {outgoingIncidents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No high-risk outgoing alerts for {selectedChild}.</Text>
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
                <Text style={styles.emptyText}>No high-risk incoming alerts for {selectedChild}.</Text>
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
            <View style={styles.actionGrid}>
              <PrimaryButton
                title="Scan / Refresh"
                onPress={() => loadData()}
                variant="outline"
                icon="qr-code-scanner"
                style={styles.actionButton}
              />
              <PrimaryButton
                title="Settings & Defaults"
                onPress={() => router.push('/settings')}
                variant="outline"
                icon="settings"
                style={styles.actionButton}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { padding: 24, paddingTop: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appName: { fontSize: 22, fontWeight: '800', color: '#2F80ED', letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  mappedInfoBox: { backgroundColor: '#E0F2FE', padding: 10, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#BAE6FD' },
  mappedText: { fontSize: 13, color: '#0369A1' },
  boldText: { fontWeight: '700' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1C1E', marginBottom: 10 },
  childTabsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  childTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E2E8F0' },
  activeChildTab: { backgroundColor: '#2F80ED' },
  childTabText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  activeChildTabText: { color: '#FFFFFF' },
  metricsGrid: { flexDirection: 'row', gap: 8 },
  metricCard: { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', justifyContent: 'center' },
  metricNumber: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  metricLabel: { fontSize: 11, fontWeight: '600', color: '#475569', textAlign: 'center' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyText: { textAlign: 'center', color: '#64748B', fontSize: 13 },
  actionGrid: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionButton: { flex: 1, height: 80, flexDirection: 'column', paddingHorizontal: 0, borderRadius: 16, backgroundColor: '#fff', borderWidth: 0, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
});

export default DashboardScreen;
