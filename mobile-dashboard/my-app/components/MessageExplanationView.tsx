import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getMessageExplanation, type MessageExplanation } from '../services/alertsService';

interface MessageExplanationViewProps {
  incidentId: string;
  parentEmail?: string;
}

export const MessageExplanationView: React.FC<MessageExplanationViewProps> = ({ incidentId, parentEmail }) => {
  const [explanation, setExplanation] = useState<MessageExplanation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    getMessageExplanation(incidentId, parentEmail).then(res => {
      if (isMounted) {
        setExplanation(res);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [incidentId, parentEmail]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#2F80ED" />
        <Text style={styles.loadingText}>Loading Message SHAP Explanation...</Text>
      </View>
    );
  }

  if (!explanation || explanation.status !== 'computed') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Model Explanation (Message SHAP)</Text>
        <Text style={styles.unavailableText}>
          Explanation unavailable{explanation?.reason ? ` (${explanation.reason})` : ''}.
        </Text>
      </View>
    );
  }

  const sortedTokens = [...explanation.tokens].sort((a, b) => a.index - b.index);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Model Explanation (Message SHAP)</Text>
      <Text style={styles.disclaimer}>{explanation.message}</Text>

      <View style={styles.chipsContainer}>
        {sortedTokens.map(tok => {
          const val = tok.gate;
          const absVal = Math.abs(val);
          const maxAbs = Math.max(...sortedTokens.map(t => Math.abs(t.gate)), 0.1);
          const intensity = Math.min(absVal / maxAbs, 1.0);

          // Red/pink for pushing towards bullying (>0), blue/green for pushing away (<0)
          const bgColor = val >= 0
            ? `rgba(239, 68, 68, ${0.15 + intensity * 0.55})`
            : `rgba(59, 130, 246, ${0.15 + intensity * 0.55})`;
          const textColor = val >= 0 ? '#991B1B' : '#1E40AF';

          return (
            <View key={tok.index} style={[styles.chip, { backgroundColor: bgColor }]}>
              <Text style={[styles.tokenText, { color: textColor }]}>{tok.token}</Text>
              <Text style={[styles.scoreText, { color: textColor }]}>
                {val > 0 ? `+${val.toFixed(3)}` : val.toFixed(3)}
              </Text>
            </View>
          );
        })}
      </View>

      {explanation.gate && Math.abs(explanation.gate.omitted_contribution) > 0.0001 && (
        <Text style={styles.omittedText}>
          Other omitted/unstored words contribution: {explanation.gate.omitted_contribution.toFixed(3)}
        </Text>
      )}

      {explanation.category && (
        <Text style={styles.categoryText}>
          Category Head ({explanation.category.name}): base {explanation.category.base_value.toFixed(2)}, model output {explanation.category.model_output.toFixed(2)}
        </Text>
      )}

      <Text style={styles.metaText}>
        Method: {explanation.method} ({explanation.exact ? 'Exact' : 'Sampled'}) • Tokens as read by model
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    padding: 14,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  disclaimer: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 10,
    lineHeight: 15,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  tokenText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scoreText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  omittedText: {
    fontSize: 11,
    color: '#475569',
    marginBottom: 6,
    fontStyle: 'italic',
  },
  categoryText: {
    fontSize: 11,
    color: '#334155',
    marginBottom: 6,
    fontWeight: '600',
  },
  metaText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  unavailableText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 4,
  },
});
