import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

const ReportsScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Reports</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Weekly Report</Text>
        <Text style={styles.text}>No major incidents detected this week. Keep monitoring for your child's safety.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2F80ED',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    width: 320,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2F80ED',
    marginBottom: 8,
  },
  text: {
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
  },
});

export default ReportsScreen;
