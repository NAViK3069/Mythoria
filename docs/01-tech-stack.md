# 01 — Tech Stack (ข้อเสนอเริ่มต้น)

> เลือกโดยยึด 3 ข้อ: **เล่นบนเว็บได้ลื่นทุกอุปกรณ์**, **ใช้ภาษาเดียวทั้ง client/server**, **เริ่มฟรีบน GitHub Pages แล้วขยายเป็นออนไลน์จริงได้โดยไม่ต้องเขียนใหม่**

## ภาษา & Monorepo
| ส่วน | เลือก | เหตุผล |
|---|---|---|
| ภาษา | **TypeScript** | ใช้ร่วมกันได้ทั้ง client / server / ระบบต่อสู้ ลดบั๊ก |
| Monorepo | **npm workspaces** (อาจเปลี่ยนเป็น pnpm) | แชร์โค้ด `packages/*` ระหว่างแอป |
| Build | **Vite** | เร็ว, build เป็นไฟล์ static ขึ้น GitHub Pages ได้ทันที |

## Client (apps/client)
| ส่วน | เลือก | หมายเหตุ |
|---|---|---|
| Game engine | **Phaser** (WebGL/Canvas) | แข็งแรงด้าน 2D/Pixel, ทัช+เมาส์+คีย์บอร์ด, Tilemap, เบา |
| ทางเลือก 2.5D แบบ HD-2D | Three.js + sprite billboard | ใช้ถ้าต้องการฉาก 3D + ตัวละคร pixel (ตัดสินใจหลังกำหนดสไตล์ภาพ) |
| UI เมนู | HTML/CSS overlay หรือ UI ใน Phaser | เมนูซับซ้อน (กระเป๋า, กิลด์) ทำเป็น HTML จะง่ายและคมชัดกว่า |
| แมพ | **Tiled** (.tmj) | เครื่องมือวาดแมพมาตรฐาน Phaser โหลดได้ตรง |
| งานอาร์ต | **Aseprite** / PixelLab | export เป็น sprite sheet + JSON |
| PWA | vite-plugin-pwa | Add to Home Screen, เต็มจอบนมือถือ, cache asset |

## Server (apps/server) — เริ่มใช้ตั้งแต่ Phase 3
| ส่วน | เลือก | หมายเหตุ |
|---|---|---|
| Realtime | **Colyseus** (Node.js) | ห้อง PvP, Boss Raid, ผู้เล่นเห็นกันบนแมพ, WebSocket |
| HTTP API | **Fastify** | login, บัญชี, กระเป๋า, ร้านค้า, webhook ชำระเงิน |
| Database | **PostgreSQL** + Prisma/Drizzle | ข้อมูลผู้เล่น, ไอเทม, ธุรกรรม (ต้องการ transaction ที่แม่นยำ) |
| Cache / Pub-Sub | **Redis** | session, leaderboard, matchmaking, scale หลายเครื่อง |
| Auth | Guest + Email + Google/Discord (OAuth) | ผูกบัญชี guest ภายหลังได้ |

## Hosting (ตามระยะ)
| ระยะ | Client | Server / DB |
|---|---|---|
| ทดลอง (Phase 1–2) | **GitHub Pages** (ฟรี) | ไม่มี — เซฟลง localStorage |
| Beta (Phase 3–5) | Cloudflare Pages / Vercel | Fly.io / Railway / VPS + Postgres (Neon/Supabase) + Redis (Upstash) |
| เปิดจริง (Phase 7) | CDN (Cloudflare) + โดเมนของเกม | VPS/Cloud หลายเครื่อง + Docker, DB managed + backup |

> หมายเหตุ: GitHub Pages บนบัญชีฟรีต้องเป็น **repo สาธารณะ (public)**

## Payment (Phase 6)
| ตัวเลือก | จุดเด่น |
|---|---|
| **Stripe** | บัตรเครดิต, PromptPay (TH), Apple/Google Pay บนเว็บ, เอกสารดีมาก |
| **Opn Payments (Omise)** | ผู้ให้บริการไทย, PromptPay, TrueMoney, Mobile Banking |
| 2C2P | ช่องทางเอเชียครบ |

> เล่นบนเว็บ = **ไม่เสียค่าธรรมเนียม App Store 15–30%** แต่ต้องทำระบบยืนยันการชำระเงินฝั่ง server เอง (webhook)

## เครื่องมือคุณภาพ
- ESLint + Prettier, Vitest (เทสระบบต่อสู้), Playwright (เทส UI บนมือถือ/PC)
- GitHub Actions: lint/test ทุก push, deploy GitHub Pages อัตโนมัติ
