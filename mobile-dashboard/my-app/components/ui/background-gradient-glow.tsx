import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GradientGlowBackgroundProps {
  children?: ReactNode;
  style?: ViewStyle;
}

// Aurora Dream Corner Whispers - adapted for React Native
export const Component: React.FC<GradientGlowBackgroundProps> = ({ children, style }) => {
  return (
    <View style={[styles.container, style]}>
      {/* Base gradient */}
      <LinearGradient
        colors={['#f7eaff', '#fde2ea']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Purple glow - top left */}
      <View style={[styles.glow, styles.glowPurple]} />
      
      {/* Yellow glow - top right */}
      <View style={[styles.glow, styles.glowYellow]} />
      
      {/* Pink glow - bottom left */}
      <View style={[styles.glow, styles.glowPink]} />
      
      {/* Blue glow - bottom right */}
      <View style={[styles.glow, styles.glowBlue]} />
      
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  glow: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.4,
  },
  glowPurple: {
    top: '8%',
    left: '8%',
    width: '85%',
    height: '65%',
    backgroundColor: 'rgba(175, 109, 255, 0.42)',
  },
  glowYellow: {
    top: '35%',
    left: '75%',
    width: '75%',
    height: '60%',
    backgroundColor: 'rgba(255, 235, 170, 0.55)',
  },
  glowPink: {
    top: '80%',
    left: '15%',
    width: '70%',
    height: '60%',
    backgroundColor: 'rgba(255, 100, 180, 0.40)',
  },
  glowBlue: {
    top: '92%',
    left: '92%',
    width: '70%',
    height: '60%',
    backgroundColor: 'rgba(120, 190, 255, 0.45)',
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
});

export default Component;
