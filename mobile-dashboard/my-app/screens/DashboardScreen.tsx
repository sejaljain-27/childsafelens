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
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import AlertCard from '../components/AlertCard';
import PrimaryButton from '../components/PrimaryButton';
import { fetchAlerts, fetchDashboardStats, submitDecision, type IncidentType, type DashboardStats } from '../services/alertsService';
import type { RootStackParamList } from '../navigation/RootNavigator';

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [selectedChild, setSelectedChild] = useState<'Aarav' | 'Kiara'>('Aarav');
  const [stats, setStats] = useState<DashboardStats>({
    total_events: 0,
    high_risk_count: 0,
    medium_risk_count: 0,
    low_risk_count: 0,
    pending_count: 0,
  });
  const [recentIncidents, setRecentIncidents] = useState<IncidentType[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setRefreshing(true);
    const [dashboardStats, incidents] = await Promise.all([
      fetchDashboardStats(),
      fetchAlerts()
    ]);
    setStats(dashboardStats);
    setRecentIncidents(incidents);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000); // Live poll for real Android incidents
    return () => clearInterval(interval);
  }, []);

  const handleDecision = async (incidentId: string, decision: 'ALLOW' | 'BLOCK' | 'EDIT') => {
    await submitDecision(incidentId, decision);
    loadData();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
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
          <TouchableOpacity style={styles.profileButton} activeOpacity={0.7}>
            <MaterialIcons name="account-circle" size={36} color="#2F80ED" />
          </TouchableOpacity>
        </View>

        {/* Children Selector & Summary Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Children</Text>
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

          {/* Metric Cards */}
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.metricNumber, { color: '#D97706' }]}>{stats.pending_count}</Text>
              <Text style={styles.metricLabel}>Pending</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: '#E0F2FE' }]}>
              <Text style={[styles.metricNumber, { color: '#0284C7' }]}>{stats.total_events}</Text>
              <Text style={styles.metricLabel}>This Week</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: '#FFE4E6' }]}>
              <Text style={[styles.metricNumber, { color: '#F43F5E' }]}>{stats.high_risk_count}</Text>
              <Text style={styles.metricLabel}>High Risk</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[styles.metricNumber, { color: '#16A34A' }]}>{stats.total_events}</Text>
              <Text style={styles.metricLabel}>Total</Text>
            </View>
          </View>
        </View>

        {/* Recent Alerts / Incidents (Real Data Only) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Incidents (Live from Android App)</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Alerts')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {recentIncidents.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="check-circle" size={40} color="#10B981" />
              <Text style={styles.emptyText}>No recent incidents. All child messages are safe or pending review.</Text>
            </View>
          ) : (
            recentIncidents.slice(0, 5).map((incident) => (
              <AlertCard key={incident.incidentId} alert={incident} onDecision={handleDecision} />
            ))
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <PrimaryButton
              title="Scan"
              onPress={() => loadData()}
              variant="outline"
              icon="qr-code-scanner"
              style={styles.actionButton}
            />
            <PrimaryButton
              title="Alerts"
              onPress={() => navigation.navigate('Alerts')}
              variant="outline"
              icon="notifications-none"
              style={styles.actionButton}
            />
            <PrimaryButton
              title="Reports"
              onPress={() => navigation.navigate('Reports')}
              variant="outline"
              icon="assessment"
              style={styles.actionButton}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2F80ED',
    letterSpacing: -0.5,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1C1E',
    marginBottom: 8,
  },
  childTabsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  childTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  activeChildTab: {
    backgroundColor: '#2F80ED',
  },
  childTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  activeChildTabText: {
    color: '#FFFFFF',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricNumber: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  seeAll: {
    fontSize: 14,
    color: '#2F80ED',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 14,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    height: 80,
    flexDirection: 'column',
    paddingHorizontal: 0,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
});

export default DashboardScreen;
