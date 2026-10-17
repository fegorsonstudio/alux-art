"use client";

/**
 * Our own traffic on a recorded road: a few cars and people that drive and
 * walk along the road by "metres from the start", drawn over the video.
 * Right-hand traffic (Nigeria): cars going our way sit a little to the right
 * of the camera line, oncoming cars further left; people on either pavement.
 */

export type TrackAgent = {
  kind: "car" | "person";
  color: string;
  s: number;          // metres along the road
  lateral: number;    // metres to the right of the camera line
  speed: number;      // m/s along the road (negative = coming toward us)
  alive: boolean;
  cooldown: number;
};

const CAR_COLORS = ["#d9d9d9", "#1f2a36", "#b22222", "#f2f2f2", "#2d5c9e", "#8a8a8a", "#e0b400", "#3b3b3b"];
const SHIRTS = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9d4edd", "#ffffff", "#1d3557"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export class TrackTraffic {
  readonly agents: TrackAgent[] = [];
  constructor(cars = 3, people = 2) {
    for (let i = 0; i < cars; i++) this.agents.push({ kind: "car", color: pick(CAR_COLORS), s: 0, lateral: 0, speed: 0, alive: false, cooldown: 0.5 + i * 0.7 });
    for (let i = 0; i < people; i++) this.agents.push({ kind: "person", color: pick(SHIRTS), s: 0, lateral: 0, speed: 0, alive: false, cooldown: 1 + i * 0.6 });
  }

  /** Advance by dt seconds, given where the player is and how long the road is. */
  update(dt: number, meS: number, length: number) {
    for (const a of this.agents) {
      if (!a.alive) {
        a.cooldown -= dt;
        if (a.cooldown <= 0) this.spawn(a, meS, length);
        continue;
      }
      a.s += a.speed * dt;
      const ahead = a.s - meS;
      if (ahead < -8 || ahead > 140 || a.s < 0 || a.s > length + 20) this.kill(a);
      // A car that reaches the player drives "through" them; let it vanish just before.
      else if (a.kind === "car" && ahead < 3) this.kill(a);
    }
  }

  private kill(a: TrackAgent) {
    a.alive = false;
    a.cooldown = rnd(1, 4);
    a.color = a.kind === "car" ? pick(CAR_COLORS) : pick(SHIRTS);
  }

  private spawn(a: TrackAgent, meS: number, length: number) {
    if (length - meS < 40) { a.cooldown = 2; return; }
    if (a.kind === "car") {
      if (Math.random() < 0.55) { a.s = meS + rnd(25, 80); a.speed = rnd(5, 9); a.lateral = rnd(0.2, 1.2); }      // ahead, our way, slower than us
      else { a.s = meS + rnd(90, 130); a.speed = -rnd(8, 13); a.lateral = -rnd(3.0, 4.2); }                       // oncoming, on their side
    } else {
      a.s = meS + rnd(12, 90);
      a.speed = (Math.random() < 0.5 ? 1 : -1) * rnd(1.0, 1.6);
      a.lateral = (Math.random() < 0.5 ? -1 : 1) * rnd(4.5, 6.5);
    }
    a.alive = true;
  }
}
