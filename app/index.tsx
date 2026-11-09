import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unscratched</Text>
      <Text style={styles.tagline}>Document your rental&apos;s condition at move-in and move-out.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: '700' },
  tagline: { marginTop: 8, fontSize: 16, textAlign: 'center' },
});
