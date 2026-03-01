import { showEncounterDialog } from "./encounter-dialog.js";

const MODULE_ID = "daggerheart-foundry-importer";
const TOKEN_GENERATOR_URL = "http://localhost:8000";

export class DaggerheartImporterAPI {
  authToken = null;
  #compendiumIndex = null;

  get version() {
    return "0.1.0";
  }

  async importAdversary(actorData, meta) {
    const actor = await this.#importOrResolve(actorData, meta);
    ui.notifications.info(`Imported: ${actor.name}`);
    return { success: true, actorId: actor.id, name: actor.name };
  }

  async importAdversaries(actorArray, meta) {
    if (!Array.isArray(actorArray) || actorArray.length === 0) {
      return { success: false, error: "Expected non-empty array" };
    }

    const results = [];
    for (const data of actorArray) {
      try {
        const actor = await this.#importOrResolve(data, meta);
        results.push({ actorId: actor.id, name: actor.name });
      } catch (err) {
        results.push({ name: data.name || "unknown", error: err.message });
      }
    }

    const succeeded = results.filter(r => r.actorId).length;
    const failed = results.length - succeeded;
    if (failed === 0) {
      ui.notifications.info(`Imported ${succeeded} adversaries.`);
    } else {
      ui.notifications.warn(`Imported ${succeeded}/${results.length} adversaries. ${failed} failed.`);
    }

    return { success: failed === 0, results };
  }

  async importEncounter(encounterData, meta) {
    const { adversaries, encounterName } = encounterData || {};
    if (!Array.isArray(adversaries) || adversaries.length === 0) {
      return { success: false, error: "Expected non-empty adversaries array" };
    }

    const options = await showEncounterDialog(adversaries, encounterName || "");
    if (!options) return { success: false, error: "Cancelled by user" };

    const createdActors = [];
    const actorsWithCount = [];

    for (const { actor: actorData, count } of adversaries) {
      try {
        const actor = await this.#importOrResolve(actorData, meta);
        createdActors.push({ actorId: actor.id, name: actor.name });
        actorsWithCount.push({ actor, count: count || 1 });
      } catch (err) {
        createdActors.push({ name: actorData.name || "unknown", error: err.message });
      }
    }

    const succeeded = createdActors.filter(r => r.actorId).length;
    const failed = createdActors.length - succeeded;

    if (succeeded === 0) {
      ui.notifications.error("All adversaries failed to import.");
      return { success: false, results: createdActors };
    }

    if (options.placeTokens && canvas.scene) {
      const { FormationPlacer } = await import("./formation-placer.js");
      const placer = new FormationPlacer();
      await placer.startPlacement(actorsWithCount, {
        createEncounter: options.createEncounter,
        encounterName: options.encounterName
      });
    } else if (options.createEncounter) {
      await this.#createCombatEncounter(actorsWithCount, options.encounterName);
    }

    if (failed === 0) {
      ui.notifications.info(`Imported ${succeeded} adversaries.`);
    } else {
      ui.notifications.warn(`Imported ${succeeded}/${createdActors.length} adversaries. ${failed} failed.`);
    }

    return { success: failed === 0, results: createdActors };
  }

  async #createCombatEncounter(actorsWithCount, encounterName) {
    const counts = {};
    const combatantEntries = [];
    for (const { actor, count } of actorsWithCount) {
      counts[actor.name] = (counts[actor.name] || 0) + count;
      for (let i = 0; i < count; i++) {
        combatantEntries.push({ actorId: actor.id, hidden: false });
      }
    }

    const name = encounterName || "Encounter: " + Object.entries(counts)
      .map(([n, c]) => c > 1 ? `${c} ${n}s` : n)
      .join(", ");

    const combat = await Combat.create({ active: false, name });
    await combat.createEmbeddedDocuments("Combatant", combatantEntries);
    ui.notifications.info(`Encounter "${name}" created with ${combatantEntries.length} combatants.`);
  }

  async #getCompendiumIndex() {
    if (this.#compendiumIndex) return this.#compendiumIndex;
    const pack = game.packs.get("daggerheart.adversaries");
    if (!pack) {
      console.warn("[DH-Importer] Compendium daggerheart.adversaries not found");
      this.#compendiumIndex = new Map();
      return this.#compendiumIndex;
    }
    const index = await pack.getIndex();
    this.#compendiumIndex = new Map();
    for (const entry of index) {
      this.#compendiumIndex.set(entry.name.toLowerCase(), entry._id);
    }
    return this.#compendiumIndex;
  }

  async #importFromCompendium(cleaned) {
    const index = await this.#getCompendiumIndex();
    const docId = index.get(cleaned.name.toLowerCase());
    if (!docId) return null;
    const pack = game.packs.get("daggerheart.adversaries");
    if (!pack) return null;
    try {
      const doc = await pack.getDocument(docId);
      if (!doc) return null;
      const data = game.actors.fromCompendium(doc, { keepId: false });
      if (cleaned.flags?.["daggerheart-foundry-importer"]) {
        data.flags = data.flags || {};
        data.flags["daggerheart-foundry-importer"] = {
          ...cleaned.flags["daggerheart-foundry-importer"],
          compendiumSource: true
        };
      }
      if (data.prototypeToken?.texture?.src?.includes("*")) {
        data.prototypeToken.randomImg = true;
      }
      return this.#createOrUpdate(data);
    } catch (err) {
      console.warn(`[DH-Importer] Compendium import failed for "${cleaned.name}":`, err.message);
      return null;
    }
  }

  async #importOrResolve(actorData, meta) {
    const cleaned = this.#prepareActorData(actorData);
    if (game.settings.get(MODULE_ID, "useCompendiumData")) {
      const actor = await this.#importFromCompendium(cleaned);
      if (actor) return actor;
    }
    await this.#generateAvatarArt(cleaned, meta);
    await this.#generateTokenArt(cleaned, meta);
    return this.#createOrUpdate(cleaned);
  }

  async #createOrUpdate(cleaned) {
    const existing = game.actors.find(a => a.name === cleaned.name && a.type === "adversary");
    if (existing) {
      await existing.update(cleaned);
      return existing;
    }
    return Actor.create(cleaned);
  }

  #shouldGenerate(currentImg, mode) {
    if (mode === "off") return false;
    if (!currentImg) return true;
    if (mode === "always") {
      return currentImg.startsWith("systems/") || currentImg.startsWith("icons/");
    }
    return false;
  }


  async #generateAvatarArt(cleaned, meta) {
    const mode = game.settings.get(MODULE_ID, "avatarArtMode");
    if (!this.#shouldGenerate(cleaned.img, mode)) return;
    const authToken = meta?.auth?.token || this.authToken;
    if (!authToken) return;

    try {
      const res = await fetch(`${TOKEN_GENERATOR_URL}/avatar?name=${encodeURIComponent(cleaned.name)}`, {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (!res.ok) return;

      const path = await this.#uploadArt(cleaned.name, "avatar", await res.blob());
      if (path) cleaned.img = path;
    } catch (err) {
      console.warn(`[DH-Importer] Avatar art generation failed for "${cleaned.name}":`, err.message);
    }
  }

  async #generateTokenArt(cleaned, meta) {
    const mode = game.settings.get(MODULE_ID, "tokenArtMode");
    const tokenSrc = cleaned.prototypeToken?.texture?.src;
    if (!this.#shouldGenerate(tokenSrc, mode)) return;
    const authToken = meta?.auth?.token || this.authToken;
    if (!authToken) return;

    try {
      const res = await fetch(`${TOKEN_GENERATOR_URL}/token?name=${encodeURIComponent(cleaned.name)}`, {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (!res.ok) return;

      const path = await this.#uploadArt(cleaned.name, "token", await res.blob());
      if (path) {
        cleaned.prototypeToken = cleaned.prototypeToken || {};
        cleaned.prototypeToken.texture = cleaned.prototypeToken.texture || {};
        cleaned.prototypeToken.texture.src = path;
        cleaned.prototypeToken.lockRotation = true;
      }
    } catch (err) {
      console.warn(`[DH-Importer] Token art generation failed for "${cleaned.name}":`, err.message);
    }
  }

  async #uploadArt(name, type, blob) {
    const storagePath = game.settings.get(MODULE_ID, "tokenStoragePath");
    const slug = name.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase();
    const filename = `${slug}-${type}.webp`;

    await foundry.applications.apps.FilePicker.implementation.createDirectory("data", storagePath).catch(() => {});
    const file = new File([blob], filename, { type: "image/webp" });
    const upload = await foundry.applications.apps.FilePicker.implementation.upload("data", storagePath, file);
    return upload?.path || null;
  }

  #prepareActorData(data) {
    if (!data || !data.name || data.type !== "adversary") {
      throw new Error("Invalid adversary data: missing name or type !== 'adversary'");
    }

    const cleaned = foundry.utils.deepClone(data);
    delete cleaned._id;
    delete cleaned._key;
    delete cleaned.sort;
    delete cleaned.ownership;

    if (Array.isArray(cleaned.items)) {
      for (const item of cleaned.items) {
        delete item._id;
        delete item._key;
        delete item.sort;
        delete item.ownership;
      }
    }

    if (Array.isArray(cleaned.effects)) {
      for (const effect of cleaned.effects) {
        delete effect._id;
        delete effect._key;
      }
    }

    const attr = cleaned.system?.attribution;
    if (attr) {
      cleaned.flags = cleaned.flags || {};
      cleaned.flags["daggerheart-foundry-importer"] = {
        importedAt: new Date().toISOString(),
        source: attr.source || null,
        url: attr.url || null,
        author: attr.author || null
      };
    }

    return cleaned;
  }
}
