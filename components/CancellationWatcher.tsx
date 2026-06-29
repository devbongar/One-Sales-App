'use client';

import { useEffect } from 'react';
import { cancelExpiredReservations } from '@/lib/cancellation';

export default function CancellationWatcher() {
  useEffect(() => {
    cancelExpiredReservations().catch(console.error);
  }, []);
  return null;
}
