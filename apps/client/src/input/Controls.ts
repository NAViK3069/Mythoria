import * as Phaser from 'phaser';

const STICK_RADIUS = 40; // px on screen for full speed
const DRAG_START = 10; // px moved before a press becomes a joystick drag

/**
 * One input for every device:
 * - keyboard: WASD / arrow keys
 * - mouse or touch, quick press: walk to that spot
 * - mouse or touch, press and drag: virtual joystick
 */
export class Controls {
  /** Desired direction from keys or joystick, length 0..1. */
  readonly dir = { x: 0, y: 0 };
  /** World point to walk to (from a tap/click), or null. */
  target: { x: number; y: number } | null = null;

  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
  private press: { id: number; sx: number; sy: number; drag: boolean } | null = null;
  private stickDir = { x: 0, y: 0 };
  private readonly stick = document.getElementById('stick') as HTMLDivElement;
  private readonly knob = document.getElementById('stick-knob') as HTMLDivElement;

  /** Called when a tap sets a new target (to show a marker). */
  onTarget?: (x: number, y: number) => void;

  constructor(scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    const input = scene.input;
    // The canvas renders at device pixels; the joystick (HTML) lives in CSS pixels.
    const css = (v: number) => v / scene.scale.displayScale.x;
    input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.press) return; // one finger steers at a time
      this.press = { id: p.id, sx: css(p.x), sy: css(p.y), drag: false };
    });
    input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const pr = this.press;
      if (!pr || pr.id !== p.id || !p.isDown) return;
      const dx = css(p.x) - pr.sx;
      const dy = css(p.y) - pr.sy;
      const len = Math.hypot(dx, dy);
      if (!pr.drag && len > DRAG_START) {
        pr.drag = true;
        this.target = null;
        this.stick.style.left = `${pr.sx}px`;
        this.stick.style.top = `${pr.sy}px`;
        this.stick.hidden = false;
      }
      if (pr.drag) {
        const k = Math.min(1, len / STICK_RADIUS);
        this.stickDir.x = len ? (dx / len) * k : 0;
        this.stickDir.y = len ? (dy / len) * k : 0;
        this.knob.style.transform = `translate(${this.stickDir.x * STICK_RADIUS}px, ${this.stickDir.y * STICK_RADIUS}px)`;
      }
    });
    const release = (p: Phaser.Input.Pointer) => {
      const pr = this.press;
      if (!pr || pr.id !== p.id) return;
      if (!pr.drag) {
        this.target = { x: p.worldX, y: p.worldY };
        this.onTarget?.(p.worldX, p.worldY);
      }
      this.press = null;
      this.stickDir.x = this.stickDir.y = 0;
      this.stick.hidden = true;
      this.knob.style.transform = '';
    };
    input.on('pointerup', release);
    input.on('pointerupoutside', release);
  }

  update(): void {
    const k = this.keys;
    let x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (x || y) {
      const len = Math.hypot(x, y);
      x /= len;
      y /= len;
      this.target = null; // keys take over from a tap
    } else {
      x = this.stickDir.x;
      y = this.stickDir.y;
    }
    this.dir.x = x;
    this.dir.y = y;
  }
}
