import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const API_BASE_URL = "http://10.46.19.193:8001";

export default function SettingsScreen() {
  const router = useRouter();
  const [mediumAction, setMediumAction] = useState('ALLOW');
  const [highAction, setHighAction] = useState('BLOCK');
  const [criticalAction, setCriticalAction] = useState('KEEP_PENDING');
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [requireHighRiskApproval, setRequireHighRiskApproval] = useState(true);
  const [autoBlockExplicit, setAutoBlockExplicit] = useState(true);
  const [sendDailySummary, setSendDailySummary] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/settings`)
      .then(res => res.json())
      .then(data => {
        if (data) {
          setMediumAction(data.medium_risk_timeout_action || 'ALLOW');
          setHighAction(data.high_risk_timeout_action || 'BLOCK');
          setCriticalAction(data.critical_risk_timeout_action || 'KEEP_PENDING');
          setTimeoutSeconds(data.timeout_seconds || 60);
          setRequireHighRiskApproval(data.require_high_risk_approval !== false);
          setAutoBlockExplicit(data.auto_block_explicit !== false);
          setSendDailySummary(data.send_daily_summary !== false);
        }
      })
      .catch(err => console.error("Failed to load settings", err));
  }, []);

  const saveSettings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medium_risk_timeout_action: mediumAction,
          high_risk_timeout_action: highAction,
          critical_risk_timeout_action: criticalAction,
          timeout_seconds: timeoutSeconds,
          require_high_risk_approval: requireHighRiskApproval,
          auto_block_explicit: autoBlockExplicit,
          send_daily_summary: sendDailySummary
        })
      });
      if (res.ok) {
        Alert.alert("Success", "Parent default timeout settings saved successfully.");
      } else {
        Alert.alert("Error", "Failed to save settings.");
      }
    } catch (err) {
      Alert.alert("Error", String(err));
    }
  };

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
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={22} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>PARENT SETTINGS</Text>
            <View style={{ width: 22 }} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Response Time (No action)</Text>
            <Text style={styles.cardSubtitle}>
              {timeoutSeconds} seconds
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Default Action (if no response)</Text>
            
            <Text style={styles.label}>Medium Risk</Text>
            <View style={styles.row}>
              {['ALLOW', 'BLOCK', 'KEEP_PENDING'].map(act => (
                <TouchableOpacity
                  key={act}
                  style={[styles.optionBtn, mediumAction === act && styles.activeOptionBtn]}
                  onPress={() => setMediumAction(act)}
                >
                  <Text style={[styles.optionText, mediumAction === act && styles.activeOptionText]}>
                    {act === 'KEEP_PENDING' ? 'Pending' : act.toLowerCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>High Risk</Text>
            <View style={styles.row}>
              {['ALLOW', 'BLOCK', 'KEEP_PENDING'].map(act => (
                <TouchableOpacity
                  key={act}
                  style={[styles.optionBtn, highAction === act && styles.activeOptionBtn]}
                  onPress={() => setHighAction(act)}
                >
                  <Text style={[styles.optionText, highAction === act && styles.activeOptionText]}>
                    {act === 'KEEP_PENDING' ? 'Pending' : act.toLowerCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Critical Risk</Text>
            <View style={styles.row}>
              {['ALLOW', 'BLOCK', 'KEEP_PENDING'].map(act => (
                <TouchableOpacity
                  key={act}
                  style={[styles.optionBtn, criticalAction === act && styles.activeOptionBtn]}
                  onPress={() => setCriticalAction(act)}
                >
                  <Text style={[styles.optionText, criticalAction === act && styles.activeOptionText]}>
                    {act === 'KEEP_PENDING' ? 'Pending' : act.toLowerCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.toggleRow}
              onPress={() => setRequireHighRiskApproval(!requireHighRiskApproval)}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name={requireHighRiskApproval ? "check-circle" : "radio-button-unchecked"} 
                size={24} 
                color={requireHighRiskApproval ? "#4CAF50" : "#BDBDBD"} 
              />
              <Text style={styles.toggleLabel}>Always require approval for High Risk</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.toggleRow}
              onPress={() => setAutoBlockExplicit(!autoBlockExplicit)}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name={autoBlockExplicit ? "check-circle" : "radio-button-unchecked"} 
                size={24} 
                color={autoBlockExplicit ? "#4CAF50" : "#BDBDBD"} 
              />
              <Text style={styles.toggleLabel}>Auto-block explicit content</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.toggleRow}
              onPress={() => setSendDailySummary(!sendDailySummary)}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name={sendDailySummary ? "check-circle" : "radio-button-unchecked"} 
                size={24} 
                color={sendDailySummary ? "#4CAF50" : "#BDBDBD"} 
              />
              <Text style={styles.toggleLabel}>Send daily summary</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
            <Text style={styles.saveBtnText}>SAVE SETTINGS</Text>
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
    fontSize: 18, 
    fontWeight: '800', 
    color: '#000000',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  card: { 
    backgroundColor: 'rgba(255, 255, 255, 0.65)', 
    borderRadius: 20, 
    padding: 18, 
    marginBottom: 16,
    borderWidth: 1.5, 
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  cardTitle: { 
    fontSize: 15, 
    fontWeight: '800', 
    color: '#000000', 
    marginBottom: 8,
    letterSpacing: 0.3
  },
  cardSubtitle: { 
    fontSize: 14, 
    color: '#000000', 
    lineHeight: 20,
    fontWeight: '600'
  },
  label: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#000000', 
    marginBottom: 10, 
    marginTop: 16,
    letterSpacing: 0.3
  },
  row: { flexDirection: 'row', gap: 10 },
  optionBtn: { 
    flex: 1, 
    paddingVertical: 12, 
    borderRadius: 16, 
    backgroundColor: 'rgba(255, 255, 255, 0.8)', 
    alignItems: 'center', 
    borderWidth: 1.5, 
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  activeOptionBtn: { 
    backgroundColor: 'rgba(76, 175, 80, 0.9)', 
    borderColor: 'rgba(76, 175, 80, 1)',
    shadowColor: '#4CAF50',
    shadowOpacity: 0.3
  },
  optionText: { 
    fontSize: 12, 
    fontWeight: '700', 
    color: '#000000',
    textTransform: 'capitalize',
    letterSpacing: 0.3
  },
  activeOptionText: { color: '#FFFFFF', fontWeight: '800' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    flex: 1,
    letterSpacing: 0.2
  },
  saveBtn: { 
    backgroundColor: 'rgba(76, 175, 80, 0.9)', 
    paddingVertical: 16, 
    borderRadius: 18, 
    alignItems: 'center', 
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(76, 175, 80, 1)',
    shadowColor: '#4CAF50',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  saveBtnText: { 
    color: '#FFFFFF', 
    fontWeight: '800', 
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase'
  }
});
