import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
}

const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  style,
  textStyle,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
}) => {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isOutline = variant === 'outline';
  const isDanger = variant === 'danger';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.button,
        isPrimary && styles.primaryButton,
        isSecondary && styles.secondaryButton,
        isOutline && styles.outlineButton,
        isDanger && styles.dangerButton,
        disabled && styles.disabledButton,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? '#2F80ED' : '#fff'} size="small" />
      ) : (
        <View style={styles.content}>
          {icon && (
            <MaterialIcons
              name={icon}
              size={64}
              color={isOutline ? '#22D3EE' : '#fff'}
              style={styles.icon}
            />
          )}
          <Text
            style={[
              styles.text,
              isOutline && styles.outlineText,
              disabled && styles.disabledText,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 160,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 64,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#2F80ED',
  },
  secondaryButton: {
    backgroundColor: '#F5F7FA',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  } as any,
  dangerButton: {
    backgroundColor: '#F43F5E',
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  } as any,
  text: {
    color: '#fff',
    fontSize: 64,
    fontWeight: '600',
    letterSpacing: 2,
  },
  outlineText: {
    color: '#22D3EE',
  },
  disabledText: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  icon: {
    marginRight: 24,
  },
});

export default PrimaryButton;
