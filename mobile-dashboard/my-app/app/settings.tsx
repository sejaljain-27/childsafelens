import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, SafeAreaView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const API_BASE_URL = "http://localhost:8001";

export default function SettingsScreen() {
  const router = useRouter();
  const getStoredEmail = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('childsafelens_parent_email');
    }
    return null;
  };

  const [parentEmail, setParentEmail] = useState<string>(
    getStoredEmail() || 'parent@test.com'
  );
  const [mediumAction, setMediumAction] = useState('ALLOW');
  const [highAction, setHighAction] = useState('BLOCK');
  const [criticalAction, setCriticalAction] = useState('KEEP_PENDING');
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [requireHighRiskApproval, setRequireHighRiskApproval] = useState(true);
  const [autoBlockExplicit, setAutoBlockExplicit] = useState(true);
  const [sendDailySummary, setSendDailySummary] = useState(true);

  // Notification Preferences State
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsNumber, setSmsNumber] = useState('+919876543210');
  const [emailAddress, setEmailAddress] = useState(parentEmail);
  const [highSms, setHighSms] = useState(true);
  const [criticalSms, setCriticalSms] = useState(true);
  const [criticalEmail, setCriticalEmail] = useState(true);

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

    fetch(`${API_BASE_URL}/settings/notifications?parentEmail=${encodeURIComponent(parentEmail)}`)
      .then(res => res.json())
      .then(data => {
        if (data) {
          setSmsEnabled(data.smsEnabled !== false);
          setEmailEnabled(data.emailEnabled !== false);
          setSmsNumber(data.smsNumber || '+919876543210');
          setEmailAddress(data.emailAddress || parentEmail);
          setHighSms(data.highSmsEnabled !== false);
          setCriticalSms(data.criticalSmsEnabled !== false);
          setCriticalEmail(data.criticalEmailEnabled !== false);
        }
      })
      .catch(err => console.error("Failed to load notification settings", err));
  }, [parentEmail]);

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

      const resNotif = await fetch(`${API_BASE_URL}/settings/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentEmail: parentEmail,
          fcmEnabled: true,
          smsEnabled: smsEnabled,
          emailEnabled: emailEnabled,
          smsNumber: smsNumber,
          emailAddress: emailAddress,
          mediumFcmEnabled: true,
          highFcmEnabled: true,
          highSmsEnabled: highSms,
          highEmailEnabled: false,
          criticalFcmEnabled: true,
          criticalSmsEnabled: criticalSms,
          criticalEmailEnabled: criticalEmail
        })
      });

      if (res.ok && resNotif.ok) {
        Alert.alert("Success", "Parent settings and notification preferences saved successfully.");
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
            <Text style={styles.cardTitle}>🔔 Notification Preferences (SMS & Email)</Text>

            <Text style={styles.label}>SMS Phone Number</Text>
            <TextInput
              style={styles.input}
              value={smsNumber}
              onChangeText={setSmsNumber}
              placeholder="+919876543210"
              placeholderTextColor="#888"
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={emailAddress}
              onChangeText={setEmailAddress}
              placeholder="parent@test.com"
              placeholderTextColor="#888"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TouchableOpacity
              style={[styles.toggleRow, { marginTop: 8 }]}
              onPress={() => setSmsEnabled(!smsEnabled)}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={smsEnabled ? "check-circle" : "radio-button-unchecked"}
                size={22}
                color={smsEnabled ? "#4CAF50" : "#BDBDBD"}
              />
              <Text style={styles.toggleLabel}>Enable SMS Alerts</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toggleRow, { marginTop: 12 }]}
              onPress={() => setEmailEnabled(!emailEnabled)}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={emailEnabled ? "check-circle" : "radio-button-unchecked"}
                size={22}
                color={emailEnabled ? "#4CAF50" : "#BDBDBD"}
              />
              <Text style={styles.toggleLabel}>Enable Email Alerts</Text>
            </TouchableOpacity>

            <Text style={styles.label}>SMS Risk Levels</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.optionBtn, highSms && styles.activeOptionBtn]}
                onPress={() => setHighSms(!highSms)}
              >
                <Text style={[styles.optionText, highSms && styles.activeOptionText]}>High Risk SMS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionBtn, criticalSms && styles.activeOptionBtn]}
                onPress={() => setCriticalSms(!criticalSms)}
              >
                <Text style={[styles.optionText, criticalSms && styles.activeOptionText]}>Critical SMS</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Email Risk Levels</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.optionBtn, criticalEmail && styles.activeOptionBtn]}
                onPress={() => setCriticalEmail(!criticalEmail)}
              >
                <Text style={[styles.optionText, criticalEmail && styles.activeOptionText]}>Critical Email</Text>
              </TouchableOpacity>
            </View>
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
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#000000',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    marginTop: 6,
    marginBottom: 12,
    fontWeight: '600'
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
