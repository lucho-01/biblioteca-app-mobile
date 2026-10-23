import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/button';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { TextField } from '@/components/text-field';

describe('estados de pantalla (semana 9)', () => {
  it('ErrorView muestra el mensaje y permite reintentar', async () => {
    const onRetry = jest.fn();
    await render(<ErrorView message="No hay conexión con el servidor." onRetry={onRetry} />);
    expect(screen.getByText('No hay conexión con el servidor.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('ErrorView se anuncia como alerta para lectores de pantalla', async () => {
    await render(<ErrorView message="x" onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('LoadingView expone un indicador de progreso accesible', async () => {
    await render(<LoadingView message="Cargando catálogo…" />);
    expect(screen.getByLabelText('Cargando catálogo…')).toBeTruthy();
  });

  it('EmptyView muestra título y mensaje', async () => {
    await render(<EmptyView title="Sin resultados" message="Prueba con otro título." />);
    expect(screen.getByText('Sin resultados')).toBeTruthy();
    expect(screen.getByText('Prueba con otro título.')).toBeTruthy();
  });
});

describe('Button', () => {
  it('ejecuta onPress', async () => {
    const onPress = jest.fn();
    await render(<Button title="Solicitar préstamo" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Solicitar préstamo' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('no dispara onPress cuando está deshabilitado', async () => {
    const onPress = jest.fn();
    await render(<Button title="Sin ejemplares" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByText('Sin ejemplares'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('en estado de carga se bloquea y no dispara onPress (evita doble envío)', async () => {
    const onPress = jest.fn();
    await render(<Button title="Iniciar sesión" loading onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('asocia la etiqueta al campo y muestra el error', async () => {
    await render(
      <TextField
        label="Correo"
        error="Escribe un correo válido"
        value=""
        onChangeText={() => {}}
      />,
    );
    expect(screen.getByLabelText('Correo')).toBeTruthy();
    expect(screen.getByText('Escribe un correo válido')).toBeTruthy();
  });

  it('notifica los cambios de texto', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Correo" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Correo'), 'ana@correo.co');
    expect(onChangeText).toHaveBeenCalledWith('ana@correo.co');
  });
});
