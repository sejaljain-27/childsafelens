// This service will later connect to backend/AI for real alerts
import type { AlertType } from '../components/AlertCard';

export const fetchAlerts = async (): Promise<AlertType[]> => {
  // Simulate API call
  return [
    {
      id: '1',
      message: 'Potential cyberbullying detected in chat.',
      risk: 'High',
      timestamp: '2026-03-21 10:15',
    },
    {
      id: '2',
      message: 'Suspicious link shared.',
      risk: 'Medium',
      timestamp: '2026-03-20 18:42',
    },
  ];
};
