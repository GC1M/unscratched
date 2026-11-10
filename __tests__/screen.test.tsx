import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Row, RowTitle } from '@/components/Group';
import { Screen } from '@/components/Screen';

jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));

test('the content clears the floating action at its measured height, so a tall action never hides the last row', async () => {
  await render(
    <Screen floating={<Button label="Next" onPress={() => {}} />}>
      <Text>Last row</Text>
    </Screen>,
  );
  const padding = () => {
    let el = screen.getByText('Last row').parent;
    while (el && !el.props.contentContainerStyle) el = el.parent;
    return StyleSheet.flatten(el!.props.contentContainerStyle).paddingBottom;
  };
  expect(padding()).toBe(120);

  // e.g. a stacked two-line button at an accessibility text size
  await fireEvent(screen.getByRole('button', { name: 'Next' }).parent!, 'layout', { nativeEvent: { layout: { height: 200 } } });
  expect(padding()).toBe(200 + 28 + 40);
});

describe('Button trailing text', () => {
  const direction = () => StyleSheet.flatten(screen.getByText('Continue inspection').parent!.props.style).flexDirection;

  test('sits beside the label at default text sizes', async () => {
    mockFontScale = 1;
    await render(<Button label="Continue inspection" trailing="Hallway next" onPress={() => {}} />);
    expect(direction()).toBe('row');
  });

  test('stacks under the label at accessibility sizes instead of squeezing it to one letter per line', async () => {
    mockFontScale = 3.1;
    await render(<Button label="Continue inspection" trailing="Hallway next" onPress={() => {}} />);
    expect(direction()).toBe('column');
    expect(screen.getByText('Hallway next')).toBeOnTheScreen();
  });
});

describe('Row trailing accessory', () => {
  // The title's column: the nearest ancestor of the title that flexes to fill the row.
  const titleColumn = () => {
    let el = screen.getByText('Appliances').parent;
    while (el && StyleSheet.flatten(el.props.style)?.flex !== 1) el = el.parent;
    return el!;
  };
  const row = (
    <Row onPress={() => {}} trailing={<Text>3 of 5</Text>}>
      <RowTitle>Appliances</RowTitle>
    </Row>
  );

  test('sits beside the title at default text sizes', async () => {
    mockFontScale = 1;
    await render(row);
    expect(within(titleColumn()).queryByText('3 of 5')).toBeNull();
    expect(screen.getByText('3 of 5')).toBeOnTheScreen();
  });

  test('stacks under the title at accessibility sizes, so a long word is not broken mid-word', async () => {
    mockFontScale = 3.1;
    await render(row);
    expect(within(titleColumn()).getByText('3 of 5')).toBeOnTheScreen();
  });
});
