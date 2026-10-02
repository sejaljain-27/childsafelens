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
import { useRouter } from 'expo-router';

const LoginScreen: React.FC = () => {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
          Alert.alert('Success', 'Account created successfully! Please sign in.');
        } else {
          console.log('Login successful, navigating to dashboard for:', email);
          const cleanEmail = email.trim().toLowerCase() || 'parent@test.com';
          if (typeof window !== 'undefined') {
            localStorage.setItem('childsafelens_parent_email', cleanEmail);
          }
          router.replace({
            pathname: '/dashboard',
            params: { email: cleanEmail }
          });
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
            <Text style={styles.brandName}>
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
            onPress={() => {
              const cleanEmail = 'parent@test.com';
              if (typeof window !== 'undefined') {
                localStorage.setItem('childsafelens_parent_email', cleanEmail);
              }
              router.replace({ pathname: '/dashboard', params: { email: cleanEmail } });
            }}
          >
            <Text style={styles.demoButtonText}>Skip to Dashboard →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </HeroSection>
  );
};

const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 380;
const isMediumScreen = width >= 380 && width < 768;
const isLargeScreen = width >= 768;

// Responsive values
const responsiveWidth = Math.min(width * 0.9, isLargeScreen ? 500 : isMediumScreen ? 400 : width - 40);
const brandFontSize = isSmallScreen ? 20 : isMediumScreen ? 24 : 32;
const taglineFontSize = isSmallScreen ? 12 : isMediumScreen ? 14 : 16;
const logoSize = isSmallScreen ? 50 : isMediumScreen ? 60 : 70;
const tabFontSize = isSmallScreen ? 14 : isMediumScreen ? 16 : 18;
const labelFontSize = isSmallScreen ? 11 : isMediumScreen ? 12 : 13;
const inputFontSize = isSmallScreen ? 14 : isMediumScreen ? 15 : 16;
const buttonFontSize = isSmallScreen ? 15 : isMediumScreen ? 16 : 17;
const padding = isSmallScreen ? 14 : isMediumScreen ? 18 : 24;

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%' },
  scrollContent: { 
    flexGrow: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingVertical: 10, 
    width: '100%',
    paddingHorizontal: 10,
    minHeight: '100%'
  },
  brandSection: { 
    alignItems: 'center', 
    marginBottom: isSmallScreen ? 16 : isMediumScreen ? 20 : 24, 
    width: '100%', 
    paddingHorizontal: isSmallScreen ? 16 : 20 
  },
  logoCircle: { 
    width: logoSize, 
    height: logoSize, 
    borderRadius: logoSize / 2, 
    backgroundColor: 'rgba(15, 23, 42, 0.1)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: isSmallScreen ? 8 : isMediumScreen ? 10 : 12, 
    borderWidth: 2, 
    borderColor: 'rgba(15, 23, 42, 0.3)' 
  },
  logoText: { fontSize: isSmallScreen ? 24 : isMediumScreen ? 30 : 35 },
  brandName: { 
    fontWeight: '800', 
    color: '#0F172A', 
    marginBottom: isSmallScreen ? 6 : 8, 
    letterSpacing: 0.5, 
    textAlign: 'center',
    fontSize: brandFontSize
  },
  brandTagline: { 
    fontSize: taglineFontSize, 
    color: '#334155', 
    fontWeight: '600', 
    textAlign: 'center' 
  },
  formBox: {
    width: responsiveWidth,
    maxWidth: 500,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderRadius: isSmallScreen ? 16 : isMediumScreen ? 20 : 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    paddingBottom: isSmallScreen ? 16 : isMediumScreen ? 20 : 24,
    elevation: 10,
  },
  tabsContainer: { flexDirection: 'row', width: '100%' },
  tab: { 
    flex: 1, 
    paddingVertical: isSmallScreen ? 12 : isMediumScreen ? 14 : 16, 
    alignItems: 'center', 
    borderBottomWidth: 3, 
    borderBottomColor: 'transparent' 
  },
  activeTab: { borderBottomColor: '#60A5FA' },
  tabText: { 
    fontSize: tabFontSize, 
    fontWeight: '700', 
    color: 'rgba(255, 255, 255, 0.4)', 
    letterSpacing: 1 
  },
  activeTabText: { color: '#ffffff' },
  divider: { height: 2, backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  formContent: { 
    paddingHorizontal: padding, 
    paddingTop: isSmallScreen ? 14 : isMediumScreen ? 16 : 20, 
    paddingBottom: isSmallScreen ? 10 : 12, 
    width: '100%' 
  },
  inputGroup: { marginBottom: isSmallScreen ? 10 : isMediumScreen ? 12 : 14, width: '100%' },
  label: { 
    fontSize: labelFontSize, 
    fontWeight: '700', 
    color: 'rgba(255, 255, 255, 0.8)', 
    marginBottom: isSmallScreen ? 8 : 10, 
    letterSpacing: 0.5, 
    textTransform: 'uppercase' 
  },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(255, 255, 255, 0.08)', 
    borderWidth: 2, 
    borderColor: 'rgba(255, 255, 255, 0.2)', 
    borderRadius: isSmallScreen ? 10 : 12, 
    paddingHorizontal: isSmallScreen ? 10 : isMediumScreen ? 12 : 14, 
    height: isSmallScreen ? 44 : isMediumScreen ? 48 : 50 
  },
  inputIcon: { 
    fontSize: isSmallScreen ? 18 : isMediumScreen ? 20 : 22, 
    marginRight: isSmallScreen ? 8 : 12 
  },
  input: { 
    flex: 1, 
    height: '100%', 
    fontSize: inputFontSize, 
    color: '#FFFFFF', 
    fontWeight: '500' 
  },
  forgotContainer: { 
    alignItems: 'flex-end', 
    marginTop: -8, 
    marginBottom: isSmallScreen ? 16 : 20, 
    width: '100%' 
  },
  forgotPassword: { 
    fontSize: isSmallScreen ? 12 : isMediumScreen ? 13 : 14, 
    color: '#60A5FA', 
    fontWeight: '600' 
  },
  authButton: {
    backgroundColor: '#ffffff',
    height: isSmallScreen ? 50 : isMediumScreen ? 54 : 58,
    marginHorizontal: padding,
    borderRadius: isSmallScreen ? 12 : 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: isSmallScreen ? 16 : isMediumScreen ? 20 : 24,
    marginTop: isSmallScreen ? 8 : 12,
    elevation: 8,
  },
  authButtonDisabled: { opacity: 0.7 },
  authButtonText: { 
    color: '#0F172A', 
    fontSize: buttonFontSize, 
    fontWeight: '800', 
    letterSpacing: 0.5 
  },
  toggleContainer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: padding,
    flexWrap: 'wrap'
  },
  toggleText: { 
    fontSize: isSmallScreen ? 13 : isMediumScreen ? 14 : 15, 
    color: 'rgba(255, 255, 255, 0.6)' 
  },
  toggleLink: { 
    fontSize: isSmallScreen ? 13 : isMediumScreen ? 14 : 15, 
    color: '#60A5FA', 
    fontWeight: '700' 
  },
  demoButton: { 
    marginTop: isSmallScreen ? 20 : isMediumScreen ? 28 : 32, 
    paddingVertical: isSmallScreen ? 12 : 14, 
    paddingHorizontal: isSmallScreen ? 20 : isMediumScreen ? 28 : 32, 
    backgroundColor: 'rgba(255, 255, 255, 0.15)', 
    borderRadius: isSmallScreen ? 12 : 16, 
    borderWidth: 2, 
    borderColor: 'rgba(255, 255, 255, 0.3)' 
  },
  demoButtonText: { 
    color: '#ffffff', 
    fontSize: isSmallScreen ? 13 : isMediumScreen ? 15 : 16, 
    fontWeight: '700', 
    letterSpacing: 0.5 
  },
});

export default LoginScreen;
