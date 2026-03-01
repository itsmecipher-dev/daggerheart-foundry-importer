const SIZE_TO_GRID = { small: 1, standard: 1, large: 2, huge: 3, gargantuan: 4 };
const SIZE_TO_TOKEN = { small: 0.5, standard: 1, large: 2, huge: 3, gargantuan: 4 };

export class FormationPlacer {
  #monsters = [];
  #monstersBySize = [];
  #placementLayer = null;
  #previewGraphics = null;
  #labelContainer = null;
  #isPlacing = false;
  #formationIndex = 0;
  #rotation = 0;
  #spacing = 1.0;
  #currentPosition = { x: 0, y: 0 };
  #createEncounterAfterPlacement = true;
  #encounterName = null;
  #handlers = {};

  static FORMATIONS = ["tight", "spread", "line", "wedge", "square", "largeBack", "largeFront", "surround"];
  static MIN_SPACING = 0.0;
  static MAX_SPACING = 3.0;
  static SPACING_STEP = 0.25;

  get #snappingMode() {
    return CONST.GRID_SNAPPING_MODES?.TOP_LEFT_CORNER
      ?? CONST.GRID_SNAPPING_MODES?.TOP_LEFT
      ?? 1;
  }

  async startPlacement(actorsWithCount, options = {}) {
    this.#createEncounterAfterPlacement = options.createEncounter !== false;
    this.#encounterName = options.encounterName || null;

    this.#monsters = [];
    for (const { actor, count } of actorsWithCount) {
      const tokenSize = SIZE_TO_GRID[actor.system?.size] || 1;
      for (let i = 0; i < count; i++) {
        this.#monsters.push({ actor, size: tokenSize, name: actor.name, index: this.#monsters.length });
      }
    }

    this.#monstersBySize = [...this.#monsters].sort((a, b) => b.size - a.size);
    this.#isPlacing = true;
    this.#formationIndex = 0;
    this.#rotation = 0;

    this.#createPlacementLayer();
    this.#showFormationInfo();
    this.#setupEventListeners();
  }

  #showFormationInfo() {
    const name = FormationPlacer.FORMATIONS[this.#formationIndex];
    const pct = Math.round(this.#spacing * 100);
    ui.notifications.info(
      `Formation: ${name} | Rotation: ${this.#rotation}° | Spacing: ${pct}% | ` +
      `F/Shift+F: formation | R/Shift+R: rotate | S/Shift+S: spacing | Click: place | Esc: cancel`
    );
  }

  // --- Formation generators ---

  #generateFormation(baseX, baseY, type) {
    const generators = {
      tight: () => this.#tight(),
      spread: () => this.#spread(),
      line: () => this.#line(),
      wedge: () => this.#wedge(),
      square: () => this.#square(),
      largeBack: () => this.#sizeBased(false),
      largeFront: () => this.#sizeBased(true),
      surround: () => this.#surround()
    };
    const positions = (generators[type] || generators.tight)();
    return this.#applyRotation(positions);
  }

  #tight() {
    const positions = [];
    const gs = canvas.grid.size;
    const sp = gs * this.#spacing;
    let cx = 0, cy = 0, rw = 0, rmh = 0;
    const maxRW = Math.ceil(Math.sqrt(this.#monsters.length)) * gs * Math.max(1, this.#spacing);

    for (const m of this.#monsters) {
      const mw = m.size * gs;
      if (rw + mw > maxRW && rw > 0) {
        cy += rmh + (sp - gs);
        cx = 0; rw = 0; rmh = 0;
      }
      positions.push({ monster: m, relX: cx, relY: cy });
      rmh = Math.max(rmh, m.size * gs);
      cx += mw + (sp - gs);
      rw += mw + (sp - gs);
    }
    return positions;
  }

  #spread() {
    const positions = [];
    const gs = canvas.grid.size;
    const sp = gs * this.#spacing * 1.5;
    let cx = 0, cy = 0, rw = 0;
    const maxRW = Math.ceil(Math.sqrt(this.#monsters.length)) * gs * 2 * Math.max(1, this.#spacing);

    for (const m of this.#monsters) {
      const mw = m.size * gs;
      if (rw + mw > maxRW && rw > 0) {
        cy += gs * 2 + sp; cx = 0; rw = 0;
      }
      positions.push({ monster: m, relX: cx, relY: cy });
      cx += mw + sp;
      rw += mw + sp;
    }
    return positions;
  }

  #line() {
    const positions = [];
    const gs = canvas.grid.size;
    const sp = gs * this.#spacing;
    let cx = 0;
    for (const m of this.#monsters) {
      positions.push({ monster: m, relX: cx, relY: 0 });
      cx += m.size * gs + (sp - gs);
    }
    return positions;
  }

  #wedge() {
    const positions = new Array(this.#monsters.length);
    const gs = canvas.grid.size;
    const sp = gs * this.#spacing;
    const ci = Math.floor(this.#monsters.length / 2);

    if (this.#monsters.length > 0) {
      positions[ci] = { monster: this.#monsters[ci], relX: 0, relY: 0 };
    }

    let lo = -sp, ro = sp, rowOff = sp;
    for (let i = 0; i < this.#monsters.length; i++) {
      if (i === ci) continue;
      const m = this.#monsters[i];
      if (i < ci) {
        positions[i] = { monster: m, relX: lo, relY: rowOff };
        lo -= m.size * gs + (sp - gs);
      } else {
        positions[i] = { monster: m, relX: ro, relY: rowOff };
        ro += m.size * gs + (sp - gs);
      }
      if (i % 2 === 0) rowOff += sp;
    }
    return positions;
  }

  #square() {
    const positions = [];
    const gs = canvas.grid.size;
    const sp = gs * (1 + this.#spacing);
    const cols = Math.ceil(Math.sqrt(this.#monsters.length));

    for (let i = 0; i < this.#monsters.length; i++) {
      positions.push({
        monster: this.#monsters[i],
        relX: (i % cols) * sp,
        relY: Math.floor(i / cols) * sp
      });
    }
    return positions;
  }

  #sizeBased(largeFront) {
    const positions = [];
    const gs = canvas.grid.size;
    const sp = gs * this.#spacing;
    const sorted = [...this.#monsters].sort((a, b) => largeFront ? b.size - a.size : a.size - b.size);

    let cy = 0, prevSize = 0, cx = 0;
    for (const m of sorted) {
      if (prevSize !== m.size) {
        if (prevSize > 0) cy += prevSize * gs + (sp - gs);
        cx = 0; prevSize = m.size;
      }
      positions.push({ monster: m, relX: cx, relY: cy });
      cx += m.size * gs + (sp - gs);
    }
    return positions;
  }

  #surround() {
    const positions = [];
    const gs = canvas.grid.size;
    const n = this.#monsters.length;
    if (n === 0) return positions;

    const radius = Math.max(2, Math.ceil(n / 4)) * gs * Math.max(1, this.#spacing);
    const step = (2 * Math.PI) / n;

    for (let i = 0; i < n; i++) {
      const angle = i * step;
      const x = Math.round((Math.cos(angle) * radius) / gs) * gs;
      const y = Math.round((Math.sin(angle) * radius) / gs) * gs;
      positions.push({ monster: this.#monsters[i], relX: x + radius, relY: y + radius });
    }
    return positions;
  }

  #applyRotation(positions) {
    if (this.#rotation === 0) return positions;
    const rad = (this.#rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const gs = canvas.grid.size;

    return positions.map(pos => ({
      monster: pos.monster,
      relX: Math.round((pos.relX * cos - pos.relY * sin) / gs) * gs,
      relY: Math.round((pos.relX * sin + pos.relY * cos) / gs) * gs
    }));
  }

  // --- Validation ---

  #isFormationValid(positions, baseX, baseY) {
    const gs = canvas.grid.size;
    const existing = canvas.tokens.placeables;

    for (const pos of positions) {
      const x = baseX + pos.relX;
      const y = baseY + pos.relY;
      const size = pos.monster.size * gs;

      if (x < 0 || y < 0 || x + size > canvas.dimensions.width || y + size > canvas.dimensions.height) return false;

      for (const token of existing) {
        if (!(x + size <= token.x || x >= token.x + token.w || y + size <= token.y || y >= token.y + token.h)) return false;
      }
    }
    return true;
  }

  // --- PIXI layer ---

  #createPlacementLayer() {
    if (this.#placementLayer) canvas.stage.removeChild(this.#placementLayer);

    this.#placementLayer = new PIXI.Container();
    this.#placementLayer.name = "FormationPlacerLayer";
    this.#previewGraphics = new PIXI.Graphics();
    this.#labelContainer = new PIXI.Container();
    this.#placementLayer.addChild(this.#previewGraphics);
    this.#placementLayer.addChild(this.#labelContainer);
    canvas.stage.addChild(this.#placementLayer);
  }

  #drawPreview(positions, baseX, baseY, valid) {
    const gs = canvas.grid.size;
    this.#previewGraphics.clear();
    this.#labelContainer.removeChildren();

    for (const pos of positions) {
      const x = baseX + pos.relX;
      const y = baseY + pos.relY;
      const size = pos.monster.size * gs;
      const color = pos.monster.size > 1 ? 0xff6600 : 0x00aaff;
      const c = valid ? color : 0xff0000;

      this.#previewGraphics.lineStyle(2, c, 0.8);
      this.#previewGraphics.beginFill(c, 0.3);
      this.#previewGraphics.drawRect(x, y, size, size);
      this.#previewGraphics.endFill();

      this.#previewGraphics.lineStyle(1, 0xffffff, 0.3);
      for (let gx = 0; gx < pos.monster.size; gx++) {
        for (let gy = 0; gy < pos.monster.size; gy++) {
          this.#previewGraphics.drawRect(x + gx * gs, y + gy * gs, gs, gs);
        }
      }

      const text = new PIXI.Text(pos.monster.name.substring(0, 8), {
        fontFamily: "Arial", fontSize: 12, fill: 0xffffff, stroke: 0x000000, strokeThickness: 2
      });
      text.x = x + size / 2 - text.width / 2;
      text.y = y + size / 2 - text.height / 2;
      this.#labelContainer.addChild(text);
    }

    this.#previewGraphics.lineStyle(2, 0xffff00, 0.5);
    this.#previewGraphics.drawCircle(baseX, baseY, 5);
  }

  // --- Event handling ---

  #setupEventListeners() {
    this.#handlers.mouseMove = this.#onMouseMove.bind(this);
    this.#handlers.mouseClick = this.#onMouseClick.bind(this);
    this.#handlers.rightClick = this.#onRightClick.bind(this);
    this.#handlers.keyDown = this.#onKeyPress.bind(this);

    canvas.stage.on("mousemove", this.#handlers.mouseMove);
    canvas.stage.on("mousedown", this.#handlers.mouseClick);
    canvas.stage.on("rightdown", this.#handlers.rightClick);
    document.addEventListener("keydown", this.#handlers.keyDown);
  }

  #snapPoint(point) {
    if (canvas.grid.getSnappedPoint) {
      return canvas.grid.getSnappedPoint(point, { mode: this.#snappingMode });
    }
    const gs = canvas.grid.size;
    return { x: Math.floor(point.x / gs) * gs, y: Math.floor(point.y / gs) * gs };
  }

  #onMouseMove(event) {
    if (!this.#isPlacing) return;
    const point = event.data.getLocalPosition(canvas.stage);
    const gridPos = this.#snapPoint(point);
    this.#currentPosition = gridPos;

    const type = FormationPlacer.FORMATIONS[this.#formationIndex];
    const positions = this.#generateFormation(gridPos.x, gridPos.y, type);
    const valid = this.#isFormationValid(positions, gridPos.x, gridPos.y);
    this.#drawPreview(positions, gridPos.x, gridPos.y, valid);
  }

  async #onMouseClick(event) {
    if (!this.#isPlacing || event.data.button !== 0) return;

    const point = event.data.getLocalPosition(canvas.stage);
    const gridPos = this.#snapPoint(point);
    const type = FormationPlacer.FORMATIONS[this.#formationIndex];
    const positions = this.#generateFormation(gridPos.x, gridPos.y, type);

    if (!this.#isFormationValid(positions, gridPos.x, gridPos.y)) {
      ui.notifications.warn("Invalid placement — formation overlaps or out of bounds.");
      return;
    }

    await this.#createTokens(positions, gridPos.x, gridPos.y);
  }

  #onRightClick() {
    if (!this.#isPlacing) return;
    this.cleanup();
    ui.notifications.warn("Formation placement cancelled.");
  }

  #onKeyPress(event) {
    if (!this.#isPlacing) return;

    const key = event.key;
    if (["f", "F", "r", "R", "s", "S", "Escape", "1", "2", "3", "4", "5", "6", "7", "8"].includes(key)) {
      event.preventDefault();
      event.stopPropagation();
    }

    let update = false;
    if (key === "f") {
      this.#formationIndex = (this.#formationIndex + 1) % FormationPlacer.FORMATIONS.length;
      update = true;
    } else if (key === "F") {
      this.#formationIndex = (this.#formationIndex - 1 + FormationPlacer.FORMATIONS.length) % FormationPlacer.FORMATIONS.length;
      update = true;
    } else if (key === "r") {
      this.#rotation = (this.#rotation + 90) % 360;
      update = true;
    } else if (key === "R") {
      this.#rotation = (this.#rotation - 90 + 360) % 360;
      update = true;
    } else if (key === "s") {
      this.#spacing = Math.min(FormationPlacer.MAX_SPACING, Math.round((this.#spacing + FormationPlacer.SPACING_STEP) * 4) / 4);
      update = true;
    } else if (key === "S") {
      this.#spacing = Math.max(FormationPlacer.MIN_SPACING, Math.round((this.#spacing - FormationPlacer.SPACING_STEP) * 4) / 4);
      update = true;
    } else if (key === "Escape") {
      this.cleanup();
      ui.notifications.warn("Formation placement cancelled.");
      return;
    } else if (key >= "1" && key <= "8") {
      const idx = parseInt(key) - 1;
      if (idx < FormationPlacer.FORMATIONS.length) {
        this.#formationIndex = idx;
        update = true;
      }
    }

    if (update) {
      this.#showFormationInfo();
      const fakeEvent = { data: { getLocalPosition: () => this.#currentPosition } };
      this.#onMouseMove(fakeEvent);
    }
  }

  // --- Token & encounter creation ---

  async #createTokens(positions, baseX, baseY) {
    const tokenDataArray = [];

    for (const pos of positions) {
      const { actor } = pos.monster;
      const tokenDoc = await actor.getTokenDocument({
        x: baseX + pos.relX,
        y: baseY + pos.relY
      });
      const tokenData = tokenDoc.toObject();
      const tokenSize = SIZE_TO_TOKEN[actor.system?.size] || pos.monster.size;
      tokenData.width = tokenSize;
      tokenData.height = tokenSize;

      if (tokenData.texture?.src?.includes("*")) {
        const images = await actor.getTokenImages();
        if (images.length) {
          tokenData.texture.src = images[Math.floor(Math.random() * images.length)];
        }
      }

      tokenDataArray.push(tokenData);
    }

    try {
      const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", tokenDataArray);

      if (this.#createEncounterAfterPlacement) {
        await this.#createEncounter(createdTokens);
      }

      ui.notifications.info(`Placed ${createdTokens.length} tokens.`);
      this.cleanup();
    } catch (err) {
      ui.notifications.error(`Failed to create tokens: ${err.message}`);
    }
  }

  async #createEncounter(tokens) {
    let name = this.#encounterName;
    if (!name) {
      const counts = {};
      for (const t of tokens) counts[t.name] = (counts[t.name] || 0) + 1;
      name = "Encounter: " + Object.entries(counts)
        .map(([n, c]) => c > 1 ? `${c} ${n}s` : n)
        .join(", ");
    }

    const combat = await Combat.create({
      scene: canvas.scene.id,
      active: false,
      name
    });

    await combat.createEmbeddedDocuments("Combatant", tokens.map(t => ({
      tokenId: t.id,
      sceneId: canvas.scene.id,
      actorId: t.actorId,
      hidden: false
    })));

    ui.notifications.info(`Encounter "${name}" created with ${tokens.length} combatants.`);
  }

  cleanup() {
    this.#isPlacing = false;

    if (this.#handlers.mouseMove) {
      canvas.stage.off("mousemove", this.#handlers.mouseMove);
      canvas.stage.off("mousedown", this.#handlers.mouseClick);
      canvas.stage.off("rightdown", this.#handlers.rightClick);
      document.removeEventListener("keydown", this.#handlers.keyDown);
      this.#handlers = {};
    }

    if (this.#placementLayer) {
      canvas.stage.removeChild(this.#placementLayer);
      this.#placementLayer = null;
    }

    this.#monsters = [];
    this.#monstersBySize = [];
  }
}
