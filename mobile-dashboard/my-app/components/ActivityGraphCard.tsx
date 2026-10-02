import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from 'react-native-reanimated';

const DATA = [
  { day: 'M', value: 45 },
  { day: 'T', value: 60 },
  { day: 'W', value: 30 },
  { day: 'T', value: 85 },
  { day: 'F', value: 50 },
  { day: 'S', value: 20 },
  { day: 'S', value: 15 },
];

const ActivityGraphCard = () => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Screen Time</Text>
        <Text style={styles.subtitle}>Daily average: 3.5 hrs</Text>
      </View>
      <View style={styles.graphContainer}>
        {DATA.map((item, index) => {
          return <Bar key={index} item={item} index={index} />;
        })}
      </View>
    </View>
  );
};

const Bar = ({ item, index }: { item: any; index: number }) => {
  const height = useSharedValue(0);

  useEffect(() => {
    // absolute pixel height out of 500
    const pixelHeight = (item.value / 100) * 500;
    height.value = withDelay(400 + index * 100, withSpring(pixelHeight, { damping: 15 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <View style={styles.barWrapper}>
      <View style={styles.barBackground}>
        <Animated.View style={[styles.barFill, animatedStyle]} />
      </View>
      <Text style={styles.dayText}>{item.day}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 64,
    flex: 1,
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(16px)',
    elevation: 3,
  } as any,
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 64,
  },
  title: {
    fontSize: 96,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 56,
    color: '#22D3EE',
    fontWeight: '600',
  },
  graphContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 600,
    width: '100%',
  },
  barWrapper: {
    alignItems: 'center',
  },
  barBackground: {
    height: 500,
    width: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 40,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: '#22D3EE',
    borderRadius: 40,
  },
  dayText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 48,
    marginTop: 32,
    fontWeight: '700',
  },
});

export default ActivityGraphCard;
