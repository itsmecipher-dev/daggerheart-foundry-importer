import { DaggerheartImporterAPI } from "./api.js";

const MODULE_ID = "daggerheart-foundry-importer";
const MODULE_VERSION = "0.1.0";

let api;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "useCompendiumData", {
    name: "Use SRD Compendium Data",
    hint: "When importing an adversary that exists in the system compendium, use the official data instead of parsed data.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "tokenArtMode", {
    name: "Token Art Generation",
    hint: "Generate circular token art for imported adversaries.",
    scope: "world",
    config: true,
    type: String,
    default: "missing",
    choices: { off: "Off", missing: "Missing only", always: "Always (replace defaults)" }
  });

  game.settings.register(MODULE_ID, "avatarArtMode", {
    name: "Avatar Art Generation",
    hint: "Generate avatar/portrait art for imported adversaries.",
    scope: "world",
    config: true,
    type: String,
    default: "missing",
    choices: { off: "Off", missing: "Missing only", always: "Always (replace defaults)" }
  });

  game.settings.register(MODULE_ID, "tokenShowName", {
    name: "Show Name on Token",
    hint: "When enabled, adversary names are rendered on generated tokens. When disabled, tokens without a source image keep the default system token.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  for (const [tier, defaultBorder] of [[1, "brass"], [2, "copper"], [3, "silver"], [4, "gold"]]) {
    game.settings.register(MODULE_ID, `tokenBorderTier${tier}`, {
      name: `Tier ${tier} Token Border`,
      hint: `Border frame style for tier ${tier} adversary tokens.`,
      scope: "world",
      config: true,
      type: String,
      default: defaultBorder,
      choices: { gold: "Gold", silver: "Silver", brass: "Brass", copper: "Copper" }
    });
  }

  game.settings.register(MODULE_ID, "tokenStoragePath", {
    name: "Art Storage Directory",
    hint: "Directory where generated token and avatar art will be saved.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    filePicker: "folder"
  });

  Hooks.on("renderSettingsConfig", (app, html) => {
    if (html.querySelector(".dh-settings-patreon-divider")) return;
    const firstPatreon = html.querySelector(`[name="${MODULE_ID}.tokenArtMode"]`)?.closest(".form-group");
    if (!firstPatreon) return;
    const divider = document.createElement("div");
    divider.classList.add("dh-settings-patreon-divider");
    divider.innerHTML = `<hr><p>The following settings require an active <a href="https://www.patreon.com/c/grimlibram_studio/membership" target="_blank">Patreon</a> subscription.</p>`;
    firstPatreon.parentElement.insertBefore(divider, firstPatreon);
  });

  api = new DaggerheartImporterAPI();

  game.daggerheart = game.daggerheart || {};
  game.daggerheart.importer = api;

  console.log(`${MODULE_ID} v${MODULE_VERSION} | initialized`);
});

Hooks.once("ready", async () => {
  setupPageMessageListener();

  const tour = await foundry.nue.Tour.fromJSON(`modules/${MODULE_ID}/tours/welcome.json`);
  game.tours.register(MODULE_ID, "welcome", tour);
  if (tour.status === foundry.nue.Tour.STATUS.UNSTARTED) tour.start();
});

function setupPageMessageListener() {
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (msg?.source !== "daggerheart-extension") return;

    let result;
    try {
      switch (msg.type) {
        case "PING":
          result = {
            ready: true,
            system: game.system?.id,
            moduleVersion: MODULE_VERSION
          };
          break;

        case "MODULE_STATUS":
          result = {
            installed: true,
            active: true,
            version: MODULE_VERSION
          };
          break;

        case "SET_AUTH":
          if (msg.data?.token) api.authToken = msg.data.token;
          result = { success: true };
          break;

        case "IMPORT_ADVERSARY":
          if (msg.meta?.auth?.token) api.authToken = msg.meta.auth.token;
          result = await api.importAdversary(msg.data, msg.meta);
          break;

        case "IMPORT_ADVERSARIES":
          if (msg.meta?.auth?.token) api.authToken = msg.meta.auth.token;
          result = await api.importAdversaries(msg.data, msg.meta);
          break;

        case "IMPORT_ENCOUNTER":
          if (msg.meta?.auth?.token) api.authToken = msg.meta.auth.token;
          result = await api.importEncounter(msg.data, msg.meta);
          break;

        default:
          result = { error: `Unknown message type: ${msg.type}` };
      }
    } catch (err) {
      result = { success: false, error: err.message };
    }

    window.postMessage({
      source: "daggerheart-page",
      responseId: msg.id,
      success: !result.error,
      data: result
    }, "*");
  });
}
