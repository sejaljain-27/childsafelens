import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
  Button,
} from 'react-native';

import { HeroSection } from '../components/ui/hero-section-with-smooth-bg-shader';
import { useRouter } from 'expo-router';

const LoginScreen: React.FC = () => {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleAuth = () => {
    console.log('Login button pressed. isSignup:', isSignup);
    if (isSignup) {
      if (!fullName || !email || !password || !confirmPassword) {
        Alert.alert('Validation Error', 'Please fill in all fields');
        return;
      }
    } else {
      if (!email || !password) {
        Alert.alert('Validation Error', 'Please fill in all fields');
        return;
      }
    }

    setIsLoading(true);
    try {
      setTimeout(() => {
        setIsLoading(false);
        if (isSignup) {
          console.log('Signup successful, switching to Login mode');
          setIsSignup(false);
        } else {
          console.log('Login successful, navigating to dashboard...');
          router.replace('/dashboard');
        }
      }, 500);
    } catch (error) {
      setIsLoading(false);
      console.error('Auth error:', error);
      Alert.alert('Error', String(error));
    }
  };


  const toggleMode = () => {
    setIsSignup(!isSignup);
  };

  return (
    <HeroSection>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo/Brand Section */}
          <View style={styles.brandSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>🔒</Text>
            </View>
            <Text style={[styles.brandName, { fontSize: width > 768 ? 96 : 64 }]}>
              CHILD SAFELENS
            </Text>
            <Text style={styles.brandTagline}>Secure Parental Control</Text>
          </View>

          {/* Form Box */}
          <View style={styles.formBox}>
            {/* Tabs */}
            <View style={styles.tabsContainer}>
              <TouchableOpacity
                style={[styles.tab, !isSignup && styles.activeTab]}
                onPress={() => isSignup && toggleMode()}
              >
                <Text style={[styles.tabText, !isSignup && styles.activeTabText]}>
                  LOGIN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, isSignup && styles.activeTab]}
                onPress={() => !isSignup && toggleMode()}
              >
                <Text style={[styles.tabText, isSignup && styles.activeTabText]}>
                  SIGN UP
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form Divider */}
            <View style={styles.divider} />

            {/* Form Content */}
            <View style={styles.formContent}>
              {isSignup && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Full Name</Text>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputIcon}>👤</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="John Doe"
                      placeholderTextColor="#9CA3AF"
                      value={fullName}
                      onChangeText={setFullName}
                      editable={!isLoading}
                    />
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>✉️</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                    editable={!isLoading}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>🔐</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    editable={!isLoading}
                  />
                </View>
              </View>

              {!isSignup && (
                <TouchableOpacity style={styles.forgotContainer}>
                  <Text style={styles.forgotPassword}>Forgot password?</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Action Button */}
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.authButton, isLoading && styles.authButtonDisabled]}
              onPress={handleAuth}
              disabled={isLoading}
            >
              <Text style={styles.authButtonText}>
                {isLoading
                  ? 'Processing...'
                  : isSignup
                  ? 'Create Account'
                  : 'Sign In'}
              </Text>
            </TouchableOpacity>

            {/* Toggle Form Mode */}
            <View style={styles.toggleContainer}>
              <Text style={styles.toggleText}>
                {isSignup ? 'Already have an account? ' : "Don't have an account? "}
              </Text>
              <TouchableOpacity onPress={toggleMode}>
                <Text style={styles.toggleLink}>
                  {isSignup ? 'Sign In' : 'Sign Up'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Skip Button */}
          <TouchableOpacity 
            activeOpacity={0.7}
            style={styles.demoButton}
            onPress={() => router.replace('/dashboard')}
          >
            <Text style={styles.demoButtonText}>Skip to Dashboard →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </HeroSection>
  );
};


const { width } = Dimensions.get('window');

const boxWidth = Math.min(width - 80, 800);

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80, width: '100%' },
  brandSection: { alignItems: 'center', marginBottom: 80, width: '100%', paddingHorizontal: 40 },
  logoCircle: { width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(15, 23, 42, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 40, borderWidth: 6, borderColor: 'rgba(15, 23, 42, 0.3)' },
  logoText: { fontSize: 80 },
  brandName: { fontWeight: '800', color: '#0F172A', marginBottom: 16, letterSpacing: 1, textAlign: 'center' },
  brandTagline: { fontSize: 40, color: '#334155', fontWeight: '600', textAlign: 'center' },
  formBox: {
    width: boxWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: 48,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    paddingBottom: 48,
    boxShadow: '0px 20px 40px rgba(0, 0, 0, 0.2)', // Web-compatible shadow
    elevation: 10,
    backdropFilter: 'blur(16px)',
  } as any,
  tabsContainer: { flexDirection: 'row', width: '100%' },
  tab: { flex: 1, paddingVertical: 40, alignItems: 'center', borderBottomWidth: 8, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#60A5FA' },
  tabText: { fontSize: 36, fontWeight: '700', color: 'rgba(255, 255, 255, 0.4)', letterSpacing: 2 },
  activeTabText: { color: '#ffffff' },
  divider: { height: 3, backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  formContent: { paddingHorizontal: 64, paddingTop: 64, paddingBottom: 40, width: '100%' },
  inputGroup: { marginBottom: 48, width: '100%' },
  label: { fontSize: 32, fontWeight: '700', color: 'rgba(255, 255, 255, 0.7)', marginBottom: 20, letterSpacing: 1, textTransform: 'uppercase' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 4, borderColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 32, paddingHorizontal: 40, paddingVertical: 16, height: 120 },
  inputIcon: { fontSize: 56, marginRight: 24 },
  input: { flex: 1, height: '100%', fontSize: 48, color: '#FFFFFF', fontWeight: '500' },
  forgotContainer: { alignItems: 'flex-end', marginTop: -20, marginBottom: 40, width: '100%' },
  forgotPassword: { fontSize: 32, color: '#60A5FA', fontWeight: '600' },
  authButton: {
    backgroundColor: '#ffffff',
    height: 120,
    marginHorizontal: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
    boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.2)', // Web-compatible shadow
    elevation: 8,
  } as any,
  authButtonDisabled: { opacity: 0.7 },
  authButtonText: { color: '#0F172A', fontSize: 48, fontWeight: '800', letterSpacing: 1 },
  toggleContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 64 },
  toggleText: { fontSize: 36, color: 'rgba(255, 255, 255, 0.6)' },
  toggleLink: { fontSize: 36, color: '#ffffff', fontWeight: '700' },
  demoButton: { marginTop: 64, paddingVertical: 32, paddingHorizontal: 64, borderWidth: 4, borderColor: 'rgba(15, 23, 42, 0.3)', borderRadius: 32, alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  demoButtonText: { color: '#0F172A', fontSize: 40, fontWeight: '700' },
});


export default LoginScreen;
