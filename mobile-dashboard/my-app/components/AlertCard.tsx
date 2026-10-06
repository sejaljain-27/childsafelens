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
  const isIncoming = alert.type?.toUpperCase() === 'INCOMING';

  return (
    <View style={[styles.card, isHigh && styles.highRiskCard]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: isHigh ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}>
          <MaterialIcons
            name={isHigh ? 'error-outline' : 'warning-amber'}
            size={20}
            color={isHigh ? '#E91E63' : '#FF9800'}
          />
          <Text style={styles.badgeText}>
            Message classifier: {alert.riskLevel} ({alert.category}) [{isIncoming ? 'Incoming' : 'Outgoing'}]
          </Text>
        </View>
        <Text style={styles.time}>{new Date(alert.timestamp).toLocaleTimeString()}</Text>
      </View>
      <Text style={[styles.message, isHigh && styles.highRiskMessage]}>
        {'"'}{alert.messageSnippet}{'"'}
      </Text>
      <Text style={styles.status}>Status: {alert.status} {alert.parentDecision ? `(Parent: ${alert.parentDecision})` : ''}</Text>

      {isPending && (
        <View style={styles.actions}>
          {isIncoming ? (
            <>
              <TouchableOpacity style={[styles.btn, styles.allowBtn]} onPress={() => onDecision(alert.incidentId, 'ALLOW')}>
                <Text style={styles.btnText}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.blockBtn]} onPress={() => onDecision(alert.incidentId, 'BLOCK')}>
                <Text style={styles.btnText}>Block</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.btn, styles.allowBtn]} onPress={() => onDecision(alert.incidentId, 'ALLOW')}>
                <Text style={styles.btnText}>Allow Send</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.editBtn]} onPress={() => onDecision(alert.incidentId, 'EDIT')}>
                <Text style={styles.btnText}>Ask Child to Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.blockBtn]} onPress={() => onDecision(alert.incidentId, 'BLOCK')}>
                <Text style={styles.btnText}>Block Send</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  highRiskCard: {
    backgroundColor: 'rgba(255, 240, 245, 0.8)',
    borderColor: 'rgba(233, 30, 99, 0.5)',
    shadowColor: '#E91E63',
    shadowOpacity: 0.12,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#000000',
    textTransform: 'uppercase',
  },
  time: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 15,
    color: '#000000',
    lineHeight: 23,
    fontWeight: '600',
    marginBottom: 10,
    letterSpacing: 0.1,
  },
  highRiskMessage: {
    color: '#000000',
    fontWeight: '700',
  },
  status: {
    fontSize: 12,
    color: '#000000',
    marginBottom: 14,
    fontWeight: '600',
    fontStyle: 'italic',
    opacity: 0.75,
    letterSpacing: 0.2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  allowBtn: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
  },
  editBtn: {
    backgroundColor: 'rgba(255, 152, 0, 0.9)',
  },
  blockBtn: {
    backgroundColor: 'rgba(233, 30, 99, 0.9)',
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

export default AlertCard;
