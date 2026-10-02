import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GradientBackgroundProps {
  children?: ReactNode;
  style?: ViewStyle;
}

export const Component: React.FC<GradientBackgroundProps> = ({ children, style }) => {
  // Ocean Breeze Fade Gradient adapted for React Native
  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={['#B3E5FC', '#E0F2F1', '#F0F4C3', '#FFF8E1', '#FFECB3']}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
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
  content: {
    flex: 1,
    zIndex: 1,
  },
});

export default Component;
