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
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import DashboardCard from '../components/DashboardCard';
import AlertCard, { AlertType } from '../components/AlertCard';
import PrimaryButton from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/RootNavigator';

const { width } = Dimensions.get('window');

const MOCK_ALERTS: AlertType[] = [
  {
    id: '1',
    message: '"You are useless and nobody likes you"',
    risk: 'High',
    timestamp: '5:30 PM',
  },
  {
    id: '2',
    message: 'Unknown contact attempting to share location',
    risk: 'Medium',
    timestamp: '4:15 PM',
  },
];

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

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
    transform: [{ translateY: withSpring(headerOpacity.value * 0, { damping: 15 }) }],
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={[styles.header, headerStyle]}>
          <View>
            <Text style={styles.appName}>ChildSafeLens</Text>
            <Text style={styles.greeting}>Welcome back, Parent</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} activeOpacity={0.7}>
            <MaterialIcons name="account-circle" size={36} color="#2F80ED" />
          </TouchableOpacity>
        </Animated.View>

        {/* Safety Overview */}
        <Animated.View style={[styles.section, cardStyle]}>
          <DashboardCard score={85} />
        </Animated.View>

        {/* Recent Alerts */}
        <Animated.View style={[styles.section, contentStyle]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Alerts</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Alerts')}>
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
            <PrimaryButton
              title="Scan"
              onPress={() => {}}
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
        </Animated.View>
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
    marginBottom: 32,
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2F80ED',
    letterSpacing: -0.5,
  },
  greeting: {
    fontSize: 14,
    color: '#8C9199',
    marginTop: 2,
    fontWeight: '500',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1C1E',
  },
  seeAll: {
    fontSize: 14,
    color: '#2F80ED',
    fontWeight: '600',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    height: 90,
    flexDirection: 'column',
    paddingHorizontal: 0,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
});

export default DashboardScreen;

