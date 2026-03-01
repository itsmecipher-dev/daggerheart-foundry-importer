const i18n = (key, data) => game.i18n.format(`DAGGERHEART_IMPORTER.${key}`, data);

export async function showEncounterDialog(adversaries, defaultName = "") {
  const hasScene = !!canvas.scene;
  const totalCount = adversaries.reduce((sum, a) => sum + a.count, 0);

  const rows = adversaries.map(({ actor, count }) => {
    const tier = actor.system?.tier || "—";
    const type = actor.system?.type || "—";
    return `<li class="encounter-adversary-row">
      <span class="encounter-adversary-name">${actor.name}</span>
      <span class="encounter-adversary-detail">${tier}</span>
      <span class="encounter-adversary-detail">${type}</span>
      <span class="encounter-adversary-count">&times;${count}</span>
    </li>`;
  }).join("");

  const content = `
    <form class="daggerheart-encounter-form">
      <div class="form-group">
        <label>${i18n("EncounterName")}</label>
        <input type="text" name="encounterName" value="${defaultName}" placeholder="${i18n("EncounterNamePlaceholder")}">
      </div>
      <div class="form-group">
        <label>${i18n("Adversaries")} (${totalCount})</label>
        <ul class="encounter-adversary-list">${rows}</ul>
      </div>
      <div class="form-group">
        <label class="checkbox">
          <input type="checkbox" name="placeTokens" value="1" ${hasScene ? "checked" : "disabled"}>
          ${i18n("PlaceTokens")}
          ${hasScene ? "" : `<span class="notes">${i18n("NoActiveScene")}</span>`}
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox">
          <input type="checkbox" name="createEncounter" value="1" checked>
          ${i18n("CreateEncounter")}
        </label>
      </div>
    </form>`;

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: i18n("ImportEncounterTitle") },
    content,
    ok: {
      label: i18n("Import"),
      callback: (event, button, dialog) => {
        const form = button.form;
        return {
          encounterName: form.elements.encounterName.value.trim() || defaultName,
          placeTokens: form.elements.placeTokens.checked,
          createEncounter: form.elements.createEncounter.checked
        };
      }
    },
    rejectClose: false
  });

  return result || null;
}
