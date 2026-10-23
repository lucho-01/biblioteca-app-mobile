import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from './button';
import { ThemedText } from './themed-text';

/** Los estados de una pantalla que consume datos (semana 9): cargando, vacío y error con reintento. */
export function LoadingView({ message = 'Cargando…' }: { message?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator size="large" color={theme.primary} />
      <ThemedText themeColor="textSecondary">{message}</ThemedText>
    </View>
  );
}

export function EmptyView({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.center}>
      <ThemedText type="subtitle" style={styles.centerText}>
        {title}
      </ThemedText>
      {message ? (
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      {/* Solo el texto se agrupa como alerta; el botón queda aparte para que siga siendo enfocable. */}
      <View accessible accessibilityRole="alert" style={styles.alert}>
        <ThemedText type="subtitle" style={[styles.centerText, { color: theme.danger }]}>
          No pudimos cargar los datos
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          {message}
        </ThemedText>
      </View>
      <Button title="Reintentar" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centerText: { textAlign: 'center' },
  alert: { gap: Spacing.three, alignItems: 'center' },
});
