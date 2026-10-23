import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { availabilityLabel, BookCover } from '@/components/book-views';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { EmptyView, LoadingView } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useBook, useMyLoanForBook } from '@/hooks/use-library-data';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';
import { api } from '@/services/api';
import { describeError } from '@/services/api/client';
import {
  ImageTooLargeError,
  pickCover,
  PermissionDeniedError,
  uploadCover,
  type CoverSource,
} from '@/services/device/cover-service';
import { LoanRuleError } from '@/services/loans/loan-service';

export default function BookDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { repos, online, requestLoan, notifyChanged } = useData();
  const { book, loaded } = useBook(id);
  const myLoan = useMyLoanForBook(id);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  if (!loaded) return <LoadingView />;
  if (!book)
    return <EmptyView title="Libro no encontrado" message="Puede que ya no esté en el catálogo." />;

  const librarian = user?.role === 'librarian';
  const hasActive =
    myLoan &&
    myLoan.syncState !== 'conflict' &&
    (myLoan.status === 'requested' || myLoan.status === 'approved');

  async function onRequest() {
    if (!book) return;
    setBusy(true);
    setFeedback(null);
    try {
      await requestLoan(book);
      setFeedback({
        error: false,
        text: online
          ? 'Solicitud registrada. Se está enviando al servidor.'
          : 'Sin conexión: tu solicitud quedó guardada y se enviará automáticamente cuando vuelva internet.',
      });
    } catch (err) {
      setFeedback({
        error: true,
        text: err instanceof LoanRuleError ? err.message : describeError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function onChangeCover(source: CoverSource) {
    if (!book) return;
    if (!online) {
      setFeedback({ error: true, text: 'Necesitas conexión para subir la portada.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const cover = await pickCover(source, repos.activity);
      if (!cover) return; // el usuario canceló
      const updated = await uploadCover(api, repos.activity, book.id, cover);
      await repos.books.upsertMany([updated]);
      notifyChanged();
      setFeedback({ error: false, text: 'Portada actualizada.' });
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        // Si el sistema ya no vuelve a preguntar, la única salida es Ajustes.
        Alert.alert(
          'Permiso de cámara necesario',
          'Para tomar la foto de la portada, permite el acceso a la cámara. ' +
            'También puedes elegir una imagen de la galería.',
          err.canAskAgain
            ? [{ text: 'Entendido' }]
            : [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
              ],
        );
      } else if (err instanceof ImageTooLargeError) {
        setFeedback({ error: true, text: 'La imagen es demasiado grande. Prueba con otra.' });
      } else {
        setFeedback({ error: true, text: describeError(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.cover}>
          <BookCover book={book} width={160} height={220} />
        </View>
        <ThemedText type="subtitle" accessibilityRole="header">
          {book.title}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{book.author}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {book.category} · {book.year}
        </ThemedText>
        <ThemedText
          type="smallBold"
          style={{ color: book.availableCopies > 0 ? theme.success : theme.danger }}>
          {availabilityLabel(book)}
        </ThemedText>
        <ThemedText style={styles.description}>{book.description}</ThemedText>
        {!librarian ? (
          <View style={styles.actions}>
            {myLoan && myLoan.syncState === 'pending' ? (
              <ThemedText type="smallBold" style={{ color: theme.warning }}>
                Solicitud guardada · pendiente de envío
              </ThemedText>
            ) : null}
            {myLoan && myLoan.syncState === 'conflict' ? (
              <ThemedText
                type="smallBold"
                style={{ color: theme.danger }}
                accessibilityRole="alert">
                Tu última solicitud no se pudo procesar: {myLoan.syncError}
              </ThemedText>
            ) : null}
            {myLoan?.syncState === 'synced' && myLoan.status === 'requested' ? (
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Solicitud enviada · esperando al bibliotecario
              </ThemedText>
            ) : null}
            {myLoan?.syncState === 'synced' && myLoan.status === 'approved' ? (
              <ThemedText type="smallBold" style={{ color: theme.success }}>
                Tienes este libro prestado
              </ThemedText>
            ) : null}
            <Button
              title={book.availableCopies > 0 ? 'Solicitar préstamo' : 'Sin ejemplares disponibles'}
              disabled={book.availableCopies <= 0 || !!hasActive}
              loading={busy}
              onPress={onRequest}
              accessibilityHint="Envía una solicitud de préstamo al bibliotecario"
            />
          </View>
        ) : (
          <View style={styles.actions}>
            <ThemedText type="smallBold">Portada del libro</ThemedText>
            <Button title="Tomar foto" disabled={busy} onPress={() => onChangeCover('camera')} />
            <Button
              title="Elegir de la galería"
              variant="secondary"
              disabled={busy}
              onPress={() => onChangeCover('library')}
            />
          </View>
        )}
        {feedback ? (
          <ThemedText
            accessibilityLiveRegion="polite"
            accessibilityRole={feedback.error ? 'alert' : undefined}
            style={{ color: feedback.error ? theme.danger : theme.success }}>
            {feedback.text}
          </ThemedText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two, paddingVertical: Spacing.three },
  cover: { alignItems: 'center', paddingBottom: Spacing.two },
  description: { marginTop: Spacing.two, lineHeight: 24 },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
