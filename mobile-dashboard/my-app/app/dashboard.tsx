import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import DashboardCard from '../components/DashboardCard';
import AlertCard, { AlertType } from '../components/AlertCard';
import PrimaryButton from '../components/PrimaryButton';
import ActivityGraphCard from '../components/ActivityGraphCard';

const MOCK_ALERTS: AlertType[] = [
  { id: '1', message: '"You are useless and nobody likes you"', risk: 'High', timestamp: '5:30 PM' },
  { id: '2', message: 'Unknown contact attempting to share location', risk: 'Medium', timestamp: '4:15 PM' },
];

const DashboardScreen: React.FC = () => {
  const router = useRouter();

  // Animation values
  const headerOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    headerOpacity.value = withSpring(1);
    cardScale.value = withDelay(100, withSpring(1));
    contentOpacity.value = withDelay(300, withSpring(1));
  }, []);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: withSpring((1 - headerOpacity.value) * -20, { damping: 15 }) }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardScale.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: (1 - contentOpacity.value) * 20 }],
  }));

  return (
    <LinearGradient colors={['#cb63dfff', '#77128bff', '#4c34a2ff']} style={styles.safeArea}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View style={[styles.header, headerStyle]}>
          <View>
            <Text style={styles.appName}>CHILD SAFELENS</Text>
            <Text style={styles.greeting}>Welcome back, Parent</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} activeOpacity={0.7}>
            <MaterialIcons name="account-circle" size={120} color="#330e05ff" />
          </TouchableOpacity>
        </Animated.View>

        {/* Safety Overview */}
        <Animated.View style={[styles.section, cardStyle]}>
          <DashboardCard score={85} />
        </Animated.View>

        {/* Activity Graph */}
        <Animated.View style={[styles.section, contentStyle]}>
          <ActivityGraphCard />
        </Animated.View>

        {/* Recent Alerts */}
        <Animated.View style={[styles.section, contentStyle]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Alerts</Text>
            <TouchableOpacity onPress={() => {}}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {MOCK_ALERTS.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </Animated.View>

        {/* Quick Actions */}
        <Animated.View style={[styles.section, contentStyle]}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <PrimaryButton title="Scan" onPress={() => {}} variant="outline" icon="qr-code-scanner" style={styles.actionButton} />
            <PrimaryButton title="Alerts" onPress={() => {}} variant="outline" icon="notifications-none" style={styles.actionButton} />
            <PrimaryButton title="Reports" onPress={() => {}} variant="outline" icon="assessment" style={styles.actionButton} />
          </View>
        </Animated.View>
      </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { padding: 32, paddingTop: 64, paddingBottom: 120, flexGrow: 1, gap: 80 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 32 },
  appName: { fontSize: 120, fontWeight: '900', color: '#dbd3f3ff', letterSpacing: -1.5 },
  greeting: { fontSize: 72, color: '#CBD5E1', marginTop: 12, fontWeight: '500' },
  profileButton: { width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(202, 174, 174, 0.31)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255, 255, 255, 0.2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', elevation: 2 },
  section: { flex: 1, marginBottom: 20, paddingHorizontal: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 60 },
  sectionTitle: { fontSize: 96, fontWeight: '700', color: '#e4d4d4ff' },
  seeAll: { fontSize: 64, color: '#ee5522ff', fontWeight: '600' },
  actionGrid: { flexDirection: 'row', gap: 48, marginTop: 60 },
  actionButton: { flex: 1, height: 300, flexDirection: 'column', paddingHorizontal: 0, borderRadius: 60, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.1)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', elevation: 2, backdropFilter: 'blur(16px)' } as any,
});

export default DashboardScreen;
