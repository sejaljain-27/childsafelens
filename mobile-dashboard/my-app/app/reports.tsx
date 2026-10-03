import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, SafeAreaView, TouchableOpacity, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 380;
const isMediumScreen = SCREEN_WIDTH >= 380 && SCREEN_WIDTH < 768;
const isLargeScreen = SCREEN_WIDTH >= 768;

const API_BASE_URL = "http://10.46.19.193:8001";

interface AnalyticsData {
  total_incidents: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  repeated_senders: number;
}

export default function ReportsScreen() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    total_incidents: 12,
    high_risk: 3,
    medium_risk: 5,
    low_risk: 4,
    repeated_senders: 2
  });

  useEffect(() => {
    // Fetch analytics data from backend
    fetch(`${API_BASE_URL}/analytics`)
      .then(res => res.json())
      .then(data => {
        if (data) {
          setAnalytics(data);
        }
      })
      .catch(err => console.error("Failed to load analytics", err));
  }, []);

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

          {/* Chart Area - Visual Bar Chart */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Weekly Activity Overview</Text>
            <Text style={styles.chartSubtitle}>Number of incidents detected per day</Text>
            <View style={styles.chartWithAxis}>
              {/* Y-Axis Labels */}
              <View style={styles.yAxisLabels}>
                <Text style={styles.yAxisLabel}>20</Text>
                <Text style={styles.yAxisLabel}>15</Text>
                <Text style={styles.yAxisLabel}>10</Text>
                <Text style={styles.yAxisLabel}>5</Text>
                <Text style={styles.yAxisLabel}>0</Text>
              </View>
              
              {/* Chart Container */}
              <View style={styles.chartContainer}>
                <View style={styles.barsRow}>
                  {/* Bar 1 - Blue */}
                  <View style={styles.barWrapper}>
                    <View style={[styles.bar, { height: 105, backgroundColor: '#3B82F6' }]} />
                    <Text style={styles.xAxisLabel}>Mon</Text>
                  </View>
                  {/* Bar 2 - Cyan */}
                  <View style={styles.barWrapper}>
                    <View style={[styles.bar, { height: 90, backgroundColor: '#06B6D4' }]} />
                    <Text style={styles.xAxisLabel}>Tue</Text>
                  </View>
                  {/* Bar 3 - Purple */}
                  <View style={styles.barWrapper}>
                    <View style={[styles.bar, { height: 125, backgroundColor: '#8B5CF6' }]} />
                    <Text style={styles.xAxisLabel}>Wed</Text>
                  </View>
                  {/* Bar 4 - Pink */}
                  <View style={styles.barWrapper}>
                    <View style={[styles.bar, { height: 140, backgroundColor: '#EC4899' }]} />
                    <Text style={styles.xAxisLabel}>Thu</Text>
                  </View>
                  {/* Bar 5 - Teal */}
                  <View style={styles.barWrapper}>
                    <View style={[styles.bar, { height: 115, backgroundColor: '#14B8A6' }]} />
                    <Text style={styles.xAxisLabel}>Fri</Text>
                  </View>
                </View>
              </View>
            </View>
            
            {/* Chart Legend */}
            <View style={styles.legendContainer}>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
                <Text style={styles.legendText}>Monday</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: '#06B6D4' }]} />
                <Text style={styles.legendText}>Tuesday</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
                <Text style={styles.legendText}>Wednesday</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: '#EC4899' }]} />
                <Text style={styles.legendText}>Thursday</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: '#14B8A6' }]} />
                <Text style={styles.legendText}>Friday</Text>
              </View>
            </View>
          </View>

          {/* Statistics Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.total_incidents}</Text>
              <Text style={styles.statLabel}>Total Incidents</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.high_risk}</Text>
              <Text style={styles.statLabel}>High Risk</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.medium_risk}</Text>
              <Text style={styles.statLabel}>Medium Risk</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.low_risk}</Text>
              <Text style={styles.statLabel}>Low Risk</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{analytics.repeated_senders}</Text>
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
    justifyContent: 'center',
    width: '100%',
    height: 180,
    gap: 40,
    paddingHorizontal: 4
  },
  barWrapper: {
    width: 35,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6
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
