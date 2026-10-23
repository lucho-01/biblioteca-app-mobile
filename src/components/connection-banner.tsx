import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/text';
import { useData } from '@/providers/data-provider';

import { ThemedText } from './themed-text';

/**
 * Informa el estado de conectividad y de la cola sin bloquear la pantalla:
 * sin conexión → se muestran datos guardados; con cambios pendientes → se avisa cuántos.
 */
export function ConnectionBanner() {
  const theme = useTheme();
  const { online, syncing, lastError, pendingCount, lastSyncAt, syncNow } = useData();
  let message: string | null = null;
  let color: string = theme.warning;
  if (!online) {
    message = `Sin conexión · Mostrando datos guardados (última sincronización: ${formatDateTime(lastSyncAt)})`;
  } else if (lastError) {
    message = `${lastError} Toca para reintentar.`;
    color = theme.danger;
  } else if (pendingCount > 0) {
    const many = pendingCount !== 1;
    const label = `${pendingCount} solicitud${many ? 'es' : ''} pendiente${many ? 's' : ''}`;
    message = `${label} de enviar${syncing ? '…' : ''}`;
  }
  if (!message) return null;
  return (
    <Pressable
      onPress={() => void syncNow()}
      accessibilityRole="button"
      accessibilityLabel={message}
      style={[styles.banner, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" style={styles.text}>
        {message}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1 },
});
