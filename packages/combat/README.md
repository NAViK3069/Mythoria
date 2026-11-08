# packages/combat

ระบบต่อสู้ turn-based แบบ **pure TypeScript**

- รับ state + action → คืน state ใหม่ + events
- Seeded RNG → deterministic, เทสได้, รีเพลย์ได้
- **ห้าม** import Phaser หรือ DOM — โค้ดนี้ต้องรันบน server ได้
