import { Notice, Setting, type App } from "obsidian";
import { testMemgraphConnection } from "../../sync/memgraph/connectionTest";
import { syncVaultToMemgraph } from "../../sync/memgraph/memgraphSync";
import { flushPendingMemgraphRelations } from "../../sync/memgraph/pendingRelationsQueue";
import type { TranslationKeys } from "../../i18n";
import type { SettingsHost } from "../types";

async function flushPendingRelationsQuietly(host: SettingsHost): Promise<void> {
  if (!host.settings.autoSyncMemgraph || host.settings.pendingMemgraphRelations.length === 0) return;
  try {
    const count = await flushPendingMemgraphRelations(host.settings, () => host.saveSettings());
    if (count > 0) new Notice(`✅ ${count} ausstehende Beziehung(en) nachsynchronisiert.`);
  } catch {
    // still unreachable - stays queued
  }
}

export function renderMemgraphSection(containerEl: HTMLElement, app: App, host: SettingsHost, t: TranslationKeys): void {
  const { settings } = host;
  containerEl.createEl("h3", { text: t.secMemgraph });

  new Setting(containerEl)
    .setName(t.memgraphUrlName)
    .setDesc(t.memgraphUrlDesc)
    .addText((text) =>
      text
        .setPlaceholder("bolt://localhost:7687")
        .setValue(settings.memgraphUrl || "bolt://localhost:7687")
        .onChange(async (value) => {
          settings.memgraphUrl = value.trim();
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.memgraphUserName)
    .setDesc(t.memgraphUserDesc)
    .addText((text) =>
      text
        .setPlaceholder("Benutzername...")
        .setValue(settings.memgraphUser || "")
        .onChange(async (value) => {
          settings.memgraphUser = value.trim();
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.memgraphPassName)
    .setDesc(`${t.memgraphPassDesc} ⚠️ Wird unverschlüsselt in data.json gespeichert (siehe CONFIGURATION.md).`)
    .addText((text) =>
      text
        .setPlaceholder("Passwort...")
        .setValue(settings.memgraphPassword || "")
        .onChange(async (value) => {
          settings.memgraphPassword = value.trim();
          await host.saveSettings();
        })
    );

  new Setting(containerEl)
    .setName(t.memgraphAutoSyncName)
    .setDesc(t.memgraphAutoSyncDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.autoSyncMemgraph || false).onChange(async (value) => {
        settings.autoSyncMemgraph = value;
        await host.saveSettings();
      })
    );

  new Setting(containerEl)
    .setName("Gesamten Vault-Graphen in Memgraph indizieren")
    .setDesc("Extrahiert alle Notiz-Knoten und WikiLink-Kanten im Vault und lädt den Wissensgraphen via Bolt in Memgraph.")
    .addButton((btn) =>
      btn
        .setButtonText("Jetzt Vault-Graph in Memgraph synchronisieren")
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Synchronisiere Graph...");
          btn.setDisabled(true);
          try {
            new Notice("🚀 Starte Memgraph-Graph-Synchronisation...");
            const result = await syncVaultToMemgraph(app, settings);
            btn.setButtonText("✅ Synchronisiert!");
            new Notice(`✅ Vault-Graph (${result.nodeCount} Knoten, ${result.edgeCount} Kanten) erfolgreich in Memgraph importiert!`);
            await flushPendingRelationsQuietly(host);
          } catch (err) {
            btn.setButtonText("❌ Fehlgeschlagen");
            new Notice(`❌ Memgraph Sync-Fehler: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setTimeout(() => {
              btn.setButtonText("Jetzt Vault-Graph in Memgraph synchronisieren");
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );

  new Setting(containerEl)
    .setName("Memgraph-Verbindung testen")
    .setDesc("Führt einen echten Bolt-Handshake gegen die Memgraph-Instanz aus.")
    .addButton((btn) =>
      btn
        .setButtonText("Memgraph Verbindung testen")
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Testen...");
          btn.setDisabled(true);
          try {
            await testMemgraphConnection(settings);
            btn.setButtonText("✅ Erfolgreich!");
            new Notice("✅ Memgraph-Server ist über Bolt erreichbar!");
            await flushPendingRelationsQuietly(host);
          } catch (err) {
            btn.setButtonText("❌ Fehlgeschlagen");
            new Notice(`❌ Memgraph-Verbindung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setTimeout(() => {
              btn.setButtonText("Memgraph Verbindung testen");
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );
}
