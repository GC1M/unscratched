import { render, screen } from '@testing-library/react-native';

import Home from '../app/index';

test('home screen renders the app name', async () => {
  await render(<Home />);
  expect(screen.getByText('Unscratched')).toBeOnTheScreen();
});
