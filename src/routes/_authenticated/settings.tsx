import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, Container, PageHeading } from "@/components/app/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteMyAccount,
  exportMyData,
  getCalendarSource,
  getMyProfile,
  getNotificationPrefs,
  saveCalendarSource,
  saveNotificationPrefs,
  syncCalendarNow,
  type NotificationPrefs,
  type SyncResult,
} from "@/lib/crunch.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Crunch" },
      {
        name: "description",
        content:
          "Update your Brightspace calendar feed, choose when Crunch nudges you, manage your account details and sign out.",
      },
      { property: "og:title", content: "Settings — Crunch" },
      {
        property: "og:description",
        content: "Calendar feed, notification preferences and account details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => {
    const [source, profile, prefs] = await Promise.all([
      getCalendarSource(),
      getMyProfile(),
      getNotificationPrefs(),
    ]);
    return { source, profile, prefs };
  },
  component: SettingsPage,
});

const notifications: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  {
    key: "heavyWeek",
    label: "Heavy week ahead",
    hint: "A nudge on Sunday when the coming week scores Heavy or Brutal.",
  },
  {
    key: "conflict",
    label: "Same-day clash detected",
    hint: "Told as soon as a new sync creates a high-stakes clash.",
  },
  {
    key: "logHours",
    label: "Log your hours",
    hint: "A reminder to log actual hours after a deadline passes.",
  },
];

function formatSynced(iso: string | null | undefined) {
  if (!iso) return "Not synced yet.";
  return `Last synced ${new Date(iso).toLocaleString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}.`;
}

function retryLabel(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)} min`;
}

/** Turns a real SyncResult into the toast copy for it — shared by "Save feed" and "Sync now". */
function toastSyncResult(result: SyncResult | { status: "no_source" }) {
  switch (result.status) {
    case "ok":
      toast.success(
        `Synced — ${result.coursesTouched} course${result.coursesTouched === 1 ? "" : "s"}, ${result.eventsUpserted} item${result.eventsUpserted === 1 ? "" : "s"}.`,
      );
      return;
    case "invalid_url":
      toast.error("That doesn't look like a valid Brightspace feed.");
      return;
    case "unreachable":
      toast.error("Couldn't reach that feed just now. We'll retry it tonight.");
      return;
    case "empty":
      toast.warning("Saved, but no due dates have come through yet.");
      return;
    case "cooldown":
      toast.info(`Synced a moment ago. Try again in ${retryLabel(result.retryInSeconds)}.`);
      return;
    case "no_source":
      toast.error("Add a calendar feed first.");
      return;
  }
}

function SettingsPage() {
  const { source, profile, prefs: loadedPrefs } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveCalendarSource);
  const syncNow = useServerFn(syncCalendarNow);
  const savePrefs = useServerFn(saveNotificationPrefs);
  const [url, setUrl] = useState(source?.icsUrl ?? "");
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadedPrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const exportData = useServerFn(exportMyData);
  const deleteAccount = useServerFn(deleteMyAccount);
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function onExport() {
    setExporting(true);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `crunch-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      toast.error("We couldn't prepare your data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await deleteAccount({ data: { confirm: "DELETE" } });
      await supabase.auth.signOut();
      toast.success("Your account and all its data have been deleted.");
      await router.navigate({ to: "/" });
    } catch {
      toast.error("We couldn't delete your account. Please try again or contact us.");
      setDeleting(false);
    }
  }

  async function togglePref(key: keyof NotificationPrefs, value: boolean) {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await savePrefs({ data: next });
    } catch {
      setPrefs(previous);
      toast.error("We couldn't save that preference. Please try again.");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      // saveCalendarSource syncs synchronously before returning — a real
      // result, not an inferred one. See docs/adr/0001-sync-pipeline.md.
      const result = await save({ data: { icsUrl: url.trim() } });
      toastSyncResult(result);
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error && /Brightspace/i.test(error.message)
          ? "That doesn't look like a Brightspace feed URL."
          : "We couldn't save that feed. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSyncNow() {
    setSyncing(true);
    try {
      const result = await syncNow();
      toastSyncResult(result);
      await router.invalidate();
    } catch {
      toast.error("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    await router.navigate({ to: "/" });
  }

  return (
    <AppShell>
      <PageHeading
        eyebrow="Account"
        title="Settings"
        subtitle="Your calendar feed URL is stored against your account only and is never shared with anyone, including your lecturers."
      />

      <Container className="flex max-w-2xl flex-col gap-5">
        <section className="surface-card animate-rise rounded-2xl p-6">
          <h2 className="font-display text-lg font-semibold">Calendar feed</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formatSynced(source?.lastSyncedAt)}</p>
          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="feed">Brightspace subscription URL</Label>
            <Input
              id="feed"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mystudies.iie.edu.za/d2l/le/calendar/feed/…"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="rounded-full" onClick={onSave} disabled={saving || !url.trim()}>
              {saving ? "Saving…" : "Save feed"}
            </Button>
            {source ? (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={onSyncNow}
                disabled={syncing || saving}
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            ) : null}
          </div>
        </section>

        <section className="surface-card animate-rise rounded-2xl p-6">
          <h2 className="font-display text-lg font-semibold">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Coming soon. Your choices are saved now, but Crunch doesn&apos;t send notifications yet
            during the pilot.
          </p>
          <div className="mt-4 divide-y divide-border/70">
            {notifications.map((n) => (
              <div key={n.key} className="flex items-start justify-between gap-6 py-4">
                <div>
                  <p className="text-sm font-medium">{n.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{n.hint}</p>
                </div>
                <Switch
                  checked={prefs[n.key]}
                  disabled={savingPrefs}
                  onCheckedChange={(value) => void togglePref(n.key, value)}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card animate-rise rounded-2xl p-6">
          <h2 className="font-display text-lg font-semibold">Account</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">School email</Label>
              <Input id="email" value={profile?.email ?? ""} disabled />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="role">Role</Label>
              <Input
                id="role"
                value={profile?.role === "lecturer" ? "Lecturer" : "Student"}
                disabled
              />
            </div>
            {profile?.school ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="school">School or faculty</Label>
                <Input id="school" value={profile.school} disabled />
              </div>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </section>

        <section className="surface-card animate-rise rounded-2xl p-6">
          <h2 className="font-display text-lg font-semibold">Your data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Download a copy of everything Crunch holds about you, or delete your account. Deleting
            removes your profile, calendar link, courses, deadlines, logged hours and week scores
            straight away, and can't be undone.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={onExport}
              disabled={exporting}
            >
              <Download className="h-4 w-4" />
              {exporting ? "Preparing…" : "Download my data"}
            </Button>
            <AlertDialog onOpenChange={(open) => !open && setConfirmText("")}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="rounded-full text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your Crunch account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes your account and all of its data. Download your data
                    first if you want a copy. Type DELETE to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  aria-label="Type DELETE to confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={confirmText !== "DELETE" || deleting}
                    onClick={(e) => {
                      e.preventDefault();
                      void onDelete();
                    }}
                  >
                    {deleting ? "Deleting…" : "Delete permanently"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>
      </Container>
    </AppShell>
  );
}
