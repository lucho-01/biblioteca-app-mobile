import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { migrateDbIfNeeded } from '@/db/migrations';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { DataProvider } from '@/providers/data-provider';

// La pantalla de carga nativa permanece hasta saber si hay una sesión guardada.
SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);
  if (status === 'loading') return null;
  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Rutas protegidas (semana 10): el guard decide qué pantallas existen según la sesión.
          Al cerrar sesión se redirige solo; al iniciarla, se entra a (tabs). */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" options={{ headerShown: true, title: 'Crear cuenta' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="book/[id]"
          options={{ headerShown: true, title: 'Detalle del libro' }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      {/* Orden importa: la BD se migra primero; la sesión y los datos dependen de ella. */}
      <SQLiteProvider databaseName="library.db" onInit={migrateDbIfNeeded}>
        <AuthProvider>
          <DataProvider>
            <RootStack />
          </DataProvider>
        </AuthProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
