import { Platform } from 'react-native';

/** Paleta clara y oscura. Los componentes la leen con el hook useTheme(). */
export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: '#2563EB',
    onPrimary: '#FFFFFF',
    border: '#D4D6DC',
    danger: '#B42318',
    success: '#067647',
    warning: '#B54708',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    primary: '#60A5FA',
    onPrimary: '#0B1220',
    border: '#3A3D44',
    danger: '#F97066',
    success: '#47CD89',
    warning: '#FDB022',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Escala de espaciado (múltiplos de 4 px). */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Espacio inferior para que el contenido no quede tapado por la barra de pestañas. */
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

/** Ancho máximo del contenido en pantallas grandes (tabletas). */
export const MaxContentWidth = 800;
