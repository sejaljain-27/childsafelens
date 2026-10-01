import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, Text, RefreshControl } from 'react-native';
import AlertCard from '../components/AlertCard';
import { fetchAlerts, submitDecision, type IncidentType } from '../services/alertsService';

const AlertsScreen: React.FC = () => {
  const [alerts, setAlerts] = useState<IncidentType[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = async () => {
    setRefreshing(true);
    const data = await fetchAlerts();
    setAlerts(data);
    setRefreshing(false);
  };

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 4000); // Poll for new incidents & status changes
    return () => clearInterval(interval);
  }, []);

  const handleDecision = async (incidentId: string, decision: 'ALLOW' | 'BLOCK' | 'EDIT') => {
    await submitDecision(incidentId, decision);
    loadAlerts();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Parent Alert Approvals</Text>
      <FlatList
        data={alerts}
        keyExtractor={item => item.incidentId}
        renderItem={({ item }) => <AlertCard alert={item} onDecision={handleDecision} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAlerts} />}
        ListEmptyComponent={<Text style={styles.empty}>No safety alerts or pending incidents.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    padding: 24,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2F80ED',
    marginBottom: 16,
    alignSelf: 'center',
  },
  list: {
    gap: 16,
    paddingBottom: 24,
  },
  empty: {
    textAlign: 'center',
    color: '#64748B',
    marginTop: 40,
    fontSize: 16,
  },
});

export default AlertsScreen;
