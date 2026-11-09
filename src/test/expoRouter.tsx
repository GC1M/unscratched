import { useEffect, type ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

/** Test double for expo-router: Stack.Screen and Stack.Toolbar render their children, Toolbar.Button is a Pressable. */
export function mockExpoRouter(extra: Record<string, unknown> = {}) {
  function Screen({ children }: { children?: ReactNode }) {
    return <>{children}</>;
  }
  function Toolbar({ children }: { children?: ReactNode }) {
    return <>{children}</>;
  }
  Toolbar.Button = function ToolbarButton({
    children,
    accessibilityLabel,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
  }) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? String(children)} onPress={onPress}>
        {typeof children === 'string' && <Text>{children}</Text>}
      </Pressable>
    );
  };
  return {
    Stack: { Screen, Toolbar },
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    ...extra,
  };
}
