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
} from 'react-native';
import { HeroSection } from '../components/ui/hero-section-with-smooth-bg-shader';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleAuth = () => {
    if (isSignup) {
      if (!fullName || !email || !password || !confirmPassword) {
        Alert.alert('Validation Error', 'Please fill in all fields');
        return;
      }
      if (!email.includes('@')) {
        Alert.alert('Validation Error', 'Please enter a valid email');
        return;
      }
      if (password.length < 6) {
        Alert.alert('Validation Error', 'Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Validation Error', 'Passwords do not match');
        return;
      }
      if (!agreedToTerms) {
        Alert.alert('Validation Error', 'Please agree to the Terms of Service');
        return;
      }
    } else {
      if (!email || !password) {
        Alert.alert('Validation Error', 'Please fill in all fields');
        return;
      }
      if (!email.includes('@')) {
        Alert.alert('Validation Error', 'Please enter a valid email');
        return;
      }
    }

    setIsLoading(true);
    try {
      console.log('Attempting to navigate to Dashboard...');
      // Immediate navigation for debugging
      navigation.reset({
        index: 0,
        routes: [{ name: 'Dashboard' }],
      });
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      console.error('Navigation error:', error);
      Alert.alert('Navigation Error', String(error));
    }
  };


  const toggleMode = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setConfirmPassword('');
    setAgreedToTerms(false);
    setIsSignup(!isSignup);
  };

  return (
    <HeroSection>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo/Brand Section */}
          <View style={styles.brandSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>🔒</Text>
            </View>
            <Text style={styles.brandName}>ChildSafeLens</Text>
            <Text style={styles.brandTagline}>Secure Parental Control</Text>
          </View>

          {/* Form Box */}
          <View style={styles.formBox}>
            {/* Tabs */}
            <View style={styles.tabsContainer}>
              <TouchableOpacity
                style={[styles.tab, !isSignup && styles.activeTab]}
                onPress={() => !isSignup && toggleMode()}
              >
                <Text style={[styles.tabText, !isSignup && styles.activeTabText]}>
                  LOGIN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, isSignup && styles.activeTab]}
                onPress={() => isSignup && toggleMode()}
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

              {isSignup && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputIcon}>✓</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="••••••••"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      editable={!isLoading}
                    />
                  </View>
                </View>
              )}

              {!isSignup && (
                <TouchableOpacity style={styles.forgotContainer}>
                  <Text style={styles.forgotPassword}>Forgot password?</Text>
                </TouchableOpacity>
              )}

              {isSignup && (
                <View style={styles.termsContainer}>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => setAgreedToTerms(!agreedToTerms)}
                  >
                    <View
                      style={[
                        styles.checkboxInner,
                        agreedToTerms && styles.checkboxChecked,
                      ]}
                    >
                      {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.termsText}>
                    I agree to the{' '}
                    <Text style={styles.termsLink}>Terms of Service</Text>
                  </Text>
                </View>
              )}
            </View>

            {/* Action Button */}
            <TouchableOpacity
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

          {/* Demo Button */}
          <TouchableOpacity
            style={styles.demoButton}
            onPress={() => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Dashboard' }],
              });
            }}
          >
            <Text style={styles.demoButtonText}>Skip to Dashboard →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </HeroSection>
  );
};

const { width } = Dimensions.get('window');
const boxWidth = Math.min(width - 40, 420);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 15,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 3,
    borderColor: 'rgba(59, 130, 246, 0.6)',
  },
  logoText: {
    fontSize: 48,
  },
  brandName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  brandTagline: {
    fontSize: 15,
    color: '#93C5FD',
    fontWeight: '600',
  },
  formBox: {
    width: boxWidth,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.6)',
    overflow: 'hidden',
    paddingBottom: 24,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 18,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 1,
  },
  activeTabText: {
    color: '#60A5FA',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  formContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D1D5DB',
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.5)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  inputIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  forgotContainer: {
    alignItems: 'flex-end',
    marginTop: -8,
    marginBottom: 16,
  },
  forgotPassword: {
    fontSize: 12,
    color: '#60A5FA',
    fontWeight: '600',
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkbox: {
    marginRight: 10,
  },
  checkboxInner: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(96, 165, 250, 0.5)',
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  termsText: {
    fontSize: 12,
    color: '#D1D5DB',
    flex: 1,
  },
  termsLink: {
    color: '#60A5FA',
    fontWeight: '600',
  },
  authButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    marginHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#60A5FA',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  authButtonDisabled: {
    backgroundColor: '#1E40AF',
    opacity: 0.7,
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  toggleText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  toggleLink: {
    fontSize: 13,
    color: '#60A5FA',
    fontWeight: '700',
  },
  demoButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.5)',
    borderRadius: 10,
    alignItems: 'center',
  },
  demoButtonText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

export default LoginScreen;
