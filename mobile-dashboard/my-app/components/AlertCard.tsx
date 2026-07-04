import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export type AlertType = {
  id: string;
  message: string;
  risk: 'High' | 'Medium';
  timestamp: string;
};

interface AlertCardProps {
  alert: AlertType;
}

const AlertCard: React.FC<AlertCardProps> = ({ alert }) => {
  const isHigh = alert.risk === 'High';
  return (
    <View style={[styles.card, isHigh && styles.highRiskCard]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: isHigh ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}>
          <MaterialIcons
            name={isHigh ? 'error-outline' : 'warning-amber'}
            size={48}
            color={isHigh ? '#F43F5E' : '#FBBF24'}
          />
          <Text style={[styles.badgeText, { color: isHigh ? '#F43F5E' : '#FBBF24' }]}>
            {alert.risk} Risk
          </Text>
        </View>
        <Text style={styles.time}>{alert.timestamp}</Text>
      </View>
      <Text style={[styles.message, isHigh && styles.highRiskMessage]}>
        {alert.message}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 60,
    padding: 64,
    marginBottom: 48,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(16px)',
    elevation: 2,
  } as any,

  highRiskCard: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderColor: 'rgba(244, 63, 94, 0.2)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 12,
  } as any,
  badgeText: {
    fontSize: 48,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  time: {
    fontSize: 48,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
  message: {
    fontSize: 64,
    color: '#E2E8F0',
    lineHeight: 80,
    fontWeight: '500',
  },
  highRiskMessage: {
    color: '#FFE4E6',
  },
});

export default AlertCard;

