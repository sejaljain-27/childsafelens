import React from 'react';
import { View, StyleSheet, FlatList, Text } from 'react-native';
import AlertCard, { AlertType } from '../components/AlertCard';

const alerts: AlertType[] = [
  {
    id: '1',
    message: 'Potential cyberbullying detected in chat.',
    risk: 'High',
    timestamp: '2026-03-21 10:15',
  },
  {
    id: '2',
    message: 'Suspicious link shared.',
    risk: 'Medium',
    timestamp: '2026-03-20 18:42',
  },
];

const AlertsScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Alerts</Text>
      <FlatList
        data={alerts}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <AlertCard alert={item} />}
        contentContainerStyle={styles.list}
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
});

export default AlertsScreen;
