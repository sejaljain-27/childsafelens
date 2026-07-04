import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface DashboardCardProps {
  score: number;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 48;
const CIRCLE_SIZE = 400;
const STROKE_WIDTH = 40;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DashboardCard: React.FC<DashboardCardProps> = ({ score }) => {
  const isSafe = score >= 80;
  const strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * score) / 100;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Child Safety Score</Text>
          <Text style={[styles.status, { color: isSafe ? '#22D3EE' : '#F43F5E' }]}>
            {isSafe ? 'Safe' : 'At Risk'}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Real-time</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.svgContainer}>
          <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
            {/* Background Circle */}
            <Circle
              cx={CIRCLE_SIZE / 2}
              cy={CIRCLE_SIZE / 2}
              r={RADIUS}
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />
            {/* Progress Circle */}
            <Circle
              cx={CIRCLE_SIZE / 2}
              cy={CIRCLE_SIZE / 2}
              r={RADIUS}
              stroke={isSafe ? '#22D3EE' : '#F43F5E'}
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              rotation="-90"
              origin={`${CIRCLE_SIZE / 2}, ${CIRCLE_SIZE / 2}`}
            />
          </Svg>
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreText}>{score}%</Text>
          </View>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoLabel}>Assessment</Text>
          <Text style={styles.infoText}>
            {isSafe
              ? "Your child's online activity shows no immediate concerns."
              : "Potential risks detected in recent messages. Review alerts immediately."}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 60,
    padding: 64,
    width: '100%',
    flex: 1,
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(16px)',
    elevation: 3,
  } as any,

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 64,
  },
  title: {
    fontSize: 96,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  status: {
    fontSize: 64,
    fontWeight: '600',
    marginTop: 12,
  },
  badge: {
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 32,
  },
  badgeText: {
    color: '#22D3EE',
    fontSize: 48,
    fontWeight: '600',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  svgContainer: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 96,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 64,
  },
  infoLabel: {
    fontSize: 64,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 16,
  },
  infoText: {
    fontSize: 56,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 72,
  },
});

export default DashboardCard;

