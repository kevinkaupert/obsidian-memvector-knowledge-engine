import { Notice, SecretComponent, Setting, type App } from "obsidian";
import { flushPendingMemgraphRelations } from "../../sync/memgraph/pendingRelationsQueue";
import { getGraphStore } from "../../sync/storeFactory";
import { syncVaultGraph } from "../../sync/vaultGraphSync";
import type { TranslationKeys } from "../../i18n";
import { getMemgraphPassword, setMemgraphPassword } from "../secrets";
import type { SettingsHost } from "../types";

async function flushPendingRelationsQuietly(app: App, host: SettingsHost): Promise<void> {
  if (!host.settings.autoSyncGraph || host.settings.pendingMemgraphRelations.length === 0) return;
  try {
    const count = await flushPendingMemgraphRelations(app, host.settings, () => host.saveSettings());
    if (count > 0) new Notice(`✅ ${count} ausstehende Beziehung(en) nachsynchronisiert.`);
  } catch {
    // still unreachable - stays queued
  }
}

export function renderMemgraphSection(containerEl: HTMLElement, app: App, host: SettingsHost, t: TranslationKeys, rerender: () => void): void {
  const { settings } = host;
  containerEl.createEl("h3", { text: t.secMemgraph });
  const isLocal = settings.graphBackend === "sqlite";

  new Setting(containerEl)
    .setName(t.graphBackendName)
    .setDesc(t.graphBackendDesc)
    .addDropdown((dropdown) =>
      dropdown
        .addOption("memgraph", t.graphBackendMemgraph)
        .addOption("sqlite", t.graphBackendSqlite)
        .setValue(settings.graphBackend)
        .onChange(async (value) => {
          settings.graphBackend = value as "memgraph" | "sqlite";
          await host.saveSettings();
          rerender();
        })
    );

  if (isLocal) {
    containerEl.createEl("p", { text: t.graphBackendLocalInfo, cls: "setting-item-description" });
  } else {
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

    const memgraphPassSetting = new Setting(containerEl).setName(t.memgraphPassName).setDesc(t.memgraphPassDesc);
    new SecretComponent(app, memgraphPassSetting.controlEl).setValue(getMemgraphPassword(app)).onChange((value) => setMemgraphPassword(app, value.trim()));
  }

  new Setting(containerEl)
    .setName(t.memgraphAutoSyncName)
    .setDesc(t.memgraphAutoSyncDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.autoSyncGraph || false).onChange(async (value) => {
        settings.autoSyncGraph = value;
        await host.saveSettings();
      })
    );

  const syncButtonText = isLocal ? "Jetzt Vault-Graph lokal indizieren" : "Jetzt Vault-Graph in Memgraph synchronisieren";
  new Setting(containerEl)
    .setName("Gesamten Vault-Graphen indizieren")
    .setDesc("Extrahiert alle Notiz-Knoten und WikiLink-Kanten im Vault und lädt den Wissensgraphen in die gewählte Graph-Datenbank.")
    .addButton((btn) =>
      btn
        .setButtonText(syncButtonText)
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Synchronisiere Graph...");
          btn.setDisabled(true);
          try {
            new Notice("🚀 Starte Graph-Synchronisation...");
            const result = await syncVaultGraph(app, getGraphStore(app, settings));
            btn.setButtonText("✅ Synchronisiert!");
            new Notice(`✅ Vault-Graph (${result.nodeCount} Knoten, ${result.edgeCount} Kanten) erfolgreich importiert!`);
            await flushPendingRelationsQuietly(app, host);
          } catch (err) {
            btn.setButtonText("❌ Fehlgeschlagen");
            new Notice(`❌ Graph Sync-Fehler: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setTimeout(() => {
              btn.setButtonText(syncButtonText);
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );

  const testButtonText = isLocal ? "Lokale Graph-Datenbank testen" : "Memgraph Verbindung testen";
  new Setting(containerEl)
    .setName(testButtonText)
    .setDesc(isLocal ? "Prüft, ob die lokale SQLite-Datei geöffnet werden kann." : "Führt einen echten Bolt-Handshake gegen die Memgraph-Instanz aus.")
    .addButton((btn) =>
      btn
        .setButtonText(testButtonText)
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Testen...");
          btn.setDisabled(true);
          try {
            await getGraphStore(app, settings).testConnection();
            btn.setButtonText("✅ Erfolgreich!");
            new Notice(isLocal ? "✅ Lokale Graph-Datenbank ist verfügbar!" : "✅ Memgraph-Server ist über Bolt erreichbar!");
            await flushPendingRelationsQuietly(app, host);
          } catch (err) {
            btn.setButtonText("❌ Fehlgeschlagen");
            new Notice(`❌ Verbindung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setTimeout(() => {
              btn.setButtonText(testButtonText);
              btn.setDisabled(false);
            }, 3000);
          }
        })
    );
}
