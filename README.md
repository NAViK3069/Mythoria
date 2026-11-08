# Mythoria

เกม **Turn-based RPG แฟนตาซี** สไตล์ **Pixel 2.5D** เล่นออนไลน์ผ่าน **เว็บเบราว์เซอร์** ได้ทั้งคอมพิวเตอร์ มือถือ และ iPad (ไม่ต้องลงแอป)

- 🗺️ **สำรวจแมพ** อิสระ (แนวเดียวกับ AFK Journey)
- ⚔️ **ต่อสู้แบบ Turn-based** ตามลำดับความเร็ว (แนวเดียวกับ Honkai: Star Rail)
- 🌐 **ออนไลน์**: เนื้อเรื่อง, PvP, กิลด์, Boss Raid
- 💳 รองรับระบบเติมเงินบนเว็บในอนาคต

> สถานะ: **Phase 0 — วางรากฐานโปรเจกต์** (ยังไม่มีโค้ดเกม)

## เอกสาร

| เอกสาร | เนื้อหา |
|---|---|
| [docs/00-vision.md](docs/00-vision.md) | วิสัยทัศน์และเป้าหมายของเกม |
| [docs/01-tech-stack.md](docs/01-tech-stack.md) | เทคโนโลยีที่เลือกใช้และเหตุผล |
| [docs/02-architecture.md](docs/02-architecture.md) | สถาปัตยกรรมระบบ (Client / Server / Data) |
| [docs/03-roadmap.md](docs/03-roadmap.md) | แผนพัฒนาตั้งแต่ต้นจนเปิดให้บริการ + Payment |
| [docs/04-folder-structure.md](docs/04-folder-structure.md) | โครงสร้างโฟลเดอร์ |
| [docs/game-design/](docs/game-design/) | Game Design Document (GDD) |
| [docs/decisions/](docs/decisions/) | บันทึกการตัดสินใจทางเทคนิค (ADR) |

## โครงสร้างโดยย่อ

```
apps/       แอปที่รันจริง (client เกมบนเว็บ, server เกมออนไลน์, admin)
packages/   โค้ดที่ใช้ร่วมกัน (ระบบต่อสู้, ข้อมูลเกม, type กลาง)
assets/     ไฟล์ต้นฉบับงานอาร์ต/เสียง (Aseprite ฯลฯ)
infra/      Docker, การ deploy
tools/      สคริปต์ช่วยงาน (pack sprite, ตรวจข้อมูลเกม)
docs/       เอกสารทั้งหมด
```
