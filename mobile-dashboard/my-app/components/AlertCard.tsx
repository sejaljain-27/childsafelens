import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { IncidentType } from '../services/alertsService';

interface AlertCardProps {
  alert: IncidentType;
  onDecision: (incidentId: string, decision: 'ALLOW' | 'BLOCK' | 'EDIT') => void;
}

const AlertCard: React.FC<AlertCardProps> = ({ alert, onDecision }) => {
  const isHigh = alert.riskLevel === 'HIGH' || alert.riskLevel === 'CRITICAL';
  const isPending = alert.status === 'PENDING' || alert.status === 'PENDING_PARENT_REVIEW' || alert.status === 'EDIT_REQUIRED';

  return (
    <View style={[styles.card, isHigh && styles.highRiskCard]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: isHigh ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}>
          <MaterialIcons
            name={isHigh ? 'error-outline' : 'warning-amber'}
            size={24}
            color={isHigh ? '#F43F5E' : '#FBBF24'}
          />
          <Text style={[styles.badgeText, { color: isHigh ? '#F43F5E' : '#FBBF24' }]}>
            {alert.riskLevel} Risk ({alert.category})
          </Text>
        </View>
        <Text style={styles.time}>{new Date(alert.timestamp).toLocaleTimeString()}</Text>
      </View>
      <Text style={[styles.message, isHigh && styles.highRiskMessage]}>
        "{alert.messageSnippet}"
      </Text>
      <Text style={styles.status}>Status: {alert.status} {alert.parentDecision ? `(Parent: ${alert.parentDecision})` : ''}</Text>

      {isPending && (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.allowBtn]} onPress={() => onDecision(alert.incidentId, 'ALLOW')}>
            <Text style={styles.btnText}>Allow Send</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.editBtn]} onPress={() => onDecision(alert.incidentId, 'EDIT')}>
            <Text style={styles.btnText}>Ask Child to Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.blockBtn]} onPress={() => onDecision(alert.incidentId, 'BLOCK')}>
            <Text style={styles.btnText}>Block Send</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
  },
  highRiskCard: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 8,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  time: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  message: {
    fontSize: 16,
    color: '#1E293B',
    lineHeight: 22,
    fontWeight: '500',
    marginBottom: 8,
  },
  highRiskMessage: {
    color: '#881337',
  },
  status: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  allowBtn: {
    backgroundColor: '#10B981',
  },
  editBtn: {
    backgroundColor: '#F59E0B',
  },
  blockBtn: {
    backgroundColor: '#EF4444',
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});

export default AlertCard;
