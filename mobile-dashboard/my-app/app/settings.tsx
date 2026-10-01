import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const API_BASE_URL = "http://localhost:8500";

export default function SettingsScreen() {
  const router = useRouter();
  const [mediumAction, setMediumAction] = useState('ALLOW');
  const [highAction, setHighAction] = useState('BLOCK');
  const [criticalAction, setCriticalAction] = useState('KEEP_PENDING');
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);

  useEffect(() => {
    fetch(`${API_BASE_URL}/settings`)
      .then(res => res.json())
      .then(data => {
        if (data) {
          setMediumAction(data.medium_risk_timeout_action || 'ALLOW');
          setHighAction(data.high_risk_timeout_action || 'BLOCK');
          setCriticalAction(data.critical_risk_timeout_action || 'KEEP_PENDING');
          setTimeoutSeconds(data.timeout_seconds || 60);
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
          timeout_seconds: timeoutSeconds
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
    <LinearGradient colors={['#F5F7FA', '#E2E8F0']} style={styles.safeArea}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color="#2F80ED" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Parent Safety Settings</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Timeout Default Actions</Text>
            <Text style={styles.cardSubtitle}>
              Configure what action the app takes if you do not respond within {timeoutSeconds} seconds.
            </Text>

            <Text style={styles.label}>Medium Risk Default Action</Text>
            <View style={styles.row}>
              {['ALLOW', 'BLOCK', 'KEEP_PENDING'].map(act => (
                <TouchableOpacity
                  key={act}
                  style={[styles.optionBtn, mediumAction === act && styles.activeOptionBtn]}
                  onPress={() => setMediumAction(act)}
                >
                  <Text style={[styles.optionText, mediumAction === act && styles.activeOptionText]}>{act}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>High Risk Default Action</Text>
            <View style={styles.row}>
              {['ALLOW', 'BLOCK', 'KEEP_PENDING'].map(act => (
                <TouchableOpacity
                  key={act}
                  style={[styles.optionBtn, highAction === act && styles.activeOptionBtn]}
                  onPress={() => setHighAction(act)}
                >
                  <Text style={[styles.optionText, highAction === act && styles.activeOptionText]}>{act}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Critical Risk Default Action</Text>
            <View style={styles.row}>
              {['ALLOW', 'BLOCK', 'KEEP_PENDING'].map(act => (
                <TouchableOpacity
                  key={act}
                  style={[styles.optionBtn, criticalAction === act && styles.activeOptionBtn]}
                  onPress={() => setCriticalAction(act)}
                >
                  <Text style={[styles.optionText, criticalAction === act && styles.activeOptionText]}>{act}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
              <Text style={styles.saveBtnText}>Save Settings</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#E2E8F0', elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  cardSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 20, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8, marginTop: 12 },
  row: { flexDirection: 'row', gap: 8 },
  optionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  activeOptionBtn: { backgroundColor: '#2F80ED', borderColor: '#2F80ED' },
  optionText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  activeOptionText: { color: '#FFFFFF' },
  saveBtn: { backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 }
});
