import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Field } from '@/components/Field';
import { Group, Row, RowMeta, RowTitle, SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import {
  createGroup, currentUserId, groupPreview, joinGroup, listGroups, sendCode, signOut, supabase, verifyCode, type GroupPreview,
} from '@/expenses/api';
import type { GroupRow } from '@/expenses/types';
import { useT } from '@/i18n/context';
import { useTheme } from '@/theme';

/** Sign in with an emailed code, then list, create, or join shared-expense groups. */
export default function Expenses() {
  const { c } = useTheme();
  const { t } = useT();
  const [user, setUser] = useState<string | null | undefined>(undefined);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [groupName, setGroupName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [invite, setInvite] = useState('');
  const [myName, setMyName] = useState('');
  const [fetched, setFetched] = useState<GroupPreview | null>(null);
  const [picked, setPicked] = useState('new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const id = await currentUserId();
      setUser(id);
      if (id) setGroups(await listGroups());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // A full invite code shows the group's name and any spots added for people who have not joined yet.
  const fullCode = mode === 'join' && invite.trim().length === 8;
  useEffect(() => {
    if (!fullCode) return;
    let live = true;
    groupPreview(invite).then((p) => live && setFetched(p), () => live && setFetched(null));
    return () => {
      live = false;
    };
  }, [invite, fullCode]);
  const preview = fullCode && fetched ? fetched : null;
  const claim = preview?.placeholders.some((p) => p.user_id === picked) ? picked : 'new';
  const setClaim = setPicked;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(t('exp.failed'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const header = <Stack.Screen options={{ title: t('exp.title'), headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />;

  if (!supabase()) {
    return (
      <>
        {header}
        <Screen>
          <Problem title={t('exp.offTitle')} body={t('exp.offBody')} />
        </Screen>
      </>
    );
  }
  if (error) {
    return (
      <>
        {header}
        <Screen>
          <Problem title={t('exp.loadError')} body={error} onRetry={load} />
        </Screen>
      </>
    );
  }
  if (user === undefined) {
    return (
      <>
        {header}
        <Screen>
          <Loading />
        </Screen>
      </>
    );
  }

  if (user === null) {
    return (
      <>
        {header}
        <Screen>
          <Text style={[styles.intro, { color: c.ink60 }]}>{t('exp.signInIntro')}</Text>
          <SectionLabel>{t('exp.email')}</SectionLabel>
          <Field value={email} onChangeText={setEmail} accessibilityLabel={t('exp.email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          {codeSent && (
            <>
              <SectionLabel>{t('exp.code')}</SectionLabel>
              <Field value={code} onChangeText={setCode} accessibilityLabel={t('exp.code')} keyboardType="number-pad" autoComplete="one-time-code" />
            </>
          )}
          <Button
            label={t(codeSent ? 'exp.verify' : 'exp.sendCode')}
            disabled={!email.trim() || (codeSent && code.trim().length < 6)}
            busy={busy}
            style={styles.button}
            onPress={() =>
              run(async () => {
                if (!codeSent) {
                  await sendCode(email);
                  setCodeSent(true);
                } else {
                  await verifyCode(email, code);
                  await load();
                }
              })
            }
          />
          {codeSent && <Button label={t('exp.resend')} variant="tertiary" onPress={() => run(() => sendCode(email))} style={styles.small} />}
        </Screen>
      </>
    );
  }

  const submitGroup = () =>
    run(async () => {
      const g =
        mode === 'create'
          ? await createGroup(groupName, currency, myName)
          : await joinGroup(invite, myName, claim === 'new' ? null : claim);
      setMode('none');
      setGroupName('');
      setInvite('');
      router.push(`/expenses/${g.id}`);
    });
  const claiming = mode === 'join' && claim !== 'new';
  const formReady = (myName.trim() || claiming) && (mode === 'create' ? groupName.trim() && /^[A-Za-z]{3}$/.test(currency) : invite.trim().length >= 8);

  return (
    <>
      {header}
      <Screen>
        {groups === null ? (
          <Loading />
        ) : groups.length ? (
          <Group>
            {groups.map((g, i) => (
              <Row key={g.id} first={i === 0} onPress={() => router.push(`/expenses/${g.id}`)} a11y={g.name}>
                <RowTitle serif>{g.name}</RowTitle>
                <RowMeta>{g.currency}</RowMeta>
              </Row>
            ))}
          </Group>
        ) : (
          <Text style={[styles.intro, { color: c.ink60 }]}>{t('exp.noGroups')}</Text>
        )}

        {mode === 'none' ? (
          <>
            <Button label={t('exp.newGroup')} onPress={() => setMode('create')} style={styles.button} />
            <Button label={t('exp.joinGroup')} variant="secondary" onPress={() => setMode('join')} style={styles.small} />
          </>
        ) : (
          <>
            {mode === 'create' ? (
              <>
                <SectionLabel>{t('exp.groupName')}</SectionLabel>
                <Field value={groupName} onChangeText={setGroupName} accessibilityLabel={t('exp.groupName')} placeholder={t('exp.groupNameHint')} />
                <SectionLabel>{t('exp.currency')}</SectionLabel>
                <Field value={currency} onChangeText={(v) => setCurrency(v.toUpperCase())} accessibilityLabel={t('exp.currency')} autoCapitalize="characters" maxLength={3} />
              </>
            ) : (
              <>
                <SectionLabel>{t('exp.inviteCode')}</SectionLabel>
                <Field value={invite} onChangeText={(v) => setInvite(v.toUpperCase())} accessibilityLabel={t('exp.inviteCode')} autoCapitalize="characters" maxLength={8} />
                {preview && (
                  <>
                    <Text style={[styles.intro, styles.preview, { color: c.ink }]}>{t('exp.joining', { name: preview.name })}</Text>
                    {preview.placeholders.length > 0 && (
                      <>
                        <SectionLabel>{t('exp.whoAreYou')}</SectionLabel>
                        <Chips
                          options={[
                            ...preview.placeholders.map((p) => ({ value: p.user_id, label: p.display_name })),
                            { value: 'new', label: t('exp.someoneNew') },
                          ]}
                          selected={[claim]}
                          onToggle={setClaim}
                          a11y={t('exp.whoAreYou')}
                        />
                      </>
                    )}
                  </>
                )}
              </>
            )}
            <SectionLabel>{t('exp.yourName')}</SectionLabel>
            <Field value={myName} onChangeText={setMyName} accessibilityLabel={t('exp.yourName')} placeholder={claiming ? t('exp.keepName') : undefined} />
            <Button label={t(mode === 'create' ? 'exp.create' : 'exp.join')} disabled={!formReady} busy={busy} onPress={submitGroup} style={styles.button} />
            <Button label={t('common.cancel')} variant="tertiary" onPress={() => setMode('none')} style={styles.small} />
          </>
        )}
        <Button
          label={t('exp.signOut')}
          variant="tertiary"
          style={styles.button}
          onPress={() => run(async () => {
            await signOut();
            setGroups(null);
            setCodeSent(false);
            setCode('');
            await load();
          })}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 16, lineHeight: 22, marginHorizontal: 4, marginBottom: 8 },
  button: { marginTop: 32 },
  small: { marginTop: 10 },
  preview: { marginTop: 10 },
});
