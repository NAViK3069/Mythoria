# 02 — Architecture

## หลักการสำคัญ
1. **ระบบต่อสู้เป็น Pure TypeScript แยกออกจากกราฟิก** (`packages/combat`)
   - รับ state + action → คืน state ใหม่ + events (สำหรับเล่นแอนิเมชัน)
   - ใช้ **Seeded RNG** → ผลลัพธ์ deterministic ทำซ้ำได้ เทสได้ รีเพลย์ได้
   - Phase 1: รันในเบราว์เซอร์ (ออฟไลน์บน GitHub Pages)
   - Phase 3+: **รันบน server เป็นตัวตัดสิน (server-authoritative)** กันโกง — client แค่ส่งคำสั่ง + เล่นแอนิเมชัน
2. **ข้อมูลเกมแยกจากโค้ด** (`packages/game-data`) — ตัวละคร, สกิล, ศัตรู, ไอเทม เป็น JSON/TS + schema ตรวจสอบได้ เพิ่มเนื้อหาโดยไม่แก้ engine
3. **Client รองรับทุกจอ** — responsive layout (แนวนอน/แนวตั้ง), input แบบ abstract (tap = click = key)
4. **Offline-first → Online** — client คุยกับ `GameService` interface ตัวเดียว
   - `LocalGameService` (localStorage) ใช้บน GitHub Pages
   - `OnlineGameService` (HTTP + WebSocket) ใช้เมื่อมี server
   - สลับได้โดยไม่ต้องเขียนเกมใหม่

## ภาพรวม (เป้าหมายเมื่อออนไลน์เต็มรูปแบบ)

```
 ┌──────────── Browser (PC / Mobile / iPad) ─────────────┐
 │  apps/client  (Phaser + Vite + PWA)                    │
 │   ├─ Scenes: Boot / World (สำรวจแมพ) / Battle / UI      │
 │   ├─ packages/combat  (พรีวิว / ออฟไลน์)                │
 │   └─ GameService (Local | Online)                      │
 └───────────┬───────────────────────────┬────────────────┘
       HTTPS │ REST                      │ WebSocket
 ┌───────────▼───────────────────────────▼────────────────┐
 │  apps/server                                           │
 │   ├─ HTTP API (Fastify): auth, profile, inventory,     │
 │   │   shop, guild, payment webhook                     │
 │   ├─ Realtime (Colyseus rooms):                        │
 │   │   WorldRoom (เห็นผู้เล่นอื่น), BattleRoom,             │
 │   │   PvpRoom, RaidRoom (บอสร่วม HP), GuildChat           │
 │   └─ packages/combat (ตัวตัดสินจริง)                     │
 └───────┬────────────────────────┬───────────────────────┘
   ┌─────▼──────┐           ┌─────▼──────┐      ┌──────────────┐
   │ PostgreSQL │           │   Redis    │      │ Payment GW   │
   │ ผู้เล่น/ไอเทม │           │ session,   │      │ Stripe/Omise │
   │ ธุรกรรม     │           │ leaderboard│      │ → webhook    │
   └────────────┘           └────────────┘      └──────────────┘
```

## โหมดออนไลน์แต่ละแบบ
| ฟีเจอร์ | รูปแบบเริ่มต้น | ต่อยอด |
|---|---|---|
| เนื้อเรื่อง / สำรวจ | เล่นคนเดียว, server เก็บความคืบหน้า | เห็นผู้เล่นอื่นในเมือง (WorldRoom) |
| PvP | **Async Arena** — สู้กับทีมป้องกันของผู้เล่นอื่น (AI ควบคุม) | Realtime PvP 1v1 ผ่าน PvpRoom |
| Boss Raid | **World Boss** — ทุกคนตีบอสตัวเดียวกัน รวมดาเมจ (HP อยู่ใน Redis) | Co-op Raid หลายคนพร้อมกัน |
| กิลด์ | สร้าง/เข้าร่วม, แชท, ภารกิจกิลด์ | Guild War |

## ความปลอดภัย / กันโกง
- Server เป็นผู้คำนวณผลต่อสู้, รางวัล, gacha, เงินในเกม **ทั้งหมด**
- เชื่อข้อมูลจาก client ไม่ได้: ตรวจ action ทุกครั้ง, rate limit
- ธุรกรรมเงินจริง: ยืนยันผ่าน webhook ที่ verify signature + idempotency key + ledger แบบ append-only
