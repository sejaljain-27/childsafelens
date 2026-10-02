import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Component as GradientBackground } from './gradient-backgrounds';

export default function DemoOne() {
  return (
    <GradientBackground>
      <View style={styles.content}>
        <Text style={styles.title}>Gradient Background Demo</Text>
        <Text style={styles.subtitle}>
          This component wraps your content with a beautiful indigo-to-white gradient
        </Text>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    maxWidth: 300,
  },
});
