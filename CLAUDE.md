# Mythoria — notes for Claude

- Web-based Pixel 2.5D turn-based fantasy RPG (exploration like AFK Journey, combat like Honkai: Star Rail), playable on PC / mobile / iPad browsers. Online features later: story, PvP, guild, boss raid, payments.
- Owner writes in Thai; project docs are in Thai.
- Read `docs/03-roadmap.md` for the current phase and `docs/04-folder-structure.md` for where code goes.
- Game design is decided by the owner — don't invent lore, characters or mechanics; ask, or leave placeholders in `docs/game-design/`.
- Rules: `packages/combat` is pure deterministic TypeScript (seeded RNG, no Phaser/DOM). Game numbers live in `packages/game-data`, not in code. Client talks to a `GameService` interface (Local now, Online later).
- Owner's earlier games are the references: battle rules come from https://github.com/NAViK3069/LineRanger_TurnBased ; the character model (head/body/2 legs on a 32px frame, floating hands, no arms, animate by moving parts by whole pixels) from https://github.com/NAViK3069/ProjectZ . Characters face left/right only — no back view. See `docs/game-design/characters.md`.
- The master character only walks the map; heroes (party) fight in battle.
- Run: `npm install` then `npm run dev` (client at http://localhost:5173). `npm run build` typechecks and builds `apps/client/dist`.
- Record significant technical decisions as ADRs in `docs/decisions/`.
