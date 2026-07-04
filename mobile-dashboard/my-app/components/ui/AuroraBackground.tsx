import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

interface AuroraBackgroundProps {
  children: React.ReactNode;
  showRadialGradient?: boolean;
}

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({
  children,
  showRadialGradient = true,
}) => {
  const [animatedValue] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 15000,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 15000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [animatedValue]);

  const opacity1 = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.8, 0.4],
  });

  const opacity2 = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 0.3, 0.6],
  });

  return (
    <View style={styles.container}>
      {/* Background */}
      <View style={styles.background} />

      {/* Aurora Effect Layer 1 - Blue */}
      <Animated.View
        style={[
          styles.auroraLayer,
          {
            opacity: opacity1,
            backgroundColor: '#1E3A8A',
            pointerEvents: 'none',
          },
        ]}
      />

      {/* Aurora Effect Layer 2 - Indigo */}
      <Animated.View
        style={[
          styles.auroraLayer,
          {
            opacity: opacity2,
            backgroundColor: '#312E81',
            pointerEvents: 'none',
          },
        ]}
      />

      {/* Aurora Effect Layer 3 - Violet */}
      <Animated.View
        style={[
          styles.auroraLayer,
          {
            opacity: opacity1,
            backgroundColor: '#4C1D95',
            pointerEvents: 'none',
          },
        ]}
      />

      {/* Dark overlay */}
      <View style={[styles.overlay, { pointerEvents: 'none' }]} />

      {/* Content */}
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
  },
  auroraLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999, // Ensure it's on top
  },
});

