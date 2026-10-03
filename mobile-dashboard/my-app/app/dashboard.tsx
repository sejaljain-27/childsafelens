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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import AlertCard from '../components/AlertCard';
import { fetchAlerts, fetchDashboardStats, submitDecision, type IncidentType, type DashboardStats } from '../services/alertsService';

const DashboardScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();

  const getStoredEmail = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('childsafelens_parent_email');
    }
    return null;
  };

  const [parentEmail, setParentEmail] = useState<string>(
    (params.email as string) || getStoredEmail() || 'parent@test.com'
  );
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

    // Filter for High, Critical risk or pending parent review
    const filtered = allIncidents.filter(i =>
      i.riskLevel === 'HIGH' ||
      i.riskLevel === 'CRITICAL' ||
      i.riskLevel === 'high_risk' ||
      i.status === 'PENDING_PARENT_REVIEW' ||
      i.status === 'EDIT_REQUIRED'
    );

    setOutgoingIncidents(filtered.filter(i => (i.type?.toUpperCase() === 'OUTGOING') || !i.type));
    setIncomingIncidents(filtered.filter(i => i.type?.toUpperCase() === 'INCOMING'));
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('childsafelens_parent_email');
    }
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
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
              <View style={styles.metricCard}>
                <Text style={[styles.metricNumber, { color: '#FF9800' }]}>{stats.pending_count}</Text>
                <Text style={[styles.metricLabel, { color: '#F57C00' }]}>Pending</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={[styles.metricNumber, { color: '#E91E63' }]}>{stats.high_risk_count}</Text>
                <Text style={[styles.metricLabel, { color: '#C2185B' }]}>High Risk</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={[styles.metricNumber, { color: '#42A5F5' }]}>{stats.total_events}</Text>
                <Text style={[styles.metricLabel, { color: '#1976D2' }]}>Total</Text>
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
            <View style={styles.quickActionsRow}>
              <TouchableOpacity style={styles.quickActionCard} onPress={() => loadData()} activeOpacity={0.7}>
                <MaterialIcons name="qr-code-scanner" size={48} color="#000000" />
                <Text style={styles.quickActionText}>Scan / Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/reports')} activeOpacity={0.7}>
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
