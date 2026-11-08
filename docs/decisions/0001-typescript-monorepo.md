# 0001 — ใช้ TypeScript Monorepo

- สถานะ: Proposed
- วันที่: 2026-11-08

## บริบท
เกมต้องรันบนเว็บ และในอนาคตต้องมี server ที่ตัดสินผลการต่อสู้เพื่อกันโกง ถ้าเขียนระบบต่อสู้สองภาษา ผลลัพธ์จะไม่ตรงกันและต้องดูแลสองชุด

## การตัดสินใจ
ใช้ TypeScript ทั้งโปรเจกต์ใน monorepo เดียว แยก `apps/*` (client, server, admin) และ `packages/*` (combat, game-data, shared)

## ผลที่ตามมา
- ระบบต่อสู้ชุดเดียวใช้ได้ทั้งโหมดออฟไลน์ (GitHub Pages) และบน server
- ต้องรักษาวินัย: `packages/combat` ห้ามพึ่ง Phaser หรือ DOM
