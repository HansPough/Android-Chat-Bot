import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth-context';

// The app's entry route. Without this file the launch path "/" matches no screen and
// expo-router briefly shows an "Unmatched Route" error before app/_layout.tsx redirects.
// Deciding here means the first frame is already the right screen.
export default function Index() {
  const { token, loading } = useAuth();

  // Still reading the saved session: render nothing, the splash screen is still up.
  if (loading) return null;

  return <Redirect href={token ? '/(tabs)/chat' : '/(auth)/login'} />;
}
