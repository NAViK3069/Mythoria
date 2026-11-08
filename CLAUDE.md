# Mythoria — notes for Claude

- Web-based Pixel 2.5D turn-based fantasy RPG (exploration like AFK Journey, combat like Honkai: Star Rail), playable on PC / mobile / iPad browsers. Online features later: story, PvP, guild, boss raid, payments.
- Owner writes in Thai; project docs are in Thai.
- Read `docs/03-roadmap.md` for the current phase and `docs/04-folder-structure.md` for where code goes.
- Game design is decided by the owner — don't invent lore, characters or mechanics; ask, or leave placeholders in `docs/game-design/`.
- Rules: `packages/combat` is pure deterministic TypeScript (seeded RNG, no Phaser/DOM). Game numbers live in `packages/game-data`, not in code. Client talks to a `GameService` interface (Local now, Online later).
- Record significant technical decisions as ADRs in `docs/decisions/`.
