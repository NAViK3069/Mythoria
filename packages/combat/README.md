# packages/combat

ระบบต่อสู้ turn-based แบบ **pure TypeScript** — ยกมาจาก LineRanger_TurnBased (`src/play/battle.ts`, `ai.ts`)

- `Battle` รับทีม 2 ฝั่ง + seed → `nextActor()` / `beginTurn()` / `planAuto()` หรือแผนของผู้เล่น / `perform()` / `endTurn()`
- Seeded RNG (mulberry32) → deterministic, เทสได้, รีเพลย์ได้
- `setup.ts`: `heroTeam(ids)`, `monsterTeam(ids)` จาก `@mythoria/game-data`
- **ห้าม** import Phaser หรือ DOM — โค้ดนี้ต้องรันบน server ได้
- เทส: `npm test -w @mythoria/combat`
- กติกา: `docs/game-design/combat.md` · ADR 0012
